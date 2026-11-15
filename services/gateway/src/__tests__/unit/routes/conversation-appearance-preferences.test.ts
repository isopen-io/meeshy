/**
 * `PUT /user-preferences/conversations/:id` porte `appearance` (#10631,
 * #10632, § 10.1) : la garde unique (Zod strict, possession, pièce jointe de
 * CETTE conversation et non protégée), l'écrivain unique (version
 * incrémentée, diffusion sur `user:<id>` seulement) et le wire de la liste
 * des conversations qui DÉCLARE la clé — sinon le sérialiseur la retire.
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import conversationPreferencesRoutes from '../../../routes/conversation-preferences';
import { conversationListResponseSchema } from '@meeshy/shared/types/api-schemas';
import { buildPackIndex } from '../../../services/packs/PackIndex';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { datamodelReel } from '../../security/prisma-relation-fields';

const USER = '507f1f77bcf86cd799439011';
const CONVERSATION = '507f1f77bcf86cd799439abc';
const OTHER_CONVERSATION = '507f1f77bcf86cd7994390ff';
const NOT_MINE = '507f1f77bcf86cd7994390aa';

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const ref = (seed: string, ext = 'webp') => ({ src: `${sha(seed).slice(0, 16)}.${ext}`, bytes: 10, sha256: sha(seed) });
const entry = (slug: string, over: Record<string, unknown> = {}) => ({
  slug, domain: 'wallpaper', origin: 'official', version: 1, order: 0, installedByDefault: false, removable: true, hidden: false,
  contractSchema: 1, cover: ref('a'), preview: null, contract: ref('c', 'json'), strings: { fr: ref('d', 'json') },
  downloadBytes: { story: 1, square: null }, names: { fr: { name: slug, description: slug } }, ...over,
});
const INDEX = buildPackIndex({
  registries: [[entry('essentiels', { origin: 'builtin' }), entry('prestige', { price: 40 })]],
  retained: [],
  contractItemKeys: () => ['aurore', 'monogramme'],
});

type Row = Record<string, unknown>;
type Attachment = { mimeType: string; isViewOnce: boolean; isBlurred: boolean; effectFlags: number; message: Row };
const JOINED_AT = new Date('2026-06-01T00:00:00Z');
let messageSeq = 0;
const photo = (over: Partial<Attachment> = {}, message: Row = {}): Attachment => ({
  mimeType: 'image/jpeg', isViewOnce: false, isBlurred: false, effectFlags: 0,
  message: {
    id: `507f1f77bcf86cd7994${String((messageSeq += 1)).padStart(5, '0')}`, createdAt: new Date('2026-07-01T00:00:00Z'),
    conversationId: CONVERSATION, deletedAt: null, expiresAt: null, ephemeralDuration: null, isViewOnce: false, isBlurred: false, effectFlags: 0, ...message,
  },
  ...over,
});
const PHOTO_OK = '507f1f77bcf86cd799439f01';
const PHOTO_ELSEWHERE = '507f1f77bcf86cd799439f02';
const PHOTO_VIEW_ONCE = '507f1f77bcf86cd799439f03';
const PHOTO_EPHEMERAL = '507f1f77bcf86cd799439f04';
const PHOTO_BLURRED = '507f1f77bcf86cd799439f05';
const PHOTO_VIDEO = '507f1f77bcf86cd799439f06';
const PHOTO_FLAGGED_VIEW_ONCE = '507f1f77bcf86cd799439f07';
const PHOTO_IN_FLAGGED_EPHEMERAL = '507f1f77bcf86cd799439f08';
const PHOTO_IN_TIMED_MESSAGE = '507f1f77bcf86cd799439f09';
const PHOTO_IN_FLAGGED_BLURRED = '507f1f77bcf86cd799439f0a';
const PHOTO_NOT_MINE = '507f1f77bcf86cd799439f0b';
const PHOTO_BEFORE_JOIN = '507f1f77bcf86cd799439f0c';
const PHOTO_DELETED_FOR_ME = '507f1f77bcf86cd799439f0d';
const PHOTO_BEFORE_CLEARED_HISTORY = '507f1f77bcf86cd799439f0e';
const PHOTO_DELETED_FOR_ALL = '507f1f77bcf86cd799439f0f';
const PHOTO_PURGED = '507f1f77bcf86cd799439f10';
const CLEARED_AT = new Date('2026-08-01T00:00:00Z');

const attachments: Record<string, Attachment> = {
  [PHOTO_OK]: photo(),
  [PHOTO_ELSEWHERE]: photo({}, { conversationId: OTHER_CONVERSATION }),
  [PHOTO_VIEW_ONCE]: photo({ isViewOnce: true }),
  [PHOTO_EPHEMERAL]: photo({}, { expiresAt: new Date('2030-01-01') }),
  [PHOTO_BLURRED]: photo({ isBlurred: true }),
  [PHOTO_VIDEO]: photo({ mimeType: 'video/mp4' }),
  [PHOTO_FLAGGED_VIEW_ONCE]: photo({ effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }),
  [PHOTO_IN_FLAGGED_EPHEMERAL]: photo({}, { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ }),
  [PHOTO_IN_TIMED_MESSAGE]: photo({}, { ephemeralDuration: 30 }),
  [PHOTO_IN_FLAGGED_BLURRED]: photo({}, { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }),
  [PHOTO_NOT_MINE]: photo({}, { conversationId: NOT_MINE }),
  [PHOTO_BEFORE_JOIN]: photo({}, { createdAt: new Date('2026-05-01T00:00:00Z') }),
  [PHOTO_DELETED_FOR_ME]: photo(),
  [PHOTO_BEFORE_CLEARED_HISTORY]: photo({}, { createdAt: new Date('2026-07-15T00:00:00Z') }),
  [PHOTO_DELETED_FOR_ALL]: photo({}, { deletedAt: new Date('2026-07-20T00:00:00Z') }),
  [PHOTO_PURGED]: photo({}, { viewOnceBurnedAt: new Date('2026-07-21T00:00:00Z') }),
};

function build(options: { owns?: readonly string[]; clearedHistory?: boolean } = {}) {
  const rows = new Map<string, Row>();
  const emits: { room: string; event: string; payload: any }[] = [];
  const key = (where: any) => `${where.userId_conversationId.userId}:${where.userId_conversationId.conversationId}`;
  const prisma = {
    participant: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.conversationId === NOT_MINE ? null : { id: 'p1', role: 'member', joinedAt: JOINED_AT, shareLinkId: null, historyVisibleFrom: null, permissions: { canViewHistory: false }, anonymousSession: null, user: { role: 'USER' } },
      ),
    },
    userMessageDeletion: { findMany: jest.fn(async () => [{ messageId: attachments[PHOTO_DELETED_FOR_ME].message.id }]) },
    userConversationCategory: { findFirst: jest.fn(async () => null) },
    userPackOwnership: { findMany: jest.fn(async () => (options.owns ?? []).map((packKey) => ({ packKey }))) },
    messageAttachment: { findUnique: jest.fn(async ({ where }: any) => attachments[where.id] ?? null) },
    userConversationPreferences: {
      findFirst: jest.fn(async () => (options.clearedHistory ? { clearHistoryBefore: CLEARED_AT } : null)),
      findUnique: jest.fn(async ({ where }: any) => rows.get(key(where)) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = key(where);
        const existing = rows.get(k);
        const next = existing
          ? { ...existing, ...update, version: (existing.version as number) + (update.version?.increment ?? 0) }
          : { id: `pref-${k}`, isPinned: false, isMuted: false, mentionsOnly: false, isArchived: false, tags: [], categoryId: null, orderInCategory: null, customName: null, reaction: null, readingMode: 'auto', clearHistoryBefore: null, appearance: null, ...create };
        rows.set(k, next);
        return { ...next, category: null };
      }),
    },
  };
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => emits.push({ room, event, payload }) }) };
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('socketIOHandler', { getManager: () => ({ io }) } as never);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: USER, role: 'USER' }, userId: USER };
  });
  return { app, emits, rows, prisma };
}

describe('PUT /user-preferences/conversations/:id — appearance', () => {
  let env: ReturnType<typeof build>;

  const boot = async (options: { owns?: readonly string[]; clearedHistory?: boolean } = {}) => {
    env = build(options);
    await env.app.register(conversationPreferencesRoutes, { index: INDEX });
    await env.app.ready();
  };
  const put = (appearance: unknown, conversationId = CONVERSATION) =>
    env.app.inject({ method: 'PUT', url: `/user-preferences/conversations/${conversationId}`, payload: { appearance } });
  const appearance = (background: unknown, over: Record<string, unknown> = {}) => ({ v: 1, background, accent: null, animate: true, ...over });

  beforeEach(() => boot());
  afterEach(() => env.app.close());

  it('enregistre un fond uni et un accent, incrémente la version et sert la valeur', async () => {
    const first = await put(appearance({ kind: 'solid', color: 'azur' }, { accent: 'corail' }));
    const second = await put(appearance({ kind: 'signature' }));

    expect(first.statusCode).toBe(200);
    expect(first.json().data.appearance).toMatchObject({ background: { kind: 'solid', color: 'azur' }, accent: 'corail' });
    expect(first.json().data.version).toBe(1);
    expect(second.json().data.version).toBe(2);
  });

  it('diffuse sur user:<id> SEULEMENT, avec l’apparence dans l’instantané', async () => {
    await put(appearance({ kind: 'solid', color: 'azur' }));

    expect(env.emits).toHaveLength(1);
    expect(env.emits[0].room).toBe(`user:${USER}`);
    expect(env.emits[0].payload.preferences.appearance).toMatchObject({ background: { kind: 'solid', color: 'azur' } });
  });

  it('null remet Signature : l’instantané diffusé porte appearance: null', async () => {
    await put(appearance({ kind: 'solid', color: 'azur' }));
    const reset = await put(null);

    expect(reset.statusCode).toBe(200);
    expect(reset.json().data.appearance).toBeNull();
    expect(env.emits[1].payload.preferences.appearance).toBeNull();
  });

  it('une écriture sans appearance ne l’écrase pas (ancien client)', async () => {
    await put(appearance({ kind: 'solid', color: 'azur' }));
    await env.app.inject({ method: 'PUT', url: `/user-preferences/conversations/${CONVERSATION}`, payload: { isPinned: true } });

    expect(env.rows.get(`${USER}:${CONVERSATION}`)?.appearance).toMatchObject({ background: { kind: 'solid', color: 'azur' } });
  });

  it.each([
    ['un kind inconnu', appearance({ kind: 'hologramme' })],
    ['un voile hors plage', appearance({ kind: 'photo', attachmentId: PHOTO_OK, veil: 0.9, blur: 4 })],
    ['un accent hors gamme', appearance({ kind: 'signature' }, { accent: 'fluo' })],
    ['un champ en trop', appearance({ kind: 'signature' }, { extra: 1 })],
  ])('refuse %s : 400 INVALID_APPEARANCE sans écriture', async (_label, body) => {
    const response = await put(body);

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_APPEARANCE');
    expect(env.rows.size).toBe(0);
  });

  describe('modèle de pack', () => {
    it('accepte un modèle d’un pack gratuit', async () => {
      expect((await put(appearance({ kind: 'design', pack: 'essentiels', design: 'aurore' }))).statusCode).toBe(200);
    });

    it('refuse un modèle d’un pack payant non possédé : 403 PACK_NOT_OWNED', async () => {
      const response = await put(appearance({ kind: 'design', pack: 'prestige', design: 'aurore' }));

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('PACK_NOT_OWNED');
      expect(env.rows.size).toBe(0);
    });

    it('accepte le même modèle une fois le pack possédé', async () => {
      await env.app.close();
      await boot({ owns: ['wallpaper.prestige'] });

      expect((await put(appearance({ kind: 'design', pack: 'prestige', design: 'aurore' }))).statusCode).toBe(200);
    });

    it('un pack inconnu et un modèle inconnu répondent 403 aussi (aucune confirmation d’existence)', async () => {
      expect((await put(appearance({ kind: 'design', pack: 'fantome', design: 'aurore' }))).statusCode).toBe(403);
      expect((await put(appearance({ kind: 'design', pack: 'essentiels', design: 'fantome' }))).statusCode).toBe(403);
    });
  });

  describe('photo de la conversation', () => {
    const photoBackground = (attachmentId: string) => appearance({ kind: 'photo', attachmentId, veil: 0.3, blur: 8 });

    it('accepte une image de CETTE conversation', async () => {
      expect((await put(photoBackground(PHOTO_OK))).statusCode).toBe(200);
    });

    it('ne demande à la base que des colonnes qui EXISTENT (viewOnceBurnedAt n’est que sur Message) — le 500 de la recette du 2026-10-15', async () => {
      const models = datamodelReel();
      expect(models.length).toBeGreaterThan(0);
      const fieldsOf = (name: string) => new Map((models.find((m) => m.name === name)?.fields ?? []).map((f) => [f.name, f]));
      const unknown = (model: string, select: Record<string, unknown>, path: string): string[] =>
        Object.entries(select).flatMap(([key, value]) => {
          const field = fieldsOf(model).get(key);
          if (!field) return [`${path}${key}`];
          return typeof value === 'object' && value !== null && 'select' in value
            ? unknown(field.type, (value as { select: Record<string, unknown> }).select, `${path}${key}.`)
            : [];
        });

      await put(photoBackground(PHOTO_OK));

      const call = env.prisma.messageAttachment.findUnique.mock.calls[0][0] as { select: Record<string, unknown> };
      expect(unknown('MessageAttachment', call.select, '')).toEqual([]);
    });

    it('refuse une image dont le contenu a été purgé (vue unique brûlée sur le message)', async () => {
      expect((await put(photoBackground(PHOTO_PURGED))).statusCode).toBe(404);
    });

    it.each([
      ['d’une autre conversation', PHOTO_ELSEWHERE],
      ['à vue unique', PHOTO_VIEW_ONCE],
      ['éphémère', PHOTO_EPHEMERAL],
      ['floutée', PHOTO_BLURRED],
      ['qui n’est pas une image', PHOTO_VIDEO],
      ['inexistante', '507f1f77bcf86cd799439fff'],
      ['à vue unique par son seul bitfield', PHOTO_FLAGGED_VIEW_ONCE],
      ['d’un message éphémère par son seul bitfield', PHOTO_IN_FLAGGED_EPHEMERAL],
      ['d’un message à durée éphémère pas encore lu', PHOTO_IN_TIMED_MESSAGE],
      ['d’un message flouté par son seul bitfield', PHOTO_IN_FLAGGED_BLURRED],
      ['d’un message supprimé pour tous', PHOTO_DELETED_FOR_ALL],
      ['postée AVANT mon arrivée dans une conversation qui ne m’ouvre pas l’historique', PHOTO_BEFORE_JOIN],
      ['d’un message que j’ai retiré de MA vue', PHOTO_DELETED_FOR_ME],
    ])('refuse une pièce %s : 404 ATTACHMENT_NOT_AVAILABLE, sans distinguer les causes', async (_label, id) => {
      const response = await put(photoBackground(id));

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ATTACHMENT_NOT_AVAILABLE');
      expect(env.rows.size).toBe(0);
    });

    it('refuse une pièce d’avant l’historique que j’ai vidé : le fond ne ressuscite pas ce que je ne lis plus', async () => {
      await env.app.close();
      await boot({ clearedHistory: true });

      const before = await put(photoBackground(PHOTO_BEFORE_CLEARED_HISTORY));

      expect(before.statusCode).toBe(404);
      expect(before.json().code).toBe('ATTACHMENT_NOT_AVAILABLE');
      expect(env.rows.size).toBe(0);
    });
  });

  it.each([
    ['une image de cette conversation', PHOTO_NOT_MINE],
    ['une pièce inexistante', '507f1f77bcf86cd799439fff'],
  ])('un non-membre reçoit 403 pour %s : la photo ne s’examine qu’après l’appartenance (aucun oracle)', async (_label, id) => {
    const response = await put(appearance({ kind: 'photo', attachmentId: id, veil: 0.3, blur: 8 }), NOT_MINE);

    expect(response.statusCode).toBe(403);
    expect(env.prisma.messageAttachment.findUnique).not.toHaveBeenCalled();
    expect(env.rows.size).toBe(0);
  });

  it('un non-membre reçoit la MÊME réponse quel que soit le fond demandé : l’appartenance précède toute validation (#10651)', async () => {
    const probes = [
      appearance({ kind: 'photo', attachmentId: PHOTO_NOT_MINE, veil: 0.3, blur: 8 }),
      appearance({ kind: 'photo', attachmentId: PHOTO_OK, veil: 0.3, blur: 8 }),
      appearance({ kind: 'photo', attachmentId: '507f1f77bcf86cd799439fff', veil: 0.3, blur: 8 }),
      appearance({ kind: 'photo', attachmentId: 'pas-un-identifiant', veil: 0.3, blur: 8 }),
      appearance({ kind: 'design', pack: 'prestige', design: 'aurore' }),
      appearance({ kind: 'design', pack: 'essentiels', design: 'aurore' }),
      appearance({ kind: 'signature' }),
    ];

    const seen: { status: number; body: unknown }[] = [];
    for (const probe of probes) {
      const response = await put(probe, NOT_MINE);
      seen.push({ status: response.statusCode, body: response.json() });
    }

    expect(seen).toEqual(probes.map(() => ({ status: 403, body: { success: false, error: 'Not a member of this conversation', message: 'Not a member of this conversation' } })));
    expect(env.prisma.messageAttachment.findUnique).not.toHaveBeenCalled();
    expect(env.prisma.userPackOwnership.findMany).not.toHaveBeenCalled();
    expect(env.rows.size).toBe(0);
    expect(env.emits).toHaveLength(0);
  });

  it('refuse un non-membre (403) sans rien écrire', async () => {
    const response = await put(appearance({ kind: 'signature' }), NOT_MINE);

    expect(response.statusCode).toBe(403);
    expect(env.rows.size).toBe(0);
    expect(env.emits).toHaveLength(0);
  });

  it('GET sert l’apparence enregistrée', async () => {
    await put(appearance({ kind: 'solid', color: 'azur' }));

    const response = await env.app.inject({ method: 'GET', url: `/user-preferences/conversations/${CONVERSATION}` });

    expect(response.json().data.appearance).toMatchObject({ background: { kind: 'solid', color: 'azur' } });
  });
});

describe('GET /conversations — le wire déclare userPreferences[].appearance', () => {
  const served = async (userPreferences: unknown) => {
    const app = Fastify({ logger: false });
    app.get('/conversations', { schema: { response: { 200: conversationListResponseSchema } } }, async () => ({
      success: true,
      data: [{ id: 'c1', type: 'direct', createdAt: new Date('2026-09-11T09:00:00Z').toISOString(), userPreferences }],
      pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
    }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/conversations' });
    await app.close();
    return res.json().data[0].userPreferences;
  };

  it('sert l’apparence du lecteur (le sérialiseur ne la retire pas)', async () => {
    const preferences = await served([{ isPinned: false, appearance: { v: 1, background: { kind: 'solid', color: 'azur' }, accent: null, animate: true } }]);

    expect(preferences[0].appearance).toEqual({ v: 1, background: { kind: 'solid', color: 'azur' }, accent: null, animate: true });
  });

  it('sert null quand le lecteur n’a rien choisi', async () => {
    expect((await served([{ isPinned: false, appearance: null }]))[0].appearance).toBeNull();
  });
});
