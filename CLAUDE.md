# Tacticus Damage Calculator

A damage calculator for Warhammer 40,000: Tacticus mobile game.

## Working Guidelines

- **Use subagents for codebase exploration**: Before implementing changes, use Explore subagents to examine existing code patterns, find similar ability implementations, and understand the current state. This keeps the main context clean and avoids repeatedly reading large files (activeHandlers.ts is 4000+ lines, passiveHandlers.ts is 3000+ lines, battleStore.ts is 6000+ lines).
- **Find similar handlers first**: Before writing a new ability handler, always use an Explore subagent to search existing handlers for a similar ability pattern. For example: "find a passive handler with follow-up attack that triggers on melee only" or "find an active buff that applies to the whole team". Use the existing handler as a template rather than writing from scratch.
- **Ask the user when in doubt**: Ask the user questions when the ability behavior is ambiguous, there are multiple valid implementation approaches, the ability interacts with systems not documented here, or any assumption could lead to incorrect damage calculation.
- **Use parallel subagents for multi-area exploration**: When investigating a bug or understanding a feature that spans multiple code areas, launch 2-3 Explore subagents in parallel (in a single message) rather than doing sequential searches. For example, when tracing how a counter flows through battleStore.ts, launch separate agents for: (1) where the counter is incremented, (2) where it's checked/applied, (3) where it's saved to state. This gathers all context in one round instead of many.

## Project Structure

- `src/pages/CalculatorPage.tsx` - Main battle simulation page
- `src/stores/battleStore.ts` - Battle state management (Zustand)
- `src/services/abilities/` - Ability system
  - `types.ts` - Core types (AbilityHandler, AbilityContext, AbilityStatModifier, etc.)
  - `handlers/activeHandlers.ts` - Active ability handlers (damage, buff, summon)
  - `handlers/passiveHandlers.ts` - Passive ability handlers (modifiers, follow-ups)
  - `handlers/auraHandlers.ts` - Aura ability handlers (team-wide buffs)
  - `handlers/index.ts` - Aggregates and registers all handlers
  - `abilityRegistry.ts` - Central ability handler registry
  - `abilityDataLoader.ts` - Loads ability stats from abilities.json
  - `abilityEvaluator.ts` - evaluatePassiveAbilities(), executeActiveAbility(), combineModifiers()
  - `cooldownManager.ts` - Ability cooldown management
- `src/services/buffs/buffRegistry.ts` - BuffTemplate definitions for pooled team-wide buffs
- `src/services/buffs/buffPoolManager.ts` - Buff pool CRUD (addBuffToPool, getApplicableBuffs, expireBuffs)
- `src/services/buffConditions.ts` - UI toggle/condition generation for conditional abilities
- `src/components/battle/` - Battle simulation UI components
  - `BattleCharacterCard.tsx` - Character card during battle
  - `BattleSummary.tsx` - End of battle summary
  - `DamageSummary.tsx` - Damage breakdown display
  - `DamageBar.tsx` - Visual damage range bar
  - `BossSelector.tsx` - Boss selection dropdown
  - `BattleBossCard.tsx` - Boss display during battle
- `src/types/boss.ts` - Boss types and interfaces

## Ability System

### AbilityHandler Interface

```typescript
interface AbilityHandler {
  abilityId: string;       // Must match key in abilities.json
  abilityName: string;
  category: AbilityCategory; // 'damage' | 'buff' | 'healing' | 'summon' | 'passive' | 'other'
  cooldown: number;        // -1 = one-time, 0 = every turn, >0 = N turn cooldown
  endsTurn?: boolean;      // Default: true for damage, false for buff

  evaluatePassive?: (values: ComputedAbilityValues, context: AbilityContext) => PassiveAbilityEvaluation;
  executeActive?: (values: ComputedAbilityValues, context: AbilityContext) => ActiveAbilityResult;
}
```

### Data Flow

```
abilities.json (65 levels per ability)
  -> getAbilityValues(abilityId, levelIndex, progressionStepIndex)
  -> ComputedAbilityValues
  -> handler.evaluatePassive() or handler.executeActive()
  -> AbilityStatModifier / ActiveAbilityResult
  -> combineModifiers()
  -> AttackerStats.abilityModifiers
  -> DamageCalculator.calculate()
  -> DamageResult
```

### Five Ability Categories

#### 1. Active Damage (template: ThunderousAssault)

`executeActive()` returns `damageResult` with min/max/average damage. `endsTurn` defaults true.

```typescript
export const ThunderousAssaultHandler: AbilityHandler = {
  abilityId: 'ThunderousAssault',
  abilityName: 'Thunderous Assault',
  category: 'damage',
  cooldown: -1,
  endsTurn: true,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('ThunderousAssault');
    const minDmg = values.minDmg as number || 0;
    const maxDmg = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 1;
    const avgDmg = Math.round((minDmg + maxDmg) / 2);

    return {
      abilityId: 'ThunderousAssault',
      abilityName,
      category: 'damage',
      damageResult: {
        minDamage: minDmg,
        maxDamage: maxDmg,
        averageDamage: avgDmg,
        hits,
        damageProfile: 'Power' as DamageType,
      },
      message: abilityName,
    };
  },
};
```

#### 2. Active Buff (template: WarHowl)

`executeActive()` returns `buffResult: { effect, duration }`. `endsTurn: false`.

```typescript
export const WarHowlHandler: AbilityHandler = {
  abilityId: 'WarHowl',
  abilityName: 'War Howl',
  category: 'buff',
  cooldown: -1,
  endsTurn: false,

  executeActive: (values: ComputedAbilityValues, _context: AbilityContext): ActiveAbilityResult => {
    const abilityName = getAbilityNameSync('WarHowl');
    return {
      abilityId: 'WarHowl',
      abilityName,
      category: 'buff',
      buffResult: {
        effect: {
          critChanceBonus: values.extraCritChance as number || 0,
          baseDamageBonus: values.extraDmg as number || 0,
        },
        duration: 1,
      },
      message: abilityName,
    };
  },
};
```

#### 3. Passive with Modifiers (template: RitesOfBattle)

`evaluatePassive()` returns `modifiers` + `applicable: true/false`. Optional toggle via `requiresToggle`.

```typescript
export const RitesOfBattleHandler: AbilityHandler = {
  abilityId: 'RitesOfBattle',
  abilityName: 'Rites of Battle',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, _context: AbilityContext): PassiveAbilityEvaluation => {
    const avgExtraDmg = Math.round(
      ((values.extraDmg as number || 0) + (values.extraDmg_2 as number || values.extraDmg as number || 0)) / 2
    );
    return {
      abilityId: 'RitesOfBattle',
      abilityName: getAbilityNameSync('RitesOfBattle'),
      modifiers: { baseDamageBonus: avgExtraDmg },
      applicable: true,
      reason: `+${values.extraDmg}-${values.extraDmg_2} damage`,
      requiresToggle: false,
    };
  },
};
```

#### 4. Passive with Follow-Up (template: Boltstorm)

`evaluatePassive()` returns `followUpAttack` with its own damage stats. Can be conditional. Uses `sharesCritChain: true` for Additional Attacks (continues crit chain from source attack).

```typescript
export const BoltstormHandler: AbilityHandler = {
  abilityId: 'Boltstorm',
  abilityName: 'Boltstorm',
  category: 'passive',
  cooldown: -1,

  evaluatePassive: (values: ComputedAbilityValues, context: AbilityContext): PassiveAbilityEvaluation => {
    const isNormalRanged = context.attackType === 'ranged' && context.attackCategory === 'normal';
    const minDamage = values.minDmg as number || 0;
    const maxDamage = values.maxDmg as number || 0;
    const hits = values.nrOfHits as number || 3;

    const followUpAttack: FollowUpAttack | undefined = isNormalRanged ? {
      abilityId: 'Boltstorm',
      abilityName: 'Boltstorm',
      damageProfile: 'Bolter',
      minDamage,
      maxDamage,
      hits,
      attackCategory: 'normal',
      triggersOnNormalOnly: true,
      followUpAttackType: 'ranged',
      sharesCritChain: true,
    } : undefined;

    return {
      abilityId: 'Boltstorm',
      abilityName: getAbilityNameSync('Boltstorm'),
      modifiers: {},
      applicable: isNormalRanged,
      reason: isNormalRanged ? `Follow-up: ${hits}x Bolter` : 'Only triggers on normal ranged attacks',
      requiresToggle: false,
      followUpAttack,
    };
  },
};
```

#### 5. Aura (template: LordOfTheHost)

`AuraAbilityHandler.getAuraBonuses()` returns `AuraBonus[]` with requiredTraits, modifiers, toggleLabel.

```typescript
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
      {
        auraId: `LordOfTheHost_${sourceCharacterId}_damage`,
        sourceAbilityId: 'LordOfTheHost',
        sourceAbilityName: 'Lord of the Host',
        requiredTraits: ['RapidAssault', 'Flying'],
        modifiers: { baseDamageBonus: extraDmg },
        toggleLabel: `Range 2 from ${sourceCharacterName}`,
        bonusText: `+${extraDmg} melee dmg`,
        attackTypeRestriction: 'melee',
      },
      {
        auraId: `LordOfTheHost_${sourceCharacterId}_hits`,
        sourceAbilityId: 'LordOfTheHost',
        sourceAbilityName: 'Lord of the Host',
        requiredTraits: ['RapidAssault', 'Flying'],
        requiresLowHealth: true,
        modifiers: { extraHits: 1 },
        toggleLabel: `Low HP (≤50%)`,
        bonusText: `+1 melee hit`,
        attackTypeRestriction: 'melee',
      },
    ];
  },
};
```

### Key Types Reference

**AbilityStatModifier** fields:
- `baseDamageBonus` - Flat damage added pre-armor
- `baseDamageMultiplier` - Multiplier on base damage pre-armor (1.25 = +25%)
- `globalDamageBonus` - Flat damage added post-armor (per hit)
- `extraHits` - Additional hits per attack
- `critChanceBonus` - +% crit chance (percentage points)
- `critDamageBonus` - Flat crit damage bonus
- `armorIgnored` - Reduces target armor
- `pierceRatioBonus` - Bonus pierce ratio percentage (10 = +10%)
- `meleeOnly` - Bonus only applies to melee attacks
- `normalAttackOnly` - Bonus only applies to normal attacks (not abilities)
- `overrideDamageProfile`, `overrideMinDamage`, `overrideMaxDamage`, `overrideHits` - Override attack stats

**FollowUpAttack** key fields:
- `damageProfile`, `minDamage`, `maxDamage`, `hits` - Attack stats
- `attackCategory` - 'normal', 'special', or 'ability'
- `sharesCritChain` - If true, continues crit chain from source attack (Additional Attack)
- `triggersOnNormalOnly` - Only triggers after normal attacks
- `triggersOnMeleeOnly` - Only triggers after melee attacks
- `damageCaps` - Optional damage caps for the follow-up

**AbilityContext** key fields:
- `hasMoved`, `currentTurn`, `attackType` ('melee' | 'ranged' | 'ability')
- `attackCategory` ('normal' | 'special' | 'ability')
- `abilityToggles` - Record of boolean/number toggles from UI
- `bossTraits` - Boss traits array (e.g., "Mechanical", "BigTarget", "Psyker")
- `bossDebuffs` - Boss debuffs (e.g., "Markerlight")

### Modifier Stacking Rules

- **Additive** (sum): `baseDamageBonus`, `globalDamageBonus`, `extraHits`, `critChanceBonus`, `critDamageBonus`, `armorIgnored`, `pierceRatioBonus`
- **Multiplicative** (product): `baseDamageMultiplier`
- **Override** (last wins): `overrideDamageProfile`, `overrideMinDamage`, `overrideMaxDamage`, `overrideHits`

### Two Buff Systems

**Legacy `activeBuffs`** on BattleCharacter - direct array of `AbilityStatModifier`, used for simple self-buffs (e.g., WarHowl applies directly to the caster).

**New `buffPool`** on BattleState - Uses `BuffTemplate` definitions in `src/services/buffs/buffRegistry.ts`. Supports team-wide buffs with target conditions, duration, and `consumeOnUse`. Managed via `buffPoolManager.ts` (addBuffToPool, getApplicableBuffs, expireBuffs).

### Step-by-Step: Adding a New Ability

1. Look up ability in `abilities.json` (variables, constants, attackRangeType)
2. Check `characters.json` for which character has it (activeAbilities vs passiveAbilities)
3. Determine category (active damage/buff, passive modifier/follow-up, aura)
4. **Use Explore subagent to find a similar existing handler** as template
5. Create handler in `activeHandlers.ts` or `passiveHandlers.ts` (auras in `auraHandlers.ts`)
6. Add to the export array at bottom of file (auto-registered via `handlers/index.ts`)
7. If team-wide buff: add BuffTemplate in `src/services/buffs/buffRegistry.ts`
8. If toggle needed: add condition in `src/services/buffConditions.ts` → `getCharacterBuffConditions()`
9. `npm run build` to verify

### abilities.json Variable Guide

Common variable names (all are 65-element arrays, index 0-64 for levels 1-65):
- `minDmg`, `maxDmg` - Damage range (avg = (min+max)/2)
- `dmg` - Flat damage (when no range)
- `extraDmg` - Flat bonus damage added pre-armor
- `extraDmgPct` - Percentage bonus to damage (33 = +33%)
- `dmgPct` - Damage percentage multiplier (80 = 80% of base damage)
- `nrOfHits` - Number of hits (in constants, as string)
- `extraHits` - Additional hits bonus
- `extraCritChance` - Crit chance bonus (percentage)
- `extraCritDmg` - Crit damage bonus (flat)
- `chance` - Probability (25 = 25%)
- `effectTurns` - Buff/effect duration in turns
- `unitToSpawn` - Summon unit ID (string array)
- `_2`, `_3` suffix - Second/third variant (e.g., `minDmg_2` for 2nd damage component)
- `variablesAffectedByRarityBonus` - Which variables scale with character rarity

### Key Utilities

- `getAbilityNameSync(abilityId)` from `abilityDataLoader.ts` - Returns display name
- `getAbilityValues(abilityId, levelIndex, progressionStepIndex)` from `abilityDataLoader.ts` - Returns `ComputedAbilityValues` at level
- `getAbilityCooldown(abilityId)` from `abilityDataLoader.ts` - Returns cooldown from constants
- `isToggleActive(value)` - Local helper in handler files: `(value: boolean | number | undefined): boolean => value === true`

### Standard Imports

```typescript
// In activeHandlers.ts:
import type { AbilityHandler, ComputedAbilityValues, AbilityContext, ActiveAbilityResult, DamageComponent } from '../types';
import type { DamageType } from '../../../types';
import { getAbilityNameSync } from '../abilityDataLoader';

// In passiveHandlers.ts:
import type { AbilityHandler, ComputedAbilityValues, AbilityContext, PassiveAbilityEvaluation, FollowUpAttack, SummonRequest } from '../types';
import type { DamageType } from '../../../types/character';
import { getAbilityNameSync } from '../abilityDataLoader';

// In auraHandlers.ts:
import type { AuraAbilityHandler, ComputedAbilityValues, AuraBonus } from '../types';
```

### Common Patterns Quick Reference

- **Toggle pattern**: Handler reads `context.abilityToggles['AbilityId']` via `isToggleActive()`
- **Counter pattern**: Toggle as number with `isCounter: true` in buffConditions (e.g., ice hex count 0-6)
- **Attack type restrictions**: `meleeOnly`, `normalAttackOnly` on modifiers
- **Damage types**: Physical, Chain, Piercing, Power, Eviscerate, Bolter, HeavyRound, Projectile, Las, Plasma, Melta, Flame, Energy, Blast, Psychic, DirectDamage, Bio, Toxic, Gauss, Particle, Pulse

## Summon System

- Summon types defined in `src/types/summon.ts`
- Summon data loaded from `summons.json` via `dataService.ts`
- `SummonCard` component for UI (`src/components/battle/SummonCard.tsx`)
- BattleStore methods: `addSummon`, `removeSummon`, `updateSummonCount`, `executeSummonAttack`
- Summons persist across turns until manually removed
- Summon attacks: simple damage calculation (no crit, no equipment bonuses)
- Count field is for display only - user performs multiple attacks manually

## Battle Simulation

- Maximum 6 turns per battle
- Characters can move and act each turn
- Undo functionality resets: `hasMoved`, `hasActed`, `hasUsedAbilityThisTurn`, `activeBuffs`, `abilityCooldowns`
- DamageBar visualization shows damage range (lower/average/upper bounds)

## Boss System

- Boss selection during team setup (before battle)
- Boss data from `guildBossUnits.json`, images from `guildBossImg.json`
- Boss traits from `guildBossTraits.json` (e.g., Immune, BigTarget, Psyker)
- Boss ranks: Legendary 1-5 (Rank 13-17), Mythic 1 (Rank 18) - only these ranks available
- Boss armor is applied to all damage calculations
- Boss health bar shows remaining HP and damage dealt
- Selected boss stored in `teamStore.selectedBoss`
- Boss passed to `startBattle()` and stored in `battleState.boss`

### Boss Modifiers
- Modifier data from `guildBossMods.json` and `guildBossModDetails.json`
- "Minions Killed" checkbox in boss selector (checked by default)
- When checked: modifiers applied, reducing boss armor/damage
- When unchecked: base stats used without reductions
- Supports `bossStatPctDecrease` (percentage reduction) for armor/damage
- Supports `bossStatDecrease` (flat reduction) for block chance
- `getBossStatModifiers(bossId)` - Get aggregated stat reductions for a boss
- `getBossAtRank(bossId, rank, applyModifiers)` - Get boss with optional modifiers

## Damage Cap System

The calculator implements a 3-tier damage cap system based on the [Tacticus wiki](https://tacticus.fandom.com/wiki/HDTW_DamCap). Caps are applied at different stages of damage calculation to correctly model various ability effects.

### Three Damage Cap Types

1. **Cap 1: "Its Own Damage" (`baseDamageCap`)**
   - Caps base damage BEFORE any modifiers are applied
   - Applied after reading character's base damage stat
   - Example: Actus's Galvanic Field - caps base damage before `dmgPct` multiplier
   - Location in calculator: After line 103 (before flatModifiers, critDamage, armor)

2. **Cap 2: "Pre-Armour Damage" (`preArmorCap`)**
   - Caps damage after pre-armour modifiers (flat bonuses, crit damage) but before armor reduction
   - Applied to both non-crit (d0) and crit (d1) damage paths
   - Example: Ahriman's Psychic Stalk
   - Location in calculator: After DamVarMod calculation (lines 274-294)

3. **Cap 3: "The Hit" (`finalDamageCap`)**
   - Caps per-hit damage after ALL modifiers (armor, pierce, global multipliers, global damage bonus)
   - Applied just before calculating total damage
   - Example: Thoread's Astartes Banner, Vitruvius's Master Annihilator
   - Location in calculator: After line 447 (final stage before totalDamage)

### Sequential Application

Caps apply sequentially in calculation order. Earlier caps reduce values used in later stages:
- Base damage cap → affects DamVarMod calculation
- Pre-armor cap → affects armor/pierce calculation
- Final damage cap → affects total damage

### Implementation

**Type Definitions** (`src/services/damage/types.ts`):
```typescript
interface DamageCaps {
  baseDamageCap?: number;      // Cap 1
  preArmorCap?: number;         // Cap 2
  finalDamageCap?: number;      // Cap 3
}

interface AttackerStats {
  // ... other fields
  damageCaps?: DamageCaps;
}
```

**Usage in BattleStore** (`src/stores/battleStore.ts`):
```typescript
executeAttack(characterId, targetId, attackType, {
  baseDamageCap: 500,    // Cap base damage to 500
  damageMultiplier: 0.8, // Then apply 80% multiplier
});
```

**Applied in Calculator** (`src/services/damage/calculator.ts`):
- Cap 1: Line 109-116 (effectiveBaseDamage)
- Cap 2: Line 295-313 (cappedDamVarMod0/1)
- Cap 3: Line 448-455 (cappedPerHitDamage)

### Galvanic Field Example

Before fix (WRONG):
```
baseDamage: 1000
→ × 0.8 dmgPct = 800
→ (armor/multipliers applied)
→ capped to 500 ❌
```

After fix (CORRECT):
```
baseDamage: 1000
→ capped to 500 (Cap 1) ✓
→ × 0.8 dmgPct = 400
→ (armor/multipliers applied)
```

## Build & Deploy

```bash
npm run build    # Build for production
npm run dev      # Development server
npm run deploy   # Deploy to GitHub Pages
```
