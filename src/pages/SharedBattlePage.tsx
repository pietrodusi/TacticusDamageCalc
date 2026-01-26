/**
 * SharedBattlePage - Display shared battle simulation results
 * Parses URL query parameter and renders read-only battle view
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AlertCircle, Calculator, ExternalLink } from 'lucide-react';
import {
  parseShareDataFromUrl,
  decodeShareData,
  type DecodedShareData,
} from '../services/sharing';
import { getCharacter, getBossAtRank, getMachineOfWarAtStars } from '../services/dataService';
import type { Character } from '../types/character';
import type { Boss, BossRank } from '../types/boss';
import type { MachineOfWarWithBonus, MachineOfWarStars } from '../types/machineOfWar';
import { SharedBattleView } from '../components/battle/SharedBattleView';

export function SharedBattlePage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DecodedShareData | null>(null);
  const [characters, setCharacters] = useState<(Character | null)[]>([]);
  const [boss, setBoss] = useState<Boss | null>(null);
  const [machine, setMachine] = useState<MachineOfWarWithBonus | null>(null);

  useEffect(() => {
    const loadSharedData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Parse compressed data from URL
        const compressedData = parseShareDataFromUrl();

        if (!compressedData) {
          setError('No shared battle data found in URL. The link may be invalid or expired.');
          setLoading(false);
          return;
        }

        // Decode the data
        const decoded = decodeShareData(compressedData);

        if (!decoded) {
          setError('Failed to decode battle data. The link may be corrupted or from an unsupported version.');
          setLoading(false);
          return;
        }

        setData(decoded);

        // Load character data
        const loadedCharacters = decoded.setup.team.map(member => {
          return getCharacter(member.characterId);
        });
        setCharacters(loadedCharacters);

        // Load boss data if present
        if (decoded.setup.boss) {
          const loadedBoss = getBossAtRank(
            decoded.setup.boss.id,
            decoded.setup.boss.rank as BossRank,
            decoded.setup.boss.applyModifiers
          );
          setBoss(loadedBoss);
        }

        // Load machine of war data if present
        if (decoded.setup.machine) {
          const loadedMachine = getMachineOfWarAtStars(
            decoded.setup.machine.id,
            decoded.setup.machine.stars as MachineOfWarStars
          );
          setMachine(loadedMachine);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading shared battle:', err);
        setError('An unexpected error occurred while loading the battle data.');
        setLoading(false);
      }
    };

    loadSharedData();
  }, [searchParams]);

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-imperial-gold mb-4"></div>
          <p className="text-gray-400">Loading shared battle...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="card p-8 max-w-md text-center">
            <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-100 mb-2">
              Unable to Load Battle
            </h2>
            <p className="text-gray-400 mb-6">
              {error || 'The shared battle data could not be loaded.'}
            </p>
            <Link
              to="/calculator"
              className="btn-primary inline-flex items-center gap-2"
            >
              <Calculator size={18} />
              Try the Calculator
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header with CTA */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-display font-bold text-gray-100">
          Shared Battle Simulation
        </h1>
        <Link
          to="/calculator"
          className="btn-secondary inline-flex items-center gap-2 text-sm"
        >
          <Calculator size={16} />
          Try Calculator
          <ExternalLink size={14} />
        </Link>
      </div>

      {/* Shared Battle View */}
      <SharedBattleView
        data={data}
        characters={characters}
        boss={boss}
        machine={machine}
      />

      {/* Footer CTA */}
      <div className="mt-8 text-center">
        <p className="text-gray-500 mb-4">
          Want to create your own battle simulation?
        </p>
        <Link
          to="/calculator"
          className="btn-primary inline-flex items-center gap-2"
        >
          <Calculator size={18} />
          Open Damage Calculator
        </Link>
      </div>
    </div>
  );
}
