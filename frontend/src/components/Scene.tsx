import type { ReactNode } from 'react'

/**
 * Placeholder camera picture: a line drawing of the location plus one pose
 * skeleton per person, drawn in a 160x90 viewBox that fills its box (slice).
 */

export type Backdrop = 'workshop' | 'crossing' | 'sidewalk' | 'bar' | 'porch' | 'plaza' | 'parking'

export type PoseName =
  | 'stand'
  | 'walk'
  | 'run'
  | 'punch'
  | 'recoil'
  | 'carry'
  | 'perch'
  | 'fall'
  | 'lie'
  | 'crouch'

export interface PersonSpec {
  pose: PoseName
  /** Horizontal centre in scene units. */
  x: number
  /** Ground line (feet) in scene units. */
  y: number
  /** Standing height in scene units. */
  h: number
  /** Mirror the pose horizontally. */
  flip?: boolean
  /** People sharing a group are drawn inside one box. */
  group?: string
  /** Draw the box in the live anomaly red. */
  alarm?: boolean
}

export interface PropSpec {
  kind: 'package'
  x: number
  y: number
  w: number
  h: number
}

export interface SceneSpec {
  backdrop: Backdrop
  people: PersonSpec[]
  props?: PropSpec[]
}

type Pt = [number, number]

interface Pose {
  head: Pt
  neck: Pt
  hip: Pt
  lElbow: Pt
  lHand: Pt
  rElbow: Pt
  rHand: Pt
  lKnee: Pt
  lFoot: Pt
  rKnee: Pt
  rFoot: Pt
  /** Something held between the hands. */
  holds?: 'package'
}

// Keypoints in units of standing height: x centred on 0, y from 0 (top) to 1 (feet).
const POSES: Record<PoseName, Pose> = {
  stand: {
    head: [0, 0.08], neck: [0, 0.19], hip: [0, 0.53],
    lElbow: [-0.1, 0.35], lHand: [-0.12, 0.51], rElbow: [0.1, 0.35], rHand: [0.12, 0.51],
    lKnee: [-0.05, 0.77], lFoot: [-0.07, 1], rKnee: [0.05, 0.77], rFoot: [0.07, 1],
  },
  walk: {
    head: [0.02, 0.08], neck: [0.01, 0.19], hip: [0, 0.53],
    lElbow: [-0.07, 0.35], lHand: [-0.13, 0.48], rElbow: [0.08, 0.35], rHand: [0.15, 0.46],
    lKnee: [-0.08, 0.76], lFoot: [-0.17, 0.99], rKnee: [0.08, 0.77], rFoot: [0.13, 1],
  },
  run: {
    head: [0.1, 0.1], neck: [0.07, 0.21], hip: [-0.01, 0.53],
    lElbow: [0.15, 0.33], lHand: [0.24, 0.25], rElbow: [-0.08, 0.37], rHand: [-0.17, 0.3],
    lKnee: [0.17, 0.69], lFoot: [0.11, 0.9], rKnee: [-0.07, 0.77], rFoot: [-0.24, 0.9],
  },
  punch: {
    head: [0.04, 0.09], neck: [0.03, 0.2], hip: [-0.02, 0.53],
    lElbow: [0.17, 0.22], lHand: [0.32, 0.2], rElbow: [0.1, 0.33], rHand: [0.17, 0.24],
    lKnee: [0.11, 0.77], lFoot: [0.17, 1], rKnee: [-0.1, 0.77], rFoot: [-0.18, 1],
  },
  recoil: {
    head: [0.07, 0.11], neck: [0.05, 0.21], hip: [0, 0.53],
    lElbow: [-0.1, 0.25], lHand: [-0.12, 0.11], rElbow: [-0.03, 0.31], rHand: [-0.14, 0.21],
    lKnee: [0.09, 0.77], lFoot: [0.15, 1], rKnee: [-0.06, 0.77], rFoot: [-0.1, 1],
  },
  carry: {
    head: [0, 0.08], neck: [0, 0.19], hip: [0, 0.53],
    lElbow: [0.07, 0.35], lHand: [0.16, 0.39], rElbow: [0.1, 0.33], rHand: [0.18, 0.37],
    lKnee: [-0.07, 0.76], lFoot: [-0.14, 0.99], rKnee: [0.07, 0.77], rFoot: [0.1, 1],
    holds: 'package',
  },
  perch: {
    head: [0, 0.1], neck: [0, 0.21], hip: [0.02, 0.54],
    lElbow: [-0.1, 0.38], lHand: [-0.18, 0.32], rElbow: [-0.07, 0.4], rHand: [-0.15, 0.35],
    lKnee: [-0.14, 0.6], lFoot: [-0.12, 0.86], rKnee: [-0.12, 0.63], rFoot: [-0.06, 0.88],
  },
  fall: {
    head: [-0.24, 0.46], neck: [-0.15, 0.52], hip: [0.08, 0.72],
    lElbow: [-0.2, 0.37], lHand: [-0.12, 0.27], rElbow: [-0.03, 0.43], rHand: [0.04, 0.33],
    lKnee: [0.25, 0.62], lFoot: [0.4, 0.57], rKnee: [0.18, 0.86], rFoot: [0.23, 1],
  },
  lie: {
    head: [-0.44, 0.9], neck: [-0.34, 0.92], hip: [0.01, 0.93],
    lElbow: [-0.22, 0.84], lHand: [-0.11, 0.8], rElbow: [-0.27, 0.98], rHand: [-0.15, 1],
    lKnee: [0.2, 0.9], lFoot: [0.4, 0.94], rKnee: [0.21, 0.97], rFoot: [0.39, 1],
  },
  crouch: {
    head: [0.06, 0.42], neck: [0.03, 0.52], hip: [-0.05, 0.77],
    lElbow: [0.09, 0.63], lHand: [0.14, 0.75], rElbow: [0.03, 0.65], rHand: [0.07, 0.79],
    lKnee: [0.13, 0.75], lFoot: [0.05, 1], rKnee: [0.08, 0.83], rFoot: [-0.07, 1],
  },
}

const HEAD_R = 0.075
const LINE = '#22344C'
const SKELETON = '#B9C8D8'
const BOX = '#6F93B8'
const ALARM = '#FF6B6B'

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
  alarm: boolean
}

function place(p: PersonSpec, [kx, ky]: Pt): Pt {
  return [p.x + (p.flip ? -kx : kx) * p.h, p.y - p.h + ky * p.h]
}

function personBox(p: PersonSpec): Box {
  const pose = POSES[p.pose]
  const pts = (Object.keys(pose) as (keyof Pose)[])
    .filter((k) => k !== 'holds')
    .map((k) => place(p, pose[k] as Pt))
  const r = HEAD_R * p.h
  const [hx, hy] = place(p, pose.head)
  const xs = [...pts.map((q) => q[0]), hx - r, hx + r]
  const ys = [...pts.map((q) => q[1]), hy - r]
  const pad = 0.05 * p.h + 0.8
  return {
    x0: Math.min(...xs) - pad,
    y0: Math.min(...ys) - pad,
    x1: Math.max(...xs) + pad,
    y1: Math.max(...ys) + pad * 0.6,
    alarm: !!p.alarm,
  }
}

function boxesFor(people: PersonSpec[]): Box[] {
  const groups = new Map<string, Box>()
  const boxes: Box[] = []
  for (const p of people) {
    const b = personBox(p)
    if (!p.group) {
      boxes.push(b)
      continue
    }
    const g = groups.get(p.group)
    groups.set(
      p.group,
      g
        ? {
            x0: Math.min(g.x0, b.x0),
            y0: Math.min(g.y0, b.y0),
            x1: Math.max(g.x1, b.x1),
            y1: Math.max(g.y1, b.y1),
            alarm: g.alarm || b.alarm,
          }
        : b,
    )
  }
  return [...boxes, ...groups.values()]
}

function Skeleton({ p, strokeWidth }: { p: PersonSpec; strokeWidth: number }) {
  const pose = POSES[p.pose]
  const at = (k: Pt) => place(p, k)
  const line = (...pts: Pt[]) => 'M' + pts.map((k) => at(k).map((n) => n.toFixed(2)).join(' ')).join(' L')
  const [hx, hy] = at(pose.head)
  const d = [
    line(pose.neck, pose.hip),
    line(pose.lHand, pose.lElbow, pose.neck, pose.rElbow, pose.rHand),
    line(pose.lFoot, pose.lKnee, pose.hip, pose.rKnee, pose.rFoot),
  ].join(' ')
  const pkg = pose.holds === 'package' ? at([(pose.lHand[0] + pose.rHand[0]) / 2, (pose.lHand[1] + pose.rHand[1]) / 2]) : null
  return (
    <g stroke={SKELETON} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx={hx} cy={hy} r={HEAD_R * p.h} vectorEffect="non-scaling-stroke" />
      <path d={d} vectorEffect="non-scaling-stroke" />
      {pkg && (
        <rect
          x={pkg[0] - 0.02 * p.h}
          y={pkg[1] - 0.12 * p.h}
          width={0.17 * p.h}
          height={0.13 * p.h}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  )
}

// Stripe polygons for a crosswalk between two rows of a receding road.
function crosswalk(): string[] {
  const edgeL = (y: number) => 30 + ((90 - y) * 42) / 54
  const edgeR = (y: number) => 160 - edgeL(y)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const [y1, y2] = [57, 70]
  const n = 11
  const out: string[] = []
  for (let k = 0; k < n; k += 2) {
    const [t0, t1] = [k / n, (k + 1) / n]
    out.push(
      [
        [lerp(edgeL(y1), edgeR(y1), t0), y1],
        [lerp(edgeL(y1), edgeR(y1), t1), y1],
        [lerp(edgeL(y2), edgeR(y2), t1), y2],
        [lerp(edgeL(y2), edgeR(y2), t0), y2],
      ]
        .map((q) => q.map((v) => v.toFixed(1)).join(','))
        .join(' '),
    )
  }
  return out
}

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step)

function BackdropArt({ kind }: { kind: Backdrop }): ReactNode {
  switch (kind) {
    case 'workshop':
      return (
        <>
          <rect x="44" y="12" width="72" height="34" fill="#0D1620" />
          <path d="M44 12 L0 -4 M116 12 L160 -4 M44 46 L-6 90 M116 46 L166 90 M44 12 H116 M44 46 H116 M44 12 V46 M116 12 V46" />
          <path d="M62 46 L42 90 M80 46 L80 90 M98 46 L118 90 M30.4 58 H129.6 M14.5 72 H145.5" />
          <path d="M50 22 H72 M50 30 H72 M50 38 H72 M50 22 V46 M72 22 V46" />
          <rect x="86" y="18" width="22" height="14" />
          <path d="M97 18 V32" />
          <path d="M6 54 L30 45 L30 50 L6 60 Z M8 59 V74 M28 50 V64" />
          <path d="M136 50 L156 56 L156 64 L136 57 Z" />
        </>
      )
    case 'crossing':
      return (
        <>
          <path d="M0 36 H160 M30 90 L72 36 M130 90 L88 36 M6 90 L64 36 M154 90 L96 36" />
          <path d="M80 90 L80 74 M80 54 L80 36" strokeDasharray="4 4" />
          {crosswalk().map((pts) => (
            <polygon key={pts} points={pts} fill="#132134" />
          ))}
          <path d="M14 44 V82 M14 49 L60 46 M11 82 H17" />
          <path d="M24 48.4 L26 48.3 M36 47.7 L38 47.6 M48 46.9 L50 46.8" strokeWidth={2} />
          <rect x="112" y="14" width="34" height="22" fill="#0D1620" />
          <path d="M120 20 V30 M129 20 V30 M138 20 V30" />
        </>
      )
    case 'sidewalk': {
      const xs = [16, 34, 52, 68, 82, 94, 104]
      return (
        <>
          <path d="M0 4 L112 26 L112 34 L0 64 Z" fill="#0D1620" />
          <path d={xs.map((x) => `M${x} ${(4 + (x * 22) / 112).toFixed(1)} V${(64 - (x * 30) / 112).toFixed(1)}`).join(' ')} />
          <path d="M36 90 L120 34 M160 50 L124 32 M0 36 H160" />
          <path d="M80 62 V22 M80 22 L87 24" />
          <path d="M8 90 L64 62" strokeDasharray="3 4" />
        </>
      )
    }
    case 'bar': {
      const bottles = range(6, 152, 9)
      return (
        <>
          <path d="M0 14 H160 M0 25 H160 M0 36 H160" />
          <path
            d={[14, 25, 36]
              .flatMap((y, row) => bottles.map((x, i) => `M${x + row * 3} ${y} V${y - 4 - ((i + row) % 3) * 1.5}`))
              .join(' ')}
          />
          <path d="M0 50 L160 44 L160 58 L0 64 Z" fill="#0E1824" />
          <path d="M0 53 L160 47" />
          {[30, 62, 94, 126].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy={71} rx={6} ry={1.6} />
              <path d={`M${x - 4} 71.5 L${x - 5} 86 M${x + 4} 71.5 L${x + 5} 86 M${x - 4.5} 80 H${x + 4.5}`} />
            </g>
          ))}
        </>
      )
    }
    case 'porch':
      return (
        <>
          <rect x="0" y="0" width="160" height="48" fill="#0D1620" />
          <path d="M0 48 H160" />
          <rect x="96" y="12" width="22" height="36" />
          <path d="M114 30 h1" strokeWidth={2} />
          <rect x="22" y="16" width="34" height="20" />
          <path d="M39 16 V36 M22 26 H56" />
          <path d={range(-32, 192, 16).map((x) => `M${x} 90 L${(80 + (x - 80) * 0.6).toFixed(1)} 48`).join(' ')} />
          <path d="M134 48 L160 42 M138 48 V36 M150 45 V33 M136 37 L160 31" />
          <path d="M0 80 H34 M0 86 H40" />
        </>
      )
    case 'plaza':
      return (
        <>
          <path d="M0 28 H160 M0 34 H160 M0 42 H160 M0 54 H160 M0 72 H160" />
          <path d={range(-80, 240, 32).map((x) => `M${x} 90 L${(80 + ((x - 80) * 22) / 84).toFixed(1)} 28`).join(' ')} />
          <ellipse cx="112" cy="50" rx="18" ry="4.5" fill="#0E1824" />
          <ellipse cx="112" cy="54" rx="18" ry="4.5" />
          <path d="M94 50 V54 M130 50 V54 M112 44 V50" />
          <ellipse cx="112" cy="44" rx="6" ry="1.6" />
          <circle cx="24" cy="15" r="10" />
          <path d="M24 25 V40" />
        </>
      )
    case 'parking':
      return (
        <>
          <path d="M0 30 H160 M0 46 H160 M0 88 H160" />
          <path d={range(-24, 160, 28).map((x) => `M${x} 88 L${x + 20} 46`).join(' ')} />
          <path d="M134 46 V10 M134 10 L143 12" />
          <rect x="34" y="56" width="30" height="16" rx="3" fill="#0E1824" />
          <path d="M38 56 L42 50 H56 L60 56 M38 72 v3 M60 72 v3" />
          <rect x="92" y="58" width="30" height="16" rx="3" fill="#0E1824" />
          <path d="M96 58 L100 52 H114 L118 58 M96 74 v3 M118 74 v3" />
        </>
      )
  }
}

interface SceneProps {
  scene: SceneSpec
  className?: string
  /** Skeleton stroke in CSS pixels. */
  strokeWidth?: number
}

export default function Scene({ scene, className, strokeWidth = 1.5 }: SceneProps) {
  return (
    <svg
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <rect width="160" height="90" fill="#0A111A" />
      <g className="scene-lines" stroke={LINE} strokeWidth={1} fill="none">
        <BackdropArt kind={scene.backdrop} />
      </g>
      {scene.props?.map((pr, i) => (
        <rect
          key={i}
          x={pr.x}
          y={pr.y}
          width={pr.w}
          height={pr.h}
          fill="none"
          stroke={SKELETON}
          strokeWidth={strokeWidth * 0.8}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {scene.people.map((p, i) => (
        <Skeleton key={i} p={p} strokeWidth={strokeWidth} />
      ))}
      {boxesFor(scene.people).map((b, i) => (
        <rect
          key={i}
          x={b.x0}
          y={b.y0}
          width={b.x1 - b.x0}
          height={b.y1 - b.y0}
          rx={0.6}
          fill="none"
          stroke={b.alarm ? ALARM : BOX}
          strokeOpacity={b.alarm ? 1 : 0.6}
          strokeWidth={b.alarm ? 1.5 : 1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
