/**
 * Aura Ability Handlers
 * Handlers for abilities that provide buffs to teammates
 */

import type { AuraAbilityHandler, ComputedAbilityValues, AuraBonus } from '../types';

/**
 * LordOfTheHost (Dante)
 * Other friendly units within range with Rapid Assault or Flying:
 * - Deal +extraDmg damage with melee attacks
 * - If at or below 50% health, also score an additional hit
 */
export const LordOfTheHostHandler: AuraAbilityHandler = {
  abilityId: 'LordOfTheHost',
  abilityName: 'Lord of the Host',

  getAuraBonuses: (
    values: ComputedAbilityValues,
    sourceCharacterId: string,
    sourceCharacterName: string
  ): AuraBonus[] => {
    const extraDmg = values.extraDmg as number || 0;

    return [
      // Damage bonus - requires being in range (toggle: Range 2 from [Dante])
      {
        auraId: `LordOfTheHost_${sourceCharacterId}_damage`,
        sourceAbilityId: 'LordOfTheHost',
        sourceAbilityName: 'Lord of the Host',
        requiredTraits: ['RapidAssault', 'Flying'],
        requiresLowHealth: false,
        modifiers: {
          baseDamageBonus: extraDmg,
        },
        toggleLabel: `Range 2 from ${sourceCharacterName}`,
        bonusText: `+${extraDmg} melee dmg`,
        attackTypeRestriction: 'melee',
      },
      // Extra hit - requires low health AND being in range
      {
        auraId: `LordOfTheHost_${sourceCharacterId}_hits`,
        sourceAbilityId: 'LordOfTheHost',
        sourceAbilityName: 'Lord of the Host',
        requiredTraits: ['RapidAssault', 'Flying'],
        requiresLowHealth: true,
        modifiers: {
          extraHits: 1,
        },
        toggleLabel: `Low HP (≤50%)`,
        bonusText: `+1 melee hit`,
        attackTypeRestriction: 'melee',
      },
    ];
  },
};

/**
 * FirstAmongTraitors (Abaddon)
 * Other friendly Chaos units within range deal +extraDmg Damage.
 * This value increases by +extraDmg_2 for each attack Abaddon has performed,
 * up to a maximum of +maxDmg after 13 attacks.
 */
export const FirstAmongTraitorsHandler: AuraAbilityHandler = {
  abilityId: 'FirstAmongTraitors',
  abilityName: 'First Among Traitors',

  getAuraBonuses: (
    values: ComputedAbilityValues,
    sourceCharacterId: string,
    sourceCharacterName: string
  ): AuraBonus[] => {
    const extraDmg = values.extraDmg as number || 0;
    const extraDmg_2 = values.extraDmg_2 as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const maxStacks = 13;

    return [
      {
        auraId: `FirstAmongTraitors_${sourceCharacterId}_damage`,
        sourceAbilityId: 'FirstAmongTraitors',
        sourceAbilityName: 'First Among Traitors',
        requiredAlliance: 'Chaos',
        modifiers: {
          baseDamageBonus: extraDmg,  // Base value, will be scaled in battleStore
        },
        toggleLabel: `Range 2 from ${sourceCharacterName}`,
        bonusText: `+${extraDmg} dmg (scales with attacks)`,
        scalingContext: {
          sourceCharacterId,
          baseBonus: extraDmg,
          perStackBonus: extraDmg_2,
          maxBonus: maxDmg,
          maxStacks,
        },
      },
    ];
  },
};

// Export all aura handlers
export const auraHandlers: AuraAbilityHandler[] = [
  LordOfTheHostHandler,
  FirstAmongTraitorsHandler,
];

// Map for quick lookup by ability ID
export const auraHandlerMap: Map<string, AuraAbilityHandler> = new Map(
  auraHandlers.map(h => [h.abilityId, h])
);

/**
 * Get aura handler for an ability
 */
export function getAuraHandler(abilityId: string): AuraAbilityHandler | undefined {
  return auraHandlerMap.get(abilityId);
}

/**
 * Check if an ability has an aura handler
 */
export function hasAuraHandler(abilityId: string): boolean {
  return auraHandlerMap.has(abilityId);
}
