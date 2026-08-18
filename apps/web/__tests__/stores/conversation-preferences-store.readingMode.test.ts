/**
 * WL-107 (LWS-11) — écriture optimiste versionnée de la préférence de mode
 * de lecture : rollback sur échec, version inférieure ignorée.
 *
 * NOM DE FICHIER — fidèle au contrat (`tasks/lentille-implementation-
 * contract.md` §LWS-11, « Fichiers de test » :
 * `conversation-preferences-store.readingMode.test.ts`) — MAIS ce fichier
 * teste `apps/web/stores/reading-mode-preference-store.ts`, PAS
 * `conversation-preferences-store.ts`. Le contrat liste aussi ce dernier
 * sous §1.4 « Fichiers existants LUS mais jamais modifiés » (« Réutilisés
 * VERBATIM. Toute envie de les "améliorer au passage" est hors contrat. »).
 * Tension documentée plutôt que tranchée en silence (règle RE-PROUVER,
 * workshop §0) : voir la docstring de tête de
 * `reading-mode-preference-store.ts` pour le raisonnement complet. Le nom de
 * CE fichier reste celui du contrat pour que la recherche
 * `conversation-preferences-store.readingMode` retrouve la bonne suite.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AMENDÉ PAR D-4 / R5-6 (2026-08-18) — LES CLÉS D'ENTRÉE SONT SCOPÉES
 * ═══════════════════════════════════════════════════════════════════════════
 * Ce fichier lisait `entries.get('conv-b')` — la clé NUE, sans identité.
 * Depuis D-4, la clé d'entrée en mémoire est `<scopeId>:<conversationId>`
 * (`scopedEntryKey`, `reading-mode-preference-store.ts`) : c'est exactement
 * l'ancrage de l'ancien monde que R5-6 ferme (voir
 * `stores/__tests__/reading-mode-identity-scope.test.ts` pour le témoin
 * dédié). Ce fichier établit désormais une identité INSCRITE fixe
 * (`REGISTERED_USER_ID`) pour que persistance et rollback restent
 * exerçables — sans identité, `setReadingMode` réussit toujours EN MÉMOIRE
 * (repli documenté), mais n'écrit plus jamais `localStorage`, ce qui aurait
 * rendu les témoins de rollback ci-dessous vides de sens (rien à faire
 * échouer). `entryKey(...)` reproduit le calcul de clé pour les seules
 * assertions qui lisent `entries` directement ; toutes les autres
 * assertions passent par l'API publique (`getReadingMode`), inchangée.
 */
import { act, renderHook } from '@testing-library/react';
import { AUTH_STORAGE_KEYS } from '../../constants/auth';
import {
  useReadingModePreferenceStore,
  useReadingModePreference,
  useReadingModePreferenceActions,
} from '../../stores/reading-mode-preference-store';

jest.mock('../../services/reading-mode-sync.service', () => ({
  writeReadingModePreferenceToServer: jest.fn().mockResolvedValue(undefined),
  fetchServerReadingModePreference: jest.fn().mockResolvedValue(null),
}));

const REGISTERED_USER_ID = 'user-wl107';
const entryKey = (conversationId: string): string => `u-${REGISTERED_USER_ID}:${conversationId}`;

describe('reading-mode-preference-store — écriture optimiste versionnée (WL-106/LWS-11)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    act(() => {
      useReadingModePreferenceStore.getState().reset();
    });
    window.localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, 'fake-jwt-for-tests');
    window.localStorage.setItem(
      AUTH_STORAGE_KEYS.USER_DATA,
      JSON.stringify({ id: REGISTERED_USER_ID })
    );
  });

  it('défaut "auto" quand rien n\'est mémorisé pour la conversation', () => {
    expect(useReadingModePreferenceStore.getState().getReadingMode('conv-x')).toBe('auto');
  });

  it('écriture optimiste : la valeur change IMMÉDIATEMENT (avant la résolution de la persistance locale)', async () => {
    const { result } = renderHook(() => useReadingModePreference('conv-a'));
    expect(result.current).toBe('auto');

    let writePromise!: Promise<void>;
    act(() => {
      writePromise = useReadingModePreferenceStore.getState().setReadingMode('conv-a', 'focal');
    });

    // La Map a déjà été mise à jour de façon synchrone dans `set()`, avant tout `await`.
    expect(useReadingModePreferenceStore.getState().getReadingMode('conv-a')).toBe('focal');

    await act(async () => {
      await writePromise;
    });
    expect(useReadingModePreferenceStore.getState().getReadingMode('conv-a')).toBe('focal');
  });

  it('incrémente la version locale à chaque écriture réussie', async () => {
    await act(async () => {
      await useReadingModePreferenceStore.getState().setReadingMode('conv-b', 'focal');
    });
    const first = useReadingModePreferenceStore.getState();
    expect(first.entries.get(entryKey('conv-b'))?.version).toBe(1);

    await act(async () => {
      await useReadingModePreferenceStore.getState().setReadingMode('conv-b', 'script');
    });
    expect(useReadingModePreferenceStore.getState().entries.get(entryKey('conv-b'))?.version).toBe(2);
  });

  it('rollback sur échec de la persistance locale — reprend la valeur d\'avant l\'écriture optimiste', async () => {
    const setItemSpy = jest
      .spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError (simulée)');
      });

    await act(async () => {
      await expect(
        useReadingModePreferenceStore.getState().setReadingMode('conv-c', 'script')
      ).rejects.toThrow('QuotaExceededError');
    });

    expect(useReadingModePreferenceStore.getState().getReadingMode('conv-c')).toBe('auto');
    expect(useReadingModePreferenceStore.getState().entries.has(entryKey('conv-c'))).toBe(false);

    setItemSpy.mockRestore();
  });

  it('rollback reprend la DERNIÈRE valeur confirmée, pas "auto" — un échec après une réussite précédente', async () => {
    await act(async () => {
      await useReadingModePreferenceStore.getState().setReadingMode('conv-d', 'focal');
    });
    expect(useReadingModePreferenceStore.getState().getReadingMode('conv-d')).toBe('focal');

    const setItemSpy = jest
      .spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => {
        throw new Error('échec simulé');
      });

    await act(async () => {
      await expect(
        useReadingModePreferenceStore.getState().setReadingMode('conv-d', 'script')
      ).rejects.toThrow();
    });

    expect(useReadingModePreferenceStore.getState().getReadingMode('conv-d')).toBe('focal');
    expect(useReadingModePreferenceStore.getState().entries.get(entryKey('conv-d'))?.version).toBe(1);

    setItemSpy.mockRestore();
  });

  it("rejette une valeur hors énumération AVANT toute écriture optimiste — la Map n'est pas touchée", async () => {
    await expect(
      useReadingModePreferenceStore.getState().setReadingMode('conv-e', 'not-a-real-mode' as never)
    ).rejects.toThrow();
    expect(useReadingModePreferenceStore.getState().entries.has(entryKey('conv-e'))).toBe(false);
  });

  describe('applyReadingModeUpdate — réconciliation par version, le point d\'entrée prêt pour le canal G-121', () => {
    it('applique un payload de version supérieure', () => {
      act(() => {
        useReadingModePreferenceStore.getState().applyReadingModeUpdate('conv-f', 'focal', 3);
      });
      expect(useReadingModePreferenceStore.getState().getReadingMode('conv-f')).toBe('focal');
      expect(useReadingModePreferenceStore.getState().entries.get(entryKey('conv-f'))?.version).toBe(3);
    });

    it('IGNORE un payload de version STRICTEMENT INFÉRIEURE — critère d\'acceptation LWS-11 explicite', () => {
      act(() => {
        useReadingModePreferenceStore.getState().applyReadingModeUpdate('conv-g', 'script', 5);
      });
      act(() => {
        useReadingModePreferenceStore.getState().applyReadingModeUpdate('conv-g', 'focal', 2);
      });
      expect(useReadingModePreferenceStore.getState().getReadingMode('conv-g')).toBe('script');
      expect(useReadingModePreferenceStore.getState().entries.get(entryKey('conv-g'))?.version).toBe(5);
    });

    it('IGNORE un payload de version ÉGALE (rejeu, jamais un recul ni un doublon appliqué)', () => {
      act(() => {
        useReadingModePreferenceStore.getState().applyReadingModeUpdate('conv-h', 'script', 5);
      });
      act(() => {
        useReadingModePreferenceStore.getState().applyReadingModeUpdate('conv-h', 'resume', 5);
      });
      expect(useReadingModePreferenceStore.getState().getReadingMode('conv-h')).toBe('script');
    });

    it('un payload de version supérieure ÉCRASE une écriture optimiste locale plus ancienne (diffusion plus récente gagne)', async () => {
      await act(async () => {
        await useReadingModePreferenceStore.getState().setReadingMode('conv-i', 'focal');
      });
      expect(useReadingModePreferenceStore.getState().entries.get(entryKey('conv-i'))?.version).toBe(1);

      act(() => {
        useReadingModePreferenceStore.getState().applyReadingModeUpdate('conv-i', 'riviere', 9);
      });
      expect(useReadingModePreferenceStore.getState().getReadingMode('conv-i')).toBe('riviere');
    });
  });

  it('useReadingModePreferenceActions expose des références stables (pas de re-render en cascade)', () => {
    const { result, rerender } = renderHook(() => useReadingModePreferenceActions());
    const first = result.current;
    rerender();
    expect(result.current.setReadingMode).toBe(first.setReadingMode);
    expect(result.current.applyReadingModeUpdate).toBe(first.applyReadingModeUpdate);
  });

  it('isole les conversations entre elles', async () => {
    await act(async () => {
      await useReadingModePreferenceStore.getState().setReadingMode('conv-j', 'focal');
    });
    expect(useReadingModePreferenceStore.getState().getReadingMode('conv-k')).toBe('auto');
  });
});
