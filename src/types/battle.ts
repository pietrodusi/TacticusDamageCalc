import type { Character, TeamMember } from './character';

export type ActionType = 'move' | 'attack' | 'meleeAttack' | 'rangedAttack' | 'ability' | 'wait';

export interface BattleCharacter extends TeamMember {
  currentHealth: number;
  position: { x: number; y: number };
  hasMoved: boolean;
  hasActed: boolean;
  buffs: Buff[];
  debuffs: Debuff[];
  // Calculated stats based on rarity/rank
  calculatedDamage: number;
  calculatedHealth: number;
  calculatedArmour: number;
  // Track total damage dealt by this character
  totalDamageDealt: number;
}

export interface Buff {
  id: string;
  name: string;
  duration: number; // turns remaining
  effect: BuffEffect;
}

export interface Debuff {
  id: string;
  name: string;
  duration: number;
  effect: DebuffEffect;
}

export interface BuffEffect {
  damageBonus?: number;
  damageMultiplier?: number;
  armourBonus?: number;
  movementBonus?: number;
}

export interface DebuffEffect {
  damagePenalty?: number;
  damageMultiplier?: number; // < 1 for reduction
  armourPenalty?: number;
  movementPenalty?: number;
}

export interface Action {
  type: ActionType;
  characterId: string;
  targetId?: string;
  targetPosition?: { x: number; y: number };
}

export interface TurnAction {
  characterId: string;
  actions: Action[];
}

export interface Turn {
  turnNumber: number;
  actions: TurnAction[];
  log: BattleLogEntry[];
}

export interface BattleLogEntry {
  timestamp: number;
  characterId: string;
  characterName: string;
  action: ActionType;
  target?: string;
  damage?: number;
  healing?: number;
  message: string;
}

export interface BattleState {
  turn: number;
  maxTurns: number;
  team: BattleCharacter[];
  boss?: BattleCharacter;
  turnHistory: Turn[];
  totalDamageDealt: number;
  isComplete: boolean;
}

export interface BattleSimulationConfig {
  characters: Character[];
  maxTurns: number;
}
