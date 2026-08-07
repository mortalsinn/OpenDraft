import { Line, Html } from '@react-three/drei'
import { resolveDimension } from '../core/dimension.js'
import { formatLength } from '../core/units.js'

/**
 * A dimension drawn the way a drafter expects: extension lines out from the
 * measured points, a dimension line between them, ticks at each end, and the
 * length centred on it.
 *
 * The label is HTML rather than 3D text, so it stays a constant size on screen
 * as you zoom — which is how dimensions behave in every CAD tool, and what
 * keeps a drawing readable when it is zoomed out.
 */
export default function Dimension({ doc, node, selected }) {
  const resolved = resolveDimension(doc, node)

  // Broken: whatever it measured has been deleted. Say so loudly rather than
  // rendering a stale number somebody might build to.
  if (!resolved) {
    return null
  }

  const { from, to, length, lineFrom, lineTo, mid, normal } = resolved
  const color = selected ? '#fbbf24' : '#38bdf8'

  // Extension lines run from just off the measured point to just past the
  // dimension line, so they never quite touch the geometry.
  const gap = 2
  const overshoot = 4
  const extension = (point, linePoint) => {
    const dx = linePoint.x - point.x
    const dy = linePoint.y - point.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    return [
      [point.x + ux * gap, point.y + uy * gap, point.z ?? 0],
      [point.x + ux * (len + overshoot), point.y + uy * (len + overshoot), point.z ?? 0],
    ]
  }

  const tick = 3
  const tickAt = (point) => [
    [point.x - normal.x * tick, point.y - normal.y * tick, point.z ?? 0],
    [point.x + normal.x * tick, point.y + normal.y * tick, point.z ?? 0],
  ]

  return (
    <group>
      <Line points={extension(from, lineFrom)} color={color} lineWidth={1} />
      <Line points={extension(to, lineTo)} color={color} lineWidth={1} />

      <Line
        points={[
          [lineFrom.x, lineFrom.y, lineFrom.z ?? 0],
          [lineTo.x, lineTo.y, lineTo.z ?? 0],
        ]}
        color={color}
        lineWidth={selected ? 2.5 : 1.5}
      />

      <Line points={tickAt(lineFrom)} color={color} lineWidth={2} />
      <Line points={tickAt(lineTo)} color={color} lineWidth={2} />

      <group position={[mid.x, mid.y, mid.z ?? 0]}>
        <Html center style={{ pointerEvents: 'none' }} zIndexRange={[8, 0]}>
          <span
            className="whitespace-nowrap rounded px-1 py-0.5 text-[11px] font-medium tabular-nums"
            style={{
              background: 'rgba(2,6,23,0.9)',
              color: selected ? '#fbbf24' : '#7dd3fc',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {formatLength(length)}
          </span>
        </Html>
      </group>
    </group>
  )
}
