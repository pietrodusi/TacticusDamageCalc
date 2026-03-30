import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, RotateCcw, Trash2, PackageX } from 'lucide-react';
import { useTeamStore } from '../stores/teamStore';
import { useBattleStore } from '../stores/battleStore';
import { TeamSlot, BossSelector, MachineOfWarSelector } from '../components/battle';
import type { ActionType, BattleCharacter, BattleLogEntry, BossRank } from '../types';
import {
  BattleCharacterCard,
  BattleLog,
  BattleSummary,
  BattleBossCard,
  DamageSummary,
  RepairTargetModal,
  AttackTypeModal,
  SummonCard,
  InspiredToGreatnessModal,
  TheQuickeningModal,
  BloodChaliceModal,
  DarkTalonStrikeModal,
  RitesOfMorkaiModal,
  HealTargetModal,
  UnbreakableDutyModal,
  PossessionSummonModal,
  FrenziedFiringModal,
  FoulInfusionModal,
  SorcerousFacadeModal,
} from '../components/battle';
import type { DarkTalonStrikeMode } from '../components/battle';
import type { TurnLogEntry } from '../components/battle/BattleLog';
import { abilityEndsTurn, getAbilityValues } from '../services/abilities';
import { getBossAtRank, getMachineOfWarDamageBonus } from '../services/dataService';

// Helper to calculate total damage from log entries
function calculateDamageFromEntries(entries: TurnLogEntry[]): number {
  return entries.reduce((total, entry) => {
    if (entry.damageBreakdown) {
      return total + entry.damageBreakdown.damage;
    } else if (entry.damage) {
      return total + entry.damage;
    }
    return total;
  }, 0);
}

export default function CalculatorPage() {
  const {
    team,
    removeCharacter,
    clearTeam,
    clearAllEquipment,
    selectedBoss,
    setSelectedBoss,
    updateBossRank,
    toggleBossModifiers,
    clearBoss,
    selectedMachineOfWar,
    setSelectedMachineOfWar,
    updateMachineOfWarStars,
    clearMachineOfWar,
  } = useTeamStore();
  const {
    battleState,
    startBattle,
    resetBattle,
    nextTurn,
    finishBattle,
    addAction,
    setCharacterMoved,
    setCharacterActed,
    executeAttack,
    executeAbility,
    resetCharacterTurnAtTurn,
    restoreTurnStart,
    editingTurn,
    setEditingTurn,
    getActiveTurn,
    toggleAbility,
    setIgnoreCrit,
    setCharacterTurnEnded,
    executeRepairWithGalvanicField,
    markAbilityUsed,
    refreshAbilityCooldown,
    setBossMarkerlight,
    setBossOnHexWithFire,
    setBossMovedLastTurn,
    removeSummon,
    updateSummonCount,
    toggleSummonBuffCondition,
    executeSummonAttack,
    executeTheBetrayerBonus,
    executeOverwatchAttack,
    executeFuryOfTheAncients,
    executeMartialSuperiority,
    executeHatefulAssault,
    executeMartialApotheosis,
    executeLivingLightning,
    executeUnwaveringSentinel,
    spawnPossessionSummon,
    executeTheQuickening,
    applyBloodChaliceBuff,
  } = useBattleStore();

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [battleLog, setBattleLog] = useState<TurnLogEntry[]>([]);
  const battleSummaryRef = useRef<HTMLDivElement>(null);

  // Scroll to battle summary when battle is complete
  useEffect(() => {
    if (battleState?.isComplete && battleSummaryRef.current) {
      battleSummaryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [battleState?.isComplete]);

  // Repair modal state (for Actus's Mechanic trait and DefendTheDivineWork)
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [attackTypeModalOpen, setAttackTypeModalOpen] = useState(false);
  const [repairContext, setRepairContext] = useState<{
    repairerId: string;
    repairType: 'mechanic' | 'ddw';
    healAmount: number;
    selectedTargets: string[];
    attackTypeChoices: Record<string, 'melee' | 'ranged'>;
    pendingAttackChoiceTargets: string[];
  } | null>(null);

  // Inspired to Greatness modal state (for Aun'Shi's active ability)
  const [inspiredToGreatnessModalOpen, setInspiredToGreatnessModalOpen] = useState(false);
  const [inspiredToGreatnessContext, setInspiredToGreatnessContext] = useState<{
    casterId: string;
    hpToHeal: number;
    hpToHeal_2: number;
  } | null>(null);

  // The Quickening modal state (for Mephiston's active ability)
  const [theQuickeningModalOpen, setTheQuickeningModalOpen] = useState(false);
  const [theQuickeningContext, setTheQuickeningContext] = useState<{
    casterId: string;
    dmgPct: number;
    maxDmg: number;
  } | null>(null);

  // Blood Chalice modal state (for Nicodemus's active ability)
  const [bloodChaliceModalOpen, setBloodChaliceModalOpen] = useState(false);
  const [bloodChaliceContext, setBloodChaliceContext] = useState<{
    casterId: string;
    extraPierceRatio: number;
  } | null>(null);

  // DarkTalonStrike modal state (for Azrael's active ability)
  const [darkTalonStrikeModalOpen, setDarkTalonStrikeModalOpen] = useState(false);
  const [darkTalonStrikeContext, setDarkTalonStrikeContext] = useState<{
    casterId: string;
    directDamageValues: { minDmg: number; maxDmg: number; hits: number };
    bolterValues: { minDmg: number; maxDmg: number; hits: number };
  } | null>(null);

  // RitesOfMorkai modal state (for Baldr's active ability)
  const [ritesOfMorkaiModalOpen, setRitesOfMorkaiModalOpen] = useState(false);
  const [ritesOfMorkaiContext, setRitesOfMorkaiContext] = useState<{
    casterId: string;
    extraDmg: number;
  } | null>(null);

  // Heal modal state (for Healer trait - Baldr's HealingBalms)
  const [healModalOpen, setHealModalOpen] = useState(false);
  const [healContext, setHealContext] = useState<{
    healerId: string;
    healAmount: number;
    buffInfo?: {
      critChanceBonus: number;
      critDamageBonus: number;
    };
  } | null>(null);

  // Unbreakable Duty modal state (for Thoread's active ability)
  const [unbreakableDutyModalOpen, setUnbreakableDutyModalOpen] = useState(false);
  const [unbreakableDutyContext, setUnbreakableDutyContext] = useState<{
    casterId: string;
    extraDmg: number;
  } | null>(null);

  // Possession summon modal state (for Archimatos's Possession passive)
  const [possessionModalOpen, setPossessionModalOpen] = useState(false);
  const [possessionCharacterId, setPossessionCharacterId] = useState<string | null>(null);

  // FrenziedFiring modal state (for Volk's active ability)
  const [frenziedFiringModalOpen, setFrenziedFiringModalOpen] = useState(false);
  const [frenziedFiringContext, setFrenziedFiringContext] = useState<{
    casterId: string;
  } | null>(null);

  // FoulInfusion modal state (for Pestillian's active ability)
  const [foulInfusionModalOpen, setFoulInfusionModalOpen] = useState(false);
  const [foulInfusionContext, setFoulInfusionContext] = useState<{
    casterId: string;
    dmg: number;
  } | null>(null);

  // SorcerousFacade modal state (for Yazaghor's active ability)
  const [sorcerousFacadeModalOpen, setSorcerousFacadeModalOpen] = useState(false);
  const [sorcerousFacadeContext, setSorcerousFacadeContext] = useState<{
    casterId: string;
    minDmg: number;
    maxDmg: number;
  } | null>(null);

  // Get the active turn (editing turn or current turn)
  const activeTurn = getActiveTurn();
  const isEditingPastTurn = editingTurn !== null && editingTurn < (battleState?.turn ?? 0);

  // Get character action state from battle log for a specific turn
  const getCharacterTurnState = (characterId: string, turn: number) => {
    const entries = battleLog.filter(e => e.characterId === characterId && e.turn === turn);
    const hasAttacked = entries.some(e =>
      e.action === 'attack' || e.action === 'meleeAttack' || e.action === 'rangedAttack'
    );
    const hasUsedAbility = entries.some(e => e.action === 'ability');
    const hasMoved = entries.some(e => e.action === 'move') || hasAttacked;
    const hasActed = hasAttacked || hasUsedAbility;
    const hasWaited = entries.some(e => e.action === 'wait');

    return {
      hasMoved: hasMoved || hasWaited,
      hasActed: hasActed || hasWaited,
    };
  };

  // Get effective character state (considering editing mode)
  const getEffectiveCharacter = (character: BattleCharacter): BattleCharacter => {
    if (!isEditingPastTurn || editingTurn === null) {
      return character;
    }
    // When editing a past turn, use action state from battle log
    const turnState = getCharacterTurnState(character.id, editingTurn);
    return {
      ...character,
      hasMoved: turnState.hasMoved,
      hasActed: turnState.hasActed,
    };
  };

  const handleStartBattle = () => {
    if (team.length === 0) return;
    // Get the boss data if one is selected (with or without modifiers based on setting)
    const boss = selectedBoss
      ? getBossAtRank(selectedBoss.bossId, selectedBoss.rank, selectedBoss.applyModifiers) ?? undefined
      : undefined;
    // Get Machine of War data with extraDmgPct
    const machineOfWarData = selectedMachineOfWar
      ? {
          machineId: selectedMachineOfWar.machineId,
          stars: selectedMachineOfWar.stars,
          extraDmgPct: getMachineOfWarDamageBonus(selectedMachineOfWar.machineId, selectedMachineOfWar.stars),
        }
      : undefined;
    startBattle(team, boss, machineOfWarData);
    setBattleLog([]);
    setSelectedCharacterId(null);
  };

  const handleResetBattle = () => {
    resetBattle();
    setBattleLog([]);
    setSelectedCharacterId(null);
  };

  const handleNextTurn = () => {
    if (!battleState) return;

    // Filter log entries for the current turn to pass to turnHistory
    const currentTurnLog = battleLog.filter(entry => entry.turn === battleState.turn);

    // On turn 6, finish the battle instead of going to turn 7
    if (battleState.turn === 6) {
      finishBattle(currentTurnLog);
    } else {
      nextTurn(currentTurnLog);
    }
    setSelectedCharacterId(null);
  };

  const isLastTurn = battleState?.turn === 6;

  const handleUndoActions = (_characterId: string) => {
    if (!battleState) return;

    const currentTurn = battleState.turn;

    // Restore entire turn to start state using snapshot
    restoreTurnStart();

    // Remove ALL log entries for the current turn (entire turn is reset)
    setBattleLog(prev => prev.filter(entry => entry.turn !== currentTurn));
  };

  const handleUndoCharacterTurn = (characterId: string, turn: number) => {
    if (!battleState) return;

    // Calculate damage to subtract from this character's actions in the specified turn
    const characterEntries = battleLog.filter(
      entry => entry.characterId === characterId && entry.turn === turn
    );
    const damageToSubtract = calculateDamageFromEntries(characterEntries);

    // Reset character turn in store (handles both current and past turns)
    resetCharacterTurnAtTurn(characterId, turn, damageToSubtract);

    // Remove this character's log entries for the specified turn
    setBattleLog(prev => prev.filter(
      entry => !(entry.characterId === characterId && entry.turn === turn)
    ));
  };

  const handleAction = (characterId: string, actionType: ActionType) => {
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    // Use activeTurn for logging (supports editing past turns)
    const targetTurn = activeTurn;

    switch (actionType) {
      case 'move':
        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          setCharacterMoved(characterId, true);
        }
        addAction(characterId, { type: 'move', characterId });
        setBattleLog((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            characterId,
            characterName: character.name,
            action: 'move' as const,
            message: `${character.name} moves`,
            turn: targetTurn,
          },
        ]);
        break;

      case 'attack':
      case 'meleeAttack': {
        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          setCharacterActed(characterId, true);
          setCharacterTurnEnded(characterId, true); // Basic attack ends turn
        }
        addAction(characterId, { type: 'meleeAttack', characterId, targetId: 'boss' });

        // Execute attack and add to log (executeAttack updates total damage in store)
        // Note: hasMoved reflects actual movement, not action state
        const meleeLog = executeAttack(characterId, 'boss', 'melee');
        setBattleLog((prev) => [...prev, { ...meleeLog, turn: targetTurn }]);
        break;
      }

      case 'rangedAttack': {
        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          setCharacterActed(characterId, true);
          setCharacterTurnEnded(characterId, true); // Basic attack ends turn
        }
        addAction(characterId, { type: 'rangedAttack', characterId, targetId: 'boss' });

        // Execute attack and add to log (executeAttack updates total damage in store)
        // Note: hasMoved reflects actual movement, not action state
        const rangedLog = executeAttack(characterId, 'boss', 'ranged');
        setBattleLog((prev) => [...prev, { ...rangedLog, turn: targetTurn }]);
        break;
      }

      case 'ability': {
        // Execute ability and get damage result
        const abilityId = character.activeAbilities[0];

        // Special handling for DefendTheDivineWork - opens repair modal for multi-target selection
        if (abilityId === 'DefendTheDivineWork') {
          const ddwLevelIndex = character.abilityLevels?.['DefendTheDivineWork'] ?? 59;
          const ddwValues = getAbilityValues('DefendTheDivineWork', ddwLevelIndex, character.progressionStepIndex);
          const hpToRepair = (ddwValues?.hpToRepair as number) || 0;

          setRepairContext({
            repairerId: characterId,
            repairType: 'ddw',
            healAmount: hpToRepair,
            selectedTargets: [],
            attackTypeChoices: {},
            pendingAttackChoiceTargets: [],
          });
          setRepairModalOpen(true);
          break;
        }

        // Special handling for InspiredToGreatness - opens target selection modal
        if (abilityId === 'InspiredToGreatness') {
          const itgLevelIndex = character.abilityLevels?.['InspiredToGreatness'] ?? 59;
          const itgValues = getAbilityValues('InspiredToGreatness', itgLevelIndex, character.progressionStepIndex);
          const hpToHeal = (itgValues?.hpToHeal as number) || 0;
          const hpToHeal_2 = (itgValues?.hpToHeal_2 as number) || 0;

          setInspiredToGreatnessContext({
            casterId: characterId,
            hpToHeal,
            hpToHeal_2,
          });
          setInspiredToGreatnessModalOpen(true);
          break;
        }

        // Special handling for TheQuickening - opens target selection modal
        if (abilityId === 'TheQuickening') {
          const tqLevelIndex = character.abilityLevels?.['TheQuickening'] ?? 59;
          const tqValues = getAbilityValues('TheQuickening', tqLevelIndex, character.progressionStepIndex);
          const dmgPct = (tqValues?.dmgPct as number) || 100;
          const maxDmg = (tqValues?.maxDmg as number) || 0;

          // Check if there are any Blood Angels targets (excluding Mephiston himself)
          const eligibleTargets = battleState.team.filter(c =>
            c.id !== characterId && c.faction === 'BloodAngels'
          );

          if (eligibleTargets.length === 0) {
            // No valid targets - use ability but it does nothing
            const targetTurn = activeTurn;

            // Only modify current turn flags if not editing past turn
            if (!isEditingPastTurn) {
              setCharacterActed(characterId, true);
              setCharacterTurnEnded(characterId, true);
            }

            // Mark ability as used
            markAbilityUsed(characterId, 'TheQuickening');

            // Add log entry indicating ability was used but had no effect
            const logEntry: BattleLogEntry = {
              timestamp: Date.now(),
              characterId,
              characterName: character.name,
              characterIconUrl: character.iconUrl,
              action: 'ability',
              message: `${character.name} used The Quickening but there are no Blood Angels teammates to target.`,
            };
            setBattleLog((prev) => [...prev, { ...logEntry, turn: targetTurn }]);

            // Auto-trigger Fury of the Ancients if not used this turn
            if (character.passiveAbilities.includes('FuryOfTheAncients') && !character.hasUsedFuryOfTheAncientsThisTurn) {
              const furyLog = executeFuryOfTheAncients(characterId);
              setBattleLog((prev) => [...prev, { ...furyLog, turn: targetTurn }]);
            }
            break;
          }

          setTheQuickeningContext({
            casterId: characterId,
            dmgPct,
            maxDmg,
          });
          setTheQuickeningModalOpen(true);
          break;
        }

        // Special handling for BloodChalice - opens target selection modal
        if (abilityId === 'BloodChalice') {
          const bcLevelIndex = character.abilityLevels?.['BloodChalice'] ?? 59;
          const bcValues = getAbilityValues('BloodChalice', bcLevelIndex, character.progressionStepIndex);
          const extraPierceRatio = (bcValues?.extraPierceRatio as number) || 0;

          setBloodChaliceContext({
            casterId: characterId,
            extraPierceRatio,
          });
          setBloodChaliceModalOpen(true);
          break;
        }

        // Special handling for DarkTalonStrike - opens attack type selection modal
        if (abilityId === 'DarkTalonStrike') {
          const dtsLevelIndex = character.abilityLevels?.['DarkTalonStrike'] ?? 59;
          const dtsValues = getAbilityValues('DarkTalonStrike', dtsLevelIndex, character.progressionStepIndex);

          if (dtsValues) {
            setDarkTalonStrikeContext({
              casterId: characterId,
              directDamageValues: {
                minDmg: (dtsValues.minDmg as number) || 0,
                maxDmg: (dtsValues.maxDmg as number) || 0,
                hits: (dtsValues.nrOfHits as number) || 1,
              },
              bolterValues: {
                minDmg: (dtsValues.minDmg_2 as number) || 0,
                maxDmg: (dtsValues.maxDmg_2 as number) || 0,
                hits: (dtsValues.nrOfHits_2 as number) || 6,
              },
            });
            setDarkTalonStrikeModalOpen(true);
            break;
          }
        }

        // Special handling for UnbreakableDuty - opens Yes/No confirmation modal
        if (abilityId === 'UnbreakableDuty') {
          const udLevelIndex = character.abilityLevels?.['UnbreakableDuty'] ?? 59;
          const udValues = getAbilityValues('UnbreakableDuty', udLevelIndex, character.progressionStepIndex);
          const extraDmg = (udValues?.extraDmg as number) || 0;

          setUnbreakableDutyContext({
            casterId: characterId,
            extraDmg,
          });
          setUnbreakableDutyModalOpen(true);
          break;
        }

        // Special handling for RitesOfMorkai - opens target selection modal
        if (abilityId === 'RitesOfMorkai') {
          const romLevelIndex = character.abilityLevels?.['RitesOfMorkai'] ?? 59;
          const romValues = getAbilityValues('RitesOfMorkai', romLevelIndex, character.progressionStepIndex);
          const extraDmg = (romValues?.extraDmg as number) || 0;

          setRitesOfMorkaiContext({
            casterId: characterId,
            extraDmg,
          });
          setRitesOfMorkaiModalOpen(true);
          break;
        }

        // Special handling for FoulInfusion - opens Chaos ally selection modal
        if (abilityId === 'FoulInfusion') {
          const fiLevelIndex = character.abilityLevels?.['FoulInfusion'] ?? 59;
          const fiValues = getAbilityValues('FoulInfusion', fiLevelIndex, character.progressionStepIndex);
          const dmg = (fiValues?.dmg as number) || 0;

          setFoulInfusionContext({
            casterId: characterId,
            dmg,
          });
          setFoulInfusionModalOpen(true);
          break;
        }

        // Special handling for SorcerousFacade - opens Psyker ally selection modal
        if (abilityId === 'SorcerousFacade') {
          const sfLevelIndex = character.abilityLevels?.['SorcerousFacade'] ?? 59;
          const sfValues = getAbilityValues('SorcerousFacade', sfLevelIndex, character.progressionStepIndex);
          const sfMinDmg = (sfValues?.minDmg as number) || 0;
          const sfMaxDmg = (sfValues?.maxDmg as number) || 0;

          setSorcerousFacadeContext({
            casterId: characterId,
            minDmg: sfMinDmg,
            maxDmg: sfMaxDmg,
          });
          setSorcerousFacadeModalOpen(true);
          break;
        }

        // Special handling for FrenziedFiring - opens free hexes counter modal
        if (abilityId === 'FrenziedFiring') {
          setFrenziedFiringContext({ casterId: characterId });
          setFrenziedFiringModalOpen(true);
          break;
        }

        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          // Check if this ability ends the turn
          let endsTurn = abilityId ? abilityEndsTurn(abilityId) : true;

          // Fighting Retreat: Never ends Darkstrider's turn
          if (abilityId === 'FightingRetreat') {
            endsTurn = false;
          }

          if (endsTurn) {
            setCharacterActed(characterId, true);
            setCharacterTurnEnded(characterId, true);
          }
          // LC hits buff activation is handled inside executeAbility
        }
        addAction(characterId, { type: 'ability', characterId });

        if (abilityId) {
          const abilityLog = executeAbility(characterId, abilityId);
          setBattleLog((prev) => [...prev, { ...abilityLog, turn: targetTurn }]);
        } else {
          setBattleLog((prev) => [
            ...prev,
            {
              timestamp: Date.now(),
              characterId,
              characterName: character.name,
              action: 'ability' as const,
              message: `${character.name} has no ability`,
              turn: targetTurn,
            },
          ]);
        }
        break;
      }

      case 'wait':
        // Only modify current turn flags if not editing past turn
        if (!isEditingPastTurn) {
          setCharacterMoved(characterId, true);
          setCharacterActed(characterId, true);
        }
        addAction(characterId, { type: 'wait', characterId });
        setBattleLog((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            characterId,
            characterName: character.name,
            action: 'wait' as const,
            message: `${character.name} waits`,
            turn: targetTurn,
          },
        ]);
        break;

      case 'repair': {
        // Open repair target modal for Mechanic trait
        // Calculate heal amount: character's damage × max(meleeHits, rangedHits)
        const maxHits = Math.max(character.meleeHits, character.rangedHits || 0);
        const healAmount = character.calculatedDamage * maxHits;

        setRepairContext({
          repairerId: characterId,
          repairType: 'mechanic',
          healAmount,
          selectedTargets: [],
          attackTypeChoices: {},
          pendingAttackChoiceTargets: [],
        });
        setRepairModalOpen(true);
        break;
      }

      case 'heal': {
        // Open heal target modal for Healer trait
        // Calculate heal amount: character's damage × max(meleeHits, rangedHits)
        const maxHitsHeal = Math.max(character.meleeHits, character.rangedHits || 0);
        const healAmountHeal = character.calculatedDamage * maxHitsHeal;

        // Check if healer has HealingBalms passive (Baldr)
        const hasHealingBalms = character.passiveAbilities?.includes('HealingBalms') ?? false;
        let buffInfo: { critChanceBonus: number; critDamageBonus: number } | undefined;

        if (hasHealingBalms) {
          const hbLevelIndex = character.abilityLevels?.['HealingBalms'] ?? 59;
          const hbValues = getAbilityValues('HealingBalms', hbLevelIndex, character.progressionStepIndex);
          if (hbValues) {
            buffInfo = {
              critChanceBonus: (hbValues.extraCritChance as number) || 0,
              critDamageBonus: (hbValues.extraCritDmg as number) || 0,
            };
          }
        }

        setHealContext({
          healerId: characterId,
          healAmount: healAmountHeal,
          buffInfo,
        });
        setHealModalOpen(true);
        break;
      }
    }
  };

  // Handle The Betrayer execute action for Kharn
  const handleExecuteBetrayer = (characterId: string) => {
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    const targetTurn = activeTurn;

    // Execute The Betrayer bonus attack (does NOT end turn)
    const executeLog = executeTheBetrayerBonus(characterId);
    setBattleLog((prev) => [...prev, { ...executeLog, turn: targetTurn }]);
  };

  // Handle Overwatch execute action for Re'vas
  const handleExecuteOverwatch = (characterId: string) => {
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    const targetTurn = activeTurn;

    // Execute Overwatch attack (does NOT end turn, but can only be used once)
    const executeLog = executeOverwatchAttack(characterId);
    setBattleLog((prev) => [...prev, { ...executeLog, turn: targetTurn }]);
  };

  // Handle Fury of the Ancients execute action for Mephiston
  const handleExecuteFuryOfTheAncients = (characterId: string) => {
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    const targetTurn = activeTurn;

    // Execute Fury of the Ancients bonus attack (does NOT end turn)
    const executeLog = executeFuryOfTheAncients(characterId);
    setBattleLog((prev) => [...prev, { ...executeLog, turn: targetTurn }]);
  };

  // Handle Martial Superiority execute action for Jaeger
  const handleExecuteMartialSuperiority = (characterId: string) => {
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    const targetTurn = activeTurn;

    // Execute Martial Superiority bonus attack (does NOT end turn)
    const executeLog = executeMartialSuperiority(characterId);
    setBattleLog((prev) => [...prev, { ...executeLog, turn: targetTurn }]);
  };

  // Handle Hateful Assault execute action for Angrax
  const handleExecuteHatefulAssault = (characterId: string) => {
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    const targetTurn = activeTurn;

    // Execute Hateful Assault bonus attack (does NOT end turn)
    const executeLog = executeHatefulAssault(characterId);
    setBattleLog((prev) => [...prev, { ...executeLog, turn: targetTurn }]);
  };

  // Handle Martial Apotheosis execute action for Anuphet
  const handleExecuteMartialApotheosis = (characterId: string) => {
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    const targetTurn = activeTurn;

    // Execute Martial Apotheosis bonus attack (does NOT end turn)
    const executeLog = executeMartialApotheosis(characterId);
    setBattleLog((prev) => [...prev, { ...executeLog, turn: targetTurn }]);
  };

  // Handle Living Lightning execute action for Thutmose
  const handleExecuteLivingLightning = (characterId: string) => {
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    const targetTurn = activeTurn;

    // Execute Living Lightning bonus attack (does NOT end turn)
    const executeLog = executeLivingLightning(characterId);
    setBattleLog((prev) => [...prev, { ...executeLog, turn: targetTurn }]);
  };

  // Handle Unwavering Sentinel execute action for Tyrith
  const handleExecuteUnwaveringSentinel = (characterId: string) => {
    if (!battleState) return;

    const character = battleState.team.find((c) => c.id === characterId);
    if (!character) return;

    const targetTurn = activeTurn;

    // Execute Unwavering Sentinel bonus attack (does NOT end turn, unlimited uses)
    const executeLog = executeUnwaveringSentinel(characterId);
    setBattleLog((prev) => [...prev, { ...executeLog, turn: targetTurn }]);
  };

  // Helper to check if character has both melee and ranged attacks
  const hasBothAttacks = (char: BattleCharacter) => {
    const hasMelee = char.meleeHits > 0;
    const hasRanged = char.rangedHits !== undefined && char.rangedHits > 0;
    return hasMelee && hasRanged;
  };

  // Handle repair target selection
  const handleRepairTargetConfirm = (targetIds: string[]) => {
    if (!repairContext || !battleState) return;

    const repairer = battleState.team.find(c => c.id === repairContext.repairerId);
    if (!repairer) return;

    // Find targets that need attack type choice (only for Galvanic Field - non-self with both melee and ranged)
    const hasGalvanicField = repairer.passiveAbilities.includes('GalvanicField');
    const pendingAttackChoiceTargets = hasGalvanicField ? targetIds.filter(targetId => {
      if (targetId === repairContext.repairerId) return false; // Self-repair doesn't trigger attack
      const target = battleState.team.find(c => c.id === targetId);
      return target && hasBothAttacks(target);
    }) : [];

    // Set default attack type for targets without both attacks (melee by default)
    const attackTypeChoices: Record<string, 'melee' | 'ranged'> = {};
    targetIds.forEach(targetId => {
      if (targetId === repairContext.repairerId) return; // Skip self
      const target = battleState.team.find(c => c.id === targetId);
      if (target && !hasBothAttacks(target)) {
        // Default to melee, or ranged if no melee
        attackTypeChoices[targetId] = target.meleeHits > 0 ? 'melee' : 'ranged';
      }
    });

    setRepairContext({
      ...repairContext,
      selectedTargets: targetIds,
      attackTypeChoices,
      pendingAttackChoiceTargets,
    });

    setRepairModalOpen(false);

    // If there are attack type choices needed, open the modal
    if (pendingAttackChoiceTargets.length > 0) {
      setAttackTypeModalOpen(true);
    } else {
      // No choices needed, execute repair immediately
      executeRepairAction(targetIds, attackTypeChoices);
    }
  };

  // Handle attack type selection for Galvanic Field
  const handleAttackTypeSelect = (attackType: 'melee' | 'ranged') => {
    if (!repairContext || repairContext.pendingAttackChoiceTargets.length === 0) return;

    const currentTargetId = repairContext.pendingAttackChoiceTargets[0];
    const remainingTargets = repairContext.pendingAttackChoiceTargets.slice(1);
    const updatedChoices = {
      ...repairContext.attackTypeChoices,
      [currentTargetId]: attackType,
    };

    if (remainingTargets.length > 0) {
      // More choices needed
      setRepairContext({
        ...repairContext,
        attackTypeChoices: updatedChoices,
        pendingAttackChoiceTargets: remainingTargets,
      });
    } else {
      // All choices made, execute repair
      setAttackTypeModalOpen(false);
      executeRepairAction(repairContext.selectedTargets, updatedChoices);
    }
  };

  // Execute the repair action with Galvanic Field
  const executeRepairAction = (targetIds: string[], attackTypeChoices: Record<string, 'melee' | 'ranged'>) => {
    if (!repairContext || !battleState) return;

    const targetTurn = activeTurn;

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      setCharacterActed(repairContext.repairerId, true);
      setCharacterTurnEnded(repairContext.repairerId, true);

      // Mark DefendTheDivineWork as used (one-time per battle)
      if (repairContext.repairType === 'ddw') {
        markAbilityUsed(repairContext.repairerId, 'DefendTheDivineWork');
      }
    }

    // Execute repair and get log entries
    const logEntries = executeRepairWithGalvanicField(
      repairContext.repairerId,
      targetIds,
      repairContext.healAmount,
      attackTypeChoices
    );

    // Add to battle log
    setBattleLog((prev) => [
      ...prev,
      ...logEntries.map(entry => ({ ...entry, turn: targetTurn })),
    ]);

    // Clear repair context
    setRepairContext(null);
  };

  // Cancel repair action
  const handleRepairCancel = () => {
    setRepairModalOpen(false);
    setAttackTypeModalOpen(false);
    setRepairContext(null);
  };

  // Handle Inspired to Greatness target selection confirm
  const handleInspiredToGreatnessConfirm = (targetId: string, hasUsedAbility: boolean) => {
    if (!inspiredToGreatnessContext || !battleState) return;

    const caster = battleState.team.find(c => c.id === inspiredToGreatnessContext.casterId);
    const target = battleState.team.find(c => c.id === targetId);
    if (!caster || !target) return;

    const targetTurn = activeTurn;
    const healAmount = hasUsedAbility
      ? inspiredToGreatnessContext.hpToHeal
      : inspiredToGreatnessContext.hpToHeal_2;

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      setCharacterActed(inspiredToGreatnessContext.casterId, true);
      setCharacterTurnEnded(inspiredToGreatnessContext.casterId, true);
      markAbilityUsed(inspiredToGreatnessContext.casterId, 'InspiredToGreatness');
    }

    // Log the Inspired to Greatness action
    setBattleLog((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        characterId: inspiredToGreatnessContext.casterId,
        characterName: caster.name,
        action: 'ability' as const,
        message: hasUsedAbility
          ? `Inspired to Greatness inspires ${target.name}: +${healAmount} HP & ability re-use`
          : `Inspired to Greatness heals ${target.name}: +${healAmount} HP`,
        healing: healAmount,
        turn: targetTurn,
      },
    ]);

    // If target has used their ability, refresh their cooldown so they can use it again
    if (hasUsedAbility && !isEditingPastTurn && target.activeAbilities.length > 0) {
      const targetAbilityId = target.activeAbilities[0];
      refreshAbilityCooldown(targetId, targetAbilityId);
    }

    // Close modal and clear context
    setInspiredToGreatnessModalOpen(false);
    setInspiredToGreatnessContext(null);
  };

  // Cancel Inspired to Greatness action
  const handleInspiredToGreatnessCancel = () => {
    setInspiredToGreatnessModalOpen(false);
    setInspiredToGreatnessContext(null);
  };

  // Handle The Quickening target selection (Mephiston)
  const handleTheQuickeningConfirm = (targetId: string) => {
    if (!theQuickeningContext || !battleState) return;

    const caster = battleState.team.find(c => c.id === theQuickeningContext.casterId);
    const target = battleState.team.find(c => c.id === targetId);
    if (!caster || !target) return;

    // Verify target is Blood Angels
    if (target.faction !== 'BloodAngels') {
      console.warn('TheQuickening target must be Blood Angels');
      return;
    }

    const targetTurn = activeTurn;

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      setCharacterActed(theQuickeningContext.casterId, true);
      setCharacterTurnEnded(theQuickeningContext.casterId, true);
    }
    addAction(theQuickeningContext.casterId, { type: 'ability', characterId: theQuickeningContext.casterId });

    // Mark ability as used
    markAbilityUsed(theQuickeningContext.casterId, 'TheQuickening');

    // Execute the attack
    const executeLog = executeTheQuickening(theQuickeningContext.casterId, targetId);
    setBattleLog((prev) => [...prev, { ...executeLog, turn: targetTurn }]);

    // Auto-trigger Fury of the Ancients if not used this turn
    if (caster.passiveAbilities.includes('FuryOfTheAncients') && !caster.hasUsedFuryOfTheAncientsThisTurn) {
      const furyLog = executeFuryOfTheAncients(theQuickeningContext.casterId);
      setBattleLog((prev) => [...prev, { ...furyLog, turn: targetTurn }]);
    }

    // Close modal and clear context
    setTheQuickeningModalOpen(false);
    setTheQuickeningContext(null);
  };

  // Cancel The Quickening action
  const handleTheQuickeningCancel = () => {
    setTheQuickeningModalOpen(false);
    setTheQuickeningContext(null);
  };

  // Handle Blood Chalice target selection (Nicodemus)
  const handleBloodChaliceConfirm = (targetIds: string[]) => {
    if (!bloodChaliceContext || !battleState) return;

    const caster = battleState.team.find(c => c.id === bloodChaliceContext.casterId);
    if (!caster) return;

    const targetTurn = activeTurn;

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      setCharacterActed(bloodChaliceContext.casterId, true);
      setCharacterTurnEnded(bloodChaliceContext.casterId, true);
    }
    addAction(bloodChaliceContext.casterId, { type: 'ability', characterId: bloodChaliceContext.casterId });

    // Mark ability as used
    markAbilityUsed(bloodChaliceContext.casterId, 'BloodChalice');

    // Apply the buff to selected targets
    if (targetIds.length > 0) {
      applyBloodChaliceBuff(bloodChaliceContext.casterId, targetIds, bloodChaliceContext.extraPierceRatio);
    }

    // Build log message
    const targetNames = targetIds.map(id => {
      const char = battleState.team.find(c => c.id === id);
      return char?.name || 'Unknown';
    }).join(', ');

    const logEntry: BattleLogEntry = {
      timestamp: Date.now(),
      characterId: bloodChaliceContext.casterId,
      characterName: caster.name,
      characterIconUrl: caster.iconUrl,
      action: 'ability',
      message: targetIds.length > 0
        ? `Blood Chalice grants +${bloodChaliceContext.extraPierceRatio}% pierce ratio to ${targetNames}`
        : `Blood Chalice used but no targets selected`,
    };
    setBattleLog((prev) => [...prev, { ...logEntry, turn: targetTurn }]);

    // Close modal and clear context
    setBloodChaliceModalOpen(false);
    setBloodChaliceContext(null);
  };

  // Cancel Blood Chalice action
  const handleBloodChaliceCancel = () => {
    setBloodChaliceModalOpen(false);
    setBloodChaliceContext(null);
  };

  // Handle DarkTalonStrike attack type selection
  const handleDarkTalonStrikeSelect = (mode: DarkTalonStrikeMode) => {
    if (!darkTalonStrikeContext || !battleState) return;

    const caster = battleState.team.find(c => c.id === darkTalonStrikeContext.casterId);
    if (!caster) return;

    const targetTurn = activeTurn;

    // Set the toggle based on user's choice before executing
    // toggleAbility flips the boolean, so we need to check current state
    const currentBolterMode = caster.abilityToggles['DarkTalonStrike_bolterMode'] ?? false;
    const wantBolterMode = mode === 'bolter';

    if (currentBolterMode !== wantBolterMode) {
      toggleAbility(darkTalonStrikeContext.casterId, 'DarkTalonStrike_bolterMode');
    }

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      setCharacterActed(darkTalonStrikeContext.casterId, true);
      setCharacterTurnEnded(darkTalonStrikeContext.casterId, true);
    }
    addAction(darkTalonStrikeContext.casterId, { type: 'ability', characterId: darkTalonStrikeContext.casterId });

    // Execute the ability
    const abilityLog = executeAbility(darkTalonStrikeContext.casterId, 'DarkTalonStrike');
    setBattleLog((prev) => [...prev, { ...abilityLog, turn: targetTurn }]);

    // Close modal and clear context
    setDarkTalonStrikeModalOpen(false);
    setDarkTalonStrikeContext(null);
  };

  // Cancel DarkTalonStrike action
  const handleDarkTalonStrikeCancel = () => {
    setDarkTalonStrikeModalOpen(false);
    setDarkTalonStrikeContext(null);
  };

  // Handle FrenziedFiring confirm
  const handleFrenziedFiringConfirm = (freeHexes: number) => {
    if (!frenziedFiringContext || !battleState) return;

    const targetTurn = activeTurn;

    // Set the free hexes toggle value before executing
    toggleAbility(frenziedFiringContext.casterId, 'FrenziedFiring_freeHexes', freeHexes);

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      setCharacterActed(frenziedFiringContext.casterId, true);
      setCharacterTurnEnded(frenziedFiringContext.casterId, true);
    }
    addAction(frenziedFiringContext.casterId, { type: 'ability', characterId: frenziedFiringContext.casterId });

    // Execute the ability
    const abilityLog = executeAbility(frenziedFiringContext.casterId, 'FrenziedFiring');
    setBattleLog((prev) => [...prev, { ...abilityLog, turn: targetTurn }]);

    // Close modal and clear context
    setFrenziedFiringModalOpen(false);
    setFrenziedFiringContext(null);
  };

  // Cancel FrenziedFiring action
  const handleFrenziedFiringCancel = () => {
    setFrenziedFiringModalOpen(false);
    setFrenziedFiringContext(null);
  };

  // Handle Foul Infusion target selection confirm
  const handleFoulInfusionConfirm = (targetIds: string[]) => {
    if (!foulInfusionContext || !battleState) return;

    const caster = battleState.team.find(c => c.id === foulInfusionContext.casterId);
    if (!caster) return;

    const targetTurn = activeTurn;
    const dmg = foulInfusionContext.dmg;

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      // Apply FoulInfusion buff to selected targets
      useBattleStore.setState((state) => ({
        battleState: state.battleState ? {
          ...state.battleState,
          team: state.battleState.team.map((char) =>
            targetIds.includes(char.id)
              ? {
                  ...char,
                  foulInfusionActive: true,
                  foulInfusionDmg: dmg,
                  foulInfusionTurnsRemaining: 2,
                }
              : char
          ),
        } : null,
      }));

      // Mark ability as used (one-time) but don't end turn - Pestillian can still melee attack
      markAbilityUsed(foulInfusionContext.casterId, 'FoulInfusion');
    }
    addAction(foulInfusionContext.casterId, { type: 'ability', characterId: foulInfusionContext.casterId });

    // Build target names for log message
    const buffedTargetNames = targetIds.map(id => {
      const target = battleState.team.find(c => c.id === id);
      return target?.name || 'Unknown';
    });

    // Log the Foul Infusion action
    setBattleLog((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        characterId: foulInfusionContext.casterId,
        characterName: caster.name,
        action: 'ability' as ActionType,
        message: `Foul Infusion: ${buffedTargetNames.join(', ')} +1x ${dmg} Toxic on melee (2 turns)`,
        turn: targetTurn,
      },
    ]);

    // Close modal and clear context
    setFoulInfusionModalOpen(false);
    setFoulInfusionContext(null);
  };

  // Cancel FoulInfusion action
  const handleFoulInfusionCancel = () => {
    setFoulInfusionModalOpen(false);
    setFoulInfusionContext(null);
  };

  // Handle Sorcerous Facade target selection confirm
  const handleSorcerousFacadeConfirm = (targetIds: string[]) => {
    if (!sorcerousFacadeContext || !battleState) return;

    const caster = battleState.team.find(c => c.id === sorcerousFacadeContext.casterId);
    if (!caster) return;

    const targetTurn = activeTurn;
    const { minDmg, maxDmg } = sorcerousFacadeContext;

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      // Apply SorcerousFacade buff to selected targets
      useBattleStore.setState((state) => ({
        battleState: state.battleState ? {
          ...state.battleState,
          team: state.battleState.team.map((char) =>
            targetIds.includes(char.id)
              ? {
                  ...char,
                  sorcerousFacadeActive: true,
                  sorcerousFacadeMinDmg: minDmg,
                  sorcerousFacadeMaxDmg: maxDmg,
                  sorcerousFacadeTurnsRemaining: 1,
                }
              : char
          ),
        } : null,
      }));

      // Mark ability as used (one-time) - does NOT end turn
      markAbilityUsed(sorcerousFacadeContext.casterId, 'SorcerousFacade');
    }
    addAction(sorcerousFacadeContext.casterId, { type: 'ability', characterId: sorcerousFacadeContext.casterId });

    // Build target names for log message
    const buffedTargetNames = targetIds.map(id => {
      const target = battleState.team.find(c => c.id === id);
      return target?.name || 'Unknown';
    });

    // Log the Sorcerous Facade action
    setBattleLog((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        characterId: sorcerousFacadeContext.casterId,
        characterName: caster.name,
        action: 'ability' as ActionType,
        message: `Sorcerous Facade: ${buffedTargetNames.join(', ')} +1x ${minDmg}-${maxDmg} Psychic on attacks (1 turn)`,
        turn: targetTurn,
      },
    ]);

    // Close modal and clear context
    setSorcerousFacadeModalOpen(false);
    setSorcerousFacadeContext(null);
  };

  // Cancel SorcerousFacade action
  const handleSorcerousFacadeCancel = () => {
    setSorcerousFacadeModalOpen(false);
    setSorcerousFacadeContext(null);
  };

  // Handle Rites of Morkai target selection confirm
  const handleRitesOfMorkaiConfirm = (targetIds: string[]) => {
    if (!ritesOfMorkaiContext || !battleState) return;

    const caster = battleState.team.find(c => c.id === ritesOfMorkaiContext.casterId);
    if (!caster) return;

    const targetTurn = activeTurn;
    const extraDmg = ritesOfMorkaiContext.extraDmg;

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      // Apply buff to caster if they have FinalJustice (and are not Mechanical - already checked in modal)
      const casterHasFinalJustice = caster.traits?.includes('FinalJustice') ?? false;
      if (casterHasFinalJustice) {
        useBattleStore.setState((state) => ({
          battleState: state.battleState ? {
            ...state.battleState,
            team: state.battleState.team.map((char) =>
              char.id === caster.id
                ? {
                    ...char,
                    activeBuffs: [
                      ...char.activeBuffs,
                      {
                        abilityId: 'RitesOfMorkai',
                        abilityName: 'Rites of Morkai',
                        baseDamageBonus: extraDmg,
                      },
                    ],
                  }
                : char
            ),
          } : null,
        }));
      }

      // Apply buff to selected targets
      if (targetIds.length > 0) {
        useBattleStore.setState((state) => ({
          battleState: state.battleState ? {
            ...state.battleState,
            team: state.battleState.team.map((char) =>
              targetIds.includes(char.id)
                ? {
                    ...char,
                    activeBuffs: [
                      ...char.activeBuffs,
                      {
                        abilityId: 'RitesOfMorkai',
                        abilityName: 'Rites of Morkai',
                        baseDamageBonus: extraDmg,
                      },
                    ],
                  }
                : char
            ),
          } : null,
        }));
      }

      // Mark ability as used (one-time per battle)
      markAbilityUsed(ritesOfMorkaiContext.casterId, 'RitesOfMorkai');
      // Ability does NOT end turn - Baldr can still attack
    }

    // Build target names for log message
    const buffedTargetNames = targetIds.map(id => {
      const target = battleState.team.find(c => c.id === id);
      return target?.name || 'Unknown';
    });
    const casterHasFinalJustice = caster.traits?.includes('FinalJustice') ?? false;
    if (casterHasFinalJustice) {
      buffedTargetNames.unshift(caster.name);
    }

    // Log the Rites of Morkai action
    setBattleLog((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        characterId: ritesOfMorkaiContext.casterId,
        characterName: caster.name,
        action: 'ability' as const,
        message: buffedTargetNames.length > 0
          ? `Rites of Morkai: ${buffedTargetNames.join(', ')} +${extraDmg} dmg`
          : 'Rites of Morkai: No eligible allies',
        turn: targetTurn,
      },
    ]);

    // Close modal and clear context
    setRitesOfMorkaiModalOpen(false);
    setRitesOfMorkaiContext(null);
  };

  // Cancel Rites of Morkai action
  const handleRitesOfMorkaiCancel = () => {
    setRitesOfMorkaiModalOpen(false);
    setRitesOfMorkaiContext(null);
  };

  // Handle Heal target selection confirm
  const handleHealConfirm = (targetId: string) => {
    if (!healContext || !battleState) return;

    const healer = battleState.team.find(c => c.id === healContext.healerId);
    const target = battleState.team.find(c => c.id === targetId);
    if (!healer || !target) return;

    const targetTurn = activeTurn;
    const healAmount = Math.min(healContext.healAmount, target.calculatedHealth - target.currentHealth);

    // Only modify current turn flags if not editing past turn
    if (!isEditingPastTurn) {
      setCharacterActed(healContext.healerId, true);
      setCharacterTurnEnded(healContext.healerId, true);

      // Apply healing to target
      useBattleStore.setState((state) => ({
        battleState: state.battleState ? {
          ...state.battleState,
          team: state.battleState.team.map((char) =>
            char.id === targetId
              ? {
                  ...char,
                  currentHealth: Math.min(char.currentHealth + healContext.healAmount, char.calculatedHealth),
                }
              : char
          ),
        } : null,
      }));

      // Apply HealingBalms buff if healer has it
      if (healContext.buffInfo) {
        useBattleStore.setState((state) => {
          if (!state.battleState) return state;

          return {
            battleState: {
              ...state.battleState,
              team: state.battleState.team.map((char) => {
                if (char.id !== targetId) return char;

                // Check if target already has HealingBalms buff - if so, reset duration
                const existingBuffIndex = char.activeBuffs.findIndex(
                  buff => buff.abilityName === 'Healing Balms'
                );

                const newBuff = {
                  abilityName: 'Healing Balms',
                  critChanceBonus: healContext.buffInfo!.critChanceBonus,
                  critDamageBonus: healContext.buffInfo!.critDamageBonus,
                  duration: 2,  // Lasts 2 turns
                };

                if (existingBuffIndex >= 0) {
                  // Reset duration on existing buff
                  const updatedBuffs = [...char.activeBuffs];
                  updatedBuffs[existingBuffIndex] = newBuff;
                  return { ...char, activeBuffs: updatedBuffs };
                } else {
                  // Add new buff
                  return {
                    ...char,
                    activeBuffs: [...char.activeBuffs, newBuff],
                  };
                }
              }),
            },
          };
        });
      }
    }

    // Log the heal action
    const buffText = healContext.buffInfo
      ? ` (+${healContext.buffInfo.critChanceBonus}% crit, +${healContext.buffInfo.critDamageBonus} crit dmg for 2 turns)`
      : '';
    setBattleLog((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        characterId: healContext.healerId,
        characterName: healer.name,
        action: 'heal' as const,
        message: `${healer.name} heals ${target.name}: +${healAmount} HP${buffText}`,
        healing: healAmount,
        turn: targetTurn,
      },
    ]);

    // Close modal and clear context
    setHealModalOpen(false);
    setHealContext(null);
  };

  // Cancel Heal action
  const handleHealCancel = () => {
    setHealModalOpen(false);
    setHealContext(null);
  };

  // Handle Unbreakable Duty confirmation (Thoread)
  const handleUnbreakableDutyConfirm = (deadAlliesConfirmed: boolean) => {
    if (!unbreakableDutyContext || !battleState) return;

    const caster = battleState.team.find(c => c.id === unbreakableDutyContext.casterId);
    if (!caster) return;

    const targetTurn = activeTurn;

    // Mark ability as used (one-time per battle)
    markAbilityUsed(unbreakableDutyContext.casterId, 'UnbreakableDuty');

    if (deadAlliesConfirmed) {
      // Execute the ability to apply buff (UnbreakableDuty handler returns a buff)
      const abilityLog = executeAbility(unbreakableDutyContext.casterId, 'UnbreakableDuty');
      setBattleLog((prev) => [...prev, { ...abilityLog, turn: targetTurn }]);
    } else {
      // No buff applied - just log that ability was used
      setBattleLog((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          characterId: unbreakableDutyContext.casterId,
          characterName: caster.name,
          action: 'ability' as const,
          message: `${caster.name} used Unbreakable Duty - no dead Imperial allies`,
          turn: targetTurn,
        },
      ]);
    }

    // Close modal and clear context
    setUnbreakableDutyModalOpen(false);
    setUnbreakableDutyContext(null);
  };

  // Cancel Unbreakable Duty action
  const handleUnbreakableDutyCancel = () => {
    setUnbreakableDutyModalOpen(false);
    setUnbreakableDutyContext(null);
  };

  // Team setup mode
  if (!battleState) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-imperial-gold mb-2">
            Damage Calculator
          </h1>
          <p className="text-gray-400">
            Build your team of up to 5 characters and simulate a 6-turn Guild Raid battle
          </p>
        </div>

        {/* Team Slots */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-100">Your Team</h2>
            {team.length > 0 && (
              <div className="flex items-center gap-4">
                <button
                  onClick={clearAllEquipment}
                  className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <PackageX size={16} />
                  Remove Equip
                </button>
                <button
                  onClick={clearTeam}
                  className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={16} />
                  Clear All
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }, (_, i) => (
              <TeamSlot
                key={i}
                slotIndex={i}
                character={team[i]}
                onRemove={removeCharacter}
              />
            ))}
          </div>

          {/* Machine of War Selector */}
          <div className="mt-6">
            <MachineOfWarSelector
              selectedMachineId={selectedMachineOfWar?.machineId ?? null}
              selectedStars={selectedMachineOfWar?.stars ?? 14}
              onSelectMachine={setSelectedMachineOfWar}
              onUpdateStars={updateMachineOfWarStars}
              onClearMachine={clearMachineOfWar}
            />
          </div>

          {/* Boss Selector */}
          <div className="mt-4">
            <BossSelector
              selectedBossId={selectedBoss?.bossId ?? null}
              selectedRank={selectedBoss?.rank ?? (13 as BossRank)}
              applyModifiers={selectedBoss?.applyModifiers ?? true}
              onSelectBoss={setSelectedBoss}
              onUpdateRank={updateBossRank}
              onToggleModifiers={toggleBossModifiers}
              onClearBoss={clearBoss}
            />
          </div>
        </div>

        {/* Start Battle Button */}
        <div className="flex justify-center">
          <button
            onClick={handleStartBattle}
            disabled={team.length === 0}
            className={`flex items-center gap-2 px-8 py-4 rounded-lg font-bold text-lg transition-all ${
              team.length > 0
                ? 'btn-primary hover:scale-105'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Play size={24} />
            Start Battle Simulation
          </button>
        </div>

        {/* Info */}
        {team.length === 0 && (
          <div className="text-center">
            <p className="text-gray-500 mb-2">No characters selected</p>
            <Link to="/characters" className="text-imperial-gold hover:underline">
              Browse characters to add to your team →
            </Link>
          </div>
        )}
      </div>
    );
  }

  // Battle mode
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-imperial-gold">
            Battle Simulation
          </h1>
          <p className="text-gray-400 text-sm">
            {battleState.isComplete
              ? 'Battle Complete!'
              : `Turn ${battleState.turn} of ${battleState.maxTurns}`}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={battleState.ignoreCrit}
              onChange={(e) => setIgnoreCrit(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-imperial-gold focus:ring-imperial-gold focus:ring-offset-gray-800"
            />
            <span className="text-sm text-gray-300">Ignore Crit</span>
          </label>
          <button
            onClick={handleResetBattle}
            className="btn-secondary flex items-center gap-2"
          >
            <RotateCcw size={18} />
            Reset
          </button>
        </div>
      </div>

      {/* Damage Summary */}
      {!battleState.isComplete && (
        <DamageSummary battleState={battleState} />
      )}

      {/* Next Turn / Finish Battle Button */}
      {!battleState.isComplete && (
        <div className="flex justify-center">
          <button
            onClick={handleNextTurn}
            className="btn-primary flex items-center gap-2 px-6 py-3"
          >
            {isLastTurn ? 'Finish Battle' : `End Turn ${battleState.turn} →`}
          </button>
        </div>
      )}

      {/* Main Battle Area */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Characters - Column Layout */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-100">Characters</h2>
          <div className="space-y-2">
            {battleState.team.map((character) => {
              const effectiveCharacter = getEffectiveCharacter(character);
              return (
                <BattleCharacterCard
                  key={character.id}
                  character={effectiveCharacter}
                  team={battleState.team}
                  isSelected={selectedCharacterId === character.id}
                  currentTurn={battleState.turn}
                  activeAbilitiesUsedCount={battleState.activeAbilitiesUsedCount}
                  selectedMachineOfWar={selectedMachineOfWar}
                  custodedUsedAbilityThisTurn={battleState.custodedUsedAbilityThisTurn}
                  onSelect={() =>
                    setSelectedCharacterId(
                      selectedCharacterId === character.id ? null : character.id
                    )
                  }
                  onAction={(type) => handleAction(character.id, type)}
                  onUndo={() => handleUndoActions(character.id)}
                  onToggleAbility={(abilityId, counterValue) => toggleAbility(character.id, abilityId, counterValue)}
                  onExecuteBetrayer={() => handleExecuteBetrayer(character.id)}
                  onExecuteOverwatch={() => handleExecuteOverwatch(character.id)}
                  onExecuteFuryOfTheAncients={() => handleExecuteFuryOfTheAncients(character.id)}
                  onExecuteMartialSuperiority={() => handleExecuteMartialSuperiority(character.id)}
                  onExecuteHatefulAssault={() => handleExecuteHatefulAssault(character.id)}
                  onExecuteMartialApotheosis={() => handleExecuteMartialApotheosis(character.id)}
                  onExecuteLivingLightning={() => handleExecuteLivingLightning(character.id)}
                  onExecuteUnwaveringSentinel={() => handleExecuteUnwaveringSentinel(character.id)}
                  onOpenPossessionModal={() => { setPossessionCharacterId(character.id); setPossessionModalOpen(true); }}
                />
              );
            })}
          </div>

          {/* Summons Section - shown if there are active summons */}
          {battleState.summons.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-100 mt-4">Summons</h2>
              <div className="space-y-2">
                {battleState.summons.map((summon) => (
                  <SummonCard
                    key={summon.id}
                    summon={summon}
                    team={battleState.team}
                    selectedMachineOfWar={selectedMachineOfWar}
                    buffPool={battleState.buffPool}
                    currentTurn={battleState.turn}
                    onRemove={removeSummon}
                    onUpdateCount={updateSummonCount}
                    onToggleBuffCondition={toggleSummonBuffCondition}
                    onAttack={(summonId, attackType) => {
                      const logEntry = executeSummonAttack(summonId, attackType);
                      const targetTurn = editingTurn ?? battleState.turn;
                      setBattleLog((prev) => [...prev, { ...logEntry, turn: targetTurn }]);
                      return logEntry;
                    }}
                    hasActedThisTurn={battleLog.some(
                      entry => entry.characterId === summon.id && entry.turn === battleState.turn
                    )}
                    onUndo={() => handleUndoActions(summon.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right Column: Boss Card + Battle Log */}
        <div className="space-y-3">
          {/* Boss Card - shown if boss is selected */}
          {battleState.boss && (() => {
            // Only show Markerlight if team has T'au Empire characters or CyclicIonBlaster
            const hasMarkerlightRelevance = battleState.team.some(char =>
              char.faction === "T'au Empire" || char.faction === 'Tau' ||
              char.passiveAbilities.includes('CyclicIonBlaster')
            );

            // Only show On Hex with Fire if team has a character with PsychicStalk
            const hasPsychicStalkRelevance = battleState.team.some(char =>
              char.passiveAbilities.includes('PsychicStalk')
            );
            const hasPredictiveGuidanceRelevance = battleState.team.some(char =>
              char.passiveAbilities.includes('PredictiveGuidance')
            );
            const psychicStalkEffect = hasPsychicStalkRelevance
              ? `+${battleState.psychicStalkExtraDmgPct}% Flame/Psychic, +${battleState.psychicStalkExtraDmg} Chaos`
              : undefined;

            return (
              <>
                <h2 className="text-lg font-semibold text-gray-100">Enemy Boss</h2>
                <BattleBossCard
                  boss={battleState.boss}
                  totalDamageDealt={battleState.totalDamageDealt}
                  bossArmorReduction={battleState.bossArmorReduction}
                  bossHasMarkerlight={battleState.bossHasMarkerlight}
                  onMarkerlightChange={hasMarkerlightRelevance ? setBossMarkerlight : undefined}
                  bossOnHexWithFire={battleState.bossOnHexWithFire}
                  onHexWithFireChange={hasPsychicStalkRelevance ? setBossOnHexWithFire : undefined}
                  psychicStalkEffect={psychicStalkEffect}
                  bossMovedLastTurn={battleState.bossMovedLastTurn}
                  onBossMovedChange={hasPredictiveGuidanceRelevance ? setBossMovedLastTurn : undefined}
                  prophetOfGorkAndMork={battleState.prophetOfGorkAndMork}
                  bossAttacksReceivedThisTurn={battleState.bossAttacksReceivedThisTurn}
                  bossHasMasterAnnihilatorMark={battleState.bossHasMasterAnnihilatorMark}
                  masterAnnihilatorMaxDmg={battleState.masterAnnihilatorMaxDmg}
                />
              </>
            );
          })()}

          {/* Battle Log */}
          <h2 className="text-lg font-semibold text-gray-100">Battle Log</h2>
          <div className="card p-4">
            <BattleLog
              entries={battleLog}
              currentTurn={battleState.turn}
              editingTurn={editingTurn}
              isComplete={battleState.isComplete}
              team={battleState.team}
              onUndoCharacterTurn={handleUndoCharacterTurn}
              onEditTurn={setEditingTurn}
            />
          </div>
        </div>
      </div>

      {/* Battle Summary - shown when complete */}
      {battleState.isComplete && (
        <div ref={battleSummaryRef}>
          <BattleSummary
            team={battleState.team}
            totalDamage={battleState.totalDamageDealt}
            turnHistory={battleState.turnHistory}
            onReset={handleResetBattle}
            battleState={battleState}
            originalTeam={team}
            selectedBoss={selectedBoss}
            selectedMachine={selectedMachineOfWar}
          />
        </div>
      )}

      {/* Repair Target Modal (Actus's Mechanic trait) */}
      {repairContext && (
        <RepairTargetModal
          isOpen={repairModalOpen}
          onClose={handleRepairCancel}
          repairer={battleState.team.find(c => c.id === repairContext.repairerId)!}
          team={battleState.team}
          repairType={repairContext.repairType}
          repairAmount={repairContext.healAmount}
          onConfirm={handleRepairTargetConfirm}
        />
      )}

      {/* Attack Type Modal (Galvanic Field attack type choice) */}
      {repairContext && repairContext.pendingAttackChoiceTargets.length > 0 && (
        <AttackTypeModal
          isOpen={attackTypeModalOpen}
          onClose={handleRepairCancel}
          attacker={battleState.team.find(c => c.id === repairContext.pendingAttackChoiceTargets[0])!}
          onSelect={handleAttackTypeSelect}
        />
      )}

      {/* Inspired to Greatness Modal (Aun'Shi's ability) */}
      {inspiredToGreatnessContext && (
        <InspiredToGreatnessModal
          isOpen={inspiredToGreatnessModalOpen}
          onClose={handleInspiredToGreatnessCancel}
          caster={battleState.team.find(c => c.id === inspiredToGreatnessContext.casterId)!}
          team={battleState.team}
          hpToHeal={inspiredToGreatnessContext.hpToHeal}
          hpToHeal_2={inspiredToGreatnessContext.hpToHeal_2}
          onConfirm={handleInspiredToGreatnessConfirm}
        />
      )}

      {/* The Quickening Modal (Mephiston's ability) */}
      {theQuickeningContext && (
        <TheQuickeningModal
          isOpen={theQuickeningModalOpen}
          onClose={handleTheQuickeningCancel}
          caster={battleState.team.find(c => c.id === theQuickeningContext.casterId)!}
          team={battleState.team}
          dmgPct={theQuickeningContext.dmgPct}
          maxDmg={theQuickeningContext.maxDmg}
          onConfirm={handleTheQuickeningConfirm}
        />
      )}

      {/* Blood Chalice Modal (Nicodemus's ability) */}
      {bloodChaliceContext && (
        <BloodChaliceModal
          isOpen={bloodChaliceModalOpen}
          onClose={handleBloodChaliceCancel}
          caster={battleState.team.find(c => c.id === bloodChaliceContext.casterId)!}
          team={battleState.team}
          extraPierceRatio={bloodChaliceContext.extraPierceRatio}
          onConfirm={handleBloodChaliceConfirm}
        />
      )}

      {/* Dark Talon Strike Modal (Azrael's ability) */}
      {darkTalonStrikeContext && (
        <DarkTalonStrikeModal
          isOpen={darkTalonStrikeModalOpen}
          onClose={handleDarkTalonStrikeCancel}
          characterName={battleState.team.find(c => c.id === darkTalonStrikeContext.casterId)?.name || 'Azrael'}
          directDamageValues={darkTalonStrikeContext.directDamageValues}
          bolterValues={darkTalonStrikeContext.bolterValues}
          onSelect={handleDarkTalonStrikeSelect}
        />
      )}

      {/* Rites of Morkai Modal (Baldr's ability) */}
      {ritesOfMorkaiContext && (
        <RitesOfMorkaiModal
          isOpen={ritesOfMorkaiModalOpen}
          onClose={handleRitesOfMorkaiCancel}
          caster={battleState.team.find(c => c.id === ritesOfMorkaiContext.casterId)!}
          team={battleState.team}
          extraDmg={ritesOfMorkaiContext.extraDmg}
          onConfirm={handleRitesOfMorkaiConfirm}
        />
      )}

      {/* Heal Target Modal (Healer trait - Baldr's HealingBalms) */}
      {healContext && (
        <HealTargetModal
          isOpen={healModalOpen}
          onClose={handleHealCancel}
          healer={battleState.team.find(c => c.id === healContext.healerId)!}
          team={battleState.team}
          healAmount={healContext.healAmount}
          buffInfo={healContext.buffInfo}
          onConfirm={handleHealConfirm}
        />
      )}

      {/* Unbreakable Duty Modal (Thoread's ability) */}
      {unbreakableDutyContext && (
        <UnbreakableDutyModal
          isOpen={unbreakableDutyModalOpen}
          onClose={handleUnbreakableDutyCancel}
          characterName={battleState.team.find(c => c.id === unbreakableDutyContext.casterId)?.name || 'Thoread'}
          extraDmg={unbreakableDutyContext.extraDmg}
          onConfirm={handleUnbreakableDutyConfirm}
        />
      )}

      {/* Frenzied Firing Modal (Volk's active ability) */}
      {frenziedFiringContext && (
        <FrenziedFiringModal
          isOpen={frenziedFiringModalOpen}
          onClose={handleFrenziedFiringCancel}
          onConfirm={handleFrenziedFiringConfirm}
        />
      )}

      {/* Foul Infusion Modal (Pestillian's active ability) */}
      {foulInfusionContext && (
        <FoulInfusionModal
          isOpen={foulInfusionModalOpen}
          onClose={handleFoulInfusionCancel}
          caster={battleState.team.find(c => c.id === foulInfusionContext.casterId)!}
          team={battleState.team}
          dmg={foulInfusionContext.dmg}
          onConfirm={handleFoulInfusionConfirm}
        />
      )}

      {/* Sorcerous Facade Modal (Yazaghor's active ability) */}
      {sorcerousFacadeContext && (
        <SorcerousFacadeModal
          isOpen={sorcerousFacadeModalOpen}
          onClose={handleSorcerousFacadeCancel}
          caster={battleState.team.find(c => c.id === sorcerousFacadeContext.casterId)!}
          team={battleState.team}
          minDmg={sorcerousFacadeContext.minDmg}
          maxDmg={sorcerousFacadeContext.maxDmg}
          onConfirm={handleSorcerousFacadeConfirm}
        />
      )}

      {/* Possession Summon Modal (Archimatos's Possession passive) */}
      {possessionCharacterId && (
        <PossessionSummonModal
          isOpen={possessionModalOpen}
          onClose={() => { setPossessionModalOpen(false); setPossessionCharacterId(null); }}
          onSelect={(unitType) => {
            spawnPossessionSummon(possessionCharacterId, unitType);
            setPossessionModalOpen(false);
            setPossessionCharacterId(null);
          }}
        />
      )}
    </div>
  );
}
