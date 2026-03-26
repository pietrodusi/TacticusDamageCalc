import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Character, TeamMember, EquippedItem, SelectedBoss, BossRank, SelectedMachineOfWar, MachineOfWarStars } from '../types';
import { getDefaultEquipment } from '../services/dataService';

const MAX_TEAM_SIZE = 5;

// Default progression step and rank (Mythic 12★, Adamantine II)
const DEFAULT_PROGRESSION_STEP = 17;
const DEFAULT_RANK = 19;

// Default boss rank (Legendary 1)
const DEFAULT_BOSS_RANK: BossRank = 13;

// Default Machine of War stars (Mythic 14★ = max bonus)
const DEFAULT_MACHINE_STARS: MachineOfWarStars = 14;

interface TeamState {
  team: TeamMember[];
  selectedBoss: SelectedBoss | null;
  selectedMachineOfWar: SelectedMachineOfWar | null;
  addCharacter: (character: Character, progressionStepIndex?: number, rank?: number, abilityLevels?: Record<string, number>, equipment?: Record<number, EquippedItem>) => void;
  removeCharacter: (characterId: string) => void;
  updateCharacterProgression: (characterId: string, progressionStepIndex: number, rank: number) => void;
  updateCharacterAbilityLevels: (characterId: string, abilityLevels: Record<string, number>) => void;
  updateCharacterEquipment: (characterId: string, equipment: Record<number, EquippedItem>) => void;
  clearAllEquipment: () => void;
  clearTeam: () => void;
  canAddCharacter: () => boolean;
  reorderTeam: (fromIndex: number, toIndex: number) => void;
  // Boss selection
  setSelectedBoss: (bossId: string, rank?: BossRank) => void;
  updateBossRank: (rank: BossRank) => void;
  toggleBossModifiers: (apply: boolean) => void;
  clearBoss: () => void;
  // Machine of War selection
  setSelectedMachineOfWar: (machineId: string, stars?: MachineOfWarStars) => void;
  updateMachineOfWarStars: (stars: MachineOfWarStars) => void;
  clearMachineOfWar: () => void;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
      team: [],
      selectedBoss: null,
      selectedMachineOfWar: null,

      addCharacter: (character, progressionStepIndex = DEFAULT_PROGRESSION_STEP, rank = DEFAULT_RANK, abilityLevels, equipment) => {
        const { team } = get();
        if (team.length >= MAX_TEAM_SIZE) return;
        if (team.some((c) => c.id === character.id)) return;

        // Use default equipment if not provided
        const finalEquipment = equipment ?? getDefaultEquipment(character.id, character.faction, character.itemSlots);

        const teamMember: TeamMember = {
          ...character,
          progressionStepIndex,
          rank,
          abilityLevels,
          equipment: finalEquipment,
        };

        set({ team: [...team, teamMember] });
      },

      removeCharacter: (characterId) => {
        set((state) => ({
          team: state.team.filter((c) => c.id !== characterId),
        }));
      },

      updateCharacterProgression: (characterId, progressionStepIndex, rank) => {
        set((state) => ({
          team: state.team.map((c) =>
            c.id === characterId
              ? { ...c, progressionStepIndex, rank }
              : c
          ),
        }));
      },

      updateCharacterAbilityLevels: (characterId, abilityLevels) => {
        set((state) => ({
          team: state.team.map((c) =>
            c.id === characterId
              ? { ...c, abilityLevels }
              : c
          ),
        }));
      },

      updateCharacterEquipment: (characterId, equipment) => {
        set((state) => ({
          team: state.team.map((c) =>
            c.id === characterId
              ? { ...c, equipment }
              : c
          ),
        }));
      },

      clearAllEquipment: () => {
        set((state) => ({
          team: state.team.map((c) => ({ ...c, equipment: {} })),
        }));
      },

      clearTeam: () => {
        set({ team: [] });
      },

      canAddCharacter: () => {
        return get().team.length < MAX_TEAM_SIZE;
      },

      reorderTeam: (fromIndex, toIndex) => {
        set((state) => {
          const newTeam = [...state.team];
          const [removed] = newTeam.splice(fromIndex, 1);
          newTeam.splice(toIndex, 0, removed);
          return { team: newTeam };
        });
      },

      // Boss selection functions
      setSelectedBoss: (bossId, rank = DEFAULT_BOSS_RANK) => {
        set({ selectedBoss: { bossId, rank, applyModifiers: true } });
      },

      updateBossRank: (rank) => {
        set((state) => {
          if (!state.selectedBoss) return state;
          return { selectedBoss: { ...state.selectedBoss, rank } };
        });
      },

      toggleBossModifiers: (apply) => {
        set((state) => {
          if (!state.selectedBoss) return state;
          return { selectedBoss: { ...state.selectedBoss, applyModifiers: apply } };
        });
      },

      clearBoss: () => {
        set({ selectedBoss: null });
      },

      // Machine of War selection functions
      setSelectedMachineOfWar: (machineId, stars = DEFAULT_MACHINE_STARS) => {
        set({ selectedMachineOfWar: { machineId, stars } });
      },

      updateMachineOfWarStars: (stars) => {
        set((state) => {
          if (!state.selectedMachineOfWar) return state;
          return { selectedMachineOfWar: { ...state.selectedMachineOfWar, stars } };
        });
      },

      clearMachineOfWar: () => {
        set({ selectedMachineOfWar: null });
      },
    }),
    {
      name: 'tacticus-team-storage',
    }
  )
);
