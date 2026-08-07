# OpenDraft

A drafting tool that fuses **SketchUp**'s direct 3D manipulation with **ArcSite**'s
field-first 2D takeoff.

One document, two cameras. You sketch a plan with live dimensions; that plan is a
projection of a real 3D model you can orbit; and every element knows what it costs.

## Why those two tools

Neither half is really about the dimension count:

- **ArcSite's** actual trick is that every drawn element *carries a product*. The
  drawing **is** the takeoff **is** the quote.
- **SketchUp's** actual trick is the **inference engine** — snapping to endpoints,
  midpoints, axes, parallels and extensions with instant feedback, plus
  type-a-number-to-commit-a-length.

So the ordering of work follows from that: the inference engine and the units
engine came first, before any object types, because if drawing one line does not
feel right nothing downstream matters.

## Architectural decisions

**Geometry is a parametric object graph, not a mesh and not a B-rep kernel.**
A node stores its defining inputs (a footprint, a height, a picket spacing) and
its 3D geometry is generated from those on demand. This is the whole bet:

- it is what lets one document be a 2D plan and a 3D model at once;
- it is what makes quantities exact — you cannot reliably count pickets off a
  triangle soup, but you can compute them from a run length and a spacing;
- it ships incrementally, where a topology engine ships nothing until it is done.

A B-rep kernel (opencascade.js) was rejected: 10–40MB of WASM and a brutal API to
buy boolean fillets nobody needs to quote a railing. Raw SketchUp-style face
topology was deferred: the face-healing is the hardest part of SketchUp's
codebase, and the *feel* people actually want lives in the inference engine,
which is independent of how geometry is stored. Free-form shapes get an
`extrusion` node later rather than making every other node pay the cost now.

**Lengths are stored as plain inches.** This is a stair and railing shop: every
catalogue, drawing and site conversation is in feet, inches and fractions.
Display rounding happens once, at format time, in integer ticks of
1/denominator — never by chained float math — so `12' 6 1/2"` survives a
parse/format round trip exactly.

**Z is up**, like CAD and like SketchUp. Plan view looks down -Z and 2D drafting
happens on the XY plane, which keeps plan-view maths to plain x and y.

## Relationship to AscendOS

Separate repo, deliberately. A 60fps canvas app should not share a bundle with
the estimating suite, and AscendOS lives in the shared `ironwood-stairflow`
Firebase project where a second app's config has already broken production once.

Integration happens at the data seam instead: `computeTakeoff(doc)` in
[src/core/doc.js](src/core/doc.js) rolls the document up into SKU/quantity lines,
and the AscendOS estimator ingests those. Adding a priced product means adding
one entry to `NODE_TYPES` — the scene, the takeoff panel and the estimator
contract all pick it up without further plumbing.

## What it does

**Draw and infer.** Lines snap to endpoints, midpoints, intersections, edges,
axes, extensions and parallels, ranked by priority then distance, with tolerance
measured in screen pixels so snapping feels identical at any zoom. Aim for
direction, type a number for exact distance.

**Objects that know what they are.** Promote lines into railing runs, decks and
stairs. Connected lines are absorbed into one run, so a deck perimeter shares
its corner posts instead of double-counting them. A stair is solved from the
floor-to-floor rise rather than drawn, so every riser is identical.

**The drawing is the quote.** One layout function decides where every post and
picket goes, and both the 3D scene and the takeoff read it — so what you are
quoted cannot drift from what is drawn.

**Associative dimensions.** A dimension stores a reference to the vertex it
measures, not a copy. Move the geometry and it follows.

**Code checking with citations.** Guards and stairs are checked against a
selectable jurisdiction — Ontario within a dwelling, Ontario public, US IRC —
and every finding names its clause. Changing jurisdiction re-evaluates the
drawing; it never silently reshapes it.

**Layers where hiding is not excluding.** Visibility and quantification are
separate flags, because hiding a layer to see behind it must not quietly drop
its contents from the quote.

**Components.** Draw one, place many, edit the definition and every instance
changes.

**Export.** A dimensioned plan sheet at a real architectural scale with the
takeoff in the title block, and a versioned handoff document for the AscendOS
estimator.

## Status

Phases 1–11 done, 185 tests. Working: line, select, move, push/pull, dimension,
note and component tools; railing runs, decks and stairs; layers; compliance;
PDF and takeoff export; persistence across reloads.

Not done yet: multi-select, rotated and radial geometry, sloped faces, walls and
openings, raking guards on stairs, tablet and stylus input, and any storage
beyond a single drawing in localStorage.

## Running it

```bash
npm install
npm run dev     # http://localhost:5180
npm test        # units + inference
```

### Controls

| | |
|---|---|
| Left click (Line) | place a point; the run chains from the last one |
| Left click (Select) | select a line, then edit or promote it on the right |
| Drag (Move) | a corner moves that corner; anywhere else moves the whole object |
| Drag (Push/Pull) | edits a parameter — slab thickness, railing height, stair rise |
| Two clicks (Dimension) | snapping to a corner binds it so it follows the geometry |
| Type a number, Enter | commit an exact length along the inferred direction |
| Arrow keys | lock to an axis |
| Esc | abandon the line in progress |
| Ctrl/Cmd + Z | undo |
| Middle drag | pan |
| Right drag | pan in plan, orbit in 3D |

Lengths accept `12`, `12'`, `12' 6"`, `12'6`, `6 1/2`, `12' 6 1/2"`, and metric
with an explicit suffix (`300mm`). A bare number is always inches.
