import { describe, expect, test } from 'bun:test';

import {
  ADMIN_SOUVERAIN_PREFIXE,
  adminConversationMessagesQueryKey,
  adminConversationsQueryKey,
  decodeAdminInstanceConversations,
  decodeAdminSovereignThread,
  estClefSouveraine,
  loadAdminInstanceConversations,
  loadAdminSovereignThread,
} from './admin-conversations';
import type { HttpTransport } from './http';
import { pageServie } from './admin';
import { resultatServi } from '@/test-support/served-pagination';

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

/**
 * LE DOUBLE DÉPAQUETTE COMME LE TRANSPORT (#6862, revue-correction) : il
 * reçoit l'enveloppe telle que la passerelle l'envoie et remet ce que
 * `createHttpTransport` remettrait — `data` dépaqueté, `pagination` en
 * SIBLING. Rendre `{ ok: true, data: enveloppe }` faisait trouver au décodeur
 * une pagination qui, en production, n'est jamais là.
 */
function transportQuiRend(charge: unknown, vu: { path?: string }): HttpTransport {
  const transport = (() => {
    throw new Error('appel positionnel non utilisé');
  }) as unknown as HttpTransport;
  transport.request = (async (requete: { path: string }) => {
    vu.path = requete.path;
    return resultatServi(charge);
  }) as HttpTransport['request'];
  return transport;
}

/**
 * LA PAGE TELLE QUE LE PRODUIT LA REÇOIT (#6862, revue-correction) — l'enveloppe
 * de la passerelle passe par la MÊME conversion que `createHttpTransport`
 * (`resultatServi`) puis par la MÊME lecture que les ports (`pageServie`).
 * Passer l'enveloppe brute au décodeur laissait `pagination` là où la
 * production ne la trouve jamais : le témoin verdissait sur un chemin
 * inexistant.
 */
const servie = (enveloppe: unknown) => pageServie(resultatServi(enveloppe));

describe('decodeAdminInstanceConversations — l\'inventaire', () => {
  test('lit la pagination À CÔTÉ de `data`, jamais dedans', () => {
    const page = decodeAdminInstanceConversations(servie(
      {
        data: [{ id: 'c1', title: 'Équipe', type: 'group', memberCount: 4 }],
        pagination: { total: 42, offset: 0, limit: 20, hasMore: true },
      }),
      0,
    );

    expect(page.total).toBe(42);
    expect(page.hasMore).toBe(true);
    expect(page.conversations.length).toBe(1);
  });

  test('un direct sans titre rend `null`, jamais une chaîne vide', () => {
    const page = decodeAdminInstanceConversations(servie({ data: [{ id: 'c2', title: '', type: 'direct' }] }), 0);
    expect(page.conversations[0]?.title).toBe(null);
  });

  test('écarte une ligne sans identifiant plutôt que d\'inventer une clé', () => {
    const page = decodeAdminInstanceConversations(servie({ data: [{ title: 'sans id' }, { id: 'c3' }] }), 0);
    expect(page.conversations.length).toBe(1);
    expect(page.conversations[0]?.id).toBe('c3');
  });

  test('sans `pagination`, déduit `hasMore` du décompte plutôt que de le supposer faux', () => {
    const page = decodeAdminInstanceConversations(servie({ data: [{ id: 'c4' }] }), 0);
    expect(page.total).toBe(1);
    expect(page.hasMore).toBe(false);
  });
});

describe('decodeAdminSovereignThread — le fil, dans le type PARTAGÉ', () => {
  const chargeSouveraine = {
    data: [
      /* La route sert `createdAt DESC` : le plus RÉCENT d'abord. Ce corpus est
         donc écrit dans l'ordre de la route, et le décodeur doit le rendre
         ASCENDANT — sans quoi `place()` daterait les séparateurs à l'envers. */
      {
        id: 'm2',
        conversationId: 'c1',
        senderId: 'u2',
        content: null,
        originalLanguage: 'en',
        messageType: 'text',
        messageSource: 'user',
        isEdited: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
        reactionCount: 0,
        isEncrypted: true,
        encryptionMode: 'e2ee',
        isProtected: true,
        translations: [],
        attachmentCount: 0,
        attachments: [],
        replyTo: null,
        createdAt: '2026-06-02T11:00:00.000Z',
        sender: { id: 'p2', userId: 'u2', displayName: 'Bob', avatar: null, user: { id: 'u2', username: 'bob' } },
      },
      {
        id: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        content: 'Hello',
        originalLanguage: 'en',
        messageType: 'text',
        messageSource: 'user',
        isEdited: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
        reactionCount: 0,
        isEncrypted: false,
        isProtected: false,
        translations: [
          {
            id: 't1',
            messageId: 'm1',
            targetLanguage: 'es',
            translatedContent: 'Hola',
            createdAt: '2026-06-02T10:00:05.000Z',
          },
        ],
        attachmentCount: 1,
        attachments: [
          {
            id: 'a1',
            messageId: 'm1',
            originalName: 'photo.jpg',
            mimeType: 'image/jpeg',
            fileSize: 120000,
            fileUrl: 'https://cdn.test/a1.jpg',
            thumbnailUrl: null,
            transcription: null,
            translations: null,
            imageVariants: null,
            isProtected: false,
          },
        ],
        replyTo: null,
        createdAt: '2026-06-02T10:00:00.000Z',
        sender: { id: 'p1', userId: 'u1', displayName: 'Alice', avatar: null, user: { id: 'u1', username: 'alice' } },
      },
    ],
    pagination: { total: 2, offset: 0, limit: 30, hasMore: false },
  };

  test('RENVERSE le `createdAt DESC` de la route — `place()` suppose l’ascendant', () => {
    const page = decodeAdminSovereignThread(servie(chargeSouveraine), 0);
    expect(page.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  test('revit les dates par le décodeur PARTAGÉ — jamais des chaînes ISO', () => {
    const page = decodeAdminSovereignThread(servie(chargeSouveraine), 0);
    expect(page.messages[0]?.createdAt instanceof Date).toBe(true);
    expect(page.messages[0]?.translations[0]?.createdAt instanceof Date).toBe(true);
  });

  test('porte les TRADUCTIONS — sans elles aucun Prisme ne peut descendre', () => {
    const page = decodeAdminSovereignThread(servie(chargeSouveraine), 0);
    expect(page.messages[0]?.translations.map((t) => t.targetLanguage)).toEqual(['es']);
    expect(page.messages[0]?.translations[0]?.translatedContent).toBe('Hola');
  });

  test('`content: null` devient la chaîne VIDE, jamais `undefined`', () => {
    // `Message.content` est REQUIS ; `decodeMessage` retire les clés nulles.
    // Un `null` traversant deviendrait donc `undefined` — un type menti, que
    // `served({ original })` propagerait jusqu'au texte peint.
    const page = decodeAdminSovereignThread(servie(chargeSouveraine), 0);
    const protege = page.messages.find((m) => m.id === 'm2');
    expect(protege?.content).toBe('');
  });

  test('le verdict SERVI voyage dans `protectedIds` — il ne se recalcule pas', () => {
    // `m2` est protégé par CHIFFREMENT seul : `protectionOf` (client) ne
    // connaît ni `isEncrypted` ni `encryptionMode`, il rendrait « standard ».
    // Seul le verdict de la passerelle couvre les quatre causes.
    const page = decodeAdminSovereignThread(servie(chargeSouveraine), 0);
    expect(page.protectedIds.has('m2')).toBe(true);
    expect(page.protectedIds.has('m1')).toBe(false);
  });

  test('les `null` de la passerelle sont DÉFAITS sur les pièces jointes aussi', () => {
    const page = decodeAdminSovereignThread(servie(chargeSouveraine), 0);
    const piece = page.messages[0]?.attachments?.[0];
    expect(piece?.fileUrl).toBe('https://cdn.test/a1.jpg');
    // `imageVariants: null` atteignait `attachmentSrcSet`, dont la garde ne
    // connaît que `undefined` — le fil ENTIER par terre (#6820).
    expect(piece?.imageVariants).toBeUndefined();
    expect(piece?.transcription).toBeUndefined();
  });

  test('écarte une ligne sans identifiant ou sans horloge — `place()` ne saurait pas la ranger', () => {
    const page = decodeAdminSovereignThread(servie(
      {
        data: [
          { content: 'sans id', createdAt: '2026-06-02T10:00:00.000Z' },
          { id: 'm9', content: 'sans horloge' },
          { id: 'm8', content: 'complet', createdAt: '2026-06-02T10:00:00.000Z' },
        ],
      }),
      0,
    );
    expect(page.messages.map((m) => m.id)).toEqual(['m8']);
  });

  test('lit la pagination À CÔTÉ de `data`, jamais dedans', () => {
    const page = decodeAdminSovereignThread(servie(chargeSouveraine), 0);
    expect(page.total).toBe(2);
    expect(page.hasMore).toBe(false);
  });

  test('le motif écrit voyage en QUERYSTRING — un GET n’a pas de corps', async () => {
    const vu: { path?: string } = {};
    const resultat = await loadAdminSovereignThread({
      source: 'gateway',
      transport: transportQuiRend(chargeSouveraine, vu),
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
    expect(adminConversationsQueryKey('')[0]).toBe(ADMIN_SOUVERAIN_PREFIXE);
    expect(adminConversationMessagesQueryKey('c1', 0)[0]).toBe(ADMIN_SOUVERAIN_PREFIXE);
  });

  test('`estClefSouveraine` reconnaît ces clés et REJETTE les autres', () => {
    expect(estClefSouveraine(adminConversationsQueryKey(''))).toBe(true);
    expect(estClefSouveraine(adminConversationMessagesQueryKey('c1', 0))).toBe(true);

    // Le contraste est ce qui donne sa valeur au prédicat : s'il rendait
    // `true` partout, la v2 cesserait de persister TOUT son cache, et le
    // témoin ci-dessus passerait quand même.
    expect(estClefSouveraine(['admin', 'users', 0, ''])).toBe(false);
    expect(estClefSouveraine(['conversations'])).toBe(false);
    expect(estClefSouveraine([])).toBe(false);
  });
});

/**
 * **« SUIVANTS » A UN EFFET, OU N'EXISTE PAS** (#6862, revue-correction) — le
 * témoin qui manquait, et sans lequel les deux décodeurs ci-dessus ont vécu
 * FAUX en production tout en restant verts.
 *
 * Les témoins de décodeur ci-dessus reçoivent l'enveloppe ENTIÈRE. Ceux-ci
 * passent par le PORT, avec un transport qui dépaquette comme le vrai : `data`
 * seul, `pagination` en sibling. C'est le seul chemin qu'un administrateur
 * emprunte, et c'est là que `hasMore` retombait à `false` pour toujours —
 * bouton « Suivants » grisé sur une liste qui a 42 lignes.
 */
describe('la pagination SERVIE atteint le bouton', () => {
  const PAGE_PLEINE = {
    data: [{ id: 'm-1', content: 'un', createdAt: '2026-06-02T10:00:00.000Z' }],
    pagination: { total: 42, offset: 0, limit: 30, hasMore: true },
  };

  test('le fil souverain : `hasMore` vient du SERVEUR, par le chemin du transport', async () => {
    const vu: { path?: string } = {};
    const resultat = await loadAdminSovereignThread({
      source: 'gateway',
      transport: transportQuiRend(PAGE_PLEINE, vu),
      conversationId: 'c1',
      offset: 0,
      reason: 'Enquête sur un signalement (#9142)',
    } as never);

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.total).toBe(42);
    expect(resultat.data.hasMore).toBe(true);
  });

  test('l’inventaire : même chemin, même verdict', async () => {
    const vu: { path?: string } = {};
    const resultat = await loadAdminInstanceConversations({
      source: 'gateway',
      transport: transportQuiRend(
        { data: [{ id: 'c1' }], pagination: { total: 42, offset: 0, limit: 20, hasMore: true } },
        vu,
      ),
      offset: 0,
    } as never);

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.total).toBe(42);
    expect(resultat.data.hasMore).toBe(true);
  });
});

describe('loadAdminInstanceConversations — tri, ordre, filtres et taille de page (#7873)', () => {
  test('transmet ce que la liste demande, et rien de vide', async () => {
    const vu: { path?: string } = {};
    await loadAdminInstanceConversations({
      source: 'gateway',
      transport: transportQuiRend({ data: [], pagination: { total: 0 } }, vu),
      offset: 50,
      limit: 50,
      search: '',
      sort: 'createdAt',
      order: 'asc',
      filters: { type: 'group', isActive: 'false' },
    } as never);

    const adresse = new URL(vu.path ?? '', 'https://x.test');
    expect(Object.fromEntries(adresse.searchParams)).toEqual({
      offset: '50',
      limit: '50',
      sort: 'createdAt',
      order: 'asc',
      type: 'group',
      isActive: 'false',
    });
  });
});
