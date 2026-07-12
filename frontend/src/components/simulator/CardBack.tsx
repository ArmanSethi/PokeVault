import { useId } from "react";

/**
 * The locked PokéVault card back (master spec §7): a navy field, a 36-ray sunburst clipped to an
 * inner rounded frame, concentric rings, a gold double frame, four corner diamonds, a central
 * roundel with a faceted gold gem crest, and the POKÉVAULT wordmark. Original artwork — never the
 * real (trademarked) Pokémon card back. All colors are fixed hex: a card back is a physical object,
 * so it does NOT invert in dark mode. The gem is a placeholder for an eventual logo mark.
 */
export function CardBack({ className }: { className?: string }) {
  const clip = useId();
  const cx = 95;
  const cy = 130;
  const R = 215;

  const rays = Array.from({ length: 36 }, (_, i) => {
    const a0 = ((i * 10 - 2) * Math.PI) / 180;
    const a1 = ((i * 10 + 2) * Math.PI) / 180;
    const x0 = (cx + Math.cos(a0) * R).toFixed(1);
    const y0 = (cy + Math.sin(a0) * R).toFixed(1);
    const x1 = (cx + Math.cos(a1) * R).toFixed(1);
    const y1 = (cy + Math.sin(a1) * R).toFixed(1);
    return <path key={i} d={`M${cx} ${cy} L${x0} ${y0} L${x1} ${y1} Z`} fill="#164079" />;
  });

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
        {rays}
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
