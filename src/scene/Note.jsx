import { Html } from '@react-three/drei'

/** A text note pinned to a point in the drawing. */
export default function Note({ node, selected }) {
  const { position, text } = node
  if (!position) return null

  return (
    <group position={[position.x, position.y, position.z ?? 0]}>
      <mesh>
        <sphereGeometry args={[1.5, 8, 8]} />
        <meshBasicMaterial color={selected ? '#fbbf24' : '#facc15'} />
      </mesh>

      <Html style={{ pointerEvents: 'none', transform: 'translate(10px, -50%)' }} zIndexRange={[8, 0]}>
        <span
          className="whitespace-pre rounded px-1.5 py-0.5 text-[11px]"
          style={{
            background: 'rgba(2,6,23,0.9)',
            color: selected ? '#fbbf24' : '#fde68a',
            border: `1px solid ${selected ? '#fbbf24' : 'rgba(255,255,255,0.1)'}`,
          }}
        >
          {text}
        </span>
      </Html>
    </group>
  )
}
