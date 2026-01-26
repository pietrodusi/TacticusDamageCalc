/**
 * ShareBattleModal - Modal for sharing battle simulation results
 * Allows adding notes and generates shareable URL
 */

import { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, Share2, AlertCircle, Link as LinkIcon } from 'lucide-react';
import type { BattleState } from '../../types/battle';
import type { TeamMember } from '../../types/character';
import type { SelectedBoss } from '../../types/boss';
import type { SelectedMachineOfWar } from '../../types/machineOfWar';
import { encodeBattleState, generateShareUrl } from '../../services/sharing';

const MAX_NOTES_LENGTH = 500;

interface ShareBattleModalProps {
  isOpen: boolean;
  onClose: () => void;
  battleState: BattleState;
  team: TeamMember[];
  selectedBoss: SelectedBoss | null;
  selectedMachine: SelectedMachineOfWar | null;
}

export function ShareBattleModal({
  isOpen,
  onClose,
  battleState,
  team,
  selectedBoss,
  selectedMachine,
}: ShareBattleModalProps) {
  const [notes, setNotes] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Generate URL when notes change
  useEffect(() => {
    if (!isOpen) return;

    try {
      const encoded = encodeBattleState(
        battleState,
        team,
        selectedBoss,
        selectedMachine,
        notes
      );
      const url = generateShareUrl(encoded);
      setShareUrl(url);
      setError(null);

      // Check URL length
      if (url.length > 4000) {
        setError(`URL is ${url.length} characters. Some browsers may have issues with URLs over 4000 characters.`);
      }
    } catch (err) {
      console.error('Error generating share URL:', err);
      setError('Failed to generate share URL');
      setShareUrl('');
    }
  }, [isOpen, battleState, team, selectedBoss, selectedMachine, notes]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setNotes('');
      setCopied(false);
      setError(null);
    }
  }, [isOpen]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_NOTES_LENGTH) {
      setNotes(value);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Share2 size={20} className="text-imperial-gold" />
            <h2 className="text-lg font-semibold text-gray-100">Share Battle Results</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700 transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Battle Summary */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Total Damage</span>
              <span className="font-bold text-imperial-gold">
                {battleState.totalDamageDealt.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-gray-400">Team Size</span>
              <span className="text-gray-200">{team.length} characters</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-gray-400">Turns</span>
              <span className="text-gray-200">{battleState.turnHistory.length}</span>
            </div>
          </div>

          {/* Notes Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="share-notes" className="text-sm font-medium text-gray-300">
                Strategy Notes (optional)
              </label>
              <span className={`text-xs ${notes.length >= MAX_NOTES_LENGTH ? 'text-red-400' : 'text-gray-500'}`}>
                {notes.length}/{MAX_NOTES_LENGTH}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              id="share-notes"
              value={notes}
              onChange={handleNotesChange}
              placeholder="Add notes about your strategy, key decisions, or anything you want to share..."
              className="w-full h-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-imperial-gold/50 focus:border-imperial-gold resize-none"
            />
          </div>

          {/* Generated URL */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <LinkIcon size={14} className="text-gray-400" />
              <label className="text-sm font-medium text-gray-300">
                Shareable Link
              </label>
            </div>
            <div className="relative">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="w-full px-3 py-2 pr-20 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 text-xs font-mono truncate focus:outline-none"
              />
              <button
                onClick={handleCopy}
                disabled={!shareUrl}
                className={`absolute right-1 top-1 bottom-1 px-3 rounded flex items-center gap-1.5 text-sm font-medium transition-colors ${
                  copied
                    ? 'bg-green-600 text-white'
                    : 'bg-imperial-gold hover:bg-imperial-gold/80 text-gray-900'
                }`}
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copy
                  </>
                )}
              </button>
            </div>
            {shareUrl && (
              <p className="text-xs text-gray-500 mt-1">
                URL length: {shareUrl.length} characters
              </p>
            )}
          </div>

          {/* Warning/Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
              <AlertCircle size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCopy}
              disabled={!shareUrl}
              className="btn-primary flex items-center gap-2"
            >
              <Copy size={16} />
              Copy Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
