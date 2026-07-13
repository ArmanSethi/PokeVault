import { useId } from "react";

/**
 * The locked PokéVault card back (master spec §7): a navy field with a slowly rotating gold-navy
 * VORTEX/swirl (14 interleaved blades) clipped to an inner rounded frame, concentric rings, a gold
 * double frame, four corner diamonds, a central roundel with a faceted gold gem crest, and the
 * POKÉVAULT wordmark. The rings and gem are drawn OVER the swirl, so only the vortex moves. Original
 * artwork — never the real (trademarked) Pokémon card back. All colors are fixed hex: a card back is
 * a physical object, so it does NOT invert in dark mode. The gem is a placeholder for an eventual
 * logo mark. The swirl spins via CSS (`.pv-vortex`, ~42s/turn) and renders STATIC under
 * prefers-reduced-motion.
 */
export function CardBack({ className }: { className?: string }) {
  const clip = useId();

  // Vortex behind the gem: 7 outer + 7 inner blades, each placed at the card centre (95,130) and
  // rotated evenly; the inner ring is offset by 25° so the blades interleave. The whole group spins.
  const outer = Array.from({ length: 7 }, (_, i) => (
    <path
      key={`o${i}`}
      d="M0 0 C 26 -7 58 -16 92 -10 C 58 4 28 10 0 0 Z"
      fill="#164079"
      transform={`translate(95 130) rotate(${((i * 360) / 7).toFixed(3)})`}
    />
  ));
  const inner = Array.from({ length: 7 }, (_, i) => (
    <path
      key={`i${i}`}
      d="M0 0 C 18 -5 40 -11 60 -7 C 40 3 18 7 0 0 Z"
      fill="#1d4885"
      transform={`translate(95 130) rotate(${((i * 360) / 7 + 25).toFixed(3)})`}
    />
  ));

  const corners: Array<[number, number]> = [
    [20, 20],
    [170, 20],
    [20, 246],
    [170, 246],
  ];

  return (
    <svg
      viewBox="0 0 190 266"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="PokéVault card back"
    >
      <defs>
        <clipPath id={clip}>
          <rect x="11" y="11" width="168" height="244" rx="10" />
        </clipPath>
      </defs>
      <rect x="0" y="0" width="190" height="266" fill="#0e2f5e" />
      <g clipPath={`url(#${clip})`}>
        <g className="pv-vortex">
          {outer}
          {inner}
        </g>
        {/* rings over the swirl — only the vortex moves */}
        <circle cx="95" cy="130" r="52" fill="none" stroke="#1d4885" strokeWidth="1" />
        <circle cx="95" cy="130" r="44" fill="none" stroke="#265aa0" strokeWidth="1" />
      </g>
      <rect
        x="6"
        y="6"
        width="178"
        height="254"
        rx="13"
        fill="none"
        stroke="#c9a24a"
        strokeWidth="2"
      />
      <rect
        x="11"
        y="11"
        width="168"
        height="244"
        rx="10"
        fill="none"
        stroke="#2a5590"
        strokeWidth="1"
      />
      {corners.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x - 3}
          y={y - 3}
          width={6}
          height={6}
          fill="#c9a24a"
          transform={`rotate(45 ${x} ${y})`}
        />
      ))}
      <circle cx="95" cy="130" r="34" fill="#0b2650" stroke="#c9a24a" strokeWidth="2" />
      <circle cx="95" cy="130" r="29" fill="none" stroke="#7a6330" strokeWidth="0.75" />
      {/* faceted gold gem crest */}
      <polygon points="95,113 111,130 95,151 79,130" fill="none" stroke="#f2e4b4" strokeWidth="1" />
      <polygon points="95,113 79,130 95,130" fill="#e9d091" />
      <polygon points="95,113 111,130 95,130" fill="#d7b25c" />
      <polygon points="95,151 79,130 95,130" fill="#b28a3a" />
      <polygon points="95,151 111,130 95,130" fill="#c99f49" />
      <line x1="95" y1="113" x2="95" y2="151" stroke="#d9c483" strokeWidth="0.5" />
      <line x1="79" y1="130" x2="111" y2="130" stroke="#d9c483" strokeWidth="0.5" />
      <text x="95" y="238" textAnchor="middle" fontSize="9" letterSpacing="3.5" fill="#cdb673">
        POKÉVAULT
      </text>
    </svg>
  );
}
