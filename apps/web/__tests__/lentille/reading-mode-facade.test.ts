/**
 * `reading-mode-store` EST une façade — REV-4bis/B2, témoins (b) et (c).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CE FICHIER FERME
 * ═══════════════════════════════════════════════════════════════════════════
 * Avant ce lot, DEUX magasins mémorisaient « le mode de lecture de cette
 * conversation », chacun avec son vocabulaire, ses écrivains et sa clé :
 *
 *   | | `reading-mode-preference-store` (contrat WL-106) | `reading-mode-store` |
 *   |—|—|—|
 *   | mots      | `auto/focal/script/resume/riviere`  | `focal/script/bubble` |
 *   | écrit par | les 3 chemins du menu Lentille      | `LensSwitcher` + `Aa` |
 *   | lu par    | le menu Lentille SEULEMENT          | `ConversationView`    |
 *   | clé       | `meeshy:reading-mode:<conv>`        | `meeshy-reading-mode` |
 *
 * Conséquence : choisir un mode dans la liste Lentille ne changeait RIEN au
 * rendu du fil. Une écriture morte.
 *
 * L'arbitrage rendu est la FAÇADE : le magasin du contrat devient l'unique
 * autorité (versionné, prêt pour le canal serveur), et `reading-mode-store`
 * garde son API publique — `useReadingMode`, `setMode`, `toggleDensity` — mais
 * délègue TOUTE lecture et TOUTE écriture au magasin du contrat.
 *
 * C'est l'exact miroir de ce que REV-3/B2 a fait côté iOS
 * (`ModePreferenceRoundTripTests` §4-6 : « écrit par le centre Lentille, relu
 * par le magasin Focal — c'est la définition de "un seul magasin" »). Ce
 * fichier prend le même témoin par l'autre bout.
 */
import { renderHook, act } from '@testing-library/react';
import {
  useReadingModeStore,
  useReadingMode,
} from '../../stores/reading-mode-store';
import {
  useReadingModePreferenceStore,
  LEGACY_READING_MODE_STORAGE_KEY,
  READING_MODE_MIGRATION_MARKER_KEY,
  runLegacyReadingModeMigration,
} from '../../stores/reading-mode-preference-store';
import {
  preferenceFromReadingMode,
  readingModeFromPreference,
} from '../../lib/conversations/reading-mode';

const CONVERSATION_A = '507f1f77bcf86cd799439021';
const CONVERSATION_B = '507f1f77bcf86cd799439022';

const STORAGE_KEY_PREFIX = 'meeshy:reading-mode:';

beforeEach(() => {
  window.localStorage.clear();
  useReadingModePreferenceStore.getState().reset();
});

// ---------------------------------------------------------------------------
// TÉMOIN (b) — LensSwitcher et le menu Lentille écrivent LE MÊME magasin
// ---------------------------------------------------------------------------

describe('façade — un seul magasin autoritatif', () => {
  it("une écriture LensSwitcher (`setMode`) atterrit dans le magasin du CONTRAT, pas dans un second", () => {
    act(() => {
      useReadingModeStore.getState().setMode(CONVERSATION_A, 'script');
    });

    expect(
      useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)
    ).toBe('script');
  });

  it("une écriture du menu Lentille (`setReadingMode`) est LUE par la façade — le sens inverse compte autant", async () => {
    await act(async () => {
      await useReadingModePreferenceStore
        .getState()
        .setReadingMode(CONVERSATION_A, 'script');
    });

    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('script');
  });

  it("le menu Lentille écrit `riviere` : la façade le rend `focal` — le rendu à bulles ne sait pas dessiner la Rivière", async () => {
    await act(async () => {
      await useReadingModePreferenceStore
        .getState()
        .setReadingMode(CONVERSATION_A, 'riviere');
    });

    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('focal');
  });

  it('la façade N’A PLUS de persistance propre — la clé zustand historique n’est plus jamais écrite', () => {
    act(() => {
      useReadingModeStore.getState().setMode(CONVERSATION_A, 'bubble');
    });

    expect(window.localStorage.getItem(LEGACY_READING_MODE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${CONVERSATION_A}`)).toBe(
      'bulles'
    );
  });

  it('`useReadingMode` se ré-abonne au magasin autoritatif (un changement du menu re-rend le fil)', async () => {
    const { result } = renderHook(() => useReadingMode(CONVERSATION_A));
    expect(result.current).toBe('focal');

    await act(async () => {
      await useReadingModePreferenceStore
        .getState()
        .setReadingMode(CONVERSATION_A, 'script');
    });

    expect(result.current).toBe('script');
  });
});

// ---------------------------------------------------------------------------
// L'API publique de la façade est PRÉSERVÉE — bit-à-bit sur le chemin OFF
// ---------------------------------------------------------------------------

describe('façade — le contrat public de `reading-mode-store` ne bouge pas', () => {
  it('défaut `focal` tant que rien n’est mémorisé (préférence `auto`)', () => {
    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('focal');
  });

  it('le choix reste COLLANT et isolé par conversation', () => {
    act(() => {
      useReadingModeStore.getState().setMode(CONVERSATION_A, 'script');
    });

    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('script');
    expect(useReadingModeStore.getState().getMode(CONVERSATION_B)).toBe('focal');
  });

  it('`Aa` bascule Focal ↔ Script', () => {
    act(() => {
      useReadingModeStore.getState().toggleDensity(CONVERSATION_A);
    });
    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('script');

    act(() => {
      useReadingModeStore.getState().toggleDensity(CONVERSATION_A);
    });
    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('focal');
  });

  it('`Aa` ramène la vue à bulles héritée dans les densités plates', () => {
    act(() => {
      useReadingModeStore.getState().setMode(CONVERSATION_A, 'bubble');
    });
    act(() => {
      useReadingModeStore.getState().toggleDensity(CONVERSATION_A);
    });

    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('focal');
  });

  it('les trois lentilles du sélecteur historique font toutes un ALLER-RETOUR — `bubble` compris (amendement S1)', () => {
    (['focal', 'script', 'bubble'] as const).forEach((mode) => {
      act(() => {
        useReadingModeStore.getState().setMode(CONVERSATION_A, mode);
      });
      expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe(mode);
    });
  });
});

// ---------------------------------------------------------------------------
// La traduction préférence ⇄ lentille locale
// ---------------------------------------------------------------------------

describe('traduction préférence ⇄ lentille du rendu historique', () => {
  it('les trois lentilles du sélecteur ont une image EXACTE dans le vocabulaire de préférence', () => {
    expect(preferenceFromReadingMode('focal')).toBe('focal');
    expect(preferenceFromReadingMode('script')).toBe('script');
    expect(preferenceFromReadingMode('bubble')).toBe('bulles');
  });

  it('`auto` (rien de choisi) rend `focal` — le défaut du chemin OFF, inchangé', () => {
    expect(readingModeFromPreference('auto')).toBe('focal');
  });

  it("les préférences que `MessagesDisplay` ne sait pas rendre retombent sur `focal`, jamais sur `bubble`", () => {
    expect(readingModeFromPreference('resume')).toBe('focal');
    expect(readingModeFromPreference('riviere')).toBe('focal');
  });
});

// ---------------------------------------------------------------------------
// TÉMOIN (c) — MIGRATION ONE-SHOT de l'ancienne clé
// ---------------------------------------------------------------------------

describe('migration one-shot de `meeshy-reading-mode`', () => {
  const writeLegacy = (modes: Record<string, string>) => {
    window.localStorage.setItem(
      LEGACY_READING_MODE_STORAGE_KEY,
      JSON.stringify({ state: { modes }, version: 1 })
    );
  };

  it('reprend les choix déjà écrits — le lecteur ne perd pas ses modes', () => {
    writeLegacy({ [CONVERSATION_A]: 'script', [CONVERSATION_B]: 'bubble' });

    runLegacyReadingModeMigration();

    expect(
      useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)
    ).toBe('script');
    expect(
      useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_B)
    ).toBe('bulles');
  });

  it('les valeurs reprises sont PERSISTÉES dans le magasin autoritatif, pas seulement en mémoire', () => {
    writeLegacy({ [CONVERSATION_A]: 'script' });

    runLegacyReadingModeMigration();

    expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${CONVERSATION_A}`)).toBe(
      'script'
    );
  });

  it("neutralise l'ancienne clé — elle ne peut plus être relue par personne", () => {
    writeLegacy({ [CONVERSATION_A]: 'script' });

    runLegacyReadingModeMigration();

    expect(window.localStorage.getItem(LEGACY_READING_MODE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(READING_MODE_MIGRATION_MARKER_KEY)).not.toBeNull();
  });

  it('ONE-SHOT : une seconde exécution ne réécrit rien, même si une ancienne clé réapparaît', () => {
    writeLegacy({ [CONVERSATION_A]: 'script' });
    runLegacyReadingModeMigration();

    // Un autre onglet, resté ouvert sur l'ancien code, ré-hydrate sa clé.
    writeLegacy({ [CONVERSATION_A]: 'bubble' });
    runLegacyReadingModeMigration();

    expect(
      useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)
    ).toBe('script');
  });

  it("n'ÉCRASE JAMAIS une valeur déjà présente dans le magasin autoritatif — le contrat gagne sur l'héritage", async () => {
    await act(async () => {
      await useReadingModePreferenceStore
        .getState()
        .setReadingMode(CONVERSATION_A, 'resume');
    });
    writeLegacy({ [CONVERSATION_A]: 'bubble', [CONVERSATION_B]: 'script' });

    runLegacyReadingModeMigration();

    expect(
      useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)
    ).toBe('resume');
    expect(
      useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_B)
    ).toBe('script');
  });

  it('une ancienne clé illisible (JSON cassé, forme inattendue) est NEUTRALISÉE sans rien fabriquer', () => {
    window.localStorage.setItem(LEGACY_READING_MODE_STORAGE_KEY, '{ pas du json');

    expect(() => runLegacyReadingModeMigration()).not.toThrow();

    expect(useReadingModePreferenceStore.getState().entries.size).toBe(0);
    expect(window.localStorage.getItem(LEGACY_READING_MODE_STORAGE_KEY)).toBeNull();
  });

  it("une lentille hors énumération n'est jamais devinée — l'entrée est SAUTÉE, pas repliée sur un défaut", () => {
    writeLegacy({ [CONVERSATION_A]: 'scene', [CONVERSATION_B]: 'script' });

    runLegacyReadingModeMigration();

    expect(useReadingModePreferenceStore.getState().entries.has(CONVERSATION_A)).toBe(
      false
    );
    expect(
      useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_B)
    ).toBe('script');
  });

  it('aucune ancienne clé ⇒ aucune entrée fabriquée (le cas du nouvel appareil)', () => {
    runLegacyReadingModeMigration();

    expect(useReadingModePreferenceStore.getState().entries.size).toBe(0);
  });
});
