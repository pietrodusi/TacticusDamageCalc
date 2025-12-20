/**
 * DamageBar Component
 * Visualizes damage range with lower bound, average, and upper bound
 *
 * Layout:
 * |empty|<-- red -->|<-- green -->|empty|
 * 0     lower      avg          upper  max
 *                   ^
 *               (orange marker)
 */

interface DamageBarProps {
  lowerBound: number;
  average: number;
  upperBound: number;
  maxScale: number;  // Maximum value for the scale (typically max damage from any character)
  showLabels?: boolean;  // Whether to show numeric labels
  height?: number;  // Bar height in pixels
}

export function DamageBar({
  lowerBound,
  average,
  upperBound,
  maxScale,
  showLabels = true,
  height = 8,
}: DamageBarProps) {
  // Ensure maxScale is at least the upperBound
  const effectiveMax = Math.max(maxScale, upperBound, 1);

  // Calculate percentages for positioning
  const lowerPercent = (lowerBound / effectiveMax) * 100;
  const avgPercent = (average / effectiveMax) * 100;
  const upperPercent = (upperBound / effectiveMax) * 100;

  // Width of each section
  const redWidth = avgPercent - lowerPercent;
  const greenWidth = upperPercent - avgPercent;

  return (
    <div className="w-full">
      {/* Labels above the bar */}
      {showLabels && (
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-red-400">{lowerBound.toLocaleString()}</span>
          <span className="text-amber-400 font-medium">{average.toLocaleString()}</span>
          <span className="text-green-400">{upperBound.toLocaleString()}</span>
        </div>
      )}

      {/* The bar container */}
      <div
        className="relative w-full bg-gray-800 rounded overflow-hidden"
        style={{ height: `${height}px` }}
      >
        {/* Red section (lower to average) - "unlucky" zone */}
        <div
          className="absolute top-0 bottom-0 bg-gradient-to-r from-red-600 to-red-500"
          style={{
            left: `${lowerPercent}%`,
            width: `${redWidth}%`,
          }}
        />

        {/* Green section (average to upper) - "lucky" zone */}
        <div
          className="absolute top-0 bottom-0 bg-gradient-to-r from-green-600 to-green-500"
          style={{
            left: `${avgPercent}%`,
            width: `${greenWidth}%`,
          }}
        />

        {/* Orange marker at average */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
          style={{
            left: `${avgPercent}%`,
            transform: 'translateX(-50%)',
          }}
        />

        {/* Subtle tick marks at lower and upper bounds */}
        <div
          className="absolute top-0 bottom-0 w-px bg-gray-600"
          style={{ left: `${lowerPercent}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-gray-600"
          style={{ left: `${upperPercent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Compact version for inline use in battle log entries
 */
interface CompactDamageBarProps {
  lowerBound: number;
  average: number;
  upperBound: number;
  maxScale: number;
}

export function CompactDamageBar({
  lowerBound,
  average,
  upperBound,
  maxScale,
}: CompactDamageBarProps) {
  return (
    <DamageBar
      lowerBound={lowerBound}
      average={average}
      upperBound={upperBound}
      maxScale={maxScale}
      showLabels={false}
      height={6}
    />
  );
}
