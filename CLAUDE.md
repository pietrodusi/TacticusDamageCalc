# Tacticus Damage Calculator

A damage calculator for Warhammer 40,000: Tacticus mobile game.

## Project Structure

- `src/pages/CalculatorPage.tsx` - Main battle simulation page
- `src/stores/battleStore.ts` - Battle state management (Zustand)
- `src/services/abilities/` - Ability system
  - `handlers/activeHandlers.ts` - Active ability handlers (e.g., WarHowl)
  - `handlers/passiveHandlers.ts` - Passive ability handlers (e.g., SagaOfTheWarriorBorn)
  - `handlers/auraHandlers.ts` - Aura ability handlers
  - `abilityRegistry.ts` - Central ability handler registry
  - `cooldownManager.ts` - Ability cooldown management
- `src/components/battle/` - Battle simulation UI components
  - `BattleCharacterCard.tsx` - Character card during battle
  - `BattleSummary.tsx` - End of battle summary
  - `DamageSummary.tsx` - Damage breakdown display
  - `DamageBar.tsx` - Visual damage range bar
  - `BossSelector.tsx` - Boss selection dropdown
  - `BattleBossCard.tsx` - Boss display during battle
- `src/types/boss.ts` - Boss types and interfaces

## Ability System

### Handler Pattern
Each ability has a handler implementing `AbilityHandler` interface:
- `abilityId`, `abilityName`, `category`, `cooldown`
- `endsTurn` - Whether using ability ends character's turn (default: true for damage, false for buff)
- `evaluatePassive()` - For passive abilities
- `execute()` - For active abilities

### Key Concepts
- `activeBuffs` - Temporary buffs stored on character from abilities
- `abilityToggles` - Boolean toggles for conditional passive abilities
- `abilityCooldowns` - Track cooldown state per ability

## Implemented Character Abilities

### Ragnar
- **WarHowl** (Active, Buff): Grants crit chance bonus, doesn't end turn
- **Saga of the Warrior Born** (Passive): Extra hits + crit damage when charging (toggle)

### Trajann
- **LegendaryCommander** (Passive/Aura): Team-wide buff after ability use

### Dante, Kariyan, Kharn
- Active abilities implemented

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

## Recent Changes

- Added boss traits from `guildBossTraits.json`
  - Each boss has traits array (e.g., Immune, BigTarget, Psyker, Flying)
  - Traits loaded via `getBossAtRank()` function
- Added boss modifier system with user toggle
  - "Minions Killed" checkbox controls whether modifiers are applied
  - When checked (default): boss armor/damage reduced by modifier percentages
  - When unchecked: base boss stats used without reductions
- Implemented enemy boss system for battle simulation
  - Boss selection UI with dropdown and rank selector
  - Boss armor applied to damage calculations
  - Boss health bar with damage tracking
- Added checkbox UI for toggle-able passive abilities (Saga of the Warrior Born)
- WarHowl buff ability doesn't end Ragnar's turn
- Fixed buff application from active abilities
- Fixed undo turn to properly reset ability cooldowns
