import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';

export interface GridOverrides {
  originX: number;
  originY: number;
  hexSize: number;
  verticalScale: number;
  rows: number;
  cols: number;
}

interface CalibrationPanelProps {
  gridOverrides: GridOverrides;
  onGridChange: (overrides: GridOverrides) => void;
  gridOpacity: number;
  onOpacityChange: (opacity: number) => void;
  onClose: () => void;
  imageWidth: number;
  imageHeight: number;
}

export function CalibrationPanel({
  gridOverrides,
  onGridChange,
  gridOpacity,
  onOpacityChange,
  onClose,
  imageWidth,
  imageHeight,
}: CalibrationPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleChange = (field: keyof GridOverrides, value: number) => {
    onGridChange({ ...gridOverrides, [field]: value });
  };

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
      },
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
          onChange={(v) => handleChange('originX', v)}
        />
        <SliderControl
          label="Origin Y"
          value={gridOverrides.originY}
          min={0}
          max={imageHeight}
          onChange={(v) => handleChange('originY', v)}
        />
        <SliderControl
          label="Hex Size"
          value={gridOverrides.hexSize}
          min={20}
          max={100}
          onChange={(v) => handleChange('hexSize', v)}
        />
        <SliderControl
          label="V. Scale"
          value={Math.round(gridOverrides.verticalScale * 100)}
          min={30}
          max={100}
          onChange={(v) => handleChange('verticalScale', v / 100)}
          suffix="%"
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

        <div className="border-t border-gray-700 pt-3">
          <SliderControl
            label="Grid Opacity"
            value={Math.round(gridOpacity * 100)}
            min={10}
            max={100}
            onChange={(v) => onOpacityChange(v / 100)}
            suffix="%"
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
  suffix?: string;
}

function SliderControl({ label, value, min, max, onChange, suffix = '' }: SliderControlProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-400">{label}</label>
        <span className="text-xs text-gray-300 font-mono">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-imperial-gold"
      />
    </div>
  );
}
