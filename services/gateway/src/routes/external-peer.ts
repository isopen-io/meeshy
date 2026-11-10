/**
 * Les routes de la porte « pair externe » (#17116, chantier #17007) : ce que la
 * coquille web « ami WhatsApp » appelle au STAGING pour jouer un utilisateur
 * WhatsApp, et ce qu'un appareil Meeshy de recette appelle pour lui écrire.
 *
 * Préfixe `/api/v1/external-peer/whatsapp/`. Elles n'existent que là où
 * `selectExternalPeer` ouvre la porte (staging déclaré, développement, test) :
 * la production ne les monte pas, la page de la coquille non plus. Décision :
 * `services/gateway/decisions/2026-11-10-la-coquille-whatsapp-n-existe-qu-au-staging.md`.
 *
 * Accès réservé à l'ÉQUIPE (`isPlatformTeam`) : un compte ordinaire n'atteint
 * pas la porte tant que la conversation externe (lot suivant) n'en définit pas
 * l'usage. Un membre de l'équipe joue librement un numéro WhatsApp simulé, mais
 * n'agit pour un appareil Meeshy que s'il est le SIEN.
 *
 * La passerelle n'y est qu'un relais aveugle : chaque appel passe par
 * `admitExternalPeer` (contrat strict, clé privée refusée, clair refusé par la
 * lecture de libsignal). Ni le corps, ni le numéro ne sont journalisés.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { isPlatformTeam } from '@meeshy/shared/types/role-types';
import { createUnifiedAuthMiddleware, type UnifiedAuthRequest } from '../middleware/auth';
import { sendError, sendForbidden, sendInternalError, sendSuccess, sendUnauthorized } from '../utils/response.js';
import { enhancedLogger } from '../utils/logger-enhanced';
import { AUTH_ERROR_CODES } from '../utils/auth-error-codes';
import { getCacheStore } from '../services/CacheStore';
import {
  EXTERNAL_PEER_ERROR_CODES,
  ExternalPeerError,
  peerPartySchema,
  type ExternalPeer,
  type ExternalPeerErrorCode,
} from '../services/external-peer/external-peer-contract';
import type { ExternalPeerLogger, LibsignalMessagesApi } from '../services/external-peer/external-peer-gate';
import { selectExternalPeer } from '../services/external-peer/external-peer-selection';
import type { PeerStore } from '../services/external-peer/fake-whatsapp-peer';

const logger = enhancedLogger.child({ module: 'ExternalPeerRoutes' });

export const EXTERNAL_PEER_ROUTE_CODES = {
  /** La porte n'est ouverte qu'aux comptes de l'équipe (MODERATOR et au-dessus). */
  TEAM_ONLY: 'EXTERNAL_PEER_TEAM_ONLY',
  /** Un appareil Meeshy ne se joue que par son propre compte. */
  NOT_YOUR_DEVICE: 'EXTERNAL_PEER_NOT_YOUR_DEVICE',
} as const;

const BASE = '/external-peer/whatsapp';

const STATUS_OF: Readonly<Record<ExternalPeerErrorCode, number>> = {
  [EXTERNAL_PEER_ERROR_CODES.PLAINTEXT_REFUSED]: 422,
  [EXTERNAL_PEER_ERROR_CODES.INVALID]: 400,
  [EXTERNAL_PEER_ERROR_CODES.KEYS_FORBIDDEN]: 400,
  [EXTERNAL_PEER_ERROR_CODES.PEER_UNKNOWN]: 404,
  [EXTERNAL_PEER_ERROR_CODES.DIGEST_MISMATCH]: 422,
  [EXTERNAL_PEER_ERROR_CODES.ATTACHMENT_UNKNOWN]: 404,
};

const MESSAGE_OF: Readonly<Record<ExternalPeerErrorCode, string>> = {
  [EXTERNAL_PEER_ERROR_CODES.PLAINTEXT_REFUSED]: 'Seul un message libsignal chiffré franchit la porte',
  [EXTERNAL_PEER_ERROR_CODES.INVALID]: 'Requête hors du contrat de la porte',
  [EXTERNAL_PEER_ERROR_CODES.KEYS_FORBIDDEN]: 'Le serveur ne reçoit jamais de clé privée',
  [EXTERNAL_PEER_ERROR_CODES.PEER_UNKNOWN]: 'Ce pair n’a publié aucun bundle',
  [EXTERNAL_PEER_ERROR_CODES.DIGEST_MISMATCH]: 'L’empreinte de la pièce ne correspond pas',
  [EXTERNAL_PEER_ERROR_CODES.ATTACHMENT_UNKNOWN]: 'Pièce inconnue',
};

/** 120 appels par minute et par compte : un scénario de recette en fait une dizaine. */
const porteRateLimit = {
  max: 120,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: (request: FastifyRequest) => `external-peer:${(request as UnifiedAuthRequest).authContext?.userId ?? `ip:${request.ip}`}`,
  errorResponseBuilder: () => ({ success: false, error: 'Trop d’appels à la porte. Patientez avant de réessayer.', statusCode: 429 }),
};

type Caller = { readonly userId: string; readonly role: string };
type AuthHook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export type ExternalPeerRouteDeps = { readonly auth: AuthHook; readonly peer: ExternalPeer };

function callerOf(request: FastifyRequest): Caller | null {
  const context = (request as UnifiedAuthRequest).authContext;
  if (!context?.isAuthenticated || context.isAnonymous || !context.userId) return null;
  return { userId: context.userId, role: context.registeredUser?.role ?? '' };
}

/** Un appareil Meeshy nommé par un autre compte que l'appelant. Une forme invalide est laissée à la porte, qui la refuse. */
const actsForAnother = (caller: Caller, party: unknown): boolean => {
  const parsed = peerPartySchema.safeParse(party);
  return parsed.success && parsed.data.side === 'meeshy' && parsed.data.userId !== caller.userId;
};

const fieldOf = (body: unknown, field: string): unknown =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[field] : undefined;

type Handler = (body: unknown, reply: FastifyReply) => Promise<void>;
type Actor = (body: unknown) => unknown;

const teamOnly = (actor: Actor | null, handler: Handler) => async (request: FastifyRequest, reply: FastifyReply) => {
  const caller = callerOf(request);
  if (!caller) return sendUnauthorized(reply, 'Un compte de l’équipe est requis', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
  if (!isPlatformTeam(caller.role)) {
    return sendForbidden(reply, 'La porte pair externe est réservée à l’équipe', { code: EXTERNAL_PEER_ROUTE_CODES.TEAM_ONLY });
  }
  if (actor && actsForAnother(caller, actor(request.body))) {
    return sendForbidden(reply, 'Un appareil Meeshy ne se joue que par son compte', { code: EXTERNAL_PEER_ROUTE_CODES.NOT_YOUR_DEVICE });
  }
  try {
    return await handler(request.body, reply);
  } catch (error) {
    if (error instanceof ExternalPeerError) return sendError(reply, STATUS_OF[error.code], MESSAGE_OF[error.code], { code: error.code });
    logger.error('external peer route failed', { name: error instanceof Error ? error.name : 'unknown' });
    return sendInternalError(reply, 'Erreur interne de la porte pair externe');
  }
};

export function registerExternalPeerRoutes(fastify: FastifyInstance, { auth, peer }: ExternalPeerRouteDeps): void {
  const options = { preValidation: [auth], config: { rateLimit: porteRateLimit } };

  fastify.post(`${BASE}/bundles`, options, teamOnly((body) => fieldOf(body, 'party'), async (body, reply) => {
    await peer.publishPreKeyBundle(body as Parameters<ExternalPeer['publishPreKeyBundle']>[0]);
    return sendSuccess(reply, { published: true }, { statusCode: 201 });
  }));

  fastify.post(`${BASE}/bundles/query`, options, teamOnly(null, async (body, reply) =>
    sendSuccess(reply, { bundles: await peer.fetchPreKeyBundles(body as Parameters<ExternalPeer['fetchPreKeyBundles']>[0]) })));

  fastify.post(`${BASE}/envelopes`, options, teamOnly((body) => fieldOf(body, 'from'), async (body, reply) =>
    sendSuccess(reply, await peer.deliverEnvelope(body as Parameters<ExternalPeer['deliverEnvelope']>[0]), { statusCode: 202 })));

  fastify.post(`${BASE}/envelopes/pending`, options, teamOnly((body) => body, async (body, reply) =>
    sendSuccess(reply, { envelopes: await peer.receiveEnvelopes(body as Parameters<ExternalPeer['receiveEnvelopes']>[0]) })));

  fastify.post(`${BASE}/envelopes/ack`, options, teamOnly((body) => fieldOf(body, 'recipient'), async (body, reply) =>
    sendSuccess(reply, { removed: await peer.acknowledge(body as Parameters<ExternalPeer['acknowledge']>[0]) })));
}

/**
 * La politique de contenu de la coquille : son module et le WASM du pont viennent
 * d'elle-même (`'wasm-unsafe-eval'` est ce qu'exige la compilation d'un WASM, rien
 * de plus), elle ne joint que la passerelle qui la sert, et ne s'encadre nulle part.
 */
const COQUILLE_CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const CONTENT_TYPE_OF: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  wasm: 'application/wasm',
};

type CoquilleFile = { readonly bytes: Buffer; readonly contentType: string };

/** Les fichiers servis, lus UNE fois au montage : seuls ceux du répertoire, par leur nom exact. */
function coquilleFiles(directory: string): ReadonlyMap<string, CoquilleFile> {
  const present = (() => {
    try {
      return statSync(directory).isDirectory() ? readdirSync(directory) : [];
    } catch {
      return [];
    }
  })();
  return new Map(
    present
      .filter((name) => /^[a-z0-9_-]+\.(html|js|wasm)$/.test(name))
      .map((name) => [name, { bytes: readFileSync(join(directory, name)), contentType: CONTENT_TYPE_OF[name.slice(name.lastIndexOf('.') + 1)] ?? '' }] as const),
  );
}

export function registerCoquillePage(fastify: FastifyInstance, directory: string): void {
  const files = coquilleFiles(directory);
  if (!files.has('index.html')) return;

  const serve = (reply: FastifyReply, name: string) => {
    const file = files.get(name);
    if (!file) return sendError(reply, 404, 'Fichier inconnu de la coquille');
    return reply
      .header('content-security-policy', COQUILLE_CSP)
      .header('cache-control', 'no-store')
      .header('x-robots-tag', 'noindex, nofollow')
      .type(file.contentType)
      .send(file.bytes);
  };

  fastify.get(`${BASE}/coquille/`, async (_request, reply) => serve(reply, 'index.html'));
  fastify.get<{ Params: { file: string } }>(`${BASE}/coquille/:file`, async (request, reply) => serve(reply, request.params.file));
}

export type ExternalPeerPluginOptions = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly store: PeerStore;
  readonly auth: AuthHook;
  readonly coquilleDirectory: string | null;
  readonly libsignal?: () => LibsignalMessagesApi;
  readonly logger?: ExternalPeerLogger;
};

const porteLogger: ExternalPeerLogger = { warn: (message, context) => logger.warn(message, context) };

/** Le plugin, configuré : il ne monte rien quand la porte reste close. */
export const externalPeerRoutesFor = ({ env, store, auth, coquilleDirectory, libsignal, logger: peerLogger = porteLogger }: ExternalPeerPluginOptions): FastifyPluginAsync =>
  async (fastify) => {
    const peer = selectExternalPeer({ env, store, logger: peerLogger, ...(libsignal ? { libsignal } : {}) });
    if (!peer) return;
    registerExternalPeerRoutes(fastify, { auth, peer });
    if (coquilleDirectory) registerCoquillePage(fastify, coquilleDirectory);
  };

/** L'entrée de la table des routes : la configuration du processus, le Redis du staging, la coquille construite dans l'image. */
export default async function externalPeerRoutes(fastify: FastifyInstance): Promise<void> {
  if (!process.env.EXTERNAL_PEER_PROVIDER) return;
  await externalPeerRoutesFor({
    env: process.env,
    store: getCacheStore(),
    auth: createUnifiedAuthMiddleware(fastify.prisma, { requireAuth: true, allowAnonymous: false }),
    coquilleDirectory: join(process.cwd(), 'assets', 'dma-coquille'),
  })(fastify, {});
}
