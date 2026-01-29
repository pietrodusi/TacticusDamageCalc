/**
 * Buff Conditions Service
 * Defines toggleable conditions that affect buff application
 * Each condition represents a state the user can toggle (e.g., "Charging", "In Range", "Low HP")
 */

import type { BattleCharacter, SelectedMachineOfWar, BattleSummon, PooledBuff } from '../types';
import { getAbilityValues, getAbilityNameSync } from './abilities';
import { getTeamRequiredToggles } from './buffs/buffRegistry';
import { getMachineOfWarDamageBonus, getMachineOfWarDisplayName } from './dataService';

/**
 * Helper to check if a toggle is active (for boolean toggles in abilityToggles that can also contain numbers for counters)
 */
const isToggleActive = (value: boolean | number | undefined): boolean => value === true;

/**
 * A toggleable buff condition
 */
export interface BuffCondition {
  id: string;              // Unique ID for the toggle (stored in abilityToggles)
  label: string;           // Display label (e.g., "Charging", "Range 2 from Dante")
  source: string;          // Source ability/buff name
  sourceCharacter?: string; // Character providing the buff (for auras)
  effect: string;          // Effect description (e.g., "+3 hits, +582 crit dmg")
  isActive: boolean;       // Current toggle state
  category: 'self' | 'aura'; // Whether it's from own ability or teammate
  dependsOn?: string;      // ID of another condition this depends on (must be active to enable this)
  // Counter support (for abilities like EnmityForTheUnworthy)
  isCounter?: boolean;     // If true, this is a counter instead of a toggle
  counterValue?: number;   // Current counter value
  counterMin?: number;     // Minimum counter value (default 0)
  counterMax?: number;     // Maximum counter value (e.g., 6 for adjacent units)
  effectPerCount?: string; // Effect per count (e.g., "+5% dmg per unit")
}

/**
 * Options for buff condition generation
 */
export interface BuffConditionOptions {
  selectedMachineOfWar?: SelectedMachineOfWar | null;
  custodedUsedAbilityThisTurn?: boolean;  // For Stand Vigil range extension
  currentTurn?: number;  // For turn-cycling abilities like Serene Unifier
}

/**
 * Get all buff conditions applicable to a character
 * This combines own passive conditions and aura conditions from teammates
 * @param selectedMachineOfWar - Optional selected Machine of War for dynamic damage bonus
 */
export function getCharacterBuffConditions(
  character: BattleCharacter,
  team: BattleCharacter[],
  selectedMachineOfWar?: SelectedMachineOfWar | null,
  options?: BuffConditionOptions
): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Add universal "High Ground" condition for all characters
  conditions.push({
    id: 'HighGround',
    label: 'High Ground',
    source: 'Position',
    effect: '+50% damage',
    isActive: isToggleActive(character.abilityToggles['HighGround']),
    category: 'self',
  });

  // Add "Machine of War" condition only if a machine is selected
  if (selectedMachineOfWar) {
    const extraDmgPct = getMachineOfWarDamageBonus(
      selectedMachineOfWar.machineId,
      selectedMachineOfWar.stars
    );
    const machineName = getMachineOfWarDisplayName(selectedMachineOfWar.machineId);

    conditions.push({
      id: 'WarMachine',
      label: 'Machine of War',
      source: machineName,
      effect: `+${extraDmgPct}% damage`,
      isActive: isToggleActive(character.abilityToggles['WarMachine']),
      category: 'self',
    });
  }

  // Add "Adjacent to Boss" condition (only if team has buffs that require it)
  conditions.push(...getAdjacentToBossCondition(character, team));

  // Add "Boss at Range 2 from Eldryon" condition (only if team has Eldryon with Doom)
  conditions.push(...getBossRange2FromEldryonCondition(character, team));

  // Add own passive ability conditions
  conditions.push(...getOwnPassiveConditions(character));

  // Add Atlacoya-specific conditions
  conditions.push(...getAtlacoyaConditions(character, team));

  // Add aura conditions from teammates
  conditions.push(...getAuraConditions(character, team, options));

  return conditions;
}

/**
 * Get conditions from character's own passive abilities
 */
function getOwnPassiveConditions(character: BattleCharacter): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Saga of the Warrior Born (Ragnar) - Charging condition
  if (character.passiveAbilities.includes('SagaOfTheWarriorBorn')) {
    const levelIndex = character.abilityLevels?.['SagaOfTheWarriorBorn'] ?? 54;
    const values = getAbilityValues('SagaOfTheWarriorBorn', levelIndex);
    const abilityName = getAbilityNameSync('SagaOfTheWarriorBorn');

    if (values) {
      const extraHits = values.extraHits as number || 0;
      const critDmgBonus = values.critDmgBonus as number || 0;

      const effectParts: string[] = [];
      if (extraHits > 0) effectParts.push(`+${extraHits} hits`);
      if (critDmgBonus > 0) effectParts.push(`+${critDmgBonus} crit dmg`);

      conditions.push({
        id: 'SagaOfTheWarriorBorn',
        label: 'Charging',
        source: abilityName,
        effect: effectParts.join(', ') || 'Passive bonus',
        isActive: isToggleActive(character.abilityToggles['SagaOfTheWarriorBorn']),
        category: 'self',
      });
    }
  }

  // "Has not moved" condition - consolidate CrushingStrike and HeavyWeapon into one toggle
  const hasCrushingStrike = character.traits.includes('CrushingStrike');
  const hasHeavyWeapon = character.traits.includes('HeavyWeapon');

  if (hasCrushingStrike || hasHeavyWeapon) {
    const effects: string[] = [];
    const sources: string[] = [];

    if (hasCrushingStrike) {
      effects.push('+50% melee dmg');
      sources.push('Crushing Strike');
    }
    if (hasHeavyWeapon) {
      effects.push('+25% ranged dmg');
      sources.push('Heavy Weapon');
    }

    conditions.push({
      id: 'hasNotMoved',
      label: 'Has not moved',
      source: sources.join(', '),
      effect: effects.join(', '),
      isActive: isToggleActive(character.abilityToggles['hasNotMoved']),
      category: 'self',
    });
  }

  // Ranged Specialist trait - Started turn adjacent to enemy condition
  if (character.traits.includes('RangedSpecialist')) {
    conditions.push({
      id: 'RangedSpecialist_adjacentToEnemy',
      label: 'Started turn adjacent to enemy',
      source: 'Ranged Specialist',
      effect: 'Enables positional bonuses (Position)',
      isActive: isToggleActive(character.abilityToggles['RangedSpecialist_adjacentToEnemy']),
      category: 'self',
    });
  }

  // TacticalPrecision (Titus) - Charging changes ability damage type
  if (character.activeAbilities.includes('TacticalPrecision')) {
    const levelIndex = character.abilityLevels?.['TacticalPrecision'] ?? 54;
    const values = getAbilityValues('TacticalPrecision', levelIndex);
    const abilityName = getAbilityNameSync('TacticalPrecision');

    if (values) {
      const extraCritDmg = values.extraCritDmg as number || 0;
      conditions.push({
        id: 'TacticalPrecision_charging',
        label: 'Charging',
        source: abilityName,
        effect: `1x Bolter, 100% crit, +${extraCritDmg} crit dmg`,
        isActive: isToggleActive(character.abilityToggles['TacticalPrecision_charging']),
        category: 'self',
      });
    }
  }

  // Foehammer (Arjac) - Characters defeated counter for bonus damage
  if (character.activeAbilities.includes('Foehammer')) {
    const levelIndex = character.abilityLevels?.['Foehammer'] ?? 54;
    const values = getAbilityValues('Foehammer', levelIndex);
    const abilityName = getAbilityNameSync('Foehammer');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      // Counter for characters defeated
      const defeatedCount = (character.abilityToggles['Foehammer_defeated'] as unknown as number) ?? 0;
      conditions.push({
        id: 'Foehammer_defeated',
        label: 'Characters Defeated',
        source: abilityName,
        effect: defeatedCount > 0 ? `+${extraDmg * defeatedCount} dmg` : 'No bonus',
        effectPerCount: `+${extraDmg} dmg`,
        isActive: defeatedCount > 0,
        category: 'self',
        isCounter: true,
        counterValue: defeatedCount,
        counterMin: 0,
        counterMax: 10,  // Reasonable max for defeated characters
      });
    }
  }

  // Aggressive Onslaught (Mataneo) - Charging to summon Jump Pack Intercessors
  if (character.passiveAbilities.includes('AggressiveOnslaught')) {
    const levelIndex = character.abilityLevels?.['AggressiveOnslaught'] ?? 54;
    const values = getAbilityValues('AggressiveOnslaught', levelIndex);
    const abilityName = getAbilityNameSync('AggressiveOnslaught');

    if (values) {
      const summonHp = values.summonHp as number || 0;
      const summonDmg = values.summonDmg as number || 0;
      const summonArmor = values.summonArmor as number || 0;

      conditions.push({
        id: 'AggressiveOnslaught',
        label: 'Charging',
        source: abilityName,
        effect: `Summon 2x Intercessors (HP:${summonHp}, Dmg:${summonDmg}, Armor:${summonArmor})`,
        isActive: isToggleActive(character.abilityToggles['AggressiveOnslaught']),
        category: 'self',
      });
    }
  }

  // Hammer of Wrath (Mataneo) - Low HP for 2x damage
  if (character.activeAbilities.includes('HammerOfWrath')) {
    const levelIndex = character.abilityLevels?.['HammerOfWrath'] ?? 54;
    const values = getAbilityValues('HammerOfWrath', levelIndex);
    const abilityName = getAbilityNameSync('HammerOfWrath');

    if (values) {
      const healthPct = values.healthPct as number || 50;

      conditions.push({
        id: 'HammerOfWrath_lowHealth',
        label: `Low HP (≤${healthPct}%)`,
        source: abilityName,
        effect: '2x damage',
        isActive: isToggleActive(character.abilityToggles['HammerOfWrath_lowHealth']),
        category: 'self',
      });
    }
  }

  // Visions of Heresy (Lucien) - Low HP for pierce bonus
  if (character.passiveAbilities.includes('VisionsOfHeresy')) {
    const levelIndex = character.abilityLevels?.['VisionsOfHeresy'] ?? 54;
    const values = getAbilityValues('VisionsOfHeresy', levelIndex);
    const abilityName = getAbilityNameSync('VisionsOfHeresy');

    if (values) {
      const extraPierceRatio = values.extraPierceRatio as number || 0;
      const healthPct = values.healthPct as number || 50;

      conditions.push({
        id: 'VisionsOfHeresy_lowHealth',
        label: `Low HP (≤${healthPct}%)`,
        source: abilityName,
        effect: `+${extraPierceRatio}% pierce ratio`,
        isActive: isToggleActive(character.abilityToggles['VisionsOfHeresy_lowHealth']),
        category: 'self',
      });
    }
  }

  // Black Rage (Lucien) - Charging for damage bonus
  if (character.activeAbilities.includes('BlackRage')) {
    const levelIndex = character.abilityLevels?.['BlackRage'] ?? 54;
    const values = getAbilityValues('BlackRage', levelIndex);
    const abilityName = getAbilityNameSync('BlackRage');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'BlackRage_charging',
        label: 'Charging',
        source: abilityName,
        effect: `+${extraDmg} dmg`,
        isActive: isToggleActive(character.abilityToggles['BlackRage_charging']),
        category: 'self',
      });
    }
  }

  // Lord of Tempests (Njal) - Ice coverage counter
  if (character.passiveAbilities.includes('LordOfTempests')) {
    const levelIndex = character.abilityLevels?.['LordOfTempests'] ?? 54;
    const values = getAbilityValues('LordOfTempests', levelIndex);
    const abilityName = getAbilityNameSync('LordOfTempests');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      // Counter for surrounding Ice hexes (0-6)
      const iceHexCount = (character.abilityToggles['LordOfTempests'] as unknown as number) ?? 0;
      conditions.push({
        id: 'LordOfTempests',
        label: 'Surrounding Ice Hexes',
        source: abilityName,
        effect: iceHexCount > 0 ? `+${extraDmg * iceHexCount} dmg (normal attacks)` : 'No bonus',
        effectPerCount: `+${extraDmg} dmg`,
        isActive: iceHexCount > 0,
        category: 'self',
        isCounter: true,
        counterValue: iceHexCount,
        counterMin: 0,
        counterMax: 6,
      });
    }
  }

  // FearedInterrogator toggle removed - now uses "Adjacent to Boss" on Dark Angels teammates

  // Enmity for the Unworthy (Forcas) - Adjacent units (counter-based)
  if (character.passiveAbilities.includes('EnmityForTheUnworthy')) {
    const levelIndex = character.abilityLevels?.['EnmityForTheUnworthy'] ?? 54;
    const values = getAbilityValues('EnmityForTheUnworthy', levelIndex);
    const abilityName = getAbilityNameSync('EnmityForTheUnworthy');

    if (values) {
      const extraDmgPct = values.extraDmgPct as number || 0;
      const extraDmg = values.extraDmg as number || 0;

      // Counter for adjacent units (+extraDmgPct% damage per unit)
      const adjacentUnitsCount = (character.abilityToggles['EnmityForTheUnworthy_units'] as unknown as number) ?? 0;
      conditions.push({
        id: 'EnmityForTheUnworthy_units',
        label: 'Adjacent Units',
        source: abilityName,
        effect: adjacentUnitsCount > 0 ? `+${extraDmgPct * adjacentUnitsCount}% dmg` : 'No bonus',
        effectPerCount: `+${extraDmgPct}% dmg`,
        isActive: adjacentUnitsCount > 0,
        category: 'self',
        isCounter: true,
        counterValue: adjacentUnitsCount,
        counterMin: 0,
        counterMax: 6,
      });

      // Counter for adjacent Dark Angels (+extraDmg damage per DA)
      const adjacentDACount = (character.abilityToggles['EnmityForTheUnworthy_DA'] as unknown as number) ?? 0;
      conditions.push({
        id: 'EnmityForTheUnworthy_DA',
        label: 'Adjacent Dark Angels',
        source: abilityName,
        effect: adjacentDACount > 0 ? `+${extraDmg * adjacentDACount} dmg` : 'No bonus',
        effectPerCount: `+${extraDmg} dmg`,
        isActive: adjacentDACount > 0,
        category: 'self',
        isCounter: true,
        counterValue: adjacentDACount,
        counterMin: 0,
        counterMax: 6,
      });
    }
  }

  // Condemnor Stake (Roswitha) - Target is Psyker
  if (character.passiveAbilities.includes('CondemnorStake')) {
    const levelIndex = character.abilityLevels?.['CondemnorStake'] ?? 54;
    const values = getAbilityValues('CondemnorStake', levelIndex);
    const abilityName = getAbilityNameSync('CondemnorStake');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'CondemnorStake',
        label: 'Target is Psyker',
        source: abilityName,
        effect: `+${extraDmg} dmg`,
        isActive: isToggleActive(character.abilityToggles['CondemnorStake']),
        category: 'self',
      });
    }
  }

  // Avalanche of Muscle (Kut) - Charging
  if (character.passiveAbilities.includes('AvalancheOfMuscle')) {
    const levelIndex = character.abilityLevels?.['AvalancheOfMuscle'] ?? 54;
    const values = getAbilityValues('AvalancheOfMuscle', levelIndex);
    const abilityName = getAbilityNameSync('AvalancheOfMuscle');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'AvalancheOfMuscle',
        label: 'Charging',
        source: abilityName,
        effect: `+${extraDmg} dmg`,
        isActive: isToggleActive(character.abilityToggles['AvalancheOfMuscle']),
        category: 'self',
      });
    }
  }

  // Summary Execution (Yarrick) - Battle Fatigue
  if (character.passiveAbilities.includes('SummaryExecution')) {
    const levelIndex = character.abilityLevels?.['SummaryExecution'] ?? 54;
    const values = getAbilityValues('SummaryExecution', levelIndex);
    const abilityName = getAbilityNameSync('SummaryExecution');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;
      const extraDmg2 = values.extraDmg_2 as number || 0;

      conditions.push({
        id: 'SummaryExecution',
        label: 'Has Battle Fatigue',
        source: abilityName,
        effect: `+${extraDmg} dmg`,
        isActive: isToggleActive(character.abilityToggles['SummaryExecution']),
        category: 'self',
      });

      conditions.push({
        id: 'SummaryExecution_Executed',
        label: 'Execution happened',
        source: abilityName,
        effect: `+${extraDmg2} additional dmg`,
        isActive: isToggleActive(character.abilityToggles['SummaryExecution_Executed']),
        category: 'self',
        dependsOn: 'SummaryExecution',
      });
    }
  }

  // Inescapable Accuracy (Maugan Ra) - Did not move
  if (character.passiveAbilities.includes('InescapableAccuracy')) {
    const levelIndex = character.abilityLevels?.['InescapableAccuracy'] ?? 54;
    const values = getAbilityValues('InescapableAccuracy', levelIndex);
    const abilityName = getAbilityNameSync('InescapableAccuracy');

    if (values) {
      const extraCritChance = values.extraCritChance as number || 0;
      const extraCritDmg = values.extraCritDmg as number || 0;

      conditions.push({
        id: 'InescapableAccuracy',
        label: 'Did not move',
        source: abilityName,
        effect: `+${extraCritChance}% crit, +${extraCritDmg} crit dmg`,
        isActive: isToggleActive(character.abilityToggles['InescapableAccuracy']),
        category: 'self',
      });
    }
  }

  // Living Lightning (Thutmose) - Has moved
  if (character.passiveAbilities.includes('LivingLightning')) {
    const levelIndex = character.abilityLevels?.['LivingLightning'] ?? 54;
    const values = getAbilityValues('LivingLightning', levelIndex);
    const abilityName = getAbilityNameSync('LivingLightning');

    if (values) {
      const minDmg = values.minDmg as number || 0;
      const maxDmg = values.maxDmg as number || 0;

      conditions.push({
        id: 'LivingLightning',
        label: 'Has moved',
        source: abilityName,
        effect: `1x ${minDmg}-${maxDmg} DirectDamage`,
        isActive: isToggleActive(character.abilityToggles['LivingLightning']),
        category: 'self',
      });
    }
  }

  // Power Trip (Snappawrecka) - At full health
  if (character.passiveAbilities.includes('PowerTrip')) {
    const levelIndex = character.abilityLevels?.['PowerTrip'] ?? 54;
    const values = getAbilityValues('PowerTrip', levelIndex);
    const abilityName = getAbilityNameSync('PowerTrip');

    if (values) {
      const armorIgnored = values.armorIgnored as number || 0;

      conditions.push({
        id: 'PowerTrip',
        label: 'At full Health',
        source: abilityName,
        effect: `+1 hit, ignores ${armorIgnored} armor`,
        isActive: isToggleActive(character.abilityToggles['PowerTrip']),
        category: 'self',
      });
    }
  }

  // Smasha 'Ead (Tanksmasha) - Moved 2+ hexes
  if (character.passiveAbilities.includes('SmashaEad')) {
    const levelIndex = character.abilityLevels?.['SmashaEad'] ?? 54;
    const values = getAbilityValues('SmashaEad', levelIndex);
    const abilityName = getAbilityNameSync('SmashaEad');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'SmashaEad',
        label: 'Moved 2+ hexes',
        source: abilityName,
        effect: `+${extraDmg} dmg (normal attacks)`,
        isActive: isToggleActive(character.abilityToggles['SmashaEad']),
        category: 'self',
      });
    }
  }

  // Head-Claimer (Haarken) - Killed Character
  if (character.passiveAbilities.includes('HeadClaimer')) {
    const levelIndex = character.abilityLevels?.['HeadClaimer'] ?? 54;
    const values = getAbilityValues('HeadClaimer', levelIndex);
    const abilityName = getAbilityNameSync('HeadClaimer');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'HeadClaimer_Kills',
        label: 'Has kills',
        source: abilityName,
        effect: `+${extraDmg} dmg per kill`,
        isActive: isToggleActive(character.abilityToggles['HeadClaimer_Kills']),
        category: 'self',
      });

      conditions.push({
        id: 'HeadClaimer',
        label: 'Killed Character',
        source: abilityName,
        effect: '+1 hit per Character kill',
        isActive: isToggleActive(character.abilityToggles['HeadClaimer']),
        category: 'self',
      });
    }
  }

  // Beacon of Rage (Azkor) - Been attacked
  if (character.passiveAbilities.includes('BeaconOfRage')) {
    const levelIndex = character.abilityLevels?.['BeaconOfRage'] ?? 54;
    const values = getAbilityValues('BeaconOfRage', levelIndex);
    const abilityName = getAbilityNameSync('BeaconOfRage');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'BeaconOfRage',
        label: 'Been attacked',
        source: abilityName,
        effect: `+${extraDmg} dmg per attack (max 8)`,
        isActive: isToggleActive(character.abilityToggles['BeaconOfRage']),
        category: 'self',
      });
    }
  }

  // Skullsmasher (Macer) - Missing HP
  if (character.passiveAbilities.includes('Skullsmasher')) {
    const levelIndex = character.abilityLevels?.['Skullsmasher'] ?? 54;
    const values = getAbilityValues('Skullsmasher', levelIndex);
    const abilityName = getAbilityNameSync('Skullsmasher');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'Skullsmasher',
        label: 'Missing HP (10%)',
        source: abilityName,
        effect: `+${extraDmg} dmg per 10% HP missing`,
        isActive: isToggleActive(character.abilityToggles['Skullsmasher']),
        category: 'self',
      });
    }
  }

  // Trophy Taker (Tarvakh) - Target at low HP
  if (character.passiveAbilities.includes('TrophyTaker')) {
    const levelIndex = character.abilityLevels?.['TrophyTaker'] ?? 54;
    const values = getAbilityValues('TrophyTaker', levelIndex);
    const abilityName = getAbilityNameSync('TrophyTaker');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;
      const extraCritDmg = values.extraCritDmg as number || 0;

      conditions.push({
        id: 'TrophyTaker',
        label: 'Target at/below 50% HP',
        source: abilityName,
        effect: `+${extraDmg} dmg, +${extraCritDmg} crit dmg`,
        isActive: isToggleActive(character.abilityToggles['TrophyTaker']),
        category: 'self',
      });
    }
  }

  // Psychic Stalk (Ahriman) - Target on Fire
  if (character.passiveAbilities.includes('PsychicStalk')) {
    const levelIndex = character.abilityLevels?.['PsychicStalk'] ?? 54;
    const values = getAbilityValues('PsychicStalk', levelIndex);
    const abilityName = getAbilityNameSync('PsychicStalk');

    if (values) {
      const extraDmgPct = values.extraDmgPct as number || 25;

      conditions.push({
        id: 'PsychicStalk',
        label: 'Target on Fire',
        source: abilityName,
        effect: `+${extraDmgPct}% dmg (Flame/Psychic)`,
        isActive: isToggleActive(character.abilityToggles['PsychicStalk']),
        category: 'self',
      });
    }
  }

  // Reality Unbound (Yazaghor) - Enemies hit by Psychic
  if (character.passiveAbilities.includes('RealityUnbound')) {
    const levelIndex = character.abilityLevels?.['RealityUnbound'] ?? 54;
    const values = getAbilityValues('RealityUnbound', levelIndex);
    const abilityName = getAbilityNameSync('RealityUnbound');

    if (values) {
      const extraMaxDmg = values.extraMaxDmg as number || 0;

      conditions.push({
        id: 'RealityUnbound',
        label: 'Enemies hit by Psychic',
        source: abilityName,
        effect: `+${extraMaxDmg} max dmg per enemy hit`,
        isActive: isToggleActive(character.abilityToggles['RealityUnbound']),
        category: 'self',
      });
    }
  }

  // Terrifying Crescendo (Shiron) - Has Crescendo stacks
  if (character.passiveAbilities.includes('TerrifyingCrescendo')) {
    const levelIndex = character.abilityLevels?.['TerrifyingCrescendo'] ?? 54;
    const values = getAbilityValues('TerrifyingCrescendo', levelIndex);
    const abilityName = getAbilityNameSync('TerrifyingCrescendo');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'TerrifyingCrescendo',
        label: 'Has Crescendo stacks',
        source: abilityName,
        effect: `+${extraDmg} dmg per overkill/suppress (max 6)`,
        isActive: isToggleActive(character.abilityToggles['TerrifyingCrescendo']),
        category: 'self',
      });
    }
  }

  // Twisted Science (Hollan) - Affected by buff
  if (character.passiveAbilities.includes('TwistedScience')) {
    const levelIndex = character.abilityLevels?.['TwistedScience'] ?? 54;
    const values = getAbilityValues('TwistedScience', levelIndex);
    const abilityName = getAbilityNameSync('TwistedScience');

    if (values) {
      const hp = values.hp as number || 0;
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'TwistedScience',
        label: 'Affected by Twisted Science',
        source: abilityName,
        effect: `+${hp} max HP, +${extraDmg} dmg (GSC only)`,
        isActive: isToggleActive(character.abilityToggles['TwistedScience']),
        category: 'self',
      });
    }
  }

  // Decoys and Misdirection (Isaak) - Moved onto decoy
  if (character.passiveAbilities.includes('DecoysAndMisdirection')) {
    const levelIndex = character.abilityLevels?.['DecoysAndMisdirection'] ?? 54;
    const values = getAbilityValues('DecoysAndMisdirection', levelIndex);
    const abilityName = getAbilityNameSync('DecoysAndMisdirection');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'DecoysAndMisdirection',
        label: 'Moved onto decoy',
        source: abilityName,
        effect: `+${extraDmg} dmg this turn`,
        isActive: isToggleActive(character.abilityToggles['DecoysAndMisdirection']),
        category: 'self',
      });
    }
  }

  // Cosmic Horror (The Patermine) - Has stacks
  if (character.passiveAbilities.includes('CosmicHorror')) {
    const levelIndex = character.abilityLevels?.['CosmicHorror'] ?? 54;
    const values = getAbilityValues('CosmicHorror', levelIndex);
    const abilityName = getAbilityNameSync('CosmicHorror');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'CosmicHorror',
        label: 'Has Cosmic Horror stacks',
        source: abilityName,
        effect: `+${extraDmg} dmg`,
        isActive: isToggleActive(character.abilityToggles['CosmicHorror']),
        category: 'self',
      });
    }
  }

  // Heavy Grav-Cannon (Sy-gex) - Target is heavy armor
  if (character.passiveAbilities.includes('HeavyGravCannon')) {
    const levelIndex = character.abilityLevels?.['HeavyGravCannon'] ?? 54;
    const values = getAbilityValues('HeavyGravCannon', levelIndex);
    const abilityName = getAbilityNameSync('HeavyGravCannon');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;
      const extraPierceRatio = values.extraPierceRatio as number || 40;

      conditions.push({
        id: 'HeavyGravCannon',
        label: 'Target is Gravis/Terminator/Mechanical',
        source: abilityName,
        effect: `+${extraDmg} dmg, +${extraPierceRatio}% pierce`,
        isActive: isToggleActive(character.abilityToggles['HeavyGravCannon']),
        category: 'self',
      });
    }
  }

  // Lion Helm (Azrael) - Azrael's own bonus is always active (no toggle needed)
  // The bonus is automatically applied in executeOverwatchAttack

  // Deathwing (Baraqiel) - Damage blocked bonus
  if (character.passiveAbilities.includes('Deathwing')) {
    const levelIndex = character.abilityLevels?.['Deathwing'] ?? 54;
    const values = getAbilityValues('Deathwing', levelIndex);
    const abilityName = getAbilityNameSync('Deathwing');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;
      const isDamageBlockedActive = isToggleActive(character.abilityToggles['Deathwing_damageBlocked']);

      conditions.push({
        id: 'Deathwing_damageBlocked',
        label: 'Damage Blocked',
        source: abilityName,
        effect: `+${extraDmg} dmg (melee & PlasmaCannon)`,
        isActive: isDamageBlockedActive,
        category: 'self',
      });

      // Adjacent to another Dark Angel - doubles the bonus (x2)
      conditions.push({
        id: 'Deathwing_adjacentDA',
        label: 'Adjacent to Another Dark Angel',
        source: abilityName,
        effect: `x2 bonus (+${extraDmg * 2} total)`,
        isActive: isToggleActive(character.abilityToggles['Deathwing_adjacentDA']),
        category: 'self',
        dependsOn: 'Deathwing_damageBlocked',
      });
    }
  }

  return conditions;
}

/**
 * Get Atlacoya-specific conditions
 * Only shows these conditions for Atlacoya
 */
function getAtlacoyaConditions(character: BattleCharacter, team: BattleCharacter[]): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Only show for characters with Atlacoya's abilities
  const hasAtlacoyaAbilities = character.passiveAbilities.includes('DaughterOfTheAbyss') ||
                                character.activeAbilities.includes('TalonsOfTheEmperor');

  if (!hasAtlacoyaAbilities) return conditions;

  // Adjacent to Adeptus Custodes (for TalonsOfTheEmperor DirectDamage conversion)
  // Only show if there's at least one other Custodes in the team
  if (character.activeAbilities.includes('TalonsOfTheEmperor')) {
    const otherCustodes = team.filter(c =>
      c.id !== character.id && c.faction === 'Custodes'
    );

    if (otherCustodes.length > 0) {
      conditions.push({
        id: 'TalonsOfTheEmperor_adjacentToCustodes',
        label: 'Adjacent to Adeptus Custodes',
        source: 'Talons of the Emperor',
        effect: 'Converts to DirectDamage',
        isActive: isToggleActive(character.abilityToggles['TalonsOfTheEmperor_adjacentToCustodes']),
        category: 'self',
      });
    }
  }

  // Range 2 from Boss (for DaughterOfTheAbyss damage multiplier)
  if (character.passiveAbilities.includes('DaughterOfTheAbyss')) {
    const levelIndex = character.abilityLevels?.['DaughterOfTheAbyss'] ?? 54;
    const values = getAbilityValues('DaughterOfTheAbyss', levelIndex);
    const abilityName = getAbilityNameSync('DaughterOfTheAbyss');

    if (values) {
      const extraDmgPct = values.extraDmgPct as number || 0;
      const toggleId = `DaughterOfTheAbyss_${character.id}_range2FromBoss`;

      conditions.push({
        id: toggleId,
        label: 'Range 2 from Boss',
        source: abilityName,
        effect: `Team: +${extraDmgPct}% dmg (vs Psyker)`,
        isActive: isToggleActive(character.abilityToggles[toggleId]),
        category: 'self',
      });
    }
  }

  return conditions;
}

/**
 * Get aura conditions from teammates
 */
function getAuraConditions(
  character: BattleCharacter,
  team: BattleCharacter[],
  options?: BuffConditionOptions
): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Find teammates with aura abilities
  for (const teammate of team) {
    if (teammate.id === character.id) continue;

    // Lord of the Host (Dante) - provides buffs to RapidAssault/Flying characters
    if (teammate.passiveAbilities.includes('LordOfTheHost')) {
      // Check if character has RapidAssault or Flying trait
      const hasRapidAssault = character.traits.includes('RapidAssault');
      const hasFlying = character.traits.includes('Flying');

      if (hasRapidAssault || hasFlying) {
        const levelIndex = teammate.abilityLevels?.['LordOfTheHost'] ?? 54;
        const values = getAbilityValues('LordOfTheHost', levelIndex);
        const abilityName = getAbilityNameSync('LordOfTheHost');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;

          // Damage bonus condition - "Range 2 from [Dante]"
          const dmgToggleId = `LordOfTheHost_${teammate.id}_damage`;
          const isDmgActive = isToggleActive(character.abilityToggles[dmgToggleId]);
          conditions.push({
            id: dmgToggleId,
            label: `Range 2 from ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} melee dmg`,
            isActive: isDmgActive,
            category: 'aura',
          });

          // Extra melee hit condition - "Low HP (≤50%)"
          // Can only be enabled if In Range is active
          const hitsToggleId = `LordOfTheHost_${teammate.id}_hits`;
          const isHitsActive = isDmgActive && isToggleActive(character.abilityToggles[hitsToggleId]);
          conditions.push({
            id: hitsToggleId,
            label: 'Low HP (≤50%)',
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: '+1 melee hit',
            isActive: isHitsActive,
            category: 'aura',
            dependsOn: dmgToggleId,
          });
        }
      }
    }

    // First Among Traitors (Abaddon) - provides damage buff to Chaos characters
    if (teammate.passiveAbilities.includes('FirstAmongTraitors')) {
      // Check if character is Chaos alliance (not Abaddon himself)
      if (character.alliance === 'Chaos') {
        const levelIndex = teammate.abilityLevels?.['FirstAmongTraitors'] ?? 54;
        const values = getAbilityValues('FirstAmongTraitors', levelIndex);
        const abilityName = getAbilityNameSync('FirstAmongTraitors');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const maxDmg = values.maxDmg as number || 0;

          // Damage bonus condition - "Range 2 from [Abaddon]"
          const dmgToggleId = `FirstAmongTraitors_${teammate.id}_damage`;
          const isDmgActive = isToggleActive(character.abilityToggles[dmgToggleId]);
          conditions.push({
            id: dmgToggleId,
            label: `Range 2 from ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} to +${maxDmg} dmg`,
            isActive: isDmgActive,
            category: 'aura',
          });
        }
      }
    }

    // Way of the Short Blade (Farsight) - provides buffs to ranged attackers and T'au Empire melee
    if (teammate.passiveAbilities.includes('WayOfTheShortBlade')) {
      const levelIndex = teammate.abilityLevels?.['WayOfTheShortBlade'] ?? 54;
      const values = getAbilityValues('WayOfTheShortBlade', levelIndex);
      const abilityName = getAbilityNameSync('WayOfTheShortBlade');

      if (values) {
        const armorIgnored = values.armorIgnored as number || 0;
        const extraDmgPct = values.extraDmgPct as number || 0;

        // Check if character has normal ranged attacks (for armor ignore + damage buff)
        const hasRangedAttack = character.rangedHits !== undefined && character.rangedHits > 0;
        const isNotPsychic = character.rangedDamageType !== 'Psychic';

        if (hasRangedAttack && isNotPsychic) {
          // Ranged buff condition - "Within range 2 of adjacent enemy"
          const rangeToggleId = `WayOfTheShortBlade_${teammate.id}_range2`;
          const isRangeActive = isToggleActive(character.abilityToggles[rangeToggleId]);
          conditions.push({
            id: rangeToggleId,
            label: 'Range 2 from Boss',
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `-${armorIgnored} armor, +${extraDmgPct}% dmg`,
            isActive: isRangeActive,
            category: 'aura',
          });
        }

        // Check if character is T'au Empire (for melee follow-up)
        // Only for other T'au Empire characters (not Farsight himself)
        const isTauEmpire = character.faction === "T'au Empire" || character.faction === 'Tau';
        const hasMeleeAttack = character.meleeHits !== undefined && character.meleeHits > 0;

        if (isTauEmpire && hasMeleeAttack && hasRangedAttack) {
          // Melee follow-up condition - "Range 2 from Farsight"
          const meleeToggleId = `WayOfTheShortBlade_${teammate.id}_melee`;
          const isMeleeActive = isToggleActive(character.abilityToggles[meleeToggleId]);
          conditions.push({
            id: meleeToggleId,
            label: `Range 2 from ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: 'Additional ranged attack after melee',
            isActive: isMeleeActive,
            category: 'aura',
          });
        }
      }
    }

    // Structural Analyser (Darkstrider) - provides ranged damage bonus
    // T'au Empire units: Range 2 from Darkstrider
    // Non-Tau units with ranged attacks: Adjacent to Darkstrider
    if (teammate.passiveAbilities.includes('StructuralAnalyser')) {
      const isTauEmpire = character.faction === "T'au Empire" || character.faction === 'Tau';
      const hasRangedAttack = character.rangedHits !== undefined && character.rangedHits > 0;

      const levelIndex = teammate.abilityLevels?.['StructuralAnalyser'] ?? 54;
      const values = getAbilityValues('StructuralAnalyser', levelIndex);
      const abilityName = getAbilityNameSync('StructuralAnalyser');

      if (values) {
        const extraDmg = values.extraDmg as number || 0;

        if (isTauEmpire) {
          // T'au Empire units: Range 2 from Darkstrider
          const toggleId = `StructuralAnalyser_${teammate.id}_range2`;
          conditions.push({
            id: toggleId,
            label: `Range 2 from ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} ranged dmg (vs Markerlight)`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        } else if (hasRangedAttack) {
          // Non-Tau units with ranged attacks: Adjacent to Darkstrider
          const toggleId = `StructuralAnalyser_${teammate.id}_adjacent`;
          conditions.push({
            id: toggleId,
            label: `Adjacent to ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} ranged dmg (vs Markerlight)`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Destroy the Witch (Helbrecht passive) - damage bonus for melee attacks vs Psyker bosses
    if (teammate.passiveAbilities.includes('DestroyTheWitch')) {
      // Don't show for Helbrecht himself (he always gets the bonus)
      if (character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['DestroyTheWitch'] ?? 54;
        const values = getAbilityValues('DestroyTheWitch', levelIndex);
        const abilityName = getAbilityNameSync('DestroyTheWitch');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const toggleId = `DestroyTheWitch_${teammate.id}_adjacent`;

          conditions.push({
            id: toggleId,
            label: `Adjacent to ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} melee dmg (vs Psyker)`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Crusade of Wrath (Helbrecht active) - damage and pierce bonus for melee attacks
    // Only show if Helbrecht has this active ability
    if (teammate.activeAbilities.includes('CrusadeOfWrath')) {
      const levelIndex = teammate.abilityLevels?.['CrusadeOfWrath'] ?? 54;
      const values = getAbilityValues('CrusadeOfWrath', levelIndex);
      const abilityName = getAbilityNameSync('CrusadeOfWrath');

      if (values) {
        const extraDmg = values.extraDmg as number || 0;
        const extraPierceRatio = values.extraPierceRatio as number || 0;
        const toggleId = `CrusadeOfWrath_${teammate.id}_range2`;

        conditions.push({
          id: toggleId,
          label: `Range 2 from ${teammate.name}`,
          source: abilityName,
          sourceCharacter: teammate.name,
          effect: `+${extraDmg} dmg, +${extraPierceRatio}% pierce (melee)`,
          isActive: isToggleActive(character.abilityToggles[toggleId]),
          category: 'aura',
        });
      }
    }

    // Waaagh! (Gulgortz active) - damage and hit bonus for normal attacks
    // Only show for non-Orks (Orks get the buff automatically)
    if (teammate.activeAbilities.includes('Waaagh')) {
      // Only show for non-Orks
      if (character.faction !== 'Orks') {
        const levelIndex = teammate.abilityLevels?.['Waaagh'] ?? 54;
        const values = getAbilityValues('Waaagh', levelIndex);
        const abilityName = getAbilityNameSync('Waaagh');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const extraHit = values.extraHit as number || 1;
          const toggleId = `Waaagh_${teammate.id}_adjacent`;

          conditions.push({
            id: toggleId,
            label: `Adjacent to ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} dmg, +${extraHit} hit (normal attacks)`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Stand Vigil (Aesoth passive) - damage bonus for Special Attacks
    // Don't show for Aesoth himself (he doesn't get the bonus from his own aura)
    if (teammate.passiveAbilities.includes('StandVigil')) {
      if (character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['StandVigil'] ?? 54;
        const values = getAbilityValues('StandVigil', levelIndex);
        const abilityName = getAbilityNameSync('StandVigil');

        if (values) {
          const extraDmgPct = values.extraDmgPct as number || 0;
          const toggleId = `StandVigil_${teammate.id}`;

          // Dynamic label based on whether a Custodes used an ability this turn
          const rangeExtended = options?.custodedUsedAbilityThisTurn ?? false;
          const label = rangeExtended
            ? `Range 2 from ${teammate.name}`
            : `Adjacent to ${teammate.name}`;

          conditions.push({
            id: toggleId,
            label,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmgPct}% dmg (Special Attacks)`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Doctrina Imperatives (Tan Gi'da active) - armor bonus for Mechanical units
    // Only show for Mechanical faction characters (including Adeptus Mechanicus)
    if (teammate.activeAbilities.includes('DoctrinaImperatives')) {
      // Check if character is Mechanical (Adeptus Mechanicus faction or has Mechanical trait)
      const isMechanical = character.faction === 'Adeptus Mechanicus' ||
                           character.traits?.includes('Mechanical');

      if (isMechanical && character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['DoctrinaImperatives'] ?? 54;
        const values = getAbilityValues('DoctrinaImperatives', levelIndex);
        const abilityName = getAbilityNameSync('DoctrinaImperatives');

        if (values) {
          const extraArmor = values.extraArmor as number || 0;
          const toggleId = `DoctrinaImperatives_${teammate.id}_adjacent`;

          conditions.push({
            id: toggleId,
            label: `Adjacent to ${teammate.name}`,
            source: `${abilityName} (Protector)`,
            sourceCharacter: teammate.name,
            effect: `+${extraArmor} armor`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Serene Unifier (Aun'Shi passive) - turn-cycling aura buff
    // Don't show for Aun'Shi himself (he doesn't get the bonus from his own aura)
    if (teammate.passiveAbilities.includes('SereneUnifier')) {
      if (character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['SereneUnifier'] ?? 54;
        const values = getAbilityValues('SereneUnifier', levelIndex);
        const abilityName = getAbilityNameSync('SereneUnifier');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;

          // Check character faction for range type
          const isTau = character.faction === "T'au Empire" || character.faction === 'Tau';
          const rangeType = isTau ? 'range2' : 'adjacent';
          const rangeLabel = isTau ? `Range 2 from ${teammate.name}` : `Adjacent to ${teammate.name}`;

          // Get current phase based on turn (1-indexed, cycles 1-2-3)
          const turn = options?.currentTurn || 1;
          const phase = ((turn - 1) % 3) + 1;  // 1, 2, 3, 1, 2, 3
          const phaseNames = ['Sense of Stone', "Zephyr's Grace", 'Storm of Fire'];
          const phaseName = phaseNames[phase - 1];

          const toggleId = `SereneUnifier_${teammate.id}_${rangeType}`;

          // Only show effect for Storm of Fire (phase 3)
          const effect = phase === 3 ? `+${extraDmg} dmg (normal)` : 'No combat effect';

          conditions.push({
            id: toggleId,
            label: rangeLabel,
            source: `${abilityName} (${phaseName})`,
            sourceCharacter: teammate.name,
            effect,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Lion Helm (Azrael) - +extraDmg to Overwatch attacks for friendly units that can perform Overwatch
    // Note: This is in getAuraConditions which skips self, so Azrael's self-toggle is in getOwnPassiveConditions
    if (teammate.passiveAbilities.includes('LionHelm')) {
      // Show for characters that can perform Overwatch attacks:
      // 1. Characters with Overwatch trait (Azrael's self-toggle handled separately in getOwnPassiveConditions)
      // 2. Re'vas (has EarlyWarningOverride ability)
      // 3. Forcas (has CalibaniteGreatsword ability - Strike Stance enables Overwatch)
      const hasOverwatchTrait = character.traits.includes('Overwatch');
      const hasEarlyWarningOverride = character.activeAbilities?.includes('EarlyWarningOverride') ?? false;
      const hasCalibaniteGreatsword = character.activeAbilities?.includes('CalibaniteGreatsword') ?? false;
      const canPerformOverwatch = hasOverwatchTrait || hasEarlyWarningOverride || hasCalibaniteGreatsword;

      if (canPerformOverwatch) {
        const levelIndex = teammate.abilityLevels?.['LionHelm'] ?? 54;
        const values = getAbilityValues('LionHelm', levelIndex);
        const abilityName = getAbilityNameSync('LionHelm');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const toggleId = `LionHelm_${teammate.id}_overwatch`;

          conditions.push({
            id: toggleId,
            label: `Range 2 from ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} Overwatch dmg`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Astartes Banner (Thoread) - additional melee hit with damage cap for allies
    if (teammate.passiveAbilities.includes('AstartesBanner')) {
      if (character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['AstartesBanner'] ?? 54;
        const values = getAbilityValues('AstartesBanner', levelIndex);
        const abilityName = getAbilityNameSync('AstartesBanner');

        if (values) {
          const maxDmg = values.maxDmg as number || 0;
          const toggleId = `AstartesBanner_${teammate.id}_range2`;

          conditions.push({
            id: toggleId,
            label: `Range 2 from ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+1 melee hit (cap ${maxDmg})`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Spotter (Thaddeus) - ranged damage bonus to allies
    if (teammate.passiveAbilities.includes('SpotterReworked')) {
      // Only show for characters with ranged attacks (and not Thaddeus himself)
      const hasRangedAttack = character.rangedHits !== undefined && character.rangedHits > 0;
      if (hasRangedAttack && character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['SpotterReworked'] ?? 54;
        const values = getAbilityValues('SpotterReworked', levelIndex);
        const abilityName = getAbilityNameSync('SpotterReworked');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const extraDmgHeavy = values.extraDmg_2 as number || 0;
          const toggleId = `SpotterReworked_${teammate.id}_range2`;
          const heavyToggleId = `SpotterReworked_${teammate.id}_heavy`;

          conditions.push({
            id: toggleId,
            label: `Range 2 from ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} ranged dmg`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });

          // Heavy weapon bonus (depends on being in range)
          conditions.push({
            id: heavyToggleId,
            label: 'Has Heavy Weapon',
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmgHeavy - extraDmg} additional dmg`,
            isActive: isToggleActive(character.abilityToggles[heavyToggleId]),
            category: 'aura',
            dependsOn: toggleId,
          });
        }
      }
    }

    // Explosive Maladies (Pestillian) - Blast follow-up for adjacent allies
    if (teammate.passiveAbilities.includes('ExplosiveMaladies')) {
      if (character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['ExplosiveMaladies'] ?? 54;
        const values = getAbilityValues('ExplosiveMaladies', levelIndex);
        const abilityName = getAbilityNameSync('ExplosiveMaladies');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const toggleId = `ExplosiveMaladies_${teammate.id}_adjacent`;

          conditions.push({
            id: toggleId,
            label: `Adjacent to ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+1x ${extraDmg} Blast on ranged (Chaos: also melee)`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Infernal Pacts (Abraxas) - Psychic follow-up for adjacent Chaos allies
    if (teammate.passiveAbilities.includes('InfernalPacts')) {
      // Only show for Chaos faction characters
      if (character.alliance === 'Chaos' && character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['InfernalPacts'] ?? 54;
        const values = getAbilityValues('InfernalPacts', levelIndex);
        const abilityName = getAbilityNameSync('InfernalPacts');

        if (values) {
          const minDmg = values.minDmg as number || 0;
          const maxDmg = values.maxDmg as number || 0;
          const toggleId = `InfernalPacts_${teammate.id}_adjacent`;

          conditions.push({
            id: toggleId,
            label: `Adjacent to ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+1x ${minDmg}-${maxDmg} Psychic on ranged (Daemons: also melee)`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Obsessive Annunciation (Adamatar) - damage bonus vs enemies adjacent to Adamatar
    if (teammate.passiveAbilities.includes('ObsessiveAnnunciation')) {
      // Only show for characters with ranged attacks (and not Adamatar himself)
      const hasRangedAttack = character.rangedHits !== undefined && character.rangedHits > 0;
      if (hasRangedAttack && character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['ObsessiveAnnunciation'] ?? 54;
        const values = getAbilityValues('ObsessiveAnnunciation', levelIndex);
        const abilityName = getAbilityNameSync('ObsessiveAnnunciation');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const toggleId = `ObsessiveAnnunciation_${teammate.id}_targetAdj`;

          conditions.push({
            id: toggleId,
            label: `Target adjacent to ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} dmg (ranged)`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

    // Rites of Battle (Calgar) - damage bonus to adjacent allies
    // Imperial characters get higher bonus (extraDmg_2), others get extraDmg
    if (teammate.passiveAbilities.includes('RitesOfBattle')) {
      if (character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['RitesOfBattle'] ?? 54;
        const values = getAbilityValues('RitesOfBattle', levelIndex);
        const abilityName = getAbilityNameSync('RitesOfBattle');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const extraDmgImperial = values.extraDmg_2 as number || 0;
          const isImperial = character.alliance === 'Imperial';
          const dmgBonus = isImperial ? extraDmgImperial : extraDmg;
          const toggleId = `RitesOfBattle_${teammate.id}_adjacent`;

          conditions.push({
            id: toggleId,
            label: `Adjacent to ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${dmgBonus} dmg${isImperial ? ' (Imperial)' : ''}`,
            isActive: isToggleActive(character.abilityToggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }
  }

  return conditions;
}

/**
 * Get "Adjacent to Boss" condition for characters
 * Only shows if team has buffs that require this toggle
 * Displays all abilities that use this toggle in the effect description
 */
function getAdjacentToBossCondition(
  character: BattleCharacter,
  team: BattleCharacter[]
): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Check if any buff in the team requires this toggle
  const requiredToggles = getTeamRequiredToggles(team);
  if (!requiredToggles.has('adjacentToBoss')) {
    return conditions;
  }

  const toggleId = 'adjacentToBoss';
  const effectParts: string[] = [];

  // Check for LegendaryCommander (Trajann)
  const trajann = team.find(c => c.passiveAbilities.includes('LegendaryCommander'));
  if (trajann) {
    effectParts.push('Legendary Commander');
  }

  // Check for WayOfTheShortBlade (Farsight)
  const farsight = team.find(c => c.passiveAbilities.includes('WayOfTheShortBlade'));
  if (farsight) {
    effectParts.push('Way of the Short Blade');
  }

  // Check for OptimizedGait (Exitor-Rho)
  const exitorRho = team.find(c => c.passiveAbilities.includes('OptimizedGait'));
  if (exitorRho) {
    effectParts.push('Optimized Gait');
  }

  // Check for FearedInterrogator (Asmodai) - DA teammates show bonus value
  const asmodai = team.find(c => c.passiveAbilities.includes('FearedInterrogator'));
  if (asmodai) {
    // For Dark Angels teammates (not Asmodai), show the actual bonus value
    if (character.id !== asmodai.id && character.faction === 'DarkAngels') {
      const levelIndex = asmodai.abilityLevels?.['FearedInterrogator'] ?? 54;
      const values = getAbilityValues('FearedInterrogator', levelIndex);
      if (values) {
        const extraDmg = values.extraDmg as number || 0;
        effectParts.push(`Feared Interrogator (+${extraDmg} dmg)`);
      } else {
        effectParts.push('Feared Interrogator');
      }
    } else {
      // For Asmodai himself or non-DA characters, just list the ability name
      effectParts.push('Feared Interrogator');
    }
  }

  conditions.push({
    id: toggleId,
    label: 'Adjacent to Boss',
    source: 'Position',
    effect: effectParts.join(', '),
    isActive: isToggleActive(character.abilityToggles[toggleId]),
    category: 'self',
  });

  return conditions;
}

/**
 * Get "Boss at Range 2 from Eldryon" condition
 * Only shows for Eldryon if team has Doom ability
 * When active, all teammates get damage bonus from Doom
 */
function getBossRange2FromEldryonCondition(
  character: BattleCharacter,
  team: BattleCharacter[]
): BuffCondition[] {
  const conditions: BuffCondition[] = [];

  // Check if any buff in the team requires this toggle
  const requiredToggles = getTeamRequiredToggles(team);
  if (!requiredToggles.has('bossRange2FromEldryon')) {
    return conditions;
  }

  // Only show this toggle for Eldryon (the character with Doom)
  if (!character.passiveAbilities.includes('Doom')) {
    return conditions;
  }

  // Get Doom values for effect description
  const levelIndex = character.abilityLevels?.['Doom'] ?? 54;
  const values = getAbilityValues('Doom', levelIndex);
  const abilityName = getAbilityNameSync('Doom');

  if (values) {
    const extraDmg = values.extraDmg as number || 0;
    const extraDmg_2 = values.extraDmg_2 as number || 0;

    // Add "Boss at Range 2" toggle
    const toggleId = 'bossRange2FromEldryon';
    conditions.push({
      id: toggleId,
      label: 'Boss at Range 2',
      source: abilityName,
      effect: `Allies: +${extraDmg} normal dmg, Aeldari: +${extraDmg_2} all dmg`,
      isActive: isToggleActive(character.abilityToggles[toggleId]),
      category: 'self',
    });
  }

  return conditions;
}

/**
 * Check if a character has any buff conditions
 */
export function hasBuffConditions(
  character: BattleCharacter,
  team: BattleCharacter[],
  selectedMachineOfWar?: SelectedMachineOfWar | null,
  options?: BuffConditionOptions
): boolean {
  return getCharacterBuffConditions(character, team, selectedMachineOfWar, options).length > 0;
}

/**
 * Options for summon buff condition generation
 */
export interface SummonBuffConditionOptions {
  selectedMachineOfWar?: SelectedMachineOfWar | null;
  buffPool?: PooledBuff[];  // Active buffs in battle (to check for Waaagh!)
  currentTurn?: number;     // For turn-cycling abilities like Serene Unifier
}

/**
 * Get all buff conditions applicable to a summon
 * Similar to getCharacterBuffConditions but for summons
 */
export function getSummonBuffConditions(
  summon: BattleSummon,
  team: BattleCharacter[],
  options?: SummonBuffConditionOptions
): BuffCondition[] {
  const conditions: BuffCondition[] = [];
  const toggles = summon.abilityToggles || {};

  // Add universal "High Ground" condition for all summons
  conditions.push({
    id: 'HighGround',
    label: 'High Ground',
    source: 'Position',
    effect: '+50% damage',
    isActive: isToggleActive(toggles['HighGround']),
    category: 'self',
  });

  // Add "Machine of War" condition only if a machine is selected
  if (options?.selectedMachineOfWar) {
    const extraDmgPct = getMachineOfWarDamageBonus(
      options.selectedMachineOfWar.machineId,
      options.selectedMachineOfWar.stars
    );
    const machineName = getMachineOfWarDisplayName(options.selectedMachineOfWar.machineId);

    conditions.push({
      id: 'WarMachine',
      label: 'Machine of War',
      source: machineName,
      effect: `+${extraDmgPct}% damage`,
      isActive: isToggleActive(toggles['WarMachine']),
      category: 'self',
    });
  }

  // Check for Waaagh! buff from Gulgortz (applies to Ork summons like Ork Boyz)
  // Find the source character (Gulgortz) and check if Waaagh is active in buff pool
  const sourceCharacter = team.find(c => c.id === summon.sourceCharacterId);
  if (sourceCharacter?.activeAbilities.includes('Waaagh')) {
    // Check if Waaagh buff is active in the pool
    const waaghBuff = options?.buffPool?.find(b => b.sourceAbilityId === 'Waaagh');
    if (waaghBuff) {
      const levelIndex = sourceCharacter.abilityLevels?.['Waaagh'] ?? 54;
      const values = getAbilityValues('Waaagh', levelIndex);
      const abilityName = getAbilityNameSync('Waaagh');

      if (values) {
        const extraDmg = values.extraDmg as number || 0;
        const extraHit = values.extraHit as number || 1;
        const toggleId = `Waaagh_${sourceCharacter.id}_adjacent`;

        conditions.push({
          id: toggleId,
          label: `Adjacent to ${sourceCharacter.name}`,
          source: abilityName,
          sourceCharacter: sourceCharacter.name,
          effect: `+${extraDmg} dmg, +${extraHit} hit (normal attacks)`,
          isActive: isToggleActive(toggles[toggleId]),
          category: 'aura',
        });
      }
    }
  }

  // ShockAssault (Bellator passive) - bonus damage for adjacent Inceptors
  // Check source character specifically since Bellator summons Inceptors AND has ShockAssault
  if (summon.unitId === 'ultraSmnInceptor' && sourceCharacter?.passiveAbilities.includes('ShockAssault')) {
    const levelIndex = sourceCharacter.abilityLevels?.['ShockAssault'] ?? 54;
    const values = getAbilityValues('ShockAssault', levelIndex);
    const abilityName = getAbilityNameSync('ShockAssault');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;
      const toggleId = `ShockAssault_${sourceCharacter.id}_adjacentToBellator`;

      conditions.push({
        id: toggleId,
        label: `Adjacent to ${sourceCharacter.name}`,
        source: abilityName,
        sourceCharacter: sourceCharacter.name,
        effect: `+${extraDmg} dmg`,
        isActive: isToggleActive(toggles[toggleId]),
        category: 'aura',
      });
    }
  }

  // Add aura conditions from teammates (other than source character)
  for (const teammate of team) {
    // Skip source character (already handled Waaagh and ShockAssault above)
    if (teammate.id === summon.sourceCharacterId) continue;

    // Lord of the Host (Dante) - provides buffs to RapidAssault/Flying summons
    if (teammate.passiveAbilities.includes('LordOfTheHost')) {
      // Check if summon has RapidAssault or Flying trait
      const hasRapidAssault = summon.traits?.includes('RapidAssault');
      const hasFlying = summon.traits?.includes('Flying');

      if (hasRapidAssault || hasFlying) {
        const levelIndex = teammate.abilityLevels?.['LordOfTheHost'] ?? 54;
        const values = getAbilityValues('LordOfTheHost', levelIndex);
        const abilityName = getAbilityNameSync('LordOfTheHost');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;

          // Damage bonus condition - "Range 2 from [Dante]"
          const dmgToggleId = `LordOfTheHost_${teammate.id}_damage`;
          const isDmgActive = isToggleActive(toggles[dmgToggleId]);
          conditions.push({
            id: dmgToggleId,
            label: `Range 2 from ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} melee dmg`,
            isActive: isDmgActive,
            category: 'aura',
          });

          // Extra melee hit condition - "Low HP (≤50%)"
          // Can only be enabled if In Range is active
          const hitsToggleId = `LordOfTheHost_${teammate.id}_hits`;
          const isHitsActive = isDmgActive && isToggleActive(toggles[hitsToggleId]);
          conditions.push({
            id: hitsToggleId,
            label: 'Low HP (≤50%)',
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: '+1 melee hit',
            isActive: isHitsActive,
            category: 'aura',
            dependsOn: dmgToggleId,
          });
        }
      }
    }

    // Serene Unifier (Aun'Shi passive) - turn-cycling aura buff
    if (teammate.passiveAbilities.includes('SereneUnifier')) {
      const levelIndex = teammate.abilityLevels?.['SereneUnifier'] ?? 54;
      const values = getAbilityValues('SereneUnifier', levelIndex);
      const abilityName = getAbilityNameSync('SereneUnifier');

      if (values) {
        const extraDmg = values.extraDmg as number || 0;

        // Get current phase based on turn (1-indexed, cycles 1-2-3)
        const turn = options?.currentTurn || 1;
        const phase = ((turn - 1) % 3) + 1;  // 1, 2, 3, 1, 2, 3
        const phaseNames = ['Sense of Stone', "Zephyr's Grace", 'Storm of Fire'];
        const phaseName = phaseNames[phase - 1];

        const toggleId = `SereneUnifier_${teammate.id}_adjacent`;

        // Only show effect for Storm of Fire (phase 3)
        const effect = phase === 3 ? `+${extraDmg} dmg (normal)` : 'No combat effect';

        conditions.push({
          id: toggleId,
          label: `Adjacent to ${teammate.name}`,
          source: `${abilityName} (${phaseName})`,
          sourceCharacter: teammate.name,
          effect,
          isActive: isToggleActive(toggles[toggleId]),
          category: 'aura',
        });
      }
    }

    // Doctrina Imperatives (Tan Gi'da active) - armor bonus for Mechanical summons
    // Uses summon.traits from summons.json to check for Mechanical trait
    if (teammate.activeAbilities.includes('DoctrinaImperatives')) {
      // Check if summon has Mechanical trait (from summons.json)
      const isMechanical = summon.traits?.includes('Mechanical');

      if (isMechanical && teammate.doctrinaImperativeStance === 'protector') {
        const levelIndex = teammate.abilityLevels?.['DoctrinaImperatives'] ?? 54;
        const values = getAbilityValues('DoctrinaImperatives', levelIndex);
        const abilityName = getAbilityNameSync('DoctrinaImperatives');

        if (values) {
          const extraArmor = values.extraArmor as number || 0;
          const toggleId = `DoctrinaImperatives_${teammate.id}_adjacent`;

          conditions.push({
            id: toggleId,
            label: `Adjacent to ${teammate.name}`,
            source: `${abilityName} (Protector)`,
            sourceCharacter: teammate.name,
            effect: `+${extraArmor} armor`,
            isActive: isToggleActive(toggles[toggleId]),
            category: 'aura',
          });
        }
      }
    }

  }

  return conditions;
}

/**
 * Check if a summon has any buff conditions
 */
export function hasSummonBuffConditions(
  summon: BattleSummon,
  team: BattleCharacter[],
  options?: SummonBuffConditionOptions
): boolean {
  return getSummonBuffConditions(summon, team, options).length > 0;
}
