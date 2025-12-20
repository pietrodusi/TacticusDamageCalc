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
    const extraHit = values.extraHit as number || 1;

    return [
      // Damage bonus - always available with trait
      {
        auraId: `LordOfTheHost_damage_${sourceCharacterId}`,
        sourceAbilityId: 'LordOfTheHost',
        sourceAbilityName: 'Lord of the Host',
        requiredTraits: ['RapidAssault', 'Flying'],
        requiresLowHealth: false,
        modifiers: {
          baseDamageBonus: extraDmg,
        },
        toggleLabel: `${sourceCharacterName}'s Aura: +Dmg`,
        bonusText: `+${extraDmg} dmg`,
      },
      // Extra hit - requires low health
      {
        auraId: `LordOfTheHost_hit_${sourceCharacterId}`,
        sourceAbilityId: 'LordOfTheHost',
        sourceAbilityName: 'Lord of the Host',
        requiredTraits: ['RapidAssault', 'Flying'],
        requiresLowHealth: true,
        modifiers: {
          extraHits: extraHit,
        },
        toggleLabel: `${sourceCharacterName}'s Aura: +Hit (Low HP)`,
        bonusText: `+${extraHit} hit`,
      },
    ];
  },
};

// Export all aura handlers
export const auraHandlers: AuraAbilityHandler[] = [
  LordOfTheHostHandler,
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
