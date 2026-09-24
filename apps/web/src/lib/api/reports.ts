import type { ApiResult, HttpTransport } from './http';
import type { DataSource } from './config';
import { outcomeOf } from './outcome';

/**
 * **SIGNALER — LE PORT QUI EXISTAIT SANS APPELANT** (#7187).
 *
 * `POST /api/v1/reports` vit côté passerelle depuis longtemps
 * (`services/gateway/src/routes/reports/index.ts:223`), avec ses huit motifs et
 * ses trois limiteurs de débit. Mesuré avant ce lot : pas une occurrence de
 * `v1/reports`, `reportedEntityId` ni `reportType` dans `apps/web/src`.
 *
 * C'est la forme d'absence la plus trompeuse du dépôt : **un port sans appelant
 * ressemble à une feature livrée dans tous les relevés qui comptent les
 * endpoints**. Rien ne manquait au serveur ; personne n'appelait.
 *
 * ## LES HUIT MOTIFS SONT CEUX DU SERVEUR, REPRIS — JAMAIS RÉINVENTÉS
 *
 * `creerSchema.reportType` (`routes/reports/index.ts:48-57`) en est la source.
 * Une neuvième valeur inventée ici serait refusée en 400, et une valeur
 * MANQUANTE retirerait silencieusement un motif que la modération attend.
 */
export const REPORT_REASONS = [
  'spam',
  'inappropriate',
  'harassment',
  'violence',
  'hate_speech',
  'fake_profile',
  'impersonation',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * L'issue d'un signalement, dans le vocabulaire des gestes de la fiche.
 *
 * `throttled` a sa propre valeur, distincte de `failed` : la passerelle pose
 * TROIS limiteurs sur cette route, et un signalement refusé pour cause de débit
 * n'est pas un échec — c'est un « pas maintenant ». Les confondre dirait à
 * quelqu'un qui vient de signaler un harcèlement que son geste a échoué, alors
 * qu'il a seulement été trop rapide.
 */
export type ReportOutcome = 'done' | 'throttled' | 'offline' | 'failed';

export type ReportDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
};

/**
 * Signale un UTILISATEUR. Le motif est OBLIGATOIRE côté client alors que le
 * serveur accepterait un `reason` vide : signaler sans motif n'est pas un
 * signalement, c'est un clic — et la modération qui le recevra n'aurait rien à
 * en faire.
 *
 * `reason` (le texte libre) reste facultatif ; c'est `reportType` qui porte le
 * motif, et lui seul est structuré.
 */
export function reportUser(params: {
  readonly userId: string;
  readonly reason: ReportReason;
  readonly details?: string;
  readonly deps: ReportDeps;
}): Promise<ReportOutcome> {
  const { userId, ...rest } = params;
  return sendReport({ ...rest, reportedType: 'user', entityId: userId });
}

/**
 * Signale une PUBLICATION (#7533) — le « Signaler » du menu « ⋯ » d'une carte
 * du fil. MÊME route, MÊME motifs : seul `reportedType` change, et la
 * passerelle l'accepte (`creerSchema.reportedType`, `'post'`).
 */
export function reportPost(params: {
  readonly postId: string;
  readonly reason: ReportReason;
  readonly details?: string;
  readonly deps: ReportDeps;
}): Promise<ReportOutcome> {
  const { postId, ...rest } = params;
  return sendReport({ ...rest, reportedType: 'post', entityId: postId });
}

async function sendReport(params: {
  readonly reportedType: 'user' | 'post';
  readonly entityId: string;
  readonly reason: ReportReason;
  readonly details?: string;
  readonly deps: ReportDeps;
}): Promise<ReportOutcome> {
  const { reportedType, entityId, reason, details, deps } = params;

  if (__FIXTURES__ && deps.source === 'fixtures') return 'done';

  const result: ApiResult<unknown> | null = await deps.transport
    .request<unknown>({
      method: 'POST',
      path: '/api/v1/reports',
      body: {
        reportedType,
        reportedEntityId: entityId,
        reportType: reason,
        ...(details === undefined || details.trim() === '' ? {} : { reason: details.trim() }),
      },
    })
    .catch(() => null);

  /* Une panne de RÉSEAU n'est pas un refus : le geste n'est pas parti, et le
     dire « échoué » enverrait la personne recommencer alors que c'est sa
     connexion qu'il faut attendre. */
  if (result === null) return 'offline';
  if (result.ok) return 'done';
  if (result.status === 429) return 'throttled';
  return outcomeOf(result) === 'permanent' ? 'failed' : 'offline';
}
