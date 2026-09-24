import { describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import type { ConversationOverride } from '@/lib/conversation-store';

import { countUnreadConversations, titleWithUnread, updateAppBadge } from './use-app-badge';

/**
 * LES LOIS PURES DU BADGE (W4, #7221) — D-L1 : le badge compte les
 * CONVERSATIONS non lues, HORS MUETTES. Le CÂBLAGE de ces lois au cache et au
 * titre de l'onglet est mesuré à part, sur un arbre rendu
 * (`use-app-badge-wiring.test.tsx`) : ce fichier-ci ne rend rien.
 */
const NO_OVERRIDES: Readonly<Record<string, ConversationOverride>> = {};

const conversation = (partial: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c-1',
    title: 'Test',
    type: 'direct',
    createdAt: new Date('2026-09-20T00:00:00.000Z'),
    updatedAt: new Date('2026-09-20T00:00:00.000Z'),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

/** La forme EXACTE du wire (`packages/shared/types/api-schemas/conversation.ts:588-600`) :
 * `userPreferences` est un TABLEAU d'au plus une entrée, que `flagsOf` narrowe. */
const muted = (partial: Partial<Conversation> = {}): Conversation =>
  conversation({ ...partial, userPreferences: [{ isPinned: false, isMuted: true, isArchived: false }] });

describe('countUnreadConversations — D-L1 : des CONVERSATIONS, pas des messages', () => {
  test('compte les conversations, jamais la somme de leurs messages non lus', () => {
    const count = countUnreadConversations(
      [
        conversation({ id: 'c-1', unreadCount: 5 }),
        conversation({ id: 'c-2', unreadCount: 3 }),
        conversation({ id: 'c-3', unreadCount: 0 }),
      ],
      NO_OVERRIDES,
    );
    expect(count).toBe(2);
  });

  test('aucune non lue ⇒ 0', () => {
    expect(countUnreadConversations([conversation({ unreadCount: 0 })], NO_OVERRIDES)).toBe(0);
  });

  test('liste vide ⇒ 0', () => {
    expect(countUnreadConversations([], NO_OVERRIDES)).toBe(0);
  });

  test('cache absent ⇒ undefined (pas de mise à jour du badge)', () => {
    expect(countUnreadConversations(undefined, NO_OVERRIDES)).toBe(undefined);
  });
});

/**
 * **LE TÉMOIN QUI TOMBAIT** (revue-correction W4) : la version livrée comptait
 * `c.unreadCount > 0` sans regarder la sourdine — D-L1 dit « hors muettes »,
 * et la loi iOS de référence exclut explicitement les muettes
 * (`ConversationReadLedger.total(excludingMuted:)`).
 */
describe('countUnreadConversations — D-L1 : HORS MUETTES', () => {
  test('une conversation en sourdine ne compte pas, même avec des non-lus', () => {
    const count = countUnreadConversations(
      [muted({ id: 'c-1', unreadCount: 9 }), conversation({ id: 'c-2', unreadCount: 1 })],
      NO_OVERRIDES,
    );
    expect(count).toBe(1);
  });

  test('toutes les non-lues en sourdine ⇒ aucun badge', () => {
    expect(countUnreadConversations([muted({ id: 'c-1', unreadCount: 4 })], NO_OVERRIDES)).toBe(0);
  });

  test('une sourdine posée en OPTIMISTE retire la conversation du compte sans attendre le serveur', () => {
    const conversations = [conversation({ id: 'c-1', unreadCount: 2 })];
    const overrides = { 'c-1': { flags: { isMuted: true } } };
    expect(countUnreadConversations(conversations, NO_OVERRIDES)).toBe(1);
    expect(countUnreadConversations(conversations, overrides)).toBe(0);
  });
});

/**
 * Instant App § Optimistic Updates — « marquer lu » depuis la rangée pose un
 * override que le wire ne porte pas encore. Un badge qui lirait `unreadCount`
 * brut resterait en retard d'un aller-retour serveur.
 */
describe('countUnreadConversations — le non-lu EFFECTIF, overrides compris', () => {
  test('marquer lu fait tomber le compte immédiatement', () => {
    const conversations = [conversation({ id: 'c-1', unreadCount: 3 }), conversation({ id: 'c-2', unreadCount: 1 })];
    expect(countUnreadConversations(conversations, { 'c-1': { unreadCount: 0 } })).toBe(1);
  });

  test('marquer non lu fait monter le compte immédiatement', () => {
    const conversations = [conversation({ id: 'c-1', unreadCount: 0 })];
    expect(countUnreadConversations(conversations, { 'c-1': { unreadCount: 1 } })).toBe(1);
  });
});

describe('titleWithUnread — le préfixe « (N) » est IDEMPOTENT', () => {
  test('pose le préfixe quand N > 0', () => {
    expect(titleWithUnread('Meeshy', 5)).toBe('(5) Meeshy');
  });

  test('remplace un préfixe existant au lieu de l’empiler', () => {
    expect(titleWithUnread('(3) Meeshy', 5)).toBe('(5) Meeshy');
  });

  test('retire le préfixe quand N = 0', () => {
    expect(titleWithUnread('(3) Meeshy', 0)).toBe('Meeshy');
  });

  test('ne touche pas un titre sans préfixe quand N = 0', () => {
    expect(titleWithUnread('Meeshy', 0)).toBe('Meeshy');
  });
});

describe('updateAppBadge — les deux surfaces du même nombre', () => {
  test('N > 0 : setAppBadge(N) et titre préfixé', () => {
    const calls: number[] = [];
    const doc = { title: 'Meeshy' };
    updateAppBadge(3, { navigator: { setAppBadge: (n?: number) => { calls.push(n ?? -1); return Promise.resolve(); } }, document: doc });
    expect(calls).toEqual([3]);
    expect(doc.title).toBe('(3) Meeshy');
  });

  test('N = 0 : clearAppBadge() et titre nu', () => {
    let cleared = 0;
    const doc = { title: '(3) Meeshy' };
    updateAppBadge(0, { navigator: { clearAppBadge: () => { cleared += 1; return Promise.resolve(); } }, document: doc });
    expect(cleared).toBe(1);
    expect(doc.title).toBe('Meeshy');
  });

  test('un navigateur SANS API Badging ne casse rien — le titre part quand même', () => {
    const doc = { title: 'Meeshy' };
    expect(() => updateAppBadge(2, { navigator: {}, document: doc })).not.toThrow();
    expect(doc.title).toBe('(2) Meeshy');
  });

  test('un setAppBadge qui JETTE ne casse rien', () => {
    const doc = { title: 'Meeshy' };
    const navigator = { setAppBadge: () => { throw new Error('non supporté'); } };
    expect(() => updateAppBadge(3, { navigator, document: doc })).not.toThrow();
    expect(doc.title).toBe('(3) Meeshy');
  });

  /**
   * `setAppBadge` rend une PROMESSE : un refus de permission la REJETTE, et
   * aucun `try`/`catch` synchrone ne l'attrape — elle finirait en
   * `unhandledrejection`, que `bun test` compte en « error ».
   */
  test('un setAppBadge qui REJETTE est absorbé, jamais laissé en rejet non traité', async () => {
    const doc = { title: 'Meeshy' };
    const navigator = { setAppBadge: () => Promise.reject(new Error('permission refusée')) };
    expect(() => updateAppBadge(3, { navigator, document: doc })).not.toThrow();
    await Promise.resolve();
    expect(doc.title).toBe('(3) Meeshy');
  });

  test('un clearAppBadge qui REJETTE est absorbé', async () => {
    const doc = { title: '(1) Meeshy' };
    const navigator = { clearAppBadge: () => Promise.reject(new Error('permission refusée')) };
    expect(() => updateAppBadge(0, { navigator, document: doc })).not.toThrow();
    await Promise.resolve();
    expect(doc.title).toBe('Meeshy');
  });

  /**
   * Le titre de départ porte DÉJÀ un préfixe : un titre nu ne distinguerait
   * pas « rien écrit » de « effacé », les deux rendant « Meeshy ». C'est le
   * préfixe SURVIVANT qui prouve que le cache absent laisse les deux surfaces
   * intactes.
   */
  test('undefined ⇒ ni setAppBadge ni clearAppBadge ni modification du titre', () => {
    let setAppBadgeCalled = false;
    let clearAppBadgeCalled = false;
    const doc = { title: '(3) Meeshy' };
    const navigator = {
      setAppBadge: () => { setAppBadgeCalled = true; return Promise.resolve(); },
      clearAppBadge: () => { clearAppBadgeCalled = true; return Promise.resolve(); },
    };
    updateAppBadge(undefined, { navigator, document: doc });
    expect(setAppBadgeCalled).toBe(false);
    expect(clearAppBadgeCalled).toBe(false);
    expect(doc.title).toBe('(3) Meeshy');
  });
});
