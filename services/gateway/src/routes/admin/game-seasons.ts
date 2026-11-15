/**
 * L'ADMIN DU CALENDRIER DES SAISONS (#10016, décision du porteur du 2026-10-11).
 *
 *   GET  /admin/game/seasons                         le calendrier : passées, en cours, à venir, en pause
 *   PUT  /admin/game/seasons/:number                 programmer, décaler, mettre en pause une saison FUTURE
 *   POST /admin/game/seasons/:number/proposals       demander une proposition à l'IA (services/agent)
 *   GET  /admin/game/seasons/proposals               les propositions (en attente par défaut)
 *   POST /admin/game/seasons/proposals/:id/approve   un humain VALIDE (et peut corriger) : la saison s'écrit
 *   POST /admin/game/seasons/proposals/:id/reject    un humain rejette
 *   GET  /admin/game/seasons/app-events              le bloc `store.app_events` d'andp (JSON + YAML)
 *   GET  /admin/game/seasons/app-events.yaml         le même, en téléchargement
 *
 * - **Rôle** : `requirePermission('canManageGame')` (BIGBOSS, ADMIN), sur CHAQUE route.
 * - **Journal** : chaque écriture laisse une ligne `AdminAuditLog` AVANT d'agir — si le journal
 *   ne peut pas s'écrire, l'écriture est refusée (fermé) ; un refus de la loi laisse sa ligne aussi.
 * - **La loi** (`applySeasonEdit`) : futur seulement, un lundi, sans chevauchement, récompenses
 *   bornées, textes dans les limites. Les ligues restent hebdomadaires : rien ici ne les touche.
 * - **L'IA propose, un humain valide** : la sortie de l'IA est REVALIDÉE ici par la loi (la
 *   passerelle est la frontière de confiance), stockée `pending`, et n'écrit le calendrier qu'au
 *   geste `approve`. L'export App Store ne lit que le calendrier écrit — jamais une proposition.
 * - « Futur » se juge au fuseau le plus en avance (UTC+14) : une saison n'est plus modifiable dès
 *   qu'un seul joueur, quelque part, y est entré.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  SEASON_COPY_LIMITS,
  SEASON_COPY_LOCALES,
  SEASON_STEP_POINTS_MAX,
  SEASON_STEP_POINTS_MIN,
  applySeasonEdit,
  isLawfulSeasonCopy,
  isLawfulStepPoints,
  isSeasonThemeKey,
  scheduledSeasonCalendar,
  scheduledSeasonOfMoment,
  seasonDefinitionOf,
  type SeasonEdit,
  type SeasonSchedule,
} from '@meeshy/shared/utils/game/season-schedule';
import { SEASON_THEME_KEYS, seasonTenseAt } from '@meeshy/shared/utils/game/season';
import { seasonAppEventsYaml, upcomingSeasonAppEvents, seasonAppEvent, validateAppEvent } from '@meeshy/shared/utils/game/season-app-events';
import type { LeagueMoment } from '@meeshy/shared/utils/game/league';
import { requirePermission } from '../../middleware/authorize';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { AgentHttpClient, AgentUnavailableError } from '../../services/AgentHttpClient';
import { dayKeyOf, minuteOfDayInTimezone } from '../../services/game/gameClock';
import { seasonSchedule, writeSeasonEdit } from '../../services/game/SeasonScheduleService';
import { logError } from '../../utils/logger';

/** Le fuseau le plus en avance : une saison y commence en premier. */
export const EARLIEST_TIME_ZONE = 'Pacific/Kiritimati';

export const requireGameAdmin = requirePermission('canManageGame');

export type SeasonProposer = {
  proposeSeason(input: {
    readonly number: number;
    readonly startDay: string;
    readonly themeKey: string;
    readonly previousThemes: readonly string[];
    readonly brief: string | null;
  }): Promise<{ themeKey: unknown; stepPoints: unknown; copy: unknown; model?: unknown }>;
};

export type GameSeasonsAdminOptions = {
  readonly proposer?: SeasonProposer | null;
  readonly clock?: () => Date;
};

const momentOf = (now: Date): LeagueMoment => ({
  dayKey: dayKeyOf(now, EARLIEST_TIME_ZONE),
  minuteOfDay: minuteOfDayInTimezone(now, EARLIEST_TIME_ZONE),
});

const actorOf = (request: FastifyRequest): string | null => {
  const ctx = (request as UnifiedAuthRequest).authContext;
  return ctx?.registeredUser?.id ?? ctx?.userId ?? null;
};

const fail = (reply: FastifyReply, status: number, error: string, message?: string) =>
  reply.status(status).send({ success: false, error, message: message ?? error });

/** Une ligne de journal, ÉCRITE avant d'agir : si elle ne s'écrit pas, on n'agit pas. */
async function journal(
  request: FastifyRequest,
  prisma: PrismaClient,
  entry: { readonly action: string; readonly entityId: string; readonly changes?: unknown; readonly metadata?: unknown },
): Promise<boolean> {
  const actor = actorOf(request);
  if (actor === null) return false;
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: actor,
        userId: actor,
        action: entry.action,
        entity: 'GameSeason',
        entityId: entry.entityId,
        changes: entry.changes === undefined ? undefined : JSON.stringify(entry.changes),
        metadata: entry.metadata === undefined ? undefined : JSON.stringify(entry.metadata),
        ipAddress: request.ip,
        userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
      },
    });
    return true;
  } catch (error) {
    logError('game seasons audit write failed', error, { source: 'admin-game-seasons', action: entry.action });
    return false;
  }
}

export type AdminSeasonRow = {
  readonly number: number;
  readonly startDay: string;
  readonly endDay: string | null;
  readonly status: 'scheduled' | 'paused';
  readonly tense: 'past' | 'current' | 'upcoming';
  readonly explicit: boolean;
  readonly editable: boolean;
  readonly themeKey: string;
  readonly stepPoints: number;
  readonly copy: unknown;
  readonly rewardPack: string | null;
};

export function adminSeasonRow(schedule: SeasonSchedule, number: number, now: LeagueMoment): AdminSeasonRow | null {
  const definition = seasonDefinitionOf(schedule, number);
  if (definition === null) return null;
  const calendar = scheduledSeasonCalendar(schedule, number);
  const tense = calendar === null ? 'upcoming' : seasonTenseAt(calendar, now);
  const probe = applySeasonEdit(schedule, { number }, now);
  return {
    number,
    startDay: calendar?.startDay ?? definition.startDay,
    endDay: calendar?.endDay ?? null,
    status: definition.status,
    tense,
    explicit: schedule.seasons.some((d) => d.number === number),
    editable: probe.ok || ('reason' in probe && probe.reason !== 'season-not-future' && probe.reason !== 'season-announced'),
    themeKey: definition.themeKey,
    stepPoints: definition.stepPoints,
    copy: definition.copy,
    rewardPack: definition.rewardPack ?? null,
  };
}

const intParam = (value: unknown): number | null => {
  const n = typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
};

const copySchema = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: [...SEASON_COPY_LOCALES],
      properties: Object.fromEntries(
        SEASON_COPY_LOCALES.map((locale) => [
          locale,
          {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'tagline', 'description'],
            properties: {
              title: { type: 'string', minLength: 1, maxLength: SEASON_COPY_LIMITS.title * 2 },
              tagline: { type: 'string', minLength: 1, maxLength: SEASON_COPY_LIMITS.tagline * 2 },
              description: { type: 'string', minLength: 1, maxLength: SEASON_COPY_LIMITS.description * 2 },
            },
          },
        ]),
      ),
    },
  ],
} as const;

const editProperties = {
  startDay: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  status: { type: 'string', enum: ['scheduled', 'paused'] },
  themeKey: { type: 'string', enum: [...SEASON_THEME_KEYS] },
  stepPoints: { type: 'integer', minimum: SEASON_STEP_POINTS_MIN, maximum: SEASON_STEP_POINTS_MAX },
  copy: copySchema,
  rewardPack: { anyOf: [{ type: 'null' }, { type: 'string', minLength: 1, maxLength: 120 }] },
} as const;

const editBody = {
  type: 'object',
  required: ['expectedRevision'],
  additionalProperties: false,
  properties: { expectedRevision: { type: 'integer', minimum: 0 }, ...editProperties },
} as const;

const approveBody = {
  type: 'object',
  required: ['expectedRevision'],
  additionalProperties: false,
  properties: {
    expectedRevision: { type: 'integer', minimum: 0 },
    startDay: editProperties.startDay,
    themeKey: editProperties.themeKey,
    stepPoints: editProperties.stepPoints,
    copy: editProperties.copy,
  },
} as const;


// --- Les réponses, FERMÉES (#4168) : rien ne part qui n'est pas nommé ici. ---

const errorSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { success: { type: 'boolean' }, error: { type: 'string' }, message: { type: 'string' } },
} as const;

const copyTextResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'tagline', 'description'],
  properties: { title: { type: 'string' }, tagline: { type: 'string' }, description: { type: 'string' } },
} as const;

const copyResponse = {
  anyOf: [
    { type: 'null' },
    { type: 'object', additionalProperties: false, properties: Object.fromEntries(SEASON_COPY_LOCALES.map((l) => [l, copyTextResponse])) },
  ],
} as const;

const seasonRowSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['number', 'startDay', 'endDay', 'status', 'tense', 'explicit', 'editable', 'themeKey', 'stepPoints', 'copy', 'rewardPack'],
  properties: {
    number: { type: 'integer' },
    startDay: { type: 'string' },
    endDay: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['scheduled', 'paused'] },
    tense: { type: 'string', enum: ['past', 'current', 'upcoming'] },
    explicit: { type: 'boolean' },
    editable: { type: 'boolean' },
    themeKey: { type: 'string' },
    stepPoints: { type: 'integer' },
    copy: copyResponse,
    rewardPack: { type: ['string', 'null'] },
  },
} as const;

const appEventSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string' },
    reference_name: { type: 'string' },
    badge: { type: 'string' },
    purpose: { type: 'string' },
    priority: { type: 'string' },
    purchase_requirement: { type: 'string' },
    deep_link: { type: 'string' },
    primary_locale: { type: 'string' },
    territories: { type: 'string' },
    publish_start: { type: 'string' },
    event_start: { type: 'string' },
    event_end: { type: 'string' },
    localizations: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' }, short_description: { type: 'string' }, long_description: { type: 'string' } },
      },
    },
  },
} as const;

const proposalSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    number: { type: 'integer' },
    status: { type: 'string' },
    startDay: { type: 'string' },
    themeKey: { type: 'string' },
    stepPoints: { type: 'integer' },
    copy: copyResponse,
    appEvent: { anyOf: [{ type: 'null' }, appEventSchema] },
    appEventFaults: { type: 'array', items: { type: 'string' } },
    brief: { type: ['string', 'null'] },
    createdBy: { type: 'string' },
    createdAt: { type: 'string' },
    reviewedBy: { type: ['string', 'null'] },
    reviewedAt: { type: ['string', 'null'] },
    model: { type: ['string', 'null'] },
  },
} as const;

const ok = (data: object) => ({ type: 'object', additionalProperties: false, properties: { success: { type: 'boolean' }, data } }) as const;
const errors = { 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 422: errorSchema, 500: errorSchema, 502: errorSchema, 503: errorSchema } as const;

const listResponse = ok({
  type: 'object',
  additionalProperties: false,
  properties: {
    revision: { type: 'integer' },
    now: { type: 'object', additionalProperties: false, properties: { dayKey: { type: 'string' }, minuteOfDay: { type: 'integer' } } },
    seasons: { type: 'array', items: seasonRowSchema },
  },
});
const writeResponse = ok({ type: 'object', additionalProperties: false, properties: { revision: { type: 'integer' }, season: seasonRowSchema } });
const proposalResponse = ok(proposalSchema);
const proposalsResponse = ok({ type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: proposalSchema } } });
const approveResponse = ok({ type: 'object', additionalProperties: false, properties: { revision: { type: 'integer' }, season: seasonRowSchema, proposal: proposalSchema } });
const rejectResponse = ok({ type: 'object', additionalProperties: false, properties: { proposal: proposalSchema } });
const exportResponse = ok({
  type: 'object',
  additionalProperties: false,
  properties: {
    revision: { type: 'integer' },
    events: { type: 'array', items: appEventSchema },
    faults: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
    yaml: { type: 'string' },
  },
});

type EditBody = {
  expectedRevision: number;
  startDay?: string;
  status?: 'scheduled' | 'paused';
  themeKey?: string;
  stepPoints?: number;
  copy?: unknown;
  rewardPack?: string | null;
};

type ProposalRow = {
  id: string;
  number: number;
  status: string;
  startDay: string;
  themeKey: string;
  stepPoints: number;
  copy: unknown;
  brief: string | null;
  model: string | null;
  createdBy: string;
  createdAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectReason?: string | null;
  appliedRevision?: number | null;
};

/** L'aperçu de l'événement App Store qu'une proposition donnerait — calculé, jamais publié. */
function proposalView(row: ProposalRow, schedule: SeasonSchedule, now: LeagueMoment) {
  const preview = applySeasonEdit(
    schedule,
    { number: row.number, startDay: row.startDay, themeKey: row.themeKey, stepPoints: row.stepPoints, copy: row.copy },
    now,
  );
  const appEvent = 'schedule' in preview ? seasonAppEvent(preview.schedule, row.number, now) : null;
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    startDay: row.startDay,
    themeKey: row.themeKey,
    stepPoints: row.stepPoints,
    copy: row.copy,
    appEvent,
    appEventFaults: appEvent === null ? ('reason' in preview ? [preview.reason] : ['not-exportable']) : validateAppEvent(appEvent),
    brief: row.brief ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    model: row.model ?? null,
  };
}

const REFUSAL_MESSAGES: Readonly<Record<string, string>> = {
  'revision-conflict': 'Le calendrier a changé depuis votre lecture : rechargez.',
  'season-not-future': 'Une saison en cours ou passée ne se réécrit pas.',
  'season-announced': 'La saison est annoncée sur l’App Store (publication 7 jours avant) : elle ne se décale plus.',
  'start-too-soon': 'L’ouverture doit laisser 7 jours pour annoncer la saison sur l’App Store.',
  'schedule-indexes-unavailable': 'Les index du calendrier ne sont pas garantis : rien n’a été écrit.',
  'invalid-day': 'Date illisible.',
  'not-monday': 'Une saison commence un lundi.',
  'start-not-future': 'La date d’ouverture doit être future.',
  'overlaps-previous': 'La saison chevaucherait la précédente.',
  'overlaps-next': 'La saison chevaucherait une saison suivante déjà programmée.',
  'invalid-theme': 'Thème hors du catalogue.',
  'rewards-out-of-bounds': `Points d’étape hors des bornes (${SEASON_STEP_POINTS_MIN} à ${SEASON_STEP_POINTS_MAX}, par 10).`,
  'copy-invalid': 'Textes incomplets ou trop longs (7 langues ; 30 / 50 / 120 caractères).',
  'invalid-status': 'Statut inconnu.',
  'invalid-number': 'Numéro de saison invalide.',
  'invalid-reward-pack': 'Pack récompense illisible : une clé `<domaine>.<slug>` est attendue.',
};

/** Une validation interrompue (processus tombé entre la réservation et l'écriture) se reprend après 5 minutes. */
const APPROVING_STALE_MS = 5 * 60_000;
const isStaleApproving = (row: { status: string; reviewedAt: Date | null }, now: Date): boolean =>
  row.status === 'approving' && row.reviewedAt !== null && now.getTime() - new Date(row.reviewedAt).getTime() > APPROVING_STALE_MS;

const PROPOSAL_RATE_LIMIT = { max: 10, timeWindow: '1 minute', hook: 'preHandler' as const, skipOnError: false };

export async function gameSeasonsAdminRoutes(fastify: FastifyInstance, options: GameSeasonsAdminOptions = {}) {
  const prisma = fastify.prisma as PrismaClient;
  const clock = options.clock ?? (() => new Date());
  const proposer: SeasonProposer | null =
    options.proposer !== undefined
      ? options.proposer
      : process.env.AGENT_HOST
        ? new AgentHttpClient(`http://${process.env.AGENT_HOST}:${process.env.AGENT_HTTP_PORT || '3200'}`)
        : null;
  const guard = { onRequest: [fastify.authenticate, requireGameAdmin] };

  const writeOutcome = async (
    request: FastifyRequest,
    reply: FastifyReply,
    edit: SeasonEdit,
    expectedRevision: number,
    audit: { readonly action: string; readonly metadata?: unknown },
  ) => {
    const actor = actorOf(request);
    if (actor === null) return { reply: fail(reply, 401, 'unauthorized') };
    const now = momentOf(clock());
    // L'état d'AVANT entre au journal : on sait d'où une saison a été décalée.
    const before = seasonDefinitionOf(await seasonSchedule(prisma, { fresh: true }), edit.number);
    const journaled = await journal(request, prisma, {
      action: audit.action,
      entityId: String(edit.number),
      changes: { before, edit, expectedRevision },
      metadata: audit.metadata,
    });
    if (!journaled) return { reply: fail(reply, 500, 'audit-unavailable', 'Le journal d’audit est indisponible : rien n’a été écrit.') };
    let result: Awaited<ReturnType<typeof writeSeasonEdit>>;
    try {
      result = await writeSeasonEdit({ prisma, edit, expectedRevision, now, actorId: actor });
    } catch (error) {
      await journal(request, prisma, { action: `${audit.action}_FAILED`, entityId: String(edit.number), metadata: { error: 'write-failed' } });
      throw error;
    }
    if ('reason' in result) {
      await journal(request, prisma, { action: `${audit.action}_REFUSED`, entityId: String(edit.number), metadata: { reason: result.reason } });
      const status = result.reason === 'revision-conflict' ? 409 : result.reason === 'schedule-indexes-unavailable' ? 503 : 422;
      return { reply: fail(reply, status, result.reason, REFUSAL_MESSAGES[result.reason]) };
    }
    return { result, now };
  };

  // --- Lecture ---

  fastify.get('/seasons', { ...guard, schema: { response: { 200: listResponse, ...errors } } }, async (request: FastifyRequest<{ Querystring: { from?: string; count?: string } }>, reply) => {
    try {
      const schedule = await seasonSchedule(prisma, { fresh: true });
      const now = momentOf(clock());
      const current = scheduledSeasonOfMoment(schedule, now);
      const lastExplicit = schedule.seasons.reduce((max, d) => Math.max(max, d.number), 0);
      const from = intParam(request.query.from) ?? Math.max(1, (current ?? 1) - 1);
      const count = Math.min(24, intParam(request.query.count) ?? Math.max(8, lastExplicit - from + 3));
      const seasons = Array.from({ length: count }, (_, i) => adminSeasonRow(schedule, from + i, now)).filter((row) => row !== null);
      return reply.send({ success: true, data: { revision: schedule.revision, now, seasons } });
    } catch (error) {
      logError('game seasons admin read failed', error, { source: 'admin-game-seasons' });
      return fail(reply, 500, 'GAME_SEASONS_READ_FAILED');
    }
  });

  // --- Programmer, décaler, mettre en pause ---

  fastify.put(
    '/seasons/:number',
    { ...guard, schema: { response: { 200: writeResponse, ...errors }, body: editBody, params: { type: 'object', required: ['number'], properties: { number: { type: 'string', pattern: '^\\d{1,6}$' } } } } },
    async (request: FastifyRequest<{ Params: { number: string }; Body: EditBody }>, reply) => {
      const number = intParam(request.params.number);
      if (number === null) return fail(reply, 400, 'invalid-number');
      const { expectedRevision, ...fields } = request.body;
      const edit: SeasonEdit = { number, ...fields };
      try {
        const outcome = await writeOutcome(request, reply, edit, expectedRevision, { action: 'GAME_SEASON_UPDATE' });
        if ('reply' in outcome) return outcome.reply;
        return reply.send({
          success: true,
          data: { revision: outcome.result.schedule.revision, season: adminSeasonRow(outcome.result.schedule, number, outcome.now) },
        });
      } catch (error) {
        logError('game season write failed', error, { source: 'admin-game-seasons' });
        return fail(reply, 500, 'GAME_SEASON_WRITE_FAILED');
      }
    },
  );

  // --- L'IA propose ---

  fastify.post(
    '/seasons/:number/proposals',
    {
      ...guard,
      config: { rateLimit: { ...PROPOSAL_RATE_LIMIT, keyGenerator: (request: FastifyRequest) => `game-season-proposal:${actorOf(request) ?? request.ip}` } },
      schema: {
        response: { 201: proposalResponse, ...errors },
        params: { type: 'object', required: ['number'], properties: { number: { type: 'string', pattern: '^\\d{1,6}$' } } },
        body: { type: 'object', additionalProperties: false, properties: { brief: { type: 'string', maxLength: 500 } } },
      },
    },
    async (request: FastifyRequest<{ Params: { number: string }; Body: { brief?: string } | undefined }>, reply) => {
      const number = intParam(request.params.number);
      if (number === null) return fail(reply, 400, 'invalid-number');
      const actor = actorOf(request);
      if (actor === null) return fail(reply, 401, 'unauthorized');
      if (proposer === null) return fail(reply, 503, 'agent-unavailable', 'Le service d’agent n’est pas configuré.');
      const schedule = await seasonSchedule(prisma, { fresh: true });
      const now = momentOf(clock());
      const row = adminSeasonRow(schedule, number, now);
      if (row === null || !row.editable) return fail(reply, 422, 'season-not-future', REFUSAL_MESSAGES['season-not-future']);
      const brief = request.body?.brief?.trim() ? request.body.brief.trim() : null;
      const previousThemes = Array.from({ length: Math.min(8, number - 1) }, (_, i) => seasonDefinitionOf(schedule, number - 1 - i)?.themeKey).filter(
        (t): t is NonNullable<typeof t> => t !== undefined,
      );
      if (!(await journal(request, prisma, { action: 'GAME_SEASON_PROPOSAL_REQUEST', entityId: String(number), metadata: { brief } }))) {
        return fail(reply, 500, 'audit-unavailable', 'Le journal d’audit est indisponible.');
      }
      let raw: { themeKey: unknown; stepPoints: unknown; copy: unknown; model?: unknown };
      try {
        raw = await proposer.proposeSeason({ number, startDay: row.startDay, themeKey: row.themeKey, previousThemes, brief });
      } catch (error) {
        const status = (error as { statusCode?: number } | null)?.statusCode;
        if (error instanceof AgentUnavailableError || status === 503) {
          return fail(reply, 503, 'agent-unavailable', 'Le service d’agent ou son modèle est injoignable.');
        }
        logError('game season proposal failed', error, { source: 'admin-game-seasons' });
        return fail(reply, 502, 'proposal-invalid', 'L’IA n’a pas rendu de proposition exploitable.');
      }
      // La passerelle est la frontière de confiance : la sortie de l'IA repasse par la loi, champ par champ.
      if (!raw || !isSeasonThemeKey(raw.themeKey) || !isLawfulStepPoints(raw.stepPoints) || !isLawfulSeasonCopy(raw.copy)) {
        await journal(request, prisma, { action: 'GAME_SEASON_PROPOSAL_DISCARDED', entityId: String(number), metadata: { reason: 'out-of-law' } });
        return fail(reply, 502, 'proposal-invalid', 'La proposition de l’IA sort des bornes de la loi : elle est écartée.');
      }
      const created = (await prisma.gameSeasonProposal.create({
        data: {
          number,
          status: 'pending',
          startDay: row.startDay,
          themeKey: raw.themeKey,
          stepPoints: raw.stepPoints,
          copy: raw.copy as never,
          brief,
          model: typeof raw.model === 'string' ? raw.model.slice(0, 80) : null,
          createdBy: actor,
        },
      })) as unknown as ProposalRow;
      await journal(request, prisma, { action: 'GAME_SEASON_PROPOSAL_CREATE', entityId: String(number), metadata: { proposalId: created.id } });
      return reply.status(201).send({ success: true, data: proposalView(created, schedule, now) });
    },
  );

  fastify.get(
    '/seasons/proposals',
    { ...guard, schema: { response: { 200: proposalsResponse, ...errors } } },
    async (request: FastifyRequest<{ Querystring: { status?: string } }>, reply) => {
      const status = request.query.status ?? 'pending';
      if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return fail(reply, 400, 'invalid-status');
      const rows = (await prisma.gameSeasonProposal.findMany({
        // Une validation interrompue (« approving ») se montre avec les propositions en attente : elle se reprend.
        where: status === 'all' ? {} : status === 'pending' ? { status: { in: ['pending', 'approving'] } } : { status },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })) as unknown as ProposalRow[];
      const schedule = await seasonSchedule(prisma);
      const now = momentOf(clock());
      return reply.send({ success: true, data: { items: rows.map((row) => proposalView(row, schedule, now)) } });
    },
  );

  fastify.post(
    '/seasons/proposals/:id/approve',
    { ...guard, schema: { response: { 200: approveResponse, ...errors }, body: approveBody, params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } } } } },
    async (request: FastifyRequest<{ Params: { id: string }; Body: Omit<EditBody, 'status'> }>, reply) => {
      const proposal = (await prisma.gameSeasonProposal.findUnique({ where: { id: request.params.id } })) as unknown as ProposalRow | null;
      if (proposal === null) return fail(reply, 404, 'proposal-not-found');
      const reclaimable = isStaleApproving(proposal, clock());
      if (proposal.status !== 'pending' && !reclaimable) return fail(reply, 409, 'proposal-not-pending', 'Cette proposition a déjà été traitée.');
      const { expectedRevision, ...overrides } = request.body;
      // La date n'est reprise de la proposition QUE si l'humain la pose : sinon la saison garde sa date
      // ACTUELLE — valider une proposition ne défait jamais en silence le décalage d'un collègue.
      const edit: SeasonEdit = {
        number: proposal.number,
        ...(overrides.startDay !== undefined ? { startDay: overrides.startDay } : {}),
        themeKey: overrides.themeKey ?? proposal.themeKey,
        stepPoints: overrides.stepPoints ?? proposal.stepPoints,
        copy: overrides.copy !== undefined ? overrides.copy : proposal.copy,
      };
      try {
        // La proposition se RÉSERVE avant d'écrire : deux validations concurrentes n'écrivent pas deux fois.
        const actor = actorOf(request);
        const claimed = await prisma.gameSeasonProposal.updateMany({
          where: reclaimable ? { id: proposal.id, status: 'approving', reviewedAt: proposal.reviewedAt } : { id: proposal.id, status: 'pending' },
          data: { status: 'approving', reviewedBy: actor, reviewedAt: clock() },
        });
        if (claimed.count !== 1) return fail(reply, 409, 'proposal-not-pending', 'Cette proposition a déjà été traitée.');
        const outcome = await writeOutcome(request, reply, edit, expectedRevision, {
          action: 'GAME_SEASON_PROPOSAL_APPROVE',
          metadata: { proposalId: proposal.id, corrected: Object.keys(overrides) },
        });
        if ('reply' in outcome) {
          await prisma.gameSeasonProposal.updateMany({ where: { id: proposal.id, status: 'approving' }, data: { status: 'pending', reviewedBy: null, reviewedAt: null } });
          return outcome.reply;
        }
        const revision = outcome.result.schedule.revision;
        await prisma.gameSeasonProposal.updateMany({
          where: { id: proposal.id, status: 'approving' },
          data: { status: 'approved', appliedRevision: revision, startDay: outcome.result.definition.startDay, themeKey: edit.themeKey, stepPoints: edit.stepPoints, copy: (edit.copy ?? null) as never },
        });
        const updated = (await prisma.gameSeasonProposal.findUnique({ where: { id: proposal.id } })) as unknown as ProposalRow;
        return reply.send({
          success: true,
          data: {
            revision,
            season: adminSeasonRow(outcome.result.schedule, proposal.number, outcome.now),
            proposal: proposalView(updated, outcome.result.schedule, outcome.now),
          },
        });
      } catch (error) {
        await prisma.gameSeasonProposal
          .updateMany({ where: { id: proposal.id, status: 'approving' }, data: { status: 'pending', reviewedBy: null, reviewedAt: null } })
          .catch(() => undefined);
        logError('game season proposal approval failed', error, { source: 'admin-game-seasons' });
        return fail(reply, 500, 'GAME_SEASON_WRITE_FAILED');
      }
    },
  );

  fastify.post(
    '/seasons/proposals/:id/reject',
    {
      ...guard,
      schema: {
        response: { 200: rejectResponse, ...errors },
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } } },
        body: { type: 'object', additionalProperties: false, properties: { reason: { type: 'string', maxLength: 280 } } },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } | undefined }>, reply) => {
      const proposal = (await prisma.gameSeasonProposal.findUnique({ where: { id: request.params.id } })) as unknown as ProposalRow | null;
      if (proposal === null) return fail(reply, 404, 'proposal-not-found');
      const reclaimable = isStaleApproving(proposal, clock());
      if (proposal.status !== 'pending' && !reclaimable) return fail(reply, 409, 'proposal-not-pending', 'Cette proposition a déjà été traitée.');
      const reason = request.body?.reason?.trim() || null;
      if (!(await journal(request, prisma, { action: 'GAME_SEASON_PROPOSAL_REJECT', entityId: String(proposal.number), metadata: { proposalId: proposal.id, reason } }))) {
        return fail(reply, 500, 'audit-unavailable', 'Le journal d’audit est indisponible.');
      }
      const done = await prisma.gameSeasonProposal.updateMany({
        where: reclaimable ? { id: proposal.id, status: 'approving', reviewedAt: proposal.reviewedAt } : { id: proposal.id, status: 'pending' },
        data: { status: 'rejected', reviewedBy: actorOf(request), reviewedAt: clock(), rejectReason: reason },
      });
      if (done.count !== 1) return fail(reply, 409, 'proposal-not-pending', 'Cette proposition a déjà été traitée.');
      const updated = (await prisma.gameSeasonProposal.findUnique({ where: { id: proposal.id } })) as unknown as ProposalRow;
      return reply.send({ success: true, data: { proposal: proposalView(updated, await seasonSchedule(prisma), momentOf(clock())) } });
    },
  );

  // --- L'export App Store (andp `store.app_events`) ---

  const exportOf = async (count: number) => {
    const schedule = await seasonSchedule(prisma, { fresh: true });
    const events = upcomingSeasonAppEvents(schedule, momentOf(clock()), count);
    const faults = Object.fromEntries(events.map((ev) => [ev.key, validateAppEvent(ev)]));
    return { revision: schedule.revision, events, faults, yaml: seasonAppEventsYaml(events) };
  };

  fastify.get('/seasons/app-events', { ...guard, schema: { response: { 200: exportResponse, ...errors } } }, async (request: FastifyRequest<{ Querystring: { count?: string } }>, reply) => {
    const count = Math.min(15, intParam(request.query.count) ?? 3);
    return reply.send({ success: true, data: await exportOf(count) });
  });

  fastify.get('/seasons/app-events.yaml', guard, async (request: FastifyRequest<{ Querystring: { count?: string } }>, reply) => {
    const count = Math.min(15, intParam(request.query.count) ?? 3);
    const { yaml, revision } = await exportOf(count);
    return reply
      .header('Content-Type', 'application/yaml; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="andp-app-events-r${revision}.yaml"`)
      .send(`# store.app_events — généré depuis le calendrier des saisons (révision ${revision}, #10016).\n# À coller sous \`store:\` dans apps/ios/andp.yml (ou : apps/ios/scripts/season-app-events.mjs).\n# Visuels à fournir : fastlane/metadata/app_events/<key>/<locale>/event_card|event_details_page\n${yaml}`);
  });
}
