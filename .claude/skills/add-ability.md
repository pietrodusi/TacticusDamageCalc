---
description: Add a new character ability to the Tacticus Damage Calculator
---

# Add Ability Skill

Help implement a new ability for a character in the Tacticus Damage Calculator.

## Information Needed

Ask the user for:
1. **Character name** - Which character this ability belongs to
2. **Ability ID** - The exact ID from abilities.json (e.g., "WarHowl", "SagaOfTheWarriorBorn")
3. **Ability type** - One of:
   - **Active (damage)** - Deals damage when used
   - **Active (buff)** - Grants buffs to self/team
   - **Active (summon)** - Spawns a summon unit
   - **Passive (modifier)** - Adds stat bonuses (damage, crit, hits)
   - **Passive (follow-up)** - Triggers additional attacks after normal attacks
   - **Aura** - Provides bonuses to nearby teammates
4. **What it does** - Brief description of the ability effect

## Implementation Steps

### Step 1: Read existing patterns
Based on ability type, read the appropriate handler file:
- Active abilities: `src/services/abilities/handlers/activeHandlers.ts`
- Passive abilities: `src/services/abilities/handlers/passiveHandlers.ts`
- Aura abilities: `src/services/abilities/handlers/auraHandlers.ts`

### Step 2: Check ability data
Read ability values from the JSON data:
- Use `getAbilityValues(abilityId, levelIndex)` to get computed values
- Common fields: `minDmg`, `maxDmg`, `nrOfHits`, `extraDmg`, `extraHits`, `extraCritChance`

### Step 3: Create the handler
Implement the handler following the `AbilityHandler` interface:

**For Active abilities:**
```typescript
export const YourAbilityHandler: AbilityHandler = {
  abilityId: 'YourAbilityId',
  abilityName: 'Your Ability Name',
  category: 'damage' | 'buff' | 'summon',
  cooldown: -1,  // -1 = one-time, positive = reusable
  endsTurn: true,  // false for buff abilities

  executeActive: (values, context) => {
    return {
      abilityId: 'YourAbilityId',
      abilityName: 'Your Ability Name',
      category: 'damage',
      damageResult: { minDamage, maxDamage, averageDamage, hits, damageProfile },
      message: 'Your Ability Name',
    };
  },
};
```

**For Passive abilities:**
```typescript
export const YourPassiveHandler: AbilityHandler = {
  abilityId: 'YourPassiveId',
  abilityName: 'Your Passive Name',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values, context) => {
    return {
      abilityId: 'YourPassiveId',
      abilityName: 'Your Passive Name',
      modifiers: { baseDamageBonus: X, extraHits: Y },
      applicable: true,
      reason: 'Description of bonus',
      requiresToggle: false,
      followUpAttack: undefined,  // or FollowUpAttack object
    };
  },
};
```

### Step 4: Register the handler
Add the handler to the exports array at the bottom of the handler file:
- `activeHandlers.ts`: Add to `export const activeHandlers: AbilityHandler[] = [...]`
- `passiveHandlers.ts`: Add to `export const passiveHandlers: AbilityHandler[] = [...]`

### Step 5: Add buff template (if needed)
If the ability grants team buffs, create a template in `src/services/buffs/buffRegistry.ts`

### Step 6: Update implemented characters
If this completes a character's abilities, add them to:
`src/assets/data/implementedCharacters.json`

## Key Files
- `src/services/abilities/handlers/activeHandlers.ts` - Active ability handlers
- `src/services/abilities/handlers/passiveHandlers.ts` - Passive ability handlers
- `src/services/abilities/handlers/auraHandlers.ts` - Aura ability handlers
- `src/services/abilities/types.ts` - Type definitions
- `src/services/buffs/buffRegistry.ts` - Buff templates
- `src/assets/data/implementedCharacters.json` - Implemented character list

## Checklist
- [ ] Handler created with correct interface
- [ ] Handler added to exports array
- [ ] Buff template added (if applicable)
- [ ] Character added to implementedCharacters.json (if fully implemented)
- [ ] Build passes: `npm run build`
