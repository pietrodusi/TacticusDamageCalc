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
 * A toggleable buff condition
 */
export interface BuffCondition {
  id: string;              // Unique ID for the toggle (stored in abilityToggles)
  label: string;           // Display label (e.g., "Charging", "In Range of Dante")
  source: string;          // Source ability/buff name
  sourceCharacter?: string; // Character providing the buff (for auras)
  effect: string;          // Effect description (e.g., "+3 hits, +582 crit dmg")
  isActive: boolean;       // Current toggle state
  category: 'self' | 'aura'; // Whether it's from own ability or teammate
  dependsOn?: string;      // ID of another condition this depends on (must be active to enable this)
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
    isActive: character.abilityToggles['HighGround'] ?? false,
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
      isActive: character.abilityToggles['WarMachine'] ?? false,
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
        isActive: character.abilityToggles['SagaOfTheWarriorBorn'] ?? false,
        category: 'self',
      });
    }
  }

  // Crushing Strike trait - Has not moved condition
  if (character.traits.includes('CrushingStrike')) {
    conditions.push({
      id: 'CrushingStrike_notMoved',
      label: 'Has not moved',
      source: 'Crushing Strike',
      effect: '+50% melee dmg',
      isActive: character.abilityToggles['CrushingStrike_notMoved'] ?? false,
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
      isActive: character.abilityToggles['RangedSpecialist_adjacentToEnemy'] ?? false,
      category: 'self',
    });
  }

  // Shock Assault (Bellator) - Adjacent to Inceptor summons
  if (character.passiveAbilities.includes('ShockAssault')) {
    const levelIndex = character.abilityLevels?.['ShockAssault'] ?? 54;
    const values = getAbilityValues('ShockAssault', levelIndex);
    const abilityName = getAbilityNameSync('ShockAssault');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'ShockAssault',
        label: 'Adjacent to Inceptors',
        source: abilityName,
        effect: `Inceptors attack: +${extraDmg} dmg`,
        isActive: character.abilityToggles['ShockAssault'] ?? false,
        category: 'self',
      });
    }
  }

  // Aggressive Onslaught (Mataneo) - Charging to summon Jump Pack Intercessors
  if (character.passiveAbilities.includes('AggressiveOnslaught')) {
    const levelIndex = character.abilityLevels?.['AggressiveOnslaught'] ?? 54;
    const values = getAbilityValues('AggressiveOnslaught', levelIndex);
    const abilityName = getAbilityNameSync('AggressiveOnslaught');

    if (values) {
      const summonDmg = values.summonDmg as number || 0;

      conditions.push({
        id: 'AggressiveOnslaught',
        label: 'Charging',
        source: abilityName,
        effect: `2x Jump Pack Intercessors attack (2x ${summonDmg} Physical)`,
        isActive: character.abilityToggles['AggressiveOnslaught'] ?? false,
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
        label: `Below ${healthPct}% HP`,
        source: abilityName,
        effect: `+${extraPierceRatio}% pierce ratio`,
        isActive: character.abilityToggles['VisionsOfHeresy_lowHealth'] ?? false,
        category: 'self',
      });
    }
  }

  // Lord of Tempests (Njal) - Ice coverage
  if (character.passiveAbilities.includes('LordOfTempests')) {
    const levelIndex = character.abilityLevels?.['LordOfTempests'] ?? 54;
    const values = getAbilityValues('LordOfTempests', levelIndex);
    const abilityName = getAbilityNameSync('LordOfTempests');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'LordOfTempests',
        label: 'Max Ice Coverage (6 hexes)',
        source: abilityName,
        effect: `+${extraDmg * 6} dmg (normal attacks)`,
        isActive: character.abilityToggles['LordOfTempests'] ?? false,
        category: 'self',
      });
    }
  }

  // Feared Interrogator (Asmodai) - Target condition
  if (character.passiveAbilities.includes('FearedInterrogator')) {
    const levelIndex = character.abilityLevels?.['FearedInterrogator'] ?? 54;
    const values = getAbilityValues('FearedInterrogator', levelIndex);
    const abilityName = getAbilityNameSync('FearedInterrogator');

    if (values) {
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'FearedInterrogator',
        label: 'Target Suppressed/Stunned/adj. to DA',
        source: abilityName,
        effect: `+${extraDmg} dmg`,
        isActive: character.abilityToggles['FearedInterrogator'] ?? false,
        category: 'self',
      });
    }
  }

  // Enmity for the Unworthy (Forcas) - Adjacent units
  if (character.passiveAbilities.includes('EnmityForTheUnworthy')) {
    const levelIndex = character.abilityLevels?.['EnmityForTheUnworthy'] ?? 54;
    const values = getAbilityValues('EnmityForTheUnworthy', levelIndex);
    const abilityName = getAbilityNameSync('EnmityForTheUnworthy');

    if (values) {
      const extraDmgPct = values.extraDmgPct as number || 0;
      const extraDmg = values.extraDmg as number || 0;

      conditions.push({
        id: 'EnmityForTheUnworthy',
        label: 'Max Adjacent Units (6)',
        source: abilityName,
        effect: `+${extraDmgPct * 6}% dmg`,
        isActive: character.abilityToggles['EnmityForTheUnworthy'] ?? false,
        category: 'self',
      });

      conditions.push({
        id: 'EnmityForTheUnworthy_DA',
        label: 'Max Adjacent Dark Angels (6)',
        source: abilityName,
        effect: `+${extraDmg * 6} dmg`,
        isActive: character.abilityToggles['EnmityForTheUnworthy_DA'] ?? false,
        category: 'self',
        dependsOn: 'EnmityForTheUnworthy',
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
        isActive: character.abilityToggles['CondemnorStake'] ?? false,
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
        isActive: character.abilityToggles['AvalancheOfMuscle'] ?? false,
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
        isActive: character.abilityToggles['SummaryExecution'] ?? false,
        category: 'self',
      });

      conditions.push({
        id: 'SummaryExecution_Executed',
        label: 'Execution happened',
        source: abilityName,
        effect: `+${extraDmg2} additional dmg`,
        isActive: character.abilityToggles['SummaryExecution_Executed'] ?? false,
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
        isActive: character.abilityToggles['InescapableAccuracy'] ?? false,
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
        isActive: character.abilityToggles['LivingLightning'] ?? false,
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
        isActive: character.abilityToggles['PowerTrip'] ?? false,
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
        isActive: character.abilityToggles['SmashaEad'] ?? false,
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
        isActive: character.abilityToggles['HeadClaimer_Kills'] ?? false,
        category: 'self',
      });

      conditions.push({
        id: 'HeadClaimer',
        label: 'Killed Character',
        source: abilityName,
        effect: '+1 hit per Character kill',
        isActive: character.abilityToggles['HeadClaimer'] ?? false,
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
        isActive: character.abilityToggles['BeaconOfRage'] ?? false,
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
        isActive: character.abilityToggles['Skullsmasher'] ?? false,
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
        isActive: character.abilityToggles['TrophyTaker'] ?? false,
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
        isActive: character.abilityToggles['PsychicStalk'] ?? false,
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
        isActive: character.abilityToggles['RealityUnbound'] ?? false,
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
        isActive: character.abilityToggles['TerrifyingCrescendo'] ?? false,
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
        isActive: character.abilityToggles['TwistedScience'] ?? false,
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
        isActive: character.abilityToggles['DecoysAndMisdirection'] ?? false,
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
        isActive: character.abilityToggles['CosmicHorror'] ?? false,
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
        isActive: character.abilityToggles['HeavyGravCannon'] ?? false,
        category: 'self',
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
        isActive: character.abilityToggles['TalonsOfTheEmperor_adjacentToCustodes'] ?? false,
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
        isActive: character.abilityToggles[toggleId] ?? false,
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

          // Damage bonus condition - "In Range of [Dante]"
          const dmgToggleId = `LordOfTheHost_${teammate.id}_damage`;
          const isDmgActive = character.abilityToggles[dmgToggleId] ?? false;
          conditions.push({
            id: dmgToggleId,
            label: `In Range of ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} melee dmg`,
            isActive: isDmgActive,
            category: 'aura',
          });

          // Extra melee hit condition - "Low HP (≤50%)"
          // Can only be enabled if In Range is active
          const hitsToggleId = `LordOfTheHost_${teammate.id}_hits`;
          const isHitsActive = isDmgActive && (character.abilityToggles[hitsToggleId] ?? false);
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

          // Damage bonus condition - "In Range of [Abaddon]"
          const dmgToggleId = `FirstAmongTraitors_${teammate.id}_damage`;
          const isDmgActive = character.abilityToggles[dmgToggleId] ?? false;
          conditions.push({
            id: dmgToggleId,
            label: `In Range of ${teammate.name}`,
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
          const isRangeActive = character.abilityToggles[rangeToggleId] ?? false;
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
          const isMeleeActive = character.abilityToggles[meleeToggleId] ?? false;
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
            isActive: character.abilityToggles[toggleId] ?? false,
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
            isActive: character.abilityToggles[toggleId] ?? false,
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
            isActive: character.abilityToggles[toggleId] ?? false,
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
          isActive: character.abilityToggles[toggleId] ?? false,
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
            isActive: character.abilityToggles[toggleId] ?? false,
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
            isActive: character.abilityToggles[toggleId] ?? false,
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
            isActive: character.abilityToggles[toggleId] ?? false,
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
            isActive: character.abilityToggles[toggleId] ?? false,
            category: 'aura',
          });
        }
      }
    }

    // Lion Helm (Azrael) - armor and damage bonus to Dark Angels
    if (teammate.passiveAbilities.includes('LionHelm')) {
      // Check if character is Dark Angels faction
      if (character.faction === 'Dark Angels' && character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['LionHelm'] ?? 54;
        const values = getAbilityValues('LionHelm', levelIndex);
        const abilityName = getAbilityNameSync('LionHelm');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const extraArmor = values.extraArmor as number || 0;
          const toggleId = `LionHelm_${teammate.id}_adjacent`;

          conditions.push({
            id: toggleId,
            label: `Adjacent to ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} dmg, +${extraArmor} armor`,
            isActive: character.abilityToggles[toggleId] ?? false,
            category: 'aura',
          });
        }
      }
    }

    // Astartes Banner (Thoread) - capped damage bonus to allies
    if (teammate.passiveAbilities.includes('AstartesBanner')) {
      if (character.id !== teammate.id) {
        const levelIndex = teammate.abilityLevels?.['AstartesBanner'] ?? 54;
        const values = getAbilityValues('AstartesBanner', levelIndex);
        const abilityName = getAbilityNameSync('AstartesBanner');

        if (values) {
          const extraDmg = values.extraDmg as number || 0;
          const toggleId = `AstartesBanner_${teammate.id}_range2`;

          conditions.push({
            id: toggleId,
            label: `Range 2 from ${teammate.name}`,
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmg} dmg (cap 500)`,
            isActive: character.abilityToggles[toggleId] ?? false,
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
            isActive: character.abilityToggles[toggleId] ?? false,
            category: 'aura',
          });

          // Heavy weapon bonus (depends on being in range)
          conditions.push({
            id: heavyToggleId,
            label: 'Has Heavy Weapon',
            source: abilityName,
            sourceCharacter: teammate.name,
            effect: `+${extraDmgHeavy - extraDmg} additional dmg`,
            isActive: character.abilityToggles[heavyToggleId] ?? false,
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
            isActive: character.abilityToggles[toggleId] ?? false,
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
            isActive: character.abilityToggles[toggleId] ?? false,
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
            isActive: character.abilityToggles[toggleId] ?? false,
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
 * Only shows if team has buffs that require this toggle (e.g., Legendary Commander, Way of the Short Blade)
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

  // Add "Adjacent to Boss" toggle
  const toggleId = 'adjacentToBoss';
  conditions.push({
    id: toggleId,
    label: 'Adjacent to Boss',
    source: 'Position',
    effect: 'Enables positional bonuses',
    isActive: character.abilityToggles[toggleId] ?? false,
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
      isActive: character.abilityToggles[toggleId] ?? false,
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
    isActive: toggles['HighGround'] ?? false,
    category: 'self',
  });

  // Add "Adjacent to Boss" condition for all summons
  // This controls whether summon uses melee or ranged attacks
  conditions.push({
    id: 'adjacentToBoss',
    label: 'Adjacent to Boss',
    source: 'Position',
    effect: 'Enables melee attacks, disables ranged',
    isActive: toggles['adjacentToBoss'] ?? false,
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
      isActive: toggles['WarMachine'] ?? false,
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
          isActive: toggles[toggleId] ?? false,
          category: 'aura',
        });
      }
    }
  }

  // Add aura conditions from teammates (other than source character)
  for (const teammate of team) {
    // Skip source character (already handled Waaagh above)
    if (teammate.id === summon.sourceCharacterId) continue;

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
          isActive: toggles[toggleId] ?? false,
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
            isActive: toggles[toggleId] ?? false,
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
