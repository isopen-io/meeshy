/**
 * Q142-c (2026-08-18, TRANCHÉE) — LES AFFORDANCES DISENT LE DÉFAUT « BULLES »
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CE FICHIER FERME
 * ═══════════════════════════════════════════════════════════════════════════
 * `reading-mode-default-bubbles.test.tsx` prouve ce que le fil RENDVAIT
 * après le 2026-08-17 : sans choix explicite, drapeau ON, les bulles. Il ne
 * prouve RIEN sur ce que les AFFORDANCES *annoncent* — `LensSwitcher`
 * (`ConversationView.tsx`) et l'encoche de la focus card (`LentilleFocusCard`
 * / `notchText`) continuaient de marquer « Focal » actif, une préférence
 * traduite bit-à-bit sans jamais consulter le rendu réel. Q-142 nomme ce
 * défaut dans ses propres mots : « l'écran fait une chose, les affordances
 * en annoncent une autre ».
 *
 * Deux points de décision, une seule preuve chacun :
 *   (a) `useThreadActiveReadingMode` (`use-thread-reading-mode.ts`) — ce que
 *       `LensSwitcher` doit marquer actif ;
 *   (b) `notchText` (`lentille-mode-labels.ts`) — ce que l'encoche de la
 *       focus card doit afficher.
 *
 * Et le garde-fou que les deux doivent tenir : un choix EXPLICITE garde son
 * pouvoir, drapeau ON ou pas — sinon la correction du défaut aurait pris la
 * liberté du lecteur avec elle.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import type { OrchestratorDecision } from '@meeshy/shared/utils/reading-modes';
import type { LentilleRowTranslate } from '@/components/conversations/lentille/LentilleRow';

Element.prototype.scrollTo = jest.fn();

let mockReadingModesFlagActive = false;
jest.mock('@/hooks/lentille/use-reading-modes-flag', () => ({
  useReadingModesFlag: () => ({ active: mockReadingModesFlagActive }),
}));

import { useThreadActiveReadingMode } from '@/hooks/lentille/use-thread-reading-mode';
import { notchText } from '@/components/conversations/lentille/lentille-mode-labels';
import { useReadingModePreferenceStore } from '@/stores/reading-mode-preference-store';

const CONVERSATION_ID = 'conv-q142c';

beforeEach(() => {
  mockReadingModesFlagActive = false;
  window.localStorage.clear();
  useReadingModePreferenceStore.getState().reset();
});

// ---------------------------------------------------------------------------
// (a) `useThreadActiveReadingMode` — ce que `LensSwitcher` doit marquer actif
// ---------------------------------------------------------------------------

describe('useThreadActiveReadingMode — Q142-c, ce que LensSwitcher marque actif', () => {
  it('RED de la directive : lecteur SANS préférence, drapeau ON ⇒ « bubble » (pas « focal »)', () => {
    mockReadingModesFlagActive = true;

    const { result } = renderHook(() => useThreadActiveReadingMode(CONVERSATION_ID));

    expect(result.current).toBe('bubble');
  });

  it('non-régression : préférence EXPLICITE `focal`, drapeau ON ⇒ « focal »', async () => {
    mockReadingModesFlagActive = true;
    await act(async () => {
      await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_ID, 'focal');
    });

    const { result } = renderHook(() => useThreadActiveReadingMode(CONVERSATION_ID));

    expect(result.current).toBe('focal');
  });

  it('non-régression : préférence EXPLICITE `bulles`, drapeau ON ⇒ « bubble » (R6-4, toujours vivant)', async () => {
    mockReadingModesFlagActive = true;
    await act(async () => {
      await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_ID, 'bulles');
    });

    const { result } = renderHook(() => useThreadActiveReadingMode(CONVERSATION_ID));

    expect(result.current).toBe('bubble');
  });

  it('drapeau ÉTEINT : sans préférence ⇒ « focal », bit-à-bit comme avant (le défaut provisoire ne s’applique QUE drapeau ON)', () => {
    mockReadingModesFlagActive = false;

    const { result } = renderHook(() => useThreadActiveReadingMode(CONVERSATION_ID));

    expect(result.current).toBe('focal');
  });

  it('drapeau ÉTEINT, préférence explicite `script` ⇒ « script », traduction bit-à-bit inchangée', async () => {
    mockReadingModesFlagActive = false;
    await act(async () => {
      await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_ID, 'script');
    });

    const { result } = renderHook(() => useThreadActiveReadingMode(CONVERSATION_ID));

    expect(result.current).toBe('script');
  });
});

// ---------------------------------------------------------------------------
// (b) `notchText` — ce que l'encoche de la focus card doit afficher
// ---------------------------------------------------------------------------

const FR: Readonly<Record<string, string>> = {
  'lentille.modes.auto': 'Auto',
  'lentille.modes.focal': 'Focal',
  'lentille.modes.script': 'Script',
  'lentille.modes.resume': 'Résumé',
  'lentille.modes.riviere': 'Rivière',
  'lentille.modes.bubbles': 'Bulles',
  'lentille.modes.autoBadge': 'AUTO · {decision}',
};

const t: LentilleRowTranslate = ((key: string, params?: Record<string, unknown> | string) => {
  const template = FR[key] ?? key;
  if (!params || typeof params === 'string') return template;
  return Object.entries(params).reduce<string>(
    (acc, [name, value]) => acc.replace(`{${name}}`, String(value)),
    template
  );
}) as LentilleRowTranslate;

const AUTO_DECISION: OrchestratorDecision = { mode: 'focal', reason: 'default' };

describe('notchText — Q142-c, ce que l’encoche de la focus card affiche', () => {
  it('RED de la directive : préférence `auto` + drapeau `reading_modes` ON ⇒ « AUTO · Bulles »', () => {
    expect(notchText(AUTO_DECISION, 'auto', t, undefined, true)).toBe('AUTO · Bulles');
  });

  it('non-régression : préférence EXPLICITE `focal` ⇒ « Focal », drapeau ON ou pas', () => {
    expect(notchText(AUTO_DECISION, 'focal', t, undefined, true)).toBe('Focal');
    expect(notchText(AUTO_DECISION, 'focal', t, undefined, false)).toBe('Focal');
  });

  it('non-régression stricte : `isReadingModesFlagActive` OMIS (défaut `false`) ⇒ comportement R6-5 inchangé', () => {
    // Aucun appelant existant ne fournit ce 5e argument : le défaut doit
    // laisser `suggestedMode`/`decision.mode` gouverner comme avant Q142-c.
    expect(notchText(AUTO_DECISION, 'auto', t)).toBe('AUTO · Focal');
    expect(
      notchText({ mode: 'summary', reason: 'unread-over-cap' }, 'auto', t)
    ).toBe('AUTO · Résumé');
  });

  it('drapeau ON prime même sur `suggestedMode` (R6-5) : ouvrir rend Bulles quoi que le pont ait prédit', () => {
    const bridgeResume: ConversationBridge['suggestedMode'] = 'resume';
    expect(notchText(AUTO_DECISION, 'auto', t, bridgeResume, true)).toBe('AUTO · Bulles');
  });
});
