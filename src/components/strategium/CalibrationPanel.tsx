import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import type { HexCoord } from '../../types/strategium';
import { hexKey } from '../../services/strategium/hexUtils';

export interface GridOverrides {
  originX: number;
  originY: number;
  hexSize: number;
  verticalScale: number;
  rows: number;
  cols: number;
  levelYOffset: number;
  hexLevels: Record<string, number>;
  hexMargin: number;
}

interface CalibrationPanelProps {
  gridOverrides: GridOverrides;
  onGridChange: (overrides: GridOverrides) => void;
  gridOpacity: number;
  onOpacityChange: (opacity: number) => void;
  onClose: () => void;
  imageWidth: number;
  imageHeight: number;
  selectedHexes?: HexCoord[];
}

export function CalibrationPanel({
  gridOverrides,
  onGridChange,
  gridOpacity,
  onOpacityChange,
  onClose,
  imageWidth,
  imageHeight,
  selectedHexes = [],
}: CalibrationPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleChange = (field: keyof GridOverrides, value: number) => {
    onGridChange({ ...gridOverrides, [field]: value });
  };

  const handleHexLevelChange = (level: number) => {
    if (selectedHexes.length === 0) return;
    const newHexLevels = { ...gridOverrides.hexLevels };
    for (const hex of selectedHexes) {
      const key = hexKey(hex);
      if (level === 0) {
        delete newHexLevels[key];
      } else {
        newHexLevels[key] = level;
      }
    }
    onGridChange({ ...gridOverrides, hexLevels: newHexLevels });
  };

  // Get common level if all selected hexes have the same level, otherwise null
  const getCommonLevel = (): number | null => {
    if (selectedHexes.length === 0) return null;
    const firstLevel = gridOverrides.hexLevels[hexKey(selectedHexes[0])] ?? 0;
    const allSame = selectedHexes.every(hex => (gridOverrides.hexLevels[hexKey(hex)] ?? 0) === firstLevel);
    return allSame ? firstLevel : null;
  };
  const commonLevel = getCommonLevel();

  // Only include hexLevels in output if there are any
  const hasHexLevels = Object.keys(gridOverrides.hexLevels).length > 0;

  const jsonOutput = JSON.stringify(
    {
      hexGrid: {
        originX: gridOverrides.originX,
        originY: gridOverrides.originY,
        hexSize: gridOverrides.hexSize,
        verticalScale: Math.round(gridOverrides.verticalScale * 100) / 100,
        rotation: 0,
        rows: gridOverrides.rows,
        cols: gridOverrides.cols,
        ...(gridOverrides.levelYOffset > 0 && { levelYOffset: gridOverrides.levelYOffset }),
        ...(gridOverrides.hexMargin < 1 && { hexMargin: Math.round(gridOverrides.hexMargin * 100) / 100 }),
      },
      ...(hasHexLevels && { hexLevels: gridOverrides.hexLevels }),
    },
    null,
    2
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="w-64 bg-gray-800 rounded-lg p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-imperial-gold">Grid Calibration</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
          title="Close calibration"
        >
          <X size={18} />
        </button>
      </div>

      {/* Sliders */}
      <div className="space-y-3">
        <SliderControl
          label="Origin X"
          value={gridOverrides.originX}
          min={0}
          max={imageWidth}
          step={0.5}
          onChange={(v) => handleChange('originX', v)}
        />
        <SliderControl
          label="Origin Y"
          value={gridOverrides.originY}
          min={0}
          max={imageHeight}
          step={0.5}
          onChange={(v) => handleChange('originY', v)}
        />
        <SliderControl
          label="Hex Size"
          value={gridOverrides.hexSize}
          min={20}
          max={150}
          step={0.5}
          onChange={(v) => handleChange('hexSize', v)}
        />
        <SliderControl
          label="V. Scale"
          value={gridOverrides.verticalScale}
          min={0.3}
          max={1}
          step={0.01}
          onChange={(v) => handleChange('verticalScale', v)}
        />
        <SliderControl
          label="Rows"
          value={gridOverrides.rows}
          min={5}
          max={30}
          onChange={(v) => handleChange('rows', v)}
        />
        <SliderControl
          label="Cols"
          value={gridOverrides.cols}
          min={5}
          max={20}
          onChange={(v) => handleChange('cols', v)}
        />
        <SliderControl
          label="Hex Margin"
          value={gridOverrides.hexMargin}
          min={0.8}
          max={1}
          step={0.01}
          onChange={(v) => handleChange('hexMargin', v)}
        />

        <div className="border-t border-gray-700 pt-3">
          <SliderControl
            label="Level Offset"
            value={gridOverrides.levelYOffset}
            min={0}
            max={50}
            step={1}
            onChange={(v) => handleChange('levelYOffset', v)}
          />
        </div>

        {/* Selected Hex Level */}
        {selectedHexes.length > 0 && (
          <div className="border-t border-gray-700 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">
                {selectedHexes.length === 1
                  ? `Hex (${selectedHexes[0].q}, ${selectedHexes[0].r}) Level`
                  : `${selectedHexes.length} hexes selected`}
              </label>
            </div>
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((level) => (
                <button
                  key={level}
                  onClick={() => handleHexLevelChange(level)}
                  className={`flex-1 py-1 px-2 text-xs rounded ${
                    commonLevel === level
                      ? 'bg-imperial-gold text-gray-900 font-medium'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-gray-700 pt-3">
          <SliderControl
            label="Grid Opacity"
            value={gridOpacity}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => onOpacityChange(v)}
          />
        </div>
      </div>

      {/* Copy Button */}
      <button
        onClick={handleCopy}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
      >
        {copied ? (
          <>
            <Check size={16} className="text-green-400" />
            <span className="text-green-400">Copied!</span>
          </>
        ) : (
          <>
            <Copy size={16} className="text-gray-300" />
            <span className="text-gray-300">Copy to Clipboard</span>
          </>
        )}
      </button>

      {/* JSON Output */}
      <div className="flex-1 min-h-0">
        <label className="text-xs text-gray-400 mb-1 block">JSON Output:</label>
        <pre className="text-xs text-gray-300 bg-gray-900 rounded p-2 overflow-auto max-h-40 font-mono">
          {jsonOutput}
        </pre>
      </div>
    </div>
  );
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  step?: number;
}

function SliderControl({ label, value, min, max, onChange, step = 1 }: SliderControlProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-400">{label}</label>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) onChange(val);
          }}
          className="w-16 text-xs text-gray-300 font-mono bg-gray-700 rounded px-1 py-0.5 text-right"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-imperial-gold"
      />
    </div>
  );
}
