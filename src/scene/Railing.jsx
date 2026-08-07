import { useMemo } from 'react'
import { Instances, Instance, Line } from '@react-three/drei'
import { layoutRailing } from '../core/railing.js'

/**
 * A railing run in 3D.
 *
 * Reads `layoutRailing` — the same function the takeoff reads — so what you see
 * and what you are quoted are the same thing by construction.
 *
 * Pickets are instanced: a 20' run is already ~55 of them, and a deck's worth
 * of runs would be well into the thousands as individual meshes.
 */
export default function Railing({ node, selected }) {
  const layout = useMemo(() => layoutRailing(node), [node])
  const { posts, pickets, rails, height, postWidth, picketWidth } = layout

  if (!posts.length) return null

  const color = selected ? '#fbbf24' : '#94a3b8'

  return (
    <group>
      <Instances limit={Math.max(1, posts.length)}>
        <boxGeometry args={[postWidth, postWidth, height]} />
        <meshStandardMaterial color={selected ? '#f59e0b' : '#cbd5e1'} />
        {posts.map((post, i) => (
          <Instance key={i} position={[post.x, post.y, (post.z ?? 0) + height / 2]} />
        ))}
      </Instances>

      {pickets.length > 0 && (
        <Instances limit={pickets.length}>
          <boxGeometry args={[picketWidth, picketWidth, height - 2]} />
          <meshStandardMaterial color={color} />
          {pickets.map((picket, i) => (
            <Instance key={i} position={[picket.x, picket.y, (picket.z ?? 0) + (height - 2) / 2]} />
          ))}
        </Instances>
      )}

      {/* One rail per span, so the top rail turns the corners with the run. */}
      {rails.map(([from, to], i) => (
        <Line
          key={i}
          points={[
            [from.x, from.y, (from.z ?? 0) + height],
            [to.x, to.y, (to.z ?? 0) + height],
          ]}
          color={selected ? '#fbbf24' : '#e2e8f0'}
          lineWidth={4}
        />
      ))}
    </group>
  )
}
