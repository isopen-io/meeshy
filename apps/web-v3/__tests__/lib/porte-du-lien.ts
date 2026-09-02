/**
 * LA PORTE DU LIEN, VUE DES TÉMOINS — ce que `__tests__/chat-lien.test.ts` et
 * `__tests__/chat-lien-detention.test.ts` partagent : une passerelle simulée
 * requête par requête, les charges RÉELLES des routes qu'elle imite (fichier
 * et ligne cités à chaque site), et la passerelle COUPLÉE dont les quatre
 * portes lisent le MÊME état du lien (leçon 422). Deux fichiers de témoins qui
 * recopieraient ces charges divergeraient au premier champ ajouté.
 */

import { documentDuChoix, SAISIE_VIDE, type EtatDuChoix } from '@/app/(public)/chat/[lien]/choix-vue';
import type { CleDeLien } from '@/lib/api/guest-session';
import type { ApercuDeJonction } from '@/lib/api/invite';

export const LIEN = 'mshy_lagos' as CleDeLien;
export const CONVERSATION = '68f2a81417a557e8ce4ddfbb';

export type Appel = {
  readonly methode: string;
  readonly chemin: string;
  readonly entetes: Record<string, string>;
  readonly corps: string;
  /** Les fichiers d'un corps multipart, par nom de champ. */
  readonly fichiers: readonly { readonly champ: string; readonly nom: string; readonly type: string }[];
};

export const passerelle = (parChemin: Readonly<Record<string, (appel: Appel) => Response>>, appels: Appel[] = []) => {
  const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
    const chemin = new URL(url).pathname;
    const appel: Appel = {
      methode: options.method ?? 'GET',
      chemin,
      entetes: Object.fromEntries(Object.entries((options.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
      corps: typeof options.body === 'string' ? options.body : '',
      fichiers:
        options.body instanceof FormData
          ? [...options.body.entries()].filter((e): e is [string, File] => e[1] instanceof File).map(([champ, f]) => ({ champ, nom: f.name, type: f.type }))
          : [],
    };
    appels.push(appel);
    const reponse = parChemin[chemin];
    if (reponse === undefined) throw new Error(`chemin non simulé : ${chemin}`);
    return reponse(appel);
  };
  return { recuperer, appels };
};

export const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

/** `sendError` étale `details` à la RACINE puis pose `success`, `error`, `message` (`utils/response.ts:83-88`). */
export const refus = (statut: number, code: string, message: string, details: Record<string, unknown> = {}): Response =>
  json({ ...details, success: false, error: code, message }, statut);

/** `sendBadRequest(reply, phrase)` : la phrase EST le champ `error` (`utils/response.ts:118-124`). */
export const mauvaiseRequete = (phrase: string): Response => refus(400, phrase, phrase);

export const apercu = (exigences: Partial<{ requireAccount: boolean; requireNickname: boolean; requireEmail: boolean; requireBirthday: boolean; allowedLanguages: readonly string[] }> = {}) => () =>
  json({
    success: true,
    data: {
      linkId: LIEN,
      name: 'Équipe Lagos',
      description: 'Le canal des opérations.',
      requireNickname: true,
      requireAccount: false,
      requireEmail: false,
      requireBirthday: false,
      allowedLanguages: [],
      ...exigences,
      creator: { id: 'u1', username: 'ibrahim-le-createur', email: 'i@example.com' },
      conversation: { id: CONVERSATION, title: 'Équipe Lagos', type: 'group' },
      stats: { totalParticipants: 12 },
    },
  });

export const APERCU = apercu();

/** `PATCH /guest-sessions/me` — le chemin que la route DOIT appeler (`link-admission.ts:775`), jamais l'adaptateur déprécié. */
export const BATTEMENT = '/api/v1/guest-sessions/me';
export const JONCTION = `/api/v1/links/${LIEN}/members`;

/** `GET /auth/me` — `magic-link.ts:79`, `requireAuth: true` : 200 pour le jeton que la passerelle sait lire, 401 `AUTH_FAILED` pour un jeton mort (`middleware/auth.ts:770-775`). */
export const MOI = '/api/v1/auth/me';
export const LECTEUR = () => json({ success: true, data: { id: 'u1', username: 'amina', firstName: 'Amina', displayName: 'Amina Diallo', systemLanguage: 'fr' } });
export const JETON_MORT = () => json({ error: 'Invalid JWT token', code: 'AUTH_FAILED' }, 401);

/** Les en-têtes d'une navigation qui est le GESTE du lecteur — barre d'adresse, favori, lien ouvert depuis une autre application (Fetch Metadata). */
export const NAVIGATION_DU_LECTEUR = { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } as const;
export const NAVIGATION_DE_MEESHY = { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } as const;
export const NAVIGATION_D_AILLEURS = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } as const;

export const BATTEMENT_VALIDE = () =>
  json({
    success: true,
    data: {
      participant: { id: 'p-tolu', username: 'tolu', displayName: 'Tolu', language: 'fr', canSendMessages: true, canSendFiles: false, canSendImages: false },
      conversation: { id: CONVERSATION, title: 'Équipe Lagos', type: 'group', allowViewHistory: true },
    },
  });

export const MESSAGES = () => json({ success: true, data: [], cursorPagination: { hasMore: false, nextCursor: null } });

/** UNE ligne lue — celle qui doit RESTER à l'écran quand le lien se ferme (état G, « contenu conservé »). */
export const MESSAGE_LU = { id: 'm1', conversationId: CONVERSATION, senderId: 'u2', content: 'On se cale à 15 h ?', originalLanguage: 'fr', createdAt: '2026-09-01T12:00:00.000Z', sender: { id: 'p-ibrahim', displayName: 'Ibrahim', type: 'user' }, translations: [] };
export const MESSAGES_LUS = () => json({ success: true, data: [MESSAGE_LU], cursorPagination: { hasMore: false, nextCursor: null } });
export const DETAIL = () => json({ success: true, data: { id: CONVERSATION, title: 'Équipe Lagos', memberCount: 12, participants: [] } });

export const contexte = { params: Promise.resolve({ lien: 'lagos-q1' }) };

export const requete = (entetes: Record<string, string> = {}, methode = 'GET', corps?: URLSearchParams): Request =>
  new Request('https://meeshy.me/chat/lagos-q1', {
    method: methode,
    headers: { ...entetes, ...(corps === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded' }) },
    ...(corps === undefined ? {} : { body: corps }),
  });

export const jonctionDe = (pseudo: string, champs: Record<string, string> = {}): Request =>
  requete({}, 'POST', new URLSearchParams({ pseudo, langue: 'fr', ...champs }));

/** La route lit `fetch` global : on le remplace le temps d'un témoin, jamais au-delà. */
export const avecPasserelle = async <T,>(parChemin: Readonly<Record<string, (appel: Appel) => Response>>, action: (appels: Appel[]) => Promise<T>): Promise<T> => {
  const { recuperer, appels } = passerelle(parChemin);
  const original = globalThis.fetch;
  globalThis.fetch = recuperer as typeof fetch;
  try {
    return await action(appels);
  } finally {
    globalThis.fetch = original;
  }
};

export const APERCU_DE_TEST: ApercuDeJonction = {
  lien: LIEN,
  nom: 'Équipe Lagos',
  description: 'Le canal.',
  conversationId: CONVERSATION,
  requireNickname: true,
  requireAccount: false,
  requireEmail: false,
  requireBirthday: false,
  languesAutorisees: [],
  participants: 12,
};

export const document = (attributs: Partial<Omit<EtatDuChoix, 'apercu' | 'clos'>> & { readonly apercu?: ApercuDeJonction } = {}): string =>
  documentDuChoix({
    segment: 'lagos-q1',
    apercu: APERCU_DE_TEST,
    langueProposee: 'fr',
    saisie: SAISIE_VIDE,
    refus: null,
    clos: null,
    maintenant: 0,
    ...attributs,
  });

/**
 * UNE PASSERELLE COUPLÉE : l'aperçu, la reconnaissance, le battement et la
 * liste lisent le MÊME état du lien — comme les quatre routes réelles lisent
 * la même ligne `ConversationShareLink` (leçon 422 : un bouchon copie une LOI,
 * pas une réponse). Un témoin qui réglait l'aperçu à 200 et le battement à 410
 * `LINK_DEACTIVATED` certifiait un chemin que la passerelle ne produit jamais :
 * les deux lisent `isActive` et `expiresAt` (`routes/anonymous.ts:602-606`,
 * `link-admission.ts:499-500`), et le premier refusait AVANT que le second ne
 * soit consulté.
 */
export type EtatDuLien = {
  readonly actif: boolean;
  readonly expireA: string | null;
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly conversationClose: boolean;
  /** `Participant.isActive` de la place que `S1` désigne. */
  readonly placeActive: boolean;
  /** La place de `S1` est-elle sur CE lien (`anonymousParticipant.shareLinkId === shareLink.id`, `retrieval.ts:196`) ? */
  readonly placeDuLien: boolean;
};

export const lienDeTest = (sur: Partial<EtatDuLien> = {}): EtatDuLien => ({
  actif: true,
  expireA: null,
  maxUses: null,
  currentUses: 12,
  conversationClose: false,
  placeActive: true,
  placeDuLien: true,
  ...sur,
});

export const RECONNAISSANCE = '/api/v1/links/lagos-q1';

export const passerelleCouplee = (etat: EtatDuLien): Readonly<Record<string, (appel: Appel) => Response>> => {
  const echu = etat.expireA !== null && Date.parse(etat.expireA) < Date.now();
  const plein = etat.maxUses !== null && etat.currentUses >= etat.maxUses;
  return {
    // `routes/anonymous.ts:602-613` — isActive, expiresAt, maxUses, dans cet ordre.
    '/api/v1/anonymous/link/lagos-q1': () => {
      if (!etat.actif) return refus(410, 'LINK_INACTIVE', "Ce lien n'est plus actif");
      if (echu) return refus(410, 'LINK_EXPIRED', 'Ce lien a expire');
      if (plein) return refus(410, 'LINK_MAX_USES', "Ce lien a atteint sa limite d'utilisation");
      return APERCU();
    },
    // `routes/links/retrieval.ts:40` — une place révoquée est refusée par le middleware (410), une
    // session d'un autre lien par `hasAccess` (403) ; l'état du lien n'est pas regardé pour qui y tient.
    // Le 200 NOMME l'occupant de la place (`currentUser`, `:248-262` : `id` = `Participant.id`,
    // `username` = le pseudo de la session, `displayName` absent) — la seule porte qui le fasse
    // quand le battement refuse.
    [RECONNAISSANCE]: (appel) => {
      if (appel.entetes['x-session-token'] !== 'S1') return refus(403, 'Accès non autorisé à ce lien', 'Accès non autorisé à ce lien');
      if (!etat.placeActive) return refus(410, 'GUEST_ACCESS_REVOKED', "L'acces de cet invite a ete retire");
      if (!etat.placeDuLien) return refus(403, 'Accès non autorisé à ce lien', 'Accès non autorisé à ce lien');
      return json({
        success: true,
        data: {
          link: { id: 'l1', linkId: LIEN, name: 'Équipe Lagos', isActive: etat.actif, expiresAt: etat.expireA },
          conversation: { id: CONVERSATION, title: 'Équipe Lagos', type: 'group' },
          userType: 'anonymous',
          // `username` = `profile.username` = le pseudo LIBRE retenu au join, le même que `displayName` (`link-admission.ts:248-287`).
          currentUser: { id: 'p-tolu', username: 'Tolu', firstName: 'Tolu', lastName: '', language: 'fr', isMeeshyer: false },
          messages: [],
        },
      });
    },
    // `refreshGuestSession` (`link-admission.ts:484-509`) — la place, puis isActive, expiresAt, la conversation close.
    [BATTEMENT]: () => {
      if (!etat.placeActive) return refus(401, 'UNAUTHORIZED', 'Session invalide ou expirée');
      if (!etat.actif) return refus(410, 'LINK_DEACTIVATED', 'Le lien a été désactivé');
      if (echu) return refus(410, 'LINK_EXPIRED', 'Le lien a expiré');
      if (etat.conversationClose) return refus(410, 'CONVERSATION_CLOSED', 'Cette conversation est terminée');
      return BATTEMENT_VALIDE();
    },
    [`/api/v1/conversations/${CONVERSATION}`]: DETAIL,
    // `messages-list.ts:270-278` — le LIEN du participant ferme la lecture : échu, ou plein (`>=`, le dernier admis compris).
    // Elle ne lit PAS `isActive` (gagé : `messages-routes.test.ts:854-885`) : à une place active d'un lien FERMÉ, la liste est servie.
    [`/api/v1/conversations/${CONVERSATION}/messages`]: () => {
      if (echu) return refus(403, 'This share link has expired', 'This share link has expired', { code: 'SHARE_LINK_EXPIRED' });
      if (plein) return refus(403, 'This share link has reached its usage limit', 'This share link has reached its usage limit', { code: 'SHARE_LINK_MAX_USES' });
      return MESSAGES_LUS();
    },
    [`/api/v1/conversations/${CONVERSATION}/receipts`]: () => json({ success: true, data: {} }),
    [JONCTION]: () =>
      json({ success: true, data: { sessionToken: 'S2', conversationId: CONVERSATION, participantId: 'p-tolu-2', entry: { outcome: 'new', canViewHistory: true, rights: { canSendMessages: true } } } }, 201),
  };
};

export const chemins = (appels: readonly Appel[]): readonly string[] => appels.map((a) => `${a.methode} ${a.chemin}`);
