interface TurnIndicatorProps {
  currentTurn: number;
  maxTurns: number;
}

export function TurnIndicator({ currentTurn, maxTurns }: TurnIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: maxTurns }, (_, i) => i + 1).map((turn) => (
        <div
          key={turn}
          className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold transition-colors ${
            turn === currentTurn
              ? 'bg-imperial-gold text-gray-900'
              : turn < currentTurn
              ? 'bg-green-900 text-green-300'
              : 'bg-gray-800 text-gray-500'
          }`}
        >
          {turn}
        </div>
      ))}
    </div>
  );
}
