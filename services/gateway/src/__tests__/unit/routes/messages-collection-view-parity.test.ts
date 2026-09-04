/**
 * #4340 critère 1 — `GET /conversations/:id/messages?view=` EST la collection.
 *
 * ## Ce que ce fichier mesure, et pourquoi il ne mesure pas `statusCode`
 *
 * Trois adresses lisent aujourd'hui la MÊME collection de messages :
 * `GET .../messages` (chronologie et fil de réponses), `GET .../messages/search`
 * et `GET .../pinned-messages`. Le lot #4340 en fait UNE collection paramétrée
 * par `?view=timeline|thread|pinned|search`, sans retirer aucune adresse.
 *
 * Un paramètre qui SÉLECTIONNE n'a de valeur que si ce qu'il sélectionne porte
 * les mêmes GARDES que le reste. Les trois routes dédiées n'en portaient pas
 * les mêmes — la mesure du 2026-09-02 :
 *
 * | garde | `…/messages` | `…/messages/search` | `…/pinned-messages` |
 * |---|:--:|:--:|:--:|
 * | plancher d'historique | oui | oui | oui |
 * | masquage personnel | oui | oui | oui |
 * | `deletedAt: null` | oui | oui | oui |
 * | appartenance | oui | oui | oui |
 * | **lien de partage ÉCHU → 403** | **oui** | **NON** | **NON** |
 *
 * La quatrième ligne est l'absence que ce lot ne veut pas propager : unifier
 * sans la voir aurait rendu `view=pinned` lisible par un invité dont le lien
 * est mort, ou aurait retiré la garde du chemin nominal. Le chemin unifié la
 * porte pour les QUATRE vues, et c'est le tableau ci-dessous qui le dit.
 *
 * ## La forme des témoins
 *
 * Le double Prisma de ce fichier ÉVALUE le `where` reçu contre un jeu de quatre
 * messages, au lieu de rendre une liste fixe. C'est ce qui permet à chaque
 * témoin d'asserter sur ce que la RÉPONSE dit — « ce message n'est pas dans
 * `data` » — plutôt que sur la forme de l'appel Prisma ou sur un `statusCode`.
 * Un témoin qui vérifierait `prisma.message.findMany` a reçu `createdAt.gte`
 * passerait au vert sur un chemin qui construit la clause et ne s'en sert pas.
 *
 * Les quatre messages du jeu appartiennent aux QUATRE vues à la fois (chacun
 * est épinglé, répond au même parent, et contient le mot cherché) : c'est ce
 * qui rend le tableau garde × vue lisible d'un seul jeu de données.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockVerdict = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  verdictAccesConversation: (...args: any[]) => mockVerdict(...args),
  canAccessConversation: async (...args: any[]) => (await mockVerdict(...args)).genre === 'ok',
}));

jest.mock('../../../services/MentionService', () => ({ resolveMentionedUsers: jest.fn().mockResolvedValue([]) }));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/TrackingLinkService', () => ({ TrackingLinkService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/attachments', () => ({ AttachmentService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn().mockResolvedValue(new Map()) }),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

// ─── Le jeu de messages ───────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439301';
const USER_ID = '507f1f77bcf86cd799439322';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439333';
const SENDER_USER_ID = '507f1f77bcf86cd799439344';
const PARENT_ID = '507f1f77bcf86cd799439350';
const SHARE_LINK_ID = '507f1f77bcf86cd799439360';

/** Les quatre messages : trois qu'une garde doit retirer, un qui reste. */
const M_OK = '507f1f77bcf86cd799439401';
const M_SOUS_PLANCHER = '507f1f77bcf86cd799439402';
const M_MASQUE = '507f1f77bcf86cd799439403';
const M_SUPPRIME = '507f1f77bcf86cd799439404';
/** Le témoin de la SÉLECTION : ni épinglé, ni réponse, ni porteur du mot. */
const M_ORDINAIRE = '507f1f77bcf86cd799439405';

const PLANCHER = new Date('2026-08-15T00:00:00.000Z');

const senderParticipant = {
  id: SENDER_PARTICIPANT_ID,
  userId: SENDER_USER_ID,
  displayName: 'Alice',
  avatar: null,
  type: 'member',
  isOnline: false,
  lastActiveAt: null,
  user: {
    id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null,
    isOnline: false, lastActiveAt: null, firstName: null, lastName: null,
  },
};

type Fixture = Record<string, unknown>;

/**
 * Chaque ligne est épinglée, répond au MÊME parent et contient « cible » : elle
 * appartient donc aux quatre vues à la fois. Seules varient les colonnes que
 * les gardes lisent (`createdAt`, `deletedAt`) et l'identité, dont le masquage
 * personnel se sert.
 */
function ligne(
  id: string,
  createdAt: Date,
  deletedAt: Date | null,
  hors: { readonly ordinaire?: boolean } = {},
): Fixture {
  return {
    id,
    clientMessageId: null,
    conversationId: CONV_ID,
    senderId: SENDER_PARTICIPANT_ID,
    content: hors.ordinaire ? `banal ${id}` : `cible ${id}`,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'api',
    isEdited: false,
    editedAt: null,
    deletedAt,
    replyToId: hors.ordinaire ? null : PARENT_ID,
    storyReplyToId: null,
    forwardedFromId: null,
    forwardedFromConversationId: null,
    isViewOnce: false,
    maxViewOnceCount: null,
    viewOnceCount: 0,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    pinnedAt: hors.ordinaire ? null : new Date('2026-08-20T12:00:00.000Z'),
    pinnedBy: SENDER_PARTICIPANT_ID,
    reactionSummary: {},
    reactionCount: 0,
    isEncrypted: false,
    encryptionMode: null,
    translations: { en: { text: 'target', targetLanguage: 'en' } },
    // Une valeur RÉELLE, pas `null` : c'est la seule façon de comparer ce que
    // les deux surfaces servent de ce champ. Sur `null`, elles divergent — et
    // la divergence est nommée par son propre témoin plus bas.
    metadata: { note: 'porte' },
    validatedMentions: [],
    createdAt,
    updatedAt: createdAt,
    sender: senderParticipant,
    replyTo: null,
    attachments: [],
    _count: { reactions: 0, replies: 0 },
  };
}

const JEU: readonly Fixture[] = [
  ligne(M_OK, new Date('2026-08-20T10:00:00.000Z'), null),
  ligne(M_SOUS_PLANCHER, new Date('2026-08-10T10:00:00.000Z'), null),
  ligne(M_MASQUE, new Date('2026-08-21T10:00:00.000Z'), null),
  ligne(M_SUPPRIME, new Date('2026-08-22T10:00:00.000Z'), new Date('2026-08-23T10:00:00.000Z')),
  ligne(M_ORDINAIRE, new Date('2026-08-19T10:00:00.000Z'), null, { ordinaire: true }),
];

// ─── Le double Prisma qui ÉVALUE le `where` ───────────────────────────────────

function asDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'string') { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  return null;
}

function champCorrespond(valeur: unknown, contrainte: unknown): boolean {
  if (contrainte === null) return valeur === null || valeur === undefined;
  if (contrainte instanceof Date) return asDate(valeur)?.getTime() === contrainte.getTime();
  if (typeof contrainte !== 'object') return valeur === contrainte;

  const c = contrainte as Record<string, unknown>;
  if ('in' in c) return (c.in as unknown[]).includes(valeur);
  if ('notIn' in c) return !(c.notIn as unknown[]).includes(valeur);
  if ('contains' in c) {
    const attendu = String(c.contains).toLowerCase();
    return String(valeur ?? '').toLowerCase().includes(attendu);
  }
  if ('not' in c) {
    const not = c.not as Record<string, unknown> | null;
    if (not === null) return valeur !== null && valeur !== undefined;
    if (not && 'equals' in not && not.equals === null) return valeur !== null && valeur !== undefined;
    return !champCorrespond(valeur, not);
  }

  const bornes = ['gte', 'gt', 'lt', 'lte'] as const;
  if (bornes.some((b) => b in c)) {
    const d = asDate(valeur);
    if (!d) return false;
    const gte = asDate(c.gte); if (gte && d.getTime() < gte.getTime()) return false;
    const gt = asDate(c.gt); if (gt && d.getTime() <= gt.getTime()) return false;
    const lt = asDate(c.lt); if (lt && d.getTime() >= lt.getTime()) return false;
    const lte = asDate(c.lte); if (lte && d.getTime() > lte.getTime()) return false;
    return true;
  }
  return true;
}

function correspond(row: Fixture, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [cle, contrainte] of Object.entries(where)) {
    if (cle === 'AND') { if (!(contrainte as any[]).every((w) => correspond(row, w))) return false; continue; }
    if (cle === 'OR') { if (!(contrainte as any[]).some((w) => correspond(row, w))) return false; continue; }
    if (cle === 'NOT') { if (correspond(row, contrainte as Record<string, unknown>)) return false; continue; }
    if (!champCorrespond(row[cle], contrainte)) return false;
  }
  return true;
}

/** Projette comme Prisma : seuls les champs du `select` sortent. */
function projette(row: any, select: any): any {
  if (!select) return row;
  const out: any = {};
  for (const [k, v] of Object.entries(select)) {
    if (!v) continue;
    const val = row[k];
    if (val === undefined) continue;
    if (v === true) { out[k] = val; continue; }
    const sub = (v as any).select;
    if (!sub) { out[k] = val; continue; }
    out[k] = Array.isArray(val) ? val.map((r: any) => projette(r, sub)) : (val ? projette(val, sub) : val);
  }
  return out;
}

type Options = {
  readonly floorAt?: Date | null;
  readonly hidden?: readonly string[];
  readonly shareLink?: { readonly allowViewHistory: boolean; readonly expiresAt: Date | null } | null;
  /** Jeu de lignes alternatif, pour les témoins qui font varier une colonne. */
  readonly jeu?: readonly Fixture[];
};

function buildApp(options: Options = {}): FastifyInstance {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const lignes0 = options.jeu ?? JEU;
  const findMany = jest.fn(async (args: any) => {
    const lignes = lignes0.filter((r) => correspond(r, args?.where));
    const champ = args?.orderBy?.pinnedAt ? 'pinnedAt' : 'createdAt';
    const sens = (args?.orderBy?.[champ] ?? 'desc') === 'asc' ? 1 : -1;
    const triees = [...lignes].sort((a, b) => sens * ((a[champ] as Date).getTime() - (b[champ] as Date).getTime()));
    const depuis = triees.slice(args?.skip ?? 0);
    const page = args?.take ? depuis.slice(0, args.take) : depuis;
    return page.map((r) => projette(r, args?.select));
  });

  const prisma: any = {
    participant: {
      findFirst: jest.fn(async () => ({
        id: 'reader-part-id',
        role: 'member',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        shareLinkId: options.shareLink ? SHARE_LINK_ID : null,
        historyVisibleFrom: options.floorAt ?? null,
        permissions: null,
        anonymousSession: null,
        user: { role: 'USER' },
      })),
    },
    conversationShareLink: {
      findFirst: jest.fn(async () => options.shareLink ?? null),
      findUnique: jest.fn(async () => options.shareLink ?? null),
    },
    userConversationPreferences: { findFirst: jest.fn(async () => null) },
    userMessageDeletion: {
      findMany: jest.fn(async () => (options.hidden ?? []).map((messageId) => ({ messageId }))),
    },
    message: {
      findMany,
      count: jest.fn(async (args: any) => lignes0.filter((r) => correspond(r, args?.where)).length),
      findFirst: jest.fn(async (args: any) => {
        const trouve = lignes0.find((r) => correspond(r, args?.where));
        return trouve ? projette(trouve, args?.select) : null;
      }),
    },
    user: {
      findFirst: jest.fn(async () => ({
        systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      })),
    },
    attachmentStatusEntry: { findMany: jest.fn(async () => []) },
  };

  const auth = async (req: any) => {
    req.authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false,
      userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, auth, auth);
  return app;
}

async function lire(url: string, options: Options = {}): Promise<{ statut: number; corps: any }> {
  const app = buildApp(options);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url });
    return { statut: res.statusCode, corps: JSON.parse(res.payload) };
  } finally {
    await app.close();
  }
}

const ids = (corps: any): string[] => (corps.data ?? []).map((m: any) => m.id);

/** Les quatre vues de la collection unique, avec l'URL qui les demande. */
/**
 * « La vue rend ce que la route dédiée rendait » se vérifie en SOUS-ENSEMBLE, à
 * toute profondeur : chaque FEUILLE servie par la route dédiée doit être servie
 * à l'identique par la vue. L'égalité stricte serait la mauvaise assertion —
 * la collection unifiée sert DAVANTAGE (les drapeaux de protection du message,
 * le `type` de l'expéditeur), et c'est le but du lot.
 */
function porteAuMoins(servi: any, attendu: any, chemin: string): void {
  if (attendu !== null && typeof attendu === 'object' && !Array.isArray(attendu)) {
    for (const [cle, valeur] of Object.entries(attendu)) porteAuMoins(servi?.[cle], valeur, `${chemin}.${cle}`);
    return;
  }
  expect({ chemin, valeur: servi }).toEqual({ chemin, valeur: attendu });
}

const VUES: ReadonlyArray<readonly [string, string]> = [
  ['timeline', `/conversations/${CONV_ID}/messages?view=timeline`],
  ['thread', `/conversations/${CONV_ID}/messages?view=thread&parentId=${PARENT_ID}`],
  ['pinned', `/conversations/${CONV_ID}/messages?view=pinned`],
  ['search', `/conversations/${CONV_ID}/messages?view=search&q=cible`],
];

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockVerdict.mockResolvedValue({ genre: 'ok' });
});

describe('#4340 — `?view=` sélectionne bien la sous-collection annoncée', () => {
  it('view=pinned ne rend que des messages épinglés (et le dit dans data)', async () => {
    const { corps } = await lire(`/conversations/${CONV_ID}/messages?view=pinned`);
    expect(ids(corps)).toContain(M_OK);
    expect(ids(corps)).not.toContain(M_ORDINAIRE);
    for (const m of corps.data) expect(m.pinnedAt).not.toBeNull();
  });

  it('view=thread ne rend que les réponses du parent demandé', async () => {
    const { corps } = await lire(`/conversations/${CONV_ID}/messages?view=thread&parentId=${PARENT_ID}`);
    expect(ids(corps)).toContain(M_OK);
    expect(ids(corps)).not.toContain(M_ORDINAIRE);
    for (const m of corps.data) expect(m.replyToId).toBe(PARENT_ID);
  });

  it("view=search ne rend que les messages qui portent le mot cherché", async () => {
    const { corps } = await lire(`/conversations/${CONV_ID}/messages?view=search&q=cible`);
    expect(ids(corps)).toContain(M_OK);
    expect(ids(corps)).not.toContain(M_ORDINAIRE);
  });

  it('view=search sans `q` refuse, et dit pourquoi', async () => {
    const { corps } = await lire(`/conversations/${CONV_ID}/messages?view=search`);
    expect(corps.success).toBe(false);
    expect(String(corps.error)).toMatch(/\bq\b/i);
  });

  it('view=thread sans `parentId` refuse, et dit pourquoi', async () => {
    const { corps } = await lire(`/conversations/${CONV_ID}/messages?view=thread`);
    expect(corps.success).toBe(false);
    expect(String(corps.error)).toMatch(/parentId/i);
  });

  it("`replyToId` sur une vue qui n'est pas le fil refuse, plutôt que de perdre le filtre", async () => {
    const { corps } = await lire(`/conversations/${CONV_ID}/messages?view=pinned&replyToId=${PARENT_ID}`);
    expect(corps.success).toBe(false);
    expect(String(corps.error)).toMatch(/replyToId/);
  });

  it('une vue inconnue refuse plutôt que de servir la chronologie en silence', async () => {
    const { corps } = await lire(`/conversations/${CONV_ID}/messages?view=inventee`);
    expect(corps.success).toBe(false);
  });
});

describe('#4340 critère 4 — `?view=thread&parentId=` et `?replyToId=` rendent le MÊME corps', () => {
  it('les deux moyens servent le même fil, champ pour champ', async () => {
    const parVue = await lire(`/conversations/${CONV_ID}/messages?view=thread&parentId=${PARENT_ID}`);
    const parFiltre = await lire(`/conversations/${CONV_ID}/messages?replyToId=${PARENT_ID}`);
    expect(parVue.corps).toEqual(parFiltre.corps);
  });
});

describe('#4340 critère 2 — la TABLE des gardes × des quatre vues', () => {
  describe.each(VUES)('vue %s', (_nom, url) => {
    it("ne rend pas un message d'AVANT le plancher d'historique du lecteur", async () => {
      const { corps } = await lire(url, { floorAt: PLANCHER });
      expect(ids(corps)).not.toContain(M_SOUS_PLANCHER);
      expect(ids(corps)).toContain(M_OK);
    });

    it('ne rend pas un message que le lecteur a retiré de sa propre vue', async () => {
      const { corps } = await lire(url, { hidden: [M_MASQUE] });
      expect(ids(corps)).not.toContain(M_MASQUE);
      expect(ids(corps)).toContain(M_OK);
    });

    it('ne rend pas un message supprimé pour tout le monde', async () => {
      const { corps } = await lire(url);
      expect(ids(corps)).not.toContain(M_SUPPRIME);
      expect(ids(corps)).toContain(M_OK);
    });

    it("refuse le lecteur dont le lien de partage est ÉCHU, et le NOMME", async () => {
      const { corps } = await lire(url, {
        shareLink: { allowViewHistory: true, expiresAt: new Date('2020-01-01T00:00:00.000Z') },
      });
      expect(corps.success).toBe(false);
      expect(corps.code).toBe('SHARE_LINK_EXPIRED');
      expect(corps.data).toBeUndefined();
    });

    it("refuse un non-membre en le nommant, sans rien servir", async () => {
      mockVerdict.mockResolvedValue({ genre: 'non-membre' });
      const { corps } = await lire(url);
      expect(corps.success).toBe(false);
      expect(corps.code).toBe('CONVERSATION_ACCESS_DENIED');
      expect(corps.data).toBeUndefined();
    });

    it("refuse une session absente en la nommant, sans rien servir", async () => {
      mockVerdict.mockResolvedValue({ genre: 'sans-session' });
      const { corps } = await lire(url);
      expect(corps.success).toBe(false);
      expect(corps.code).toBe('UNAUTHORIZED');
      expect(corps.data).toBeUndefined();
    });

    it("n'accepte pas un curseur `before` emprunté à une AUTRE conversation", async () => {
      const { corps } = await lire(`${url}&before=507f1f77bcf86cd7994399ff`);
      expect(ids(corps)).toContain(M_OK);
    });
  });
});

describe('#4340 critère 1 — la vue rend ce que la route dédiée rendait', () => {
  it('view=pinned porte tous les champs de `GET .../pinned-messages`, aux mêmes valeurs', async () => {
    const vue = await lire(`/conversations/${CONV_ID}/messages?view=pinned`);
    const dediee = await lire(`/conversations/${CONV_ID}/pinned-messages`);

    const parId = new Map<string, any>((vue.corps.data ?? []).map((m: any) => [m.id, m]));
    expect(dediee.corps.data.length).toBeGreaterThan(0);
    for (const attendu of dediee.corps.data) {
      const servi = parId.get(attendu.id);
      expect(servi).toBeDefined();
      for (const [champ, valeur] of Object.entries(attendu)) {
        // `reactionCount` est le SEUL écart de VALEUR, et il est à l'avantage
        // de la vue : le `select` de la route dédiée ne demande pas `_count`,
        // donc son 0 est le `default` du schéma partagé, jamais un comptage.
        if (champ === 'reactionCount') continue;
        porteAuMoins(servi[champ], valeur, champ);
      }
    }
  });

  it('view=search porte tous les champs de `GET .../messages/search`, aux mêmes valeurs', async () => {
    const vue = await lire(`/conversations/${CONV_ID}/messages?view=search&q=cible`);
    const dediee = await lire(`/conversations/${CONV_ID}/messages/search?q=cible`);

    const parId = new Map<string, any>((vue.corps.data ?? []).map((m: any) => [m.id, m]));
    expect(dediee.corps.data.length).toBeGreaterThan(0);
    for (const attendu of dediee.corps.data) {
      const servi = parId.get(attendu.id);
      expect(servi).toBeDefined();
      for (const [champ, valeur] of Object.entries(attendu)) {
        if (champ === 'reactionCount') continue;
        porteAuMoins(servi[champ], valeur, champ);
      }
    }
  });

  it("un `metadata` ABSENT est le seul écart de nullité, et il est dans le sens de l'omission", async () => {
    // `GET .../messages/search` étale la ligne Prisma, donc sert `metadata: null` ;
    // `GET .../messages` — pour TOUS ses appelants depuis toujours — le
    // normalise en `undefined`, que fast-json-stringify omet. Aligner la vue
    // sur la route dédiée changerait la forme de fil de la CHRONOLOGIE, qui
    // est la surface la plus appelée du service : l'écart est nommé, pas
    // corrigé dans ce lot.
    const sansMetadata = JEU.map((r) => ({ ...r, metadata: null }));
    const vue = await lire(`/conversations/${CONV_ID}/messages?view=search&q=cible`, { jeu: sansMetadata });
    const dediee = await lire(`/conversations/${CONV_ID}/messages/search?q=cible`, { jeu: sansMetadata });
    expect(dediee.corps.data[0]).toHaveProperty('metadata', null);
    expect(vue.corps.data[0].metadata).toBeUndefined();
  });

  it('la vue sert DAVANTAGE que la route dédiée, mais les deux servent les drapeaux de protection (#4885)', async () => {
    const vue = await lire(`/conversations/${CONV_ID}/messages?view=search&q=cible`);
    const dediee = await lire(`/conversations/${CONV_ID}/messages/search?q=cible`);
    const champsVue = Object.keys(vue.corps.data[0]);
    const champsDediee = Object.keys(dediee.corps.data[0]);
    // #4885 — la recherche DÉDIÉE sert désormais les drapeaux de PROTECTION du
    // message elle aussi (source unique avec la vue : `MESSAGE_PROTECTION_SELECT`
    // / `mapMessageProtectionFields`, `messages-list-query.ts`). Avant ce
    // correctif, un message à vue unique trouvé par la route dédiée arrivait
    // sans le dire, et restait donc FORWARDABLE.
    expect(champsDediee).toContain('isViewOnce');
    expect(champsDediee).toContain('isBlurred');
    expect(champsDediee).toContain('expiresAt');
    expect(champsVue).toContain('isViewOnce');
    expect(champsVue).toContain('isBlurred');
    expect(champsVue).toContain('expiresAt');
    // La vue reste plus riche : attachments, isEncrypted, pinnedAt, etc. —
    // que la route dédiée de recherche ne sélectionne toujours pas.
    expect(champsVue.length).toBeGreaterThan(champsDediee.length);
  });

  it('sert la VALEUR réelle des drapeaux, pas seulement leur présence — un message à vue unique reste `isViewOnce: true` (#4885)', async () => {
    // Le témoin ci-dessus ne prouve que la présence de la clé — un `undefined`
    // aurait aussi bien traversé `toContain`. Le témoin décisif porte sur la
    // CONSÉQUENCE : le garde de transfert (`BubbleMessageNormalView.tsx`,
    // `!message.isViewOnce`) doit lire `true`, pas une clé vidée.
    const protege = JEU.map((r) =>
      r.id === M_OK ? { ...r, isViewOnce: true, isBlurred: true, effectFlags: 5 } : r
    );
    const dediee = await lire(`/conversations/${CONV_ID}/messages/search?q=cible`, { jeu: protege });
    const servi = dediee.corps.data.find((m: any) => m.id === M_OK);
    expect(servi.isViewOnce).toBe(true);
    expect(servi.isBlurred).toBe(true);
    expect(servi.effectFlags).toBe(5);
  });
});

describe('#4340 critère 3 — aucune route retirée, aucune route changée', () => {
  it('`GET .../messages/search` répond toujours, avec son enveloppe historique', async () => {
    const { statut, corps } = await lire(`/conversations/${CONV_ID}/messages/search?q=cible`);
    expect(statut).toBe(200);
    expect(Object.keys(corps)).toEqual(['success', 'data', 'cursorPagination']);
  });

  it('`GET .../pinned-messages` répond toujours, avec son enveloppe historique', async () => {
    const { statut, corps } = await lire(`/conversations/${CONV_ID}/pinned-messages`);
    expect(statut).toBe(200);
    expect(Object.keys(corps)).toEqual(['success', 'data', 'pagination']);
  });

  it('`GET .../messages` sans `view` sert la chronologie, inchangée', async () => {
    const { corps } = await lire(`/conversations/${CONV_ID}/messages`);
    expect(ids(corps).sort()).toEqual([M_OK, M_SOUS_PLANCHER, M_MASQUE, M_ORDINAIRE].sort());
    expect(Object.keys(corps)).toEqual(['success', 'data', 'pagination', 'cursorPagination', 'meta']);
  });
});
