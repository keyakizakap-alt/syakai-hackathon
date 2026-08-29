"use client";

import { CULTURES, CULTURE_IDS, type CultureReading } from "@/lib/types";

const SIZE = 260;
const C = SIZE / 2;
const R = 88;
/** 軸ラベルは半径 R+30 の外に出るため、viewBox に足す余白。無いと左右のラベルが見切れる */
const PAD = 26;

const VERDICT_COLOR = {
  green: "var(--color-green)",
  yellow: "var(--color-yellow)",
  red: "var(--color-red)",
} as const;

/** 4文化を4軸に置いたレーダー。真っ赤に染まる瞬間がデモの見せ場になる。 */
export function RiskRadar({ readings }: { readings: CultureReading[] }) {
  const byCulture = new Map(readings.map((r) => [r.culture, r]));
  const axes = CULTURE_IDS.map((id, i) => {
    // 上を起点に時計回り
    const angle = (i / CULTURE_IDS.length) * Math.PI * 2 - Math.PI / 2;
    const risk = byCulture.get(id)?.risk ?? 0;
    const verdict = byCulture.get(id)?.verdict ?? "green";
    const r = (risk / 100) * R;
    return {
      id,
      angle,
      risk,
      verdict,
      point: [C + Math.cos(angle) * r, C + Math.sin(angle) * r] as const,
      edge: [C + Math.cos(angle) * R, C + Math.sin(angle) * R] as const,
      label: [C + Math.cos(angle) * (R + 30), C + Math.sin(angle) * (R + 30)] as const,
    };
  });

  const worst = axes.reduce((a, b) => (b.risk > a.risk ? b : a), axes[0]);
  const fill = VERDICT_COLOR[worst.verdict];
  const polygon = axes.map((a) => a.point.join(",")).join(" ");

  return (
    <svg
      viewBox={`${-PAD} ${-PAD / 2} ${SIZE + PAD * 2} ${SIZE + PAD}`}
      className="h-auto w-full max-w-[300px]"
      role="img"
      aria-label={`文化圏別の誤読リスク。${axes.map((a) => `${CULTURES[a.id].shortLabel} ${a.risk}`).join("、")}`}
    >
      {[0.25, 0.5, 0.75, 1].map((s) => (
        <circle key={s} cx={C} cy={C} r={R * s} fill="none" stroke="var(--color-line)" strokeWidth={1} />
      ))}
      {axes.map((a) => (
        <line key={a.id} x1={C} y1={C} x2={a.edge[0]} y2={a.edge[1]} stroke="var(--color-line)" strokeWidth={1} />
      ))}

      <polygon points={polygon} fill={fill} fillOpacity={0.22} stroke={fill} strokeWidth={2} />

      {axes.map((a) => (
        <circle key={a.id} cx={a.point[0]} cy={a.point[1]} r={4} fill={VERDICT_COLOR[a.verdict]} />
      ))}

      {axes.map((a) => (
        <text
          key={a.id}
          x={a.label[0]}
          y={a.label[1]}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={10}
          fill="var(--color-muted)"
        >
          <tspan x={a.label[0]} dy="-0.4em">
            {CULTURES[a.id].shortLabel}
          </tspan>
          <tspan x={a.label[0]} dy="1.3em" fill={VERDICT_COLOR[a.verdict]} fontWeight={600}>
            {a.risk}
          </tspan>
        </text>
      ))}
    </svg>
  );
}
