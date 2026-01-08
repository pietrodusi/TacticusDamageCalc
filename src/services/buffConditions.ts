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
