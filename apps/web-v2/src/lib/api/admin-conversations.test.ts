import { describe, expect, test } from 'bun:test';

import {
  ADMIN_SOUVERAIN_PREFIXE,
  adminConversationMessagesQueryKey,
  adminConversationsQueryKey,
  decodeAdminInstanceConversations,
  decodeAdminSovereignMessages,
  estClefSouveraine,
  loadAdminSovereignMessages,
} from './admin-conversations';
import type { HttpTransport } from './http';

/**
 * LA LECTURE SOUVERAINE DES CONVERSATIONS (#6862) — les décodeurs.
 *
 * ## Ce que ces témoins gardent, et pourquoi chacun est là
 *
 * 1. **La PAGINATION voyage à côté de `data`.** Ces deux routes passent par
 *    `sendPaginatedSuccess` ; `GET /admin/users` sert la sienne DEDANS. Lire au
 *    mauvais niveau rendrait `total: 0` et `hasMore: false` — une liste qui
 *    s'arrête à la première page **sans que rien n'échoue**.
 * 2. **Une pièce PROTÉGÉE reste listée.** C'est un état légitime, ni une
 *    absence ni un échec de chargement : la jeter ferait disparaître un fait
 *    que l'administration a le droit de constater.
 * 3. **La clé de requête porte le préfixe souverain.** C'est le SEUL point
 *    d'accroche de l'exclusion de persistance : une clé qui y échapperait
 *    ferait écrire le contenu d'une conversation privée dans
 *    `localStorage['meeshy.query-cache']`, où il survivrait à la session.
 *    Aucun autre témoin ne peut voir ça.
 *
 * Rappel de la maison : `bun test` n'applique AUCUN typage — ces témoins verts
 * ne prouvent rien sur les types, et `bun run typecheck` reste l'arbitre.
 */

function transportQuiRend(charge: unknown, vu: { path?: string }): HttpTransport {
  const transport = (() => {
    throw new Error('appel positionnel non utilisé');
  }) as unknown as HttpTransport;
  transport.request = (async (requete: { path: string }) => {
    vu.path = requete.path;
    return { ok: true, data: charge };
  }) as HttpTransport['request'];
  return transport;
}

describe('decodeAdminInstanceConversations — l\'inventaire', () => {
  test('lit la pagination À CÔTÉ de `data`, jamais dedans', () => {
    const page = decodeAdminInstanceConversations(
      {
        data: [{ id: 'c1', title: 'Équipe', type: 'group', memberCount: 4 }],
        pagination: { total: 42, offset: 0, limit: 20, hasMore: true },
      },
      0,
    );

    expect(page.total).toBe(42);
    expect(page.hasMore).toBe(true);
    expect(page.conversations.length).toBe(1);
  });

  test('un direct sans titre rend `null`, jamais une chaîne vide', () => {
    const page = decodeAdminInstanceConversations({ data: [{ id: 'c2', title: '', type: 'direct' }] }, 0);
    expect(page.conversations[0]?.title).toBe(null);
  });

  test('écarte une ligne sans identifiant plutôt que d\'inventer une clé', () => {
    const page = decodeAdminInstanceConversations({ data: [{ title: 'sans id' }, { id: 'c3' }] }, 0);
    expect(page.conversations.length).toBe(1);
    expect(page.conversations[0]?.id).toBe('c3');
  });

  test('sans `pagination`, déduit `hasMore` du décompte plutôt que de le supposer faux', () => {
    const page = decodeAdminInstanceConversations({ data: [{ id: 'c4' }] }, 0);
    expect(page.total).toBe(1);
    expect(page.hasMore).toBe(false);
  });
});

describe('decodeAdminSovereignMessages — le contenu et ses pièces', () => {
  const chargeAvecPieces = {
    data: [
      {
        id: 'm1',
        content: 'bonjour',
        originalLanguage: 'fr',
        messageType: 'text',
        isEdited: false,
        createdAt: '2026-06-02T10:00:00.000Z',
        sender: { userId: 'u1', displayName: 'Alice', avatar: null, user: { username: 'alice' } },
        attachmentCount: 2,
        isProtected: false,
        attachments: [
          { id: 'a1', originalName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 120000, width: 800, height: 600, duration: null, fileUrl: 'https://cdn.test/a1.jpg', thumbnailUrl: null, isProtected: false },
          { id: 'a2', originalName: 'note.m4a', mimeType: 'audio/mp4', fileSize: 48000, width: null, height: null, duration: 12, fileUrl: null, thumbnailUrl: null, isProtected: true },
        ],
      },
      {
        id: 'm2',
        content: null,
        isProtected: true,
        attachmentCount: 0,
        attachments: [],
        sender: { userId: 'u2', displayName: '', avatar: null, user: { displayName: 'Bob', username: 'bob' } },
      },
    ],
    pagination: { total: 2, offset: 0, limit: 30, hasMore: false },
  };

  test('garde une pièce PROTÉGÉE dans la liste, sans URL — ni absence ni erreur', () => {
    const page = decodeAdminSovereignMessages(chargeAvecPieces, 0);
    const pieces = page.messages[0]?.attachments ?? [];

    expect(pieces.length).toBe(2);
    const protegee = pieces.find((p) => p.id === 'a2');
    expect(protegee?.isProtected).toBe(true);
    expect(protegee?.fileUrl).toBe(null);
    // Ce que l'administration constate SANS ouvrir le fichier.
    expect(protegee?.originalName).toBe('note.m4a');
    expect(protegee?.duration).toBe(12);
  });

  test('une pièce libre garde son URL — sans ce contraste, tout masquer passerait aussi', () => {
    const page = decodeAdminSovereignMessages(chargeAvecPieces, 0);
    const libre = page.messages[0]?.attachments.find((p) => p.id === 'a1');
    expect(libre?.fileUrl).toBe('https://cdn.test/a1.jpg');
    expect(libre?.isProtected).toBe(false);
  });

  test('un message protégé rend `content: null` ET le DIT — jamais un message vide', () => {
    const page = decodeAdminSovereignMessages(chargeAvecPieces, 0);
    const protege = page.messages.find((m) => m.id === 'm2');
    expect(protege?.content).toBe(null);
    expect(protege?.isProtected).toBe(true);
  });

  test('`isProtected` est fail-closed : une charge muette ne déclare pas une pièce libre', () => {
    const page = decodeAdminSovereignMessages(
      { data: [{ id: 'm3', attachments: [{ id: 'a9', originalName: 'x' }] }] },
      0,
    );
    expect(page.messages[0]?.attachments[0]?.isProtected).toBe(false);
    // Le drapeau absent vaut « pas déclaré protégé » — les URL sont déjà
    // nulles côté serveur quand cela compte ; ici il gouverne l'EXPLICATION.
    expect(page.messages[0]?.attachments[0]?.fileUrl).toBe(null);
  });

  test('le nom du PARTICIPANT prime sur celui du compte, comme dans le fil', () => {
    const page = decodeAdminSovereignMessages(chargeAvecPieces, 0);
    expect(page.messages[0]?.sender?.displayName).toBe('Alice');
    // Participant sans nom propre ⇒ repli sur le compte.
    expect(page.messages[1]?.sender?.displayName).toBe('Bob');
  });

  test('le motif écrit voyage en QUERYSTRING — un GET n\'a pas de corps', async () => {
    const vu: { path?: string } = {};
    const resultat = await loadAdminSovereignMessages({
      source: 'gateway',
      transport: transportQuiRend(chargeAvecPieces, vu),
      conversationId: 'conv 1',
      offset: 0,
      reason: 'Enquête sur un signalement (#9142)',
    } as never);

    expect(resultat.ok).toBe(true);
    expect(vu.path).toContain('reason=');
    // L'identifiant est ÉCHAPPÉ : un identifiant à espace ne doit pas casser
    // l'adresse ni glisser un second paramètre.
    expect(vu.path).toContain('conv%201');
  });
});

describe('la clé de requête porte le préfixe souverain — le point d\'accroche de la NON-persistance', () => {
  test('les deux fabriques de clés en descendent', () => {
    expect(adminConversationsQueryKey(0, '', '')[0]).toBe(ADMIN_SOUVERAIN_PREFIXE);
    expect(adminConversationMessagesQueryKey('c1', 0)[0]).toBe(ADMIN_SOUVERAIN_PREFIXE);
  });

  test('`estClefSouveraine` reconnaît ces clés et REJETTE les autres', () => {
    expect(estClefSouveraine(adminConversationsQueryKey(0, '', ''))).toBe(true);
    expect(estClefSouveraine(adminConversationMessagesQueryKey('c1', 0))).toBe(true);

    // Le contraste est ce qui donne sa valeur au prédicat : s'il rendait
    // `true` partout, la v2 cesserait de persister TOUT son cache, et le
    // témoin ci-dessus passerait quand même.
    expect(estClefSouveraine(['admin', 'users', 0, ''])).toBe(false);
    expect(estClefSouveraine(['conversations'])).toBe(false);
    expect(estClefSouveraine([])).toBe(false);
  });
});
