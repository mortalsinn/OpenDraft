# Working notes

The handoff document. [README.md](README.md) says what OpenDraft is and why;
this says how to work on it — the invariants that must not be broken, where
things live, what bites, and what to do next.

## State

Every phase of the original roadmap is done. ~400 tests, ~9,300 lines of source
across 27 core modules.

**Built:** railings (level and raking), decks, stairs, walls with openings,
blocks with attributes, components, curves, layers, sheets and viewports,
compliance with citations, dimensions, hatching, PDF and takeoff export, a
drawing library with JSON interchange, and 19 tools on a left rail with separate
2D and 3D palettes.

**Not built:** 3D walls and roofs, curved walls, door/window schedules, section
and elevation views, DXF/DWG interchange, tablet and stylus input, and any
storage beyond localStorage.

**The obvious next move** is wiring the AscendOS estimator to the handoff
document. `computeTakeoff` emits a versioned contract and nothing consumes it
yet. That is the difference between a good drafting tool and one that shortens
the tender pipeline.

## Invariants

Break these and the tool stops being trustworthy. They are each load-bearing.

**1. Geometry and quantities come from ONE function.**
`layoutRailing`, `layoutStair` and `layoutRakingGuard` are read by both the 3D
scene and `computeTakeoff`. If the renderer counted pickets one way and the
quote another, the drawing would stop being the quote — and you would find out
on a job site.

**2. Picket count solves the code rule, not a pitch.**
`k = ceil((clear − maxGap) / (picketWidth + maxGap))`. Counting by pitch
(`floor(clear / spacing)`) is right most of the time, which is what makes it
dangerous: at a 17.9" clear bay it leaves 3.9125" openings that fail inspection.

**3. On a rake, the rail is the HYPOTENUSE.** Posts and pickets stand plumb;
only the rail follows the slope. Guard height is measured vertically from the
nosing line, never perpendicular to it — the perpendicular distance is always
shorter, so it flatters every result and passes guards that fail on site.

**4. Layer `visible` and `includeInTakeoff` are separate flags.**
Hiding a layer to see behind it must never drop its contents from the quote.
Excluding work from a contract is a decision, not a side effect of looking.

**5. Changing jurisdiction re-evaluates, never reshapes.**
Quietly moving a picket spacing under someone would change a drawing they had
already checked and signed.

**6. The export core never reads the clock.** The UI passes the date in, so the
same drawing always produces identical bytes and can be diffed and cached.

**7. Wall area is net of openings; plates are gross.** Nobody finishes the hole
where a door goes, but the plate runs straight past it.

**8. Lengths are inches, rounded ONCE at format time** in integer ticks of
1/denominator — never by chained float maths.

## Architecture in one paragraph

The document is a flat map of typed, **parametric** nodes. A node stores its
defining inputs — a footprint, a height, a picket spacing — and its geometry is
generated from those on demand. Nothing in the document is a mesh. This is the
whole bet: it is what lets one document be a 2D plan and a 3D model at once, and
what makes quantities exact, because you cannot reliably count pickets off a
triangle soup. Adding a product means adding one entry to `NODE_TYPES`; the
scene, the takeoff and the inspector all pick it up.

Z is up, like CAD and SketchUp, so plan view is the XY plane.

## Module map

| Area | Modules |
|---|---|
| Foundations | `units` `vertices` `doc` `persist` `library` |
| Inference | `inference` `tools` |
| Geometry | `polygon` `curves` `shapes` `transform` `edit` `chain` `selection` |
| Products | `railing` `rake` `stairs` `walls` `blocks` `components` |
| Presentation | `hatch` `layers` `dimension` `plan` `sheets` `sheetRender` `pdf` |
| Rules & handoff | `code` `handoff` |

`src/scene/` renders, `src/ui/` is panels, `src/store/useDraft.js` holds
interaction state. The document is immutable — every edit swaps in a new one, so
undo is just keeping the previous ones.

## Gotchas that cost real time

**The preview browser never paints.** Its tab reports
`document.visibilityState: "hidden"` permanently, so `requestAnimationFrame`
never fires — which means **`useFrame` never runs**. Anything built on it
silently does nothing there. It is also why screenshots time out. Zoom-to-fit
was written with `useFrame` and had to be moved to an effect for exactly this
reason.

**Stale Vite transform cache** survives page reloads *and* cache-busting query
params. If a handler seems dead but the served module clearly has the new code:
`rm -rf node_modules/.vite` and restart the dev server.

**Never verify by `import()`ing a core module in the console.** Vite's HMR query
param hands you a *second* module instance with its own id counters, which
produces convincingly wrong results. Drive the app's own store instead —
`window.__draft` in dev, and `window.__scene` for the camera.

**To actually see output**, export a PDF and rasterise it:

```bash
gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r110 -sOutputFile=out.png plan.pdf
```

Three real bugs surfaced that way and would not have from tests: skewed wall
jambs, a vanishing em dash, and a stair drawn with no treads.

## Verifying a change

```bash
npm test          # ~400 tests, fast
npm run build     # catches syntax and import errors the tests miss
npm run dev       # http://localhost:5180
```

Tests carry the reasoning. When one fails, read its comment before changing it —
several encode a real-world failure (an inspection failing, material ordered
short) rather than an arbitrary expectation.

## Schema

Currently **v5**. Migrations chain in `migrateDocument`, so a v1 document picks
up polylines, layers, definitions and sheets in one pass. A document from an
unknown future version is refused rather than guessed at.

The **file** format (`library.js`) is versioned separately from the document
schema, so the drawing model can churn without previously exported files
becoming unreadable.
