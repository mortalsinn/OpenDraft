import { useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { isCounterClockwise } from '../core/polygon.js'
import { hatchRegion } from '../core/hatch.js'

/**
 * A horizontal face extruded to its thickness.
 *
 * THREE.Shape triangulates through earcut, so concave rings — an L-shaped deck,
 * a notch around a chimney — come out right without any special handling here.
 */
export default function Slab({ node, selected }) {
  const geometry = useMemo(() => {
    const points = node.points ?? []
    if (points.length < 3) return null

    // Shape wants a consistent winding; reverse a clockwise ring rather than
    // letting the extrusion come out inside-out.
    const ring = isCounterClockwise(points) ? points : [...points].reverse()

    const shape = new THREE.Shape()
    shape.moveTo(ring[0].x, ring[0].y)
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, ring[i].y)
    shape.closePath()

    return new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.01, node.thickness ?? 5.5),
      bevelEnabled: false,
    })
  }, [node.points, node.thickness])

  const hatch = useMemo(
    () =>
      hatchRegion(node.points ?? [], node.hatch ?? 'none', {
        scale: node.hatchScale ?? 1,
        angleOffset: node.hatchAngle ?? 0,
      }),
    [node.points, node.hatch, node.hatchScale, node.hatchAngle],
  )

  if (!geometry) return null

  const elevation = node.elevation ?? 0
  const outline = node.points.map((p) => [p.x, p.y, elevation + (node.thickness ?? 5.5)])

  return (
    <group position={[0, 0, elevation]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={selected ? '#f59e0b' : '#78716c'}
          roughness={0.85}
          // Faces read as solid from above but should not hide the railing
          // posts standing on them when seen from a low angle.
          transparent
          opacity={selected ? 0.95 : 0.85}
        />
      </mesh>

      <Line
        points={[...outline, outline[0]].map((p) => [p[0], p[1], p[2] - elevation])}
        color={selected ? '#fbbf24' : '#a8a29e'}
        lineWidth={selected ? 3 : 1.5}
      />

      {/* Hatch, drawn on the top face so it reads in plan. Generated as real
          segments rather than a texture, so it survives export to vector PDF
          at any scale. */}
      {hatch.map(([from, to], i) => (
        <Line
          key={i}
          points={[
            [from.x, from.y, node.thickness ?? 5.5],
            [to.x, to.y, node.thickness ?? 5.5],
          ]}
          color={selected ? '#fbbf24' : '#a8a29e'}
          lineWidth={0.75}
          transparent
          opacity={0.6}
        />
      ))}
    </group>
  )
}
