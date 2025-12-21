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

## Build & Deploy

```bash
npm run build    # Build for production
npm run dev      # Development server
npm run deploy   # Deploy to GitHub Pages
```

## Recent Changes

- Added checkbox UI for toggle-able passive abilities (Saga of the Warrior Born)
- WarHowl buff ability doesn't end Ragnar's turn
- Fixed buff application from active abilities
- Fixed undo turn to properly reset ability cooldowns
