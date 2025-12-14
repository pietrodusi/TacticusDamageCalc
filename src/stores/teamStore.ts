import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Character, TeamMember } from '../types';

const MAX_TEAM_SIZE = 5;

// Default progression step and rank (Mythic 11★, Adamantine I)
const DEFAULT_PROGRESSION_STEP = 16;
const DEFAULT_RANK = 18;

interface TeamState {
  team: TeamMember[];
  addCharacter: (character: Character, progressionStepIndex?: number, rank?: number) => void;
  removeCharacter: (characterId: string) => void;
  updateCharacterProgression: (characterId: string, progressionStepIndex: number, rank: number) => void;
  clearTeam: () => void;
  canAddCharacter: () => boolean;
  reorderTeam: (fromIndex: number, toIndex: number) => void;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
      team: [],

      addCharacter: (character, progressionStepIndex = DEFAULT_PROGRESSION_STEP, rank = DEFAULT_RANK) => {
        const { team } = get();
        if (team.length >= MAX_TEAM_SIZE) return;
        if (team.some((c) => c.id === character.id)) return;

        const teamMember: TeamMember = {
          ...character,
          progressionStepIndex,
          rank,
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
    }),
    {
      name: 'tacticus-team-storage',
    }
  )
);
