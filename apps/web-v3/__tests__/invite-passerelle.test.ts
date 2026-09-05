/**
 * @jest-environment node
 */
import { apercuDeJonction, apercuServi, placeDetenue, rafraichis, reconnais, rejoins } from '../lib/api/invite';
import { apercuDuLien } from '../lib/api/links';
import { litLeDelta, urlDeSync } from '../lib/realtime/sync/delta-client';

/**
 * Ce que la porte de l'invité DEMANDE à la passerelle, et ce qu'elle en LIT —
 * contre les formes RÉELLES des trois routes (`routes/anonymous.ts:442` et
 * `:272`, `link-admission.ts:688`) et de `GET /sync` (`routes/sync/index.ts`).
 */

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });
const base = 'https://gate.test';

describe('l’aperçu d’un lien', () => {
  it('projette ce que la modale montre — et rien du créateur', async () => {
    const issue = await apercuDeJonction({
      identifiant: 'lagos-q1',
      base,
      recuperer: async () =>
        json({ success: true, data: { linkId: 'mshy_lagos', name: 'Lagos', description: null, requireNickname: true, requireAccount: false, allowedLanguages: ['fr', 'en'], creator: { username: 'x', email: 'x@y' }, conversation: { id: 'c1', title: 'Lagos' }, stats: { totalParticipants: 3 } } }),
    });
    expect(issue).toEqual({
      genre: 'apercu',
      apercu: {
        lien: 'mshy_lagos', nom: 'Lagos', description: null, conversationId: 'c1', requireNickname: true, requireAccount: false, requireEmail: false, requireBirthday: false, languesAutorisees: ['fr', 'en'], participants: 3,
        droits: { canSendMessages: false, canSendFiles: false, canSendImages: false, canViewHistory: false },
      },
    });
    expect(JSON.stringify(issue)).not.toContain('x@y');
  });

  it('lit les quatre exigences du lien — courriel et date de naissance comprises (`routes/anonymous.ts:672-675`)', () => {
    const servi = apercuServi({ linkId: 'mshy_x', name: 'X', requireAccount: true, requireNickname: false, requireEmail: true, requireBirthday: true });
    expect(servi).toMatchObject({ requireAccount: true, requireNickname: false, requireEmail: true, requireBirthday: true });
  });

  /** #4830 — l'aperçu sert désormais les quatre droits que le lien OUVRE, à côté de ses exigences. */
  it('projette les quatre droits que le lien ouvre — `allowViewHistory` et `allowAnonymous*` (`routes/anonymous.ts:691-694`)', () => {
    const servi = apercuServi({
      linkId: 'mshy_x', name: 'X',
      allowAnonymousMessages: true, allowAnonymousFiles: true, allowAnonymousImages: false, allowViewHistory: true,
    });
    expect(servi?.droits).toEqual({ canSendMessages: true, canSendFiles: true, canSendImages: false, canViewHistory: true });
  });

  /** Une seule lecture de la charge : la carte d'aperçu de `/l/:token` est une PROJECTION de la porte de l'invité. */
  it('sert la carte d’aperçu de /l/:token depuis le MÊME lecteur, clé absente comprise', async () => {
    const carte = await apercuDuLien({
      identifiant: 'lagos-q1',
      base,
      recuperer: async () => json({ success: true, data: { name: 'Lagos', description: 'Le canal', creator: { username: 'x' } } }),
    });
    expect(carte).toEqual({ nom: 'Lagos', description: 'Le canal' });
    expect(apercuServi({ name: 'Lagos' })?.lien).toBeNull();
    expect((await apercuDeJonction({ identifiant: 'l', base, recuperer: async () => json({ success: true, data: { name: 'Lagos' } }) })).genre).toBe('panne');
  });

  it('borne son attente au délai demandé — celui de la redirection, plus court', async () => {
    const signaux: (AbortSignal | null | undefined)[] = [];
    await apercuDeJonction({ identifiant: 'l', base, delaiMs: 1, recuperer: async (_url, options) => { signaux.push(options.signal); return json({ success: false }, 404); } });
    expect(signaux[0]).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [404, { genre: 'introuvable' }],
    [410, { genre: 'clos', code: 'LINK_MAX_USES' }],
    [500, { genre: 'panne' }],
  ])('nomme un %s', async (statut, attendu) => {
    expect(await apercuDeJonction({ identifiant: 'l', base, recuperer: async () => json({ success: false, error: 'LINK_MAX_USES' }, statut) })).toEqual(attendu);
  });

  it('dit la panne quand la passerelle se tait', async () => {
    expect((await apercuDeJonction({ identifiant: 'l', base, recuperer: async () => { throw new Error('x'); } })).genre).toBe('panne');
  });
});

describe('la jonction canonique', () => {
  it('rend une place invitée avec ses droits sur un 201', async () => {
    const issue = await rejoins({
      cle: 'mshy_lagos',
      pseudo: 'Tolu',
      langue: 'fr',
      base,
      recuperer: async () => json({ success: true, data: { sessionToken: 'S', conversationId: 'c1', participantId: 'p1', entry: { outcome: 'new', canViewHistory: false, rights: { canSendMessages: true, canSendFiles: true } } } }, 201),
    });
    expect(issue).toEqual({ genre: 'invite', jeton: 'S', participantId: 'p1', conversationId: 'c1', droits: { canSendMessages: true, canSendFiles: true, canSendImages: false, canViewHistory: false } });
  });

  it('rend un membre sur un 200 sans session', async () => {
    const issue = await rejoins({ cle: 'k', langue: 'fr', jeton: 'J', base, recuperer: async () => json({ success: true, data: { conversationId: 'c1', participantId: 'p2', entry: { outcome: 'already-member' } } }) });
    expect(issue).toEqual({ genre: 'membre', conversationId: 'c1', issue: 'already-member' });
  });

  it('envoie le courriel et la date de naissance en ISO date-time (`z.iso.datetime()`, `link-admission.ts:578`)', async () => {
    const corps: unknown[] = [];
    await rejoins({
      cle: 'k',
      pseudo: 'Tolu',
      courriel: 'tolu@example.com',
      naissance: '1990-05-12',
      langue: 'fr',
      base,
      recuperer: async (_url, options) => { corps.push(JSON.parse(String(options.body))); return json({ success: true, data: { sessionToken: 'S', participantId: 'p', entry: {} } }, 201); },
    });
    expect(corps).toEqual([{ nickname: 'Tolu', email: 'tolu@example.com', birthday: '1990-05-12T00:00:00.000Z', language: 'fr' }]);
  });

  it('laisse partir telle quelle une date qui n’en est pas une — c’est à la porte de la refuser', async () => {
    const corps: unknown[] = [];
    await rejoins({ cle: 'k', naissance: 'hier', langue: 'fr', base, recuperer: async (_url, options) => { corps.push(JSON.parse(String(options.body))); return json({ success: false, error: 'Données invalides', message: 'Données invalides' }, 400); } });
    expect(corps).toEqual([{ birthday: 'hier', language: 'fr' }]);
  });

  /** `LINK_EXHAUSTED` est un 409 SANS suggestion : un refus du lien, pas une saisie à corriger (`linkAdmission.ts:183-197`). */
  it('rend un 409 LINK_EXHAUSTED comme un refus sans suggestion', async () => {
    const issue = await rejoins({ cle: 'k', pseudo: 'Tolu', langue: 'fr', base, recuperer: async () => json({ success: false, error: 'LINK_EXHAUSTED', message: "Ce lien a atteint sa limite d'utilisation" }, 409) });
    expect(issue).toEqual({ genre: 'refus', statut: 409, code: 'LINK_EXHAUSTED', message: "Ce lien a atteint sa limite d'utilisation", suggestion: null });
  });

  /** Un 400 n'a pas de code : `sendBadRequest` met sa phrase dans `error` (`utils/response.ts:118-124`). */
  it('sert la phrase d’un 400 comme son code, telle que la passerelle l’écrit', async () => {
    const issue = await rejoins({ cle: 'k', langue: 'fr', base, recuperer: async () => json({ success: false, error: "L'email est obligatoire pour rejoindre cette conversation", message: "L'email est obligatoire pour rejoindre cette conversation" }, 400) });
    expect(issue).toMatchObject({ genre: 'refus', statut: 400, code: "L'email est obligatoire pour rejoindre cette conversation" });
  });

  it('lit la suggestion d’un 409 sous ses deux formes', async () => {
    const etendue = await rejoins({ cle: 'k', langue: 'fr', base, recuperer: async () => json({ success: false, error: 'USERNAME_TAKEN_IN_CONVERSATION', suggestedNickname: 'tolu2' }, 409) });
    const historique = await rejoins({ cle: 'k', langue: 'fr', base, recuperer: async () => json({ success: false, error: 'USERNAME_TAKEN_IN_CONVERSATION', details: { suggestedNickname: 'tolu3' } }, 409) });
    expect(etendue.genre === 'refus' && etendue.suggestion).toBe('tolu2');
    expect(historique.genre === 'refus' && historique.suggestion).toBe('tolu3');
  });
});

/**
 * LA RECONNAISSANCE d'une place — `GET /links/:identifier` (`routes/links/
 * retrieval.ts:40`), la seule porte qui dise « ce jeton tient une place sur ce
 * lien » SANS regarder l'état du lien (`:196-197`), et qui rende la clé
 * canonique (`link.linkId`, `:293`).
 */
describe('la reconnaissance d’une place', () => {
  // `currentUser` (`retrieval.ts:248-262`) : `id` = `Participant.id`, `username` = le pseudo de la session, `displayName` ABSENT.
  const servie = () =>
    json({
      success: true,
      data: {
        conversation: { id: 'c1', title: 'Lagos', type: 'group' },
        link: { id: 'l1', linkId: 'mshy_lagos', name: 'Ops Lagos', isActive: false, expiresAt: null },
        userType: 'anonymous',
        currentUser: { id: 'p1', username: 'Tolu', firstName: 'Tolu', lastName: '', language: 'fr', isMeeshyer: false },
        messages: [],
      },
    });

  it('présente le jeton en X-Session-Token, ne demande qu’UN message, et rend la clé canonique servie', async () => {
    const appels: { readonly url: string; readonly entetes: Record<string, string> }[] = [];
    const issue = await reconnais({
      identifiant: 'lagos-q1',
      jeton: 'S1',
      base,
      recuperer: async (url, options) => {
        appels.push({ url, entetes: options.headers as Record<string, string> });
        return servie();
      },
    });
    expect(appels[0]?.url).toBe(`${base}/api/v1/links/lagos-q1?limit=1`);
    expect(appels[0]?.entetes['x-session-token']).toBe('S1');
    expect(issue).toEqual({ genre: 'place', place: { lien: 'mshy_lagos', nom: 'Ops Lagos', conversationId: 'c1', participant: { id: 'p1', pseudo: 'Tolu' } } });
  });

  it('prend le titre de la conversation quand le lien n’a pas de nom — et ne nomme personne quand la charge ne nomme personne', async () => {
    const issue = await reconnais({
      identifiant: 'l',
      jeton: 'S1',
      base,
      recuperer: async () => json({ success: true, data: { conversation: { id: 'c1', title: 'Lagos' }, link: { linkId: 'mshy_lagos', name: null } } }),
    });
    expect(issue).toEqual({ genre: 'place', place: { lien: 'mshy_lagos', nom: 'Lagos', conversationId: 'c1', participant: null } });
  });

  it.each([
    [403, 'Accès non autorisé à ce lien'],
    [410, 'GUEST_ACCESS_REVOKED'],
    [404, 'Lien de partage non trouvé'],
  ])('ne voit aucune place dans un %s', async (statut, code) => {
    expect(await reconnais({ identifiant: 'l', jeton: 'S1', base, recuperer: async () => json({ success: false, error: code }, statut) })).toEqual({ genre: 'etrangere' });
  });

  it('dit la panne quand la passerelle se tait, tombe, ou sert un lien sans clé', async () => {
    expect((await reconnais({ identifiant: 'l', jeton: 'S1', base, recuperer: async () => { throw new Error('x'); } })).genre).toBe('panne');
    expect((await reconnais({ identifiant: 'l', jeton: 'S1', base, recuperer: async () => json({}, 500) })).genre).toBe('panne');
    expect((await reconnais({ identifiant: 'l', jeton: 'S1', base, recuperer: async () => json({ success: true, data: { link: { name: 'x' } } }) })).genre).toBe('panne');
  });

  it('retient le PREMIER jeton reconnu, dans l’ordre présenté, et n’en présente pas un de plus', async () => {
    const presentes: string[] = [];
    const issue = await placeDetenue({
      identifiant: 'l',
      jetons: ['S9', 'S1', 'S3'],
      base,
      recuperer: async (_url, options) => {
        const jeton = (options.headers as Record<string, string>)['x-session-token'] ?? '';
        presentes.push(jeton);
        return jeton === 'S1' ? servie() : json({ success: false, error: 'Accès non autorisé à ce lien' }, 403);
      },
    });
    expect(presentes).toEqual(['S9', 'S1']);
    expect(issue).toMatchObject({ genre: 'place', jeton: 'S1' });
  });

  it('ne voit aucune place sans jeton, ni quand aucun n’est reconnu — et une panne reste une panne', async () => {
    expect(await placeDetenue({ identifiant: 'l', jetons: [], base, recuperer: async () => servie() })).toEqual({ genre: 'aucune' });
    expect(await placeDetenue({ identifiant: 'l', jetons: ['S9'], base, recuperer: async () => json({}, 403) })).toEqual({ genre: 'aucune' });
    expect(await placeDetenue({ identifiant: 'l', jetons: ['S9'], base, recuperer: async () => { throw new Error('x'); } })).toEqual({ genre: 'panne' });
  });
});

describe('le battement de bail', () => {
  it('rend les droits relus et la conversation sur un 200', async () => {
    const issue = await rafraichis({
      jeton: 'S',
      base,
      recuperer: async (url, options) => {
        // `PATCH /guest-sessions/me`, le jeton en `X-Session-Token` — jamais dans un corps (`link-admission.ts:775-829`).
        expect(url).toBe('https://gate.test/api/v1/guest-sessions/me');
        expect(options.method).toBe('PATCH');
        expect((options.headers as Record<string, string>)['x-session-token']).toBe('S');
        expect(options.body).toBeUndefined();
        return json({ success: true, data: { participant: { id: 'p1', displayName: 'Tolu', language: 'yo', canSendMessages: false, canSendFiles: false, canSendImages: false }, conversation: { id: 'c1', title: 'L', allowViewHistory: true } } });
      },
    });
    expect(issue).toEqual({ genre: 'valide', participant: { id: 'p1', pseudo: 'Tolu', langue: 'yo' }, droits: { canSendMessages: false, canSendFiles: false, canSendImages: false, canViewHistory: true }, conversation: { id: 'c1', titre: 'L' } });
  });

  it.each([
    [401, { genre: 'invalide' }],
    [410, { genre: 'clos', code: 'CONVERSATION_CLOSED' }],
  ])('nomme un %s', async (statut, attendu) => {
    expect(await rafraichis({ jeton: 'S', base, recuperer: async () => json({ success: false, error: 'CONVERSATION_CLOSED' }, statut) })).toEqual(attendu);
  });

  /** Erreur réseau ≠ 401 (§ 7) : une panne ne peut JAMAIS être lue comme une place perdue. */
  it('distingue la panne du refus', async () => {
    expect((await rafraichis({ jeton: 'S', base, recuperer: async () => { throw new Error('tunnel'); } })).genre).toBe('panne');
  });
});

describe('GET /sync', () => {
  it('compose l’adresse que routes/sync/index.ts attend', () => {
    expect(urlDeSync({ base, depuis: '2026-09-01T12:00:00.000Z', scope: 'c1', seq: 4 })).toBe(
      'https://gate.test/api/v1/sync?since=2026-09-01T12%3A00%3A00.000Z&collections=messages&scope=c1&seq=4',
    );
  });

  it('lit la charge : ajoutés + modifiés, tombes, checkpoint, hasGap', () => {
    const delta = litLeDelta({
      success: true,
      data: {
        checkpoint: '2026-09-01T12:05:00.000Z',
        checkpointSeq: 9,
        collections: { messages: { added: [{ id: 'a' }], modified: [{ id: 'b' }], deleted: [{ id: 'd', conversationId: 'c1', deletedAt: 'x' }], truncated: true, nextCursor: 'n' } },
        hasMore: true,
        nextCursor: 'n',
        hasGap: true,
        gapAction: 'full_resync_required',
      },
    });
    expect(delta).toEqual({
      checkpoint: '2026-09-01T12:05:00.000Z',
      checkpointSeq: 9,
      messages: [{ id: 'a' }, { id: 'b' }],
      // La collection `conversations` (celle que `/chats` demande) est LUE par
      // le même lecteur : absente de la réponse, elle rend une liste vide — pas
      // `undefined`, que chaque appelant aurait eu à garder.
      conversations: [],
      supprimes: ['d'],
      hasGap: true,
      hasMore: true,
    });
    expect(litLeDelta({ success: false })).toBeNull();
  });
});
