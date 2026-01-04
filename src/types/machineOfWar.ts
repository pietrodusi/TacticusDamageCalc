/**
 * Machine of War Types
 * Types for Machine of War selection and display
 */

// Machine of War star level (11-14 stars at Mythic rarity)
export type MachineOfWarStars = 11 | 12 | 13 | 14;

// Machine of War selection state (similar to SelectedBoss)
export interface SelectedMachineOfWar {
  machineId: string; // 'tyranBiovore' or 'deathCrawler'
  stars: MachineOfWarStars; // 11, 12, 13, or 14 stars
}

// Machine of War display info
export interface MachineOfWarInfo {
  id: string;
  name: string;
  faction: string;
  iconUrl?: string;
  mythicAbilityId: string; // 'BlightedLand' or 'HyperCorrosiveAcid'
  mythicAbilityName: string;
}

// Machine of War with calculated bonus
export interface MachineOfWarWithBonus extends MachineOfWarInfo {
  extraDmgPct: number;
  stars: MachineOfWarStars;
}
