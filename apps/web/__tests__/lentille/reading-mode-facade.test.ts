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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AMENDÉ PAR D-4 / R5-6 (2026-08-18) — IDENTITÉ ÉTABLIE, MIGRATION → PURGE
 * ═══════════════════════════════════════════════════════════════════════════
 * Ce fichier présumait une clé `meeshy:reading-mode:<conversationId>` SANS
 * préfixe d'identité (littéral aux lignes `STORAGE_KEY_PREFIX` ci-dessous, et
 * dans le `describe('migration one-shot...')`, qui vérifiait qu'une ancienne
 * clé était ADOPTÉE). C'est exactement l'ancrage de l'ancien monde que D-4
 * ferme : la clé porte désormais un `scopeId`, et l'ancienne forme
 * (n'importe laquelle) est PURGÉE, jamais adoptée (fuite multi-comptes,
 * `tasks/lentille-cloture-phase1.md` D-4). Amendé ici plutôt que laissé
 * rouge : voir `reading-mode-identity-scope.test.ts` pour le témoin R5-6
 * dédié (deux identités, une conversation, un navigateur).
 */
import { renderHook, act } from '@testing-library/react';
import { AUTH_STORAGE_KEYS } from '../../constants/auth';

// D-4 / R5-6 — ce fichier établit une identité INSCRITE (voir
// `setRegisteredIdentity` plus bas) pour exercer la persistance scopée, ce
// qui déclenche AUSSI l'écriture réseau best-effort de `setReadingMode`
// (`writeReadingModePreferenceToServer`, G-121). Mockée ici : ce fichier
// teste la FAÇADE et la persistance locale, pas le réseau (qui a sa propre
// suite, `stores/__tests__/reading-mode-identity-scope.test.ts`).
jest.mock('../../services/reading-mode-sync.service', () => ({
  writeReadingModePreferenceToServer: jest.fn().mockResolvedValue(undefined),
  fetchServerReadingModePreference: jest.fn().mockResolvedValue(null),
}));
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
const REGISTERED_USER_ID = 'user-facade-A';
const SCOPED_STORAGE_KEY_A = `${STORAGE_KEY_PREFIX}u-${REGISTERED_USER_ID}:${CONVERSATION_A}`;

/**
 * D-4 : la persistance exige désormais une identité résolvable
 * (`resolveReadingModeIdentityScope`). Un compte INSCRIT suffit à faire
 * fonctionner tout ce que ce fichier vérifiait déjà avant D-4 — c'est le
 * MÊME comportement observable, sous une clé désormais scopée.
 */
function setRegisteredIdentity(): void {
  window.localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, 'fake-jwt-for-tests');
  window.localStorage.setItem(
    AUTH_STORAGE_KEYS.USER_DATA,
    JSON.stringify({ id: REGISTERED_USER_ID })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useReadingModePreferenceStore.getState().reset();
  setRegisteredIdentity();
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

  it('la façade N’A PLUS de persistance propre — la clé zustand historique n’est plus jamais écrite ; la clé du contrat est désormais SCOPÉE par identité (D-4)', () => {
    act(() => {
      useReadingModeStore.getState().setMode(CONVERSATION_A, 'bubble');
    });

    expect(window.localStorage.getItem(LEGACY_READING_MODE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SCOPED_STORAGE_KEY_A)).toBe('bulles');
    // Et JAMAIS sous l'ancienne forme non scopée — la fuite que D-4 ferme.
    expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${CONVERSATION_A}`)).toBeNull();
  });

  it('`useReadingMode` se ré-abonne au magasin autoritatif (un changement du menu re-rend le fil)', async () => {
    const { result } = renderHook(() => useReadingMode(CONVERSATION_A));
    // Décision produit 2026-08-20 : sans préférence, le défaut est Bulles.
    expect(result.current).toBe('bubble');

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
  // Décision produit 2026-08-20 : « Il faut que le mode bulle soit le mode
  // par défaut ! » — le défaut ambiant (préférence `auto`) est désormais
  // Bulles, plus Focal.
  it('défaut `bubble` tant que rien n’est mémorisé (préférence `auto`)', () => {
    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('bubble');
  });

  it('le choix reste COLLANT et isolé par conversation', () => {
    act(() => {
      useReadingModeStore.getState().setMode(CONVERSATION_A, 'script');
    });

    expect(useReadingModeStore.getState().getMode(CONVERSATION_A)).toBe('script');
    expect(useReadingModeStore.getState().getMode(CONVERSATION_B)).toBe('bubble');
  });

  // Départ EXPLICITE en Focal (voir `stores/__tests__/reading-mode-store.test.ts`
  // pour le même ajustement) : le défaut ambiant est désormais Bulles, et
  // `nextDensity('bubble')` rentre par Focal — fixer le point de départ rend
  // ce témoin indépendant de ce que vaut le défaut.
  it('`Aa` bascule Focal ↔ Script', () => {
    act(() => {
      useReadingModeStore.getState().setMode(CONVERSATION_A, 'focal');
    });

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

  // MIS À JOUR EXPRÈS — décision produit 2026-08-20 : le défaut du chemin
  // OFF passe de `focal` à `bubble` (`DEFAULT_READING_MODE`,
  // `lib/conversations/reading-mode.ts`).
  it('`auto` (rien de choisi) rend `bubble` — le nouveau défaut du chemin OFF (2026-08-20)', () => {
    expect(readingModeFromPreference('auto')).toBe('bubble');
  });

  it("les préférences que `MessagesDisplay` ne sait pas rendre retombent sur `focal`, jamais sur `bubble`", () => {
    expect(readingModeFromPreference('resume')).toBe('focal');
    expect(readingModeFromPreference('riviere')).toBe('focal');
  });
});

// ---------------------------------------------------------------------------
// TÉMOIN (c), AMENDÉ PAR D-4 — PURGE ONE-SHOT, JAMAIS ADOPTION
// ---------------------------------------------------------------------------
//
// AVANT D-4 : une ancienne clé était ADOPTÉE dans le magasin autoritatif —
// défendable tant que ce magasin lui-même n'était pas scopé (les deux étaient
// « d'appareil », rien n'aggravait rien). D-4 scope le magasin de
// destination ; adopter reviendrait alors à attribuer à UNE identité un choix
// qu'un AUTRE compte du même navigateur a pu faire. La politique change :
// SUPPRESSION, jamais adoption (`tasks/lentille-cloture-phase1.md` D-4,
// §"MIGRATION — LA SÉCURITÉ PRIME SUR LA CONTINUITÉ").
//
// Deux formes d'ancienne clé sont purgées : l'antique `meeshy-reading-mode`
// (zustand/persist, pré-REV-4bis) ET la clé DE CE MAGASIN d'avant D-4
// (`meeshy:reading-mode:<conversationId>`, non scopée). Aucune des deux
// n'est jamais lue pour son contenu — la purge ne les PARSE même pas.

describe('purge one-shot des clés non scopées (D-4 / R5-6)', () => {
  const writeLegacyV1 = (modes: Record<string, string>) => {
    window.localStorage.setItem(
      LEGACY_READING_MODE_STORAGE_KEY,
      JSON.stringify({ state: { modes }, version: 1 })
    );
  };

  const writePreD4UnscopedKey = (conversationId: string, rawValue: string) => {
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${conversationId}`, rawValue);
  };

  it("l'antique clé zustand/persist (`meeshy-reading-mode`) est SUPPRIMÉE, jamais adoptée", () => {
    writeLegacyV1({ [CONVERSATION_A]: 'script', [CONVERSATION_B]: 'bubble' });

    runLegacyReadingModeMigration();

    expect(window.localStorage.getItem(LEGACY_READING_MODE_STORAGE_KEY)).toBeNull();
    // Ni adoptée pour l'identité qui a déclenché la purge...
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('auto');
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_B)).toBe('auto');
    // ...ni fabriquée dans les entrées en mémoire d'aucune façon.
    expect(useReadingModePreferenceStore.getState().entries.size).toBe(0);
  });

  it("la clé PRÉ-D4 de CE magasin (`meeshy:reading-mode:<conversationId>`, sans scope) est SUPPRIMÉE, jamais adoptée", () => {
    writePreD4UnscopedKey(CONVERSATION_A, 'script');

    runLegacyReadingModeMigration();

    expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${CONVERSATION_A}`)).toBeNull();
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('auto');
  });

  it('une clé DÉJÀ SCOPÉE (post-D4, un autre compte de ce navigateur) survit à la purge — elle ne lui appartient pas', () => {
    const otherAccountKey = `${STORAGE_KEY_PREFIX}u-someone-else:${CONVERSATION_A}`;
    window.localStorage.setItem(otherAccountKey, 'script');

    runLegacyReadingModeMigration();

    expect(window.localStorage.getItem(otherAccountKey)).toBe('script');
  });

  it('pose le marqueur de purge — une réécriture n’est jamais fabriquée sans lui', () => {
    runLegacyReadingModeMigration();
    expect(window.localStorage.getItem(READING_MODE_MIGRATION_MARKER_KEY)).not.toBeNull();
  });

  it('ONE-SHOT : une seconde exécution ne retente rien — une clé réapparue reste (idempotence par marqueur)', () => {
    writePreD4UnscopedKey(CONVERSATION_A, 'script');
    runLegacyReadingModeMigration();
    expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${CONVERSATION_A}`)).toBeNull();

    // Un autre onglet, resté ouvert sur l'ancien code, ré-écrit la clé morte.
    writePreD4UnscopedKey(CONVERSATION_A, 'bubble');
    runLegacyReadingModeMigration();

    // Le marqueur bloque la seconde passe : la clé réapparue n'est PAS
    // re-purgée cette fois-ci (comportement documenté, cf. docstring de
    // `runLegacyReadingModeMigration`) — mais elle n'est pas non plus lue.
    expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${CONVERSATION_A}`)).toBe('bubble');
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('auto');
  });

  it("n'ÉCRASE JAMAIS une valeur déjà présente dans le magasin autoritatif — la purge n'en pose de toute façon aucune", async () => {
    await act(async () => {
      await useReadingModePreferenceStore
        .getState()
        .setReadingMode(CONVERSATION_A, 'resume');
    });
    writeLegacyV1({ [CONVERSATION_A]: 'bubble' });
    writePreD4UnscopedKey(CONVERSATION_B, 'script');

    runLegacyReadingModeMigration();

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('resume');
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_B)).toBe('auto');
  });

  it('un contenu illisible (JSON cassé) dans l’antique clé ne fait PAS lever la purge — elle ne le parse même pas', () => {
    window.localStorage.setItem(LEGACY_READING_MODE_STORAGE_KEY, '{ pas du json');

    expect(() => runLegacyReadingModeMigration()).not.toThrow();

    expect(useReadingModePreferenceStore.getState().entries.size).toBe(0);
    expect(window.localStorage.getItem(LEGACY_READING_MODE_STORAGE_KEY)).toBeNull();
  });

  it('aucune ancienne clé ⇒ rien à supprimer, rien de fabriqué (le cas du nouvel appareil)', () => {
    runLegacyReadingModeMigration();

    expect(useReadingModePreferenceStore.getState().entries.size).toBe(0);
  });
});
