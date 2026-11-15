import { describe, expect, test } from 'bun:test';

import {
  ADMIN_SOUVERAIN_PREFIXE,
  adminConversationMediaQueryKey,
  adminConversationThreadQueryKey,
  decodeAdminSovereignMedia,
  loadAdminSovereignMedia,
  mergeAdminThreadPages,
  nextAdminMediaCursor,
  nextAdminThreadOffset,
  ADMIN_CONVERSATIONS_ROOT_KEY,
  adminConversationsQueryKey,
  decodeAdminInstanceConversation,
  decodeAdminSovereignThread,
  estClefSouveraine,
  loadAdminConversationList,
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

const OBJECT_ID = 'b'.repeat(24);

describe('decodeAdminInstanceConversation — une ligne de l\'inventaire', () => {
  test('un direct sans titre rend `null`, jamais une chaîne vide', () => {
    expect(decodeAdminInstanceConversation({ id: 'c2', title: '', type: 'direct' })?.title).toBe(null);
  });

  test('écarte une ligne sans identifiant plutôt que d\'inventer une clé', () => {
    expect(decodeAdminInstanceConversation({ title: 'sans id' })).toBe(null);
    expect(decodeAdminInstanceConversation({ id: 'c3' })?.id).toBe('c3');
  });

  test('forme FIGÉE : communauté nommée, fermeture, image, aperçu des membres — et rien d\'autre', () => {
    expect(
      decodeAdminInstanceConversation({
        id: 'c1',
        identifier: 'mshy_atelier',
        title: 'Atelier',
        type: 'group',
        avatar: 'https://cdn.test/a.png',
        isActive: false,
        closedAt: '2026-09-01T10:00:00.000Z',
        communityId: OBJECT_ID,
        community: { id: OBJECT_ID, name: 'Lycée Njanda', identifier: 'lycee-njanda' },
        memberCount: 4,
        createdAt: '2026-08-01T10:00:00.000Z',
        lastMessageAt: '2026-09-29T10:00:00.000Z',
        secret: 'jamais',
        participants: [
          { id: 'p1', userId: 'u1', type: 'user', displayName: 'Awa Diop', avatar: null, role: 'CREATOR', joinedAt: '2026-08-01T10:00:00.000Z', isActive: true, isOnline: true },
          { id: 'p2', userId: null, type: 'anonymous', displayName: 'Invité', avatar: '', role: 'member', joinedAt: null, isActive: true },
          { userId: 'u9', displayName: 'sans ligne de participation' },
        ],
      }),
    ).toEqual({
      id: 'c1',
      identifier: 'mshy_atelier',
      title: 'Atelier',
      type: 'group',
      avatar: 'https://cdn.test/a.png',
      isActive: false,
      closedAt: '2026-09-01T10:00:00.000Z',
      community: { id: OBJECT_ID, name: 'Lycée Njanda' },
      memberCount: 4,
      createdAt: '2026-08-01T10:00:00.000Z',
      lastMessageAt: '2026-09-29T10:00:00.000Z',
      participants: [
        { id: 'p1', userId: 'u1', kind: 'user', displayName: 'Awa Diop', avatar: null, role: 'creator', joinedAt: '2026-08-01T10:00:00.000Z' },
        { id: 'p2', userId: null, kind: 'anonymous', displayName: 'Invité', avatar: null, role: 'member', joinedAt: null },
      ],
    });
  });

  test('sans communauté ni fermeture : `null`, jamais un objet vide', () => {
    const row = decodeAdminInstanceConversation({ id: 'c4', community: null, closedAt: null });
    expect(row?.community).toBe(null);
    expect(row?.closedAt).toBe(null);
    expect(row?.isActive).toBe(true);
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
    expect(adminConversationThreadQueryKey('c1')[0]).toBe(ADMIN_SOUVERAIN_PREFIXE);
  });

  test('`estClefSouveraine` reconnaît ces clés et REJETTE les autres', () => {
    expect(estClefSouveraine(adminConversationsQueryKey(''))).toBe(true);
    expect(estClefSouveraine(adminConversationThreadQueryKey('c1'))).toBe(true);

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
    const resultat = await loadAdminConversationList({
      source: 'gateway',
      transport: transportQuiRend(
        { data: [{ id: 'c1' }], pagination: { total: 42, offset: 0, limit: 20, hasMore: true } },
        vu,
      ),
      query: new URLSearchParams({ offset: '0' }),
    } as never);

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.total).toBe(42);
    expect(resultat.data.hasMore).toBe(true);
    expect(resultat.data.rows.map((row) => row.id)).toEqual(['c1']);
  });
});

describe('loadAdminConversationList — la requête composée par la liste (#7873, #8876)', () => {
  test('part telle quelle sur l’adresse du catalogue, sans rien ajouter', async () => {
    const vu: { path?: string } = {};
    await loadAdminConversationList({
      source: 'gateway',
      transport: transportQuiRend({ data: [], pagination: { total: 0 } }, vu),
      query: new URLSearchParams({ offset: '50', limit: '50', sort: 'createdAt', order: 'asc', type: 'group', isActive: 'false', search: 'Famille' }),
    } as never);

    const adresse = new URL(vu.path ?? '', 'https://x.test');
    expect(adresse.pathname).toBe('/api/v1/admin/conversations');
    expect(Object.fromEntries(adresse.searchParams)).toEqual({
      offset: '50',
      limit: '50',
      sort: 'createdAt',
      order: 'asc',
      type: 'group',
      isActive: 'false',
      search: 'Famille',
    });
  });

  test('un refus de la passerelle remonte tel quel, jamais une page vide', async () => {
    const transport = (() => {
      throw new Error('appel positionnel non utilisé');
    }) as unknown as HttpTransport;
    transport.request = (async () => ({ ok: false, status: 403, error: 'Accès refusé' })) as HttpTransport['request'];

    const resultat = await loadAdminConversationList({ source: 'gateway', transport, query: new URLSearchParams() } as never);

    expect(resultat).toEqual({ ok: false, status: 403, error: 'Accès refusé' });
  });
});

describe('la racine des listes invalide toutes les pages', () => {
  test('la clé d’une liste en descend', () => {
    expect(adminConversationsQueryKey('offset=20').slice(0, 2)).toEqual([...ADMIN_CONVERSATIONS_ROOT_KEY]);
  });
});

/**
 * LE FIL SOUVERAIN EN DÉFILEMENT CONTINU (#11457) — la passerelle sert `createdAt DESC`
 * par OFFSET : la page 0 est la plus RÉCENTE, chaque page suivante est plus ANCIENNE.
 * Le fil, lui, se lit du plus ancien en haut au plus récent en bas.
 */
describe('les pages du fil souverain se recousent dans l’ordre du fil (#11457)', () => {
  const row = (id: string, minute: number, extra: Record<string, unknown> = {}) => ({
    id,
    conversationId: 'c1',
    senderId: 'u1',
    content: id,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    reactionCount: 0,
    isEncrypted: false,
    isProtected: false,
    translations: [],
    attachmentCount: 0,
    attachments: [],
    replyTo: null,
    createdAt: `2026-06-02T10:${String(minute).padStart(2, '0')}:00.000Z`,
    sender: { id: 'p1', userId: 'u1', displayName: 'Alice', avatar: null, user: { id: 'u1', username: 'alice' } },
    ...extra,
  });
  const page = (rows: readonly unknown[], offset: number, hasMore: boolean) =>
    decodeAdminSovereignThread(servie({ data: rows, pagination: { total: 99, offset, limit: 30, hasMore } }), offset);

  test('la page la plus ANCIENNE passe en TÊTE, la plus récente en QUEUE', () => {
    const recente = page([row('m4', 4), row('m3', 3)], 0, true);
    const ancienne = page([row('m2', 2), row('m1', 1)], 30, false);
    expect(mergeAdminThreadPages([recente, ancienne]).messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  test('un message arrivé entre deux pages (offsets décalés) ne se peint pas deux fois', () => {
    const recente = page([row('m4', 4), row('m3', 3)], 0, true);
    const decalee = page([row('m3', 3), row('m2', 2)], 30, false);
    expect(mergeAdminThreadPages([recente, decalee]).messages.map((m) => m.id)).toEqual(['m2', 'm3', 'm4']);
  });

  test('les verdicts de protection et les durées éphémères de TOUTES les pages sont gardés', () => {
    const recente = page([row('m2', 2, { isProtected: true, content: null })], 0, true);
    const ancienne = page([row('m1', 1, { ephemeralDuration: 30 })], 30, false);
    const fil = mergeAdminThreadPages([recente, ancienne]);
    expect([...fil.protectedIds]).toEqual(['m2']);
    expect(fil.ephemeralDurations.get('m1')).toBe(30);
  });

  test('l’offset suivant avance d’une page tant que la passerelle dit qu’il en reste, et s’arrête ensuite', () => {
    expect(nextAdminThreadOffset(page([row('m2', 2)], 0, true))).toBe(30);
    expect(nextAdminThreadOffset(page([row('m1', 1)], 30, true))).toBe(60);
    expect(nextAdminThreadOffset(page([row('m1', 1)], 60, false))).toBeUndefined();
  });
});

/**
 * **LES PIÈCES D'UNE CONVERSATION, SANS REMONTER LE FIL** (#11510) — le décodeur
 * de `GET /admin/conversations/:id/attachments`.
 *
 * La passerelle VOILE déjà une pièce protégée ; ces témoins se mesurent sur une
 * charge PLUS BAVARDE que ce qu'elle sert — un témoin fail-closed ne vaut que là.
 */
describe('decodeAdminSovereignMedia — les pièces, voilées chez le client aussi (#11510)', () => {
  const porteur = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    createdAt: '2026-06-02T10:00:00.000Z',
    senderId: 'u1',
    senderParticipantId: 'p1',
    sender: { id: 'p1', userId: 'u1', displayName: 'Alice', avatar: null, user: { id: 'u1', username: 'alice' } },
    isProtected: false,
    ...extra,
  });
  const piece = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    messageId: 'm1',
    originalName: `${id}.png`,
    mimeType: 'image/png',
    fileSize: 96,
    fileUrl: `data:image/png;base64,${id.toUpperCase()}`,
    thumbnailUrl: null,
    thumbHash: null,
    imageVariants: [],
    transcription: null,
    translations: null,
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    isProtected: false,
    message: porteur('m1'),
    ...extra,
  });
  const charge = (data: readonly unknown[], pagination: Record<string, unknown> = { limit: 60, hasMore: false, nextCursor: null, form: 'keyset' }) =>
    ({ data, pagination });

  test('une pièce LIBRE devient un élément de pellicule : son genre, sa clé, son porteur daté et nommé', () => {
    const page = decodeAdminSovereignMedia(servie(charge([piece('a1')])));
    expect(page.items).toHaveLength(1);
    const [item] = page.items;
    expect(item?.kind).toBe('visual');
    expect(item?.key).toBe('m1:a1');
    expect(item?.messageId).toBe('m1');
    expect(item?.attachment.fileUrl).toBe('data:image/png;base64,A1');
    expect(item?.message.sender?.displayName).toBe('Alice');
    expect(item?.message.createdAt).toBeInstanceOf(Date);
    expect(item?.message.senderId).toBe('u1');
  });

  test('le genre suit la MÊME partition que l’index du produit — audio, document, contact', () => {
    const page = decodeAdminSovereignMedia(
      servie(
        charge([
          piece('a-son', { mimeType: 'audio/mp4' }),
          piece('a-pdf', { mimeType: 'application/pdf' }),
          piece('a-carte', { mimeType: 'text/vcard' }),
        ]),
      ),
    );
    expect(page.items.map((item) => item.kind)).toEqual(['audio', 'document', 'contact']);
  });

  test('une pièce VOILÉE par ses drapeaux reste listée, et ce que la charge porte en trop est RETIRÉ', () => {
    const page = decodeAdminSovereignMedia(
      servie(
        charge([
          piece('a-vue-unique', { isViewOnce: true, isProtected: true, fileUrl: 'data:image/png;base64,FUITE', thumbnailUrl: 'data:FUITE-VIGNETTE', thumbHash: 'FUITE-HASH', transcription: { text: 'FUITE-TEXTE' } }),
        ]),
      ),
    );
    expect(page.items).toHaveLength(1);
    const [item] = page.items;
    expect(item?.attachment.isViewOnce).toBe(true);
    expect(JSON.stringify(item?.attachment)).not.toContain('FUITE');
  });

  test('une pièce VOILÉE perd aussi ses variantes AVIF et ses rendus (#11262, #11261) : rien de ce qui en dérive ne passe', () => {
    const fuite = { width: 640, height: 640, url: 'data:image/avif;base64,FUITE-AVIF', size: 9, format: 'avif' };
    const rendu = { codec: 'h264', url: 'data:video/mp4;base64,FUITE-RENDU', width: 1920, height: 1080, size: 9 };
    const page = decodeAdminSovereignMedia(
      servie(charge([piece('a-flou', { isBlurred: true, isProtected: true, avifVariants: [fuite], renditions: [rendu] })])),
    );
    expect(page.items).toHaveLength(1);
    const [item] = page.items;
    expect(item?.attachment.avifVariants).toBeUndefined();
    expect(item?.attachment.renditions).toBeUndefined();
    expect(JSON.stringify(item?.attachment)).not.toContain('FUITE');
  });

  test('une pièce RETENUE par son MESSAGE (chiffré, vue unique, expiré) n’entre pas : le fil en dit le constat', () => {
    const page = decodeAdminSovereignMedia(
      servie(charge([piece('a-chiffre', { isProtected: true, fileUrl: 'data:image/png;base64,FUITE', message: porteur('m1', { isProtected: true }) })])),
    );
    expect(page.items).toEqual([]);
  });

  test('une pièce sans porteur, sans identifiant ou sans type est ÉCARTÉE, jamais réparée', () => {
    const page = decodeAdminSovereignMedia(
      servie(charge([piece('a-orpheline', { message: null }), piece('', {}), piece('a-sans-type', { mimeType: undefined })])),
    );
    expect(page.items).toEqual([]);
  });

  test('le curseur suivant vient de la pagination À CÔTÉ de `data`, et s’éteint quand la passerelle dit qu’il n’y a plus rien', () => {
    expect(decodeAdminSovereignMedia(servie(charge([piece('a1')], { limit: 60, hasMore: true, nextCursor: 'jeton', form: 'keyset' }))).nextCursor).toBe('jeton');
    expect(decodeAdminSovereignMedia(servie(charge([piece('a1')], { limit: 60, hasMore: false, nextCursor: null, form: 'keyset' }))).nextCursor).toBeNull();
    expect(nextAdminMediaCursor({ items: [], nextCursor: 'jeton' })).toBe('jeton');
    expect(nextAdminMediaCursor({ items: [], nextCursor: null })).toBeUndefined();
  });

  test('la requête part sur l’adresse du catalogue, avec le curseur, le genre et le motif en QUERYSTRING', async () => {
    const vu: { path?: string } = {};
    const resultat = await loadAdminSovereignMedia({
      source: 'gateway',
      transport: transportQuiRend(charge([piece('a1')]), vu),
      conversationId: 'conv 1',
      cursor: 'jeton',
      kind: 'visual',
      reason: 'Enquête sur un signalement (#9142)',
    } as never);
    expect(resultat.ok).toBe(true);
    expect(vu.path).toContain('/api/v1/admin/conversations/conv%201/attachments?');
    expect(vu.path).toContain('cursor=jeton');
    expect(vu.path).toContain('kind=visual');
    expect(vu.path).toContain('reason=');
  });

  test('sans genre ni curseur, ni `kind=` ni `cursor=` ne partent — le rang souverain part aussi sans motif', async () => {
    const vu: { path?: string } = {};
    await loadAdminSovereignMedia({
      source: 'gateway',
      transport: transportQuiRend(charge([]), vu),
      conversationId: 'c1',
      cursor: null,
      kind: null,
      reason: null,
    } as never);
    expect(vu.path).not.toContain('kind=');
    expect(vu.path).not.toContain('cursor=');
    expect(vu.path).not.toContain('reason=');
  });

  test('la clé de requête des pièces porte le préfixe souverain — rien n’en persiste sur le poste', () => {
    expect(adminConversationMediaQueryKey('c1', null)[0]).toBe(ADMIN_SOUVERAIN_PREFIXE);
    expect(estClefSouveraine(adminConversationMediaQueryKey('c1', 'audio'))).toBe(true);
    expect(adminConversationMediaQueryKey('c1', null)).not.toEqual(adminConversationMediaQueryKey('c1', 'audio'));
  });
});
