import { useRef, useMemo, useCallback, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useDraft } from '../store/useDraft.js'
import { infer } from '../core/inference.js'
import { formatLength } from '../core/units.js'
import { distance, listSegments } from '../core/doc.js'
import { railingSegments } from '../core/railing.js'
import { isVisible } from '../core/layers.js'
import { instantiate } from '../core/components.js'
import { SHAPE_TOOLS } from '../core/shapes.js'
import Railing from './Railing.jsx'
import Slab from './Slab.jsx'
import Stair from './Stair.jsx'
import Dimension from './Dimension.jsx'
import Note from './Note.jsx'

// Z-up, like every CAD tool and like SketchUp. Plan view then looks straight
// down -Z and 2D drafting happens on the XY plane, which keeps the plan-view
// maths to plain x and y.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

const DRAWING_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)

/**
 * Keeps the drawing buffer matched to the canvas's CSS size.
 *
 * R3F sizes itself from a ResizeObserver, which is not reliable everywhere —
 * some embedded and headless browsers never deliver the initial callback, and
 * the canvas is then stuck at its intrinsic 300x150 while the page around it
 * looks fine. Comparing sizes each frame and correcting only on a genuine
 * mismatch costs nothing and removes the dependency.
 */
function SizeGuard() {
  const { gl, camera, size, setSize } = useThree()

  useFrame(() => {
    const rect = gl.domElement.getBoundingClientRect()
    const width = Math.round(rect.width)
    const height = Math.round(rect.height)
    if (width < 1 || height < 1) return
    if (width === Math.round(size.width) && height === Math.round(size.height)) return

    setSize(width, height)

    if (camera.isOrthographicCamera) {
      camera.left = -width / 2
      camera.right = width / 2
      camera.top = height / 2
      camera.bottom = -height / 2
    } else {
      camera.aspect = width / height
    }
    camera.updateProjectionMatrix()
  })

  return null
}

/**
 * Turns pointer movement into world points and inference results.
 *
 * Lives inside the Canvas so it can read the live camera every frame — the
 * screen-to-world scale changes with zoom, and the inference tolerance depends
 * on it.
 */
function PointerBridge() {
  const { camera, gl, size } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const ndc = useRef(new THREE.Vector2())
  const hit = useRef(new THREE.Vector3())

  const worldPerPixel = useCallback(() => {
    if (camera.isOrthographicCamera) {
      return (camera.right - camera.left) / camera.zoom / size.width
    }
    // Perspective: world units per pixel at the drawing plane's depth.
    const depth = Math.abs(camera.position.z) || 1
    const visibleHeight = 2 * depth * Math.tan((camera.fov * Math.PI) / 360)
    return visibleHeight / size.height
  }, [camera, size])

  const toWorld = useCallback(
    (event) => {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.current.setFromCamera(ndc.current, camera)
      const point = raycaster.current.ray.intersectPlane(DRAWING_PLANE, hit.current)
      return point ? { x: point.x, y: point.y, z: 0 } : null
    },
    [camera, gl],
  )

  useEffect(() => {
    const canvas = gl.domElement

    const onMove = (event) => {
      const state = useDraft.getState()

      // A push/pull in progress owns the pointer; inference would only fight it.
      if (state.pushPull) {
        state.updatePushPull(event.clientY, worldPerPixel())
        return
      }

      const cursor = toWorld(event)
      if (!cursor) return

      const snap = infer({
        cursor,
        // While moving, the object being dragged is excluded from inference —
        // otherwise it snaps to its own vertices and sticks to where it was.
        segments: listSegments(state.doc).filter((s) => s.id !== state.moving?.id),
        anchor: state.anchor,
        worldPerPixel: worldPerPixel(),
        gridStep: state.gridStep,
        lockedAxis: state.lockedAxis,
      })

      state.setSnap(snap)
      // Moves run through the inference engine, so dragging a corner onto
      // another corner lands exactly on it.
      if (state.moving) state.updateMove(snap.point)
    }

    const onPointerDown = (event) => {
      const state = useDraft.getState()

      if (state.tool === 'pushpull' && state.selection) {
        state.beginPushPull(event.clientY)
        return
      }

      if (state.tool === 'move' && state.snap) {
        state.beginMove(state.snap.point, state.snap.refs)
      }
    }

    const onPointerUp = () => {
      const state = useDraft.getState()
      if (state.pushPull) state.endPushPull()
      if (state.moving) state.endMove()
    }

    const onClick = (event) => {
      // Ignore the click that ends an orbit/pan drag.
      if (event.detail === 0) return
      const state = useDraft.getState()
      // A click that finished a drag must not also place a point.
      if (state.tool === 'pushpull' || state.tool === 'move') return
      if (state.snap) state.clickPoint(state.snap.point, state.snap.refs)
    }

    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('click', onClick)
    return () => {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('click', onClick)
    }
  }, [gl, toWorld, worldPerPixel])

  // Keep the marker sized in screen space rather than world space.
  const scaleRef = useRef(1)
  useFrame(() => {
    scaleRef.current = worldPerPixel()
  })

  return <SnapMarker scaleRef={scaleRef} />
}

/** The coloured dot and its label — the visible half of the inference engine. */
function SnapMarker({ scaleRef }) {
  const snap = useDraft((s) => s.snap)
  const anchor = useDraft((s) => s.anchor)
  const meshRef = useRef()

  useFrame(() => {
    if (meshRef.current) {
      const radius = scaleRef.current * 5 // ~5px regardless of zoom
      meshRef.current.scale.setScalar(radius)
    }
  })

  if (!snap) return null

  const showLabel = snap.label && snap.kind !== 'free'

  return (
    <group position={[snap.point.x, snap.point.y, snap.point.z ?? 0]}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={snap.color} depthTest={false} />
      </mesh>
      {showLabel && (
        <Html
          style={{ pointerEvents: 'none', transform: 'translate(12px, -50%)' }}
          zIndexRange={[10, 0]}
        >
          <span className="whitespace-nowrap rounded bg-slate-900/90 px-1.5 py-0.5 text-[11px] font-medium text-slate-100 ring-1 ring-white/10">
            {snap.label}
            {anchor && (
              <span className="ml-2 tabular-nums text-slate-400">
                {formatLength(distance(anchor, snap.point))}
              </span>
            )}
          </span>
        </Html>
      )}
    </group>
  )
}

/**
 * One node, drawn.
 *
 * Shared by the top-level scene and by component instances: a component is a
 * REFERENCE to geometry, not a different kind of geometry, so its contents go
 * through exactly the same renderers.
 */
function NodeView({ doc, node, selected }) {
  if (node.type === 'dimension') {
    return <Dimension doc={doc} node={node} selected={selected} />
  }

  if (node.type === 'note') {
    return <Note node={node} selected={selected} />
  }

  if (node.type === 'componentInstance') {
    return (
      <group>
        {instantiate(doc, node).map((inner) => (
          <NodeView key={inner.id} doc={doc} node={inner} selected={selected} />
        ))}
      </group>
    )
  }

  if (node.type === 'slab') {
    return <Slab node={node} selected={selected} />
  }

  if (node.type === 'stairRun') {
    return <Stair node={node} selected={selected} />
  }

  if (node.type === 'railingRun') {
    return (
      <group>
        <Railing node={node} selected={selected} />
        {/* The footprint stays, so plan view still reads as a drawing. */}
        {railingSegments(node).map(([from, to], i) => (
          <Line
            key={i}
            points={[
              [from.x, from.y, from.z ?? 0],
              [to.x, to.y, to.z ?? 0],
            ]}
            color={selected ? '#fbbf24' : '#64748b'}
            lineWidth={selected ? 3 : 1}
          />
        ))}
      </group>
    )
  }

  if (node.start && node.end) {
    return (
      <Line
        points={[
          [node.start.x, node.start.y, node.start.z ?? 0],
          [node.end.x, node.end.y, node.end.z ?? 0],
        ]}
        color={selected ? '#fbbf24' : '#e2e8f0'}
        lineWidth={selected ? 4 : 2}
      />
    )
  }

  return null
}

/** Everything in the document that is currently on a visible layer. */
function Geometry() {
  const doc = useDraft((s) => s.doc)
  const selection = useDraft((s) => s.selection)

  // Hidden layers drop out of the scene entirely. They stay in the document,
  // and — deliberately — stay in the takeoff.
  const nodes = useMemo(
    () => Object.values(doc.nodes).filter((node) => isVisible(doc, node)),
    [doc],
  )

  return nodes.map((node) => (
    <NodeView key={node.id} doc={doc} node={node} selected={node.id === selection} />
  ))
}

/**
 * The shape being dragged out right now.
 *
 * Resolved through the same table the commit uses, so what you see while
 * dragging is exactly what lands — a preview computed a second way is a
 * preview that eventually lies.
 */
function ShapePreview() {
  const tool = useDraft((s) => s.tool)
  const shapeBase = useDraft((s) => s.shapeBase)
  const snap = useDraft((s) => s.snap)
  const sides = useDraft((s) => s.polygonSides)

  if (!shapeBase || !snap || !SHAPE_TOOLS[tool]) return null

  const points = SHAPE_TOOLS[tool](shapeBase, snap.point, sides)
  if (points.length < 3) return null

  return (
    <Line
      points={[...points, points[0]].map((p) => [p.x, p.y, p.z ?? 0])}
      color={snap.color}
      lineWidth={2}
      dashed
      dashSize={4}
      gapSize={3}
    />
  )
}

/** The line being drawn right now, from the anchor to the inferred point. */
function RubberBand() {
  const anchor = useDraft((s) => s.anchor)
  const snap = useDraft((s) => s.snap)

  if (!anchor || !snap) return null

  return (
    <Line
      points={[
        [anchor.x, anchor.y, anchor.z ?? 0],
        [snap.point.x, snap.point.y, snap.point.z ?? 0],
      ]}
      color={snap.color}
      lineWidth={2}
      dashed
      dashSize={4}
      gapSize={3}
    />
  )
}

/** Ground grid at one foot, with a heavier line every ten. */
function Grid() {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <gridHelper args={[1200, 100, '#334155', '#1e293b']} />
    </group>
  )
}

/** Origin axes, in the conventional red/green/blue. */
function Axes() {
  const span = 600
  return (
    <>
      <Line points={[[-span, 0, 0], [span, 0, 0]]} color="#ef4444" lineWidth={1} transparent opacity={0.5} />
      <Line points={[[0, -span, 0], [0, span, 0]]} color="#22c55e" lineWidth={1} transparent opacity={0.5} />
      <Line points={[[0, 0, -span], [0, 0, span]]} color="#3b82f6" lineWidth={1} transparent opacity={0.5} />
    </>
  )
}

export default function Viewport() {
  const view = useDraft((s) => s.view)
  const isPlan = view === 'plan'

  const hostRef = useRef(null)

  // R3F measures itself with a ResizeObserver and refuses to mount the scene
  // until that reports a non-zero size. Some embedded browsers never deliver
  // the *initial* observation, which leaves a permanently blank viewport — and
  // because the scene never mounts, nothing inside the Canvas can correct it.
  // R3F does re-measure on window resize, so nudging that breaks the deadlock.
  //
  // Polled rather than fired once because the nudge has to land after R3F has
  // attached its own listener. Stops as soon as the drawing buffer matches the
  // element, and gives up after a few seconds so a genuinely zero-sized
  // container can't spin forever. In a normal browser the first check passes
  // and this never fires at all.
  //
  // The interval is deliberately slower than R3F's own resize debounce: nudging
  // faster than it settles just restarts the debounce timer every tick, and the
  // measurement never lands.
  useEffect(() => {
    const deadline = performance.now() + 5000

    const id = setInterval(() => {
      const canvas = hostRef.current?.querySelector('canvas')
      const settled =
        canvas && Math.abs(canvas.width - canvas.getBoundingClientRect().width) < 2

      if (settled || performance.now() > deadline) {
        clearInterval(id)
        return
      }
      window.dispatchEvent(new Event('resize'))
    }, 200)

    return () => clearInterval(id)
  }, [view])

  return (
    <div ref={hostRef} className="h-full w-full">
      <Canvas
        // Plan starts orthographic looking down; 3D starts perspective.
        // Remounting on view change is deliberate — swapping camera type under
        // a live OrbitControls is where subtle state bugs live.
        key={view}
        orthographic={isPlan}
        camera={
          isPlan
            ? { position: [0, 0, 500], zoom: 1.6, up: [0, 1, 0], near: -5000, far: 5000 }
            : { position: [360, -420, 300], fov: 45, up: [0, 0, 1], near: 1, far: 20000 }
        }
        className="bg-slate-950"
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[200, -300, 400]} intensity={1.2} />
        <Grid />
        <Axes />
        <SizeGuard />
        <Geometry />
        <RubberBand />
        <ShapePreview />
        <PointerBridge />
        <OrbitControls
          makeDefault
          enableRotate={!isPlan}
          // Left button draws, so pan and orbit move to the other buttons.
          mouseButtons={{
            LEFT: null,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: isPlan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
          }}
        />
      </Canvas>
    </div>
  )
}
