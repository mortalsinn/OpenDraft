import { useMemo } from 'react'
import { Instances, Instance, Line } from '@react-three/drei'
import { layoutStair } from '../core/stairs.js'
import { railingPoints } from '../core/railing.js'
import { rakingGuardGeometry } from '../core/rake.js'

/**
 * A flight of stairs in 3D.
 *
 * Reads `layoutStair` — the same solver the takeoff reads — so the treads you
 * count on screen are the treads on the invoice.
 */
export default function Stair({ node, selected }) {
  const layout = useMemo(() => layoutStair(node), [node])
  const guard = useMemo(
    () => (node.guard ? rakingGuardGeometry(node, node.guardParams ?? {}) : null),
    [node],
  )
  const points = railingPoints(node)

  const placement = useMemo(() => {
    if (points.length < 2) return null

    const [from, to] = points
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length === 0) return null

    // The drawn line only supplies direction; the run comes from the solver.
    return { from, angle: Math.atan2(dy, dx), ux: dx / length, uy: dy / length }
  }, [points])

  if (!placement || !layout.riserCount) return null

  const { from, angle, ux, uy } = placement
  const { steps, treadDepth, width, nosing, riserHeight } = layout
  const treadThickness = 1.25

  // Treads only — the topmost step is the floor you arrive on, not a tread.
  const treads = steps.filter((step) => !step.isLanding)

  return (
    <group>
      {treads.length > 0 && (
        <Instances limit={treads.length}>
          <boxGeometry args={[treadDepth + nosing, width, treadThickness]} />
          <meshStandardMaterial color={selected ? '#f59e0b' : '#a8a29e'} />
          {treads.map((step) => {
            // Centre of this tread, measured along the run direction.
            const along = step.offset + (treadDepth + nosing) / 2 - nosing
            return (
              <Instance
                key={step.index}
                position={[
                  from.x + ux * along,
                  from.y + uy * along,
                  (from.z ?? 0) + step.top - treadThickness / 2,
                ]}
                rotation={[0, 0, angle]}
              />
            )
          })}
        </Instances>
      )}

      {/* Risers, as thin faces closing the front of each step. */}
      <Instances limit={Math.max(1, steps.length)}>
        <boxGeometry args={[0.75, width, riserHeight]} />
        <meshStandardMaterial color={selected ? '#fbbf24' : '#78716c'} />
        {steps.map((step) => (
          <Instance
            key={step.index}
            position={[
              from.x + ux * step.offset,
              from.y + uy * step.offset,
              (from.z ?? 0) + step.top - riserHeight / 2,
            ]}
            rotation={[0, 0, angle]}
          />
        ))}
      </Instances>

      {/* The raking guard, if this flight carries one. Posts and pickets are
          PLUMB; only the rail follows the slope. */}
      {guard && (
        <group>
          {guard.posts.map(([base, top], i) => (
            <Line
              key={`post-${i}`}
              points={[[base.x, base.y, base.z], [top.x, top.y, top.z]]}
              color={selected ? '#f59e0b' : '#cbd5e1'}
              lineWidth={selected ? 4 : 3}
            />
          ))}
          {guard.pickets.map(([base, top], i) => (
            <Line
              key={`picket-${i}`}
              points={[[base.x, base.y, base.z], [top.x, top.y, top.z]]}
              color={selected ? '#fbbf24' : '#94a3b8'}
              lineWidth={1}
            />
          ))}
          {guard.rail && (
            <Line
              points={[
                [guard.rail[0].x, guard.rail[0].y, guard.rail[0].z],
                [guard.rail[1].x, guard.rail[1].y, guard.rail[1].z],
              ]}
              color={selected ? '#fbbf24' : '#e2e8f0'}
              lineWidth={4}
            />
          )}
        </group>
      )}

      {/* The stringer line, so the flight reads at a glance in any view. */}
      <Line
        points={[
          [from.x, from.y, from.z ?? 0],
          [
            from.x + ux * layout.totalRun,
            from.y + uy * layout.totalRun,
            (from.z ?? 0) + layout.totalRise,
          ],
        ]}
        color={selected ? '#fbbf24' : '#e2e8f0'}
        lineWidth={selected ? 3 : 2}
      />
    </group>
  )
}
