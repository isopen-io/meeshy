import { type AdminDeps, asRecord, asText } from './admin';
import type { ApiResult } from './http';

/**
 * **BANNIR, LEVER, LISTER** (#6819) — `POST /api/v1/admin/users/:userId/ban`,
 * `POST …/bans/:banId/lift`, `GET …/bans`. Écriture ADMIN+
 * (`requireUserModifyAccess` + `requireHierarchy`), lecture `canViewUsers`.
 *
 * ## Trois états, pas deux
 *
 * Le schéma le documente : **`expiresAt` n'est pas `liftedAt`**. Un ban expiré
 * mais non levé reste en base tel quel ; `liftedAt` ne s'écrit que sur un geste
 * administratif explicite. Les confondre ferait disparaître d'un écran un
 * bannissement que personne n'a levé — en vigueur, expiré, levé sont trois
 * choses différentes, et la troisième porte un auteur et un motif.
 *
 * ## `active` vient du SERVEUR
 *
 * `GET …/bans` sert `{ ...ban, active: estEnVigueur(ban) }`. On le garde tel
 * quel : le recalculer ici donnerait une jumelle de `estEnVigueur` qui
 * divergerait au premier ajustement — sur les fuseaux, sur l'inclusivité de la
 * borne, sur le traitement d'un ban levé avant son échéance.
 */
export type AdminBan = {
  readonly id: string;
  readonly reason: string;
  readonly createdAt: string | null;
  /** `null` = permanent. */
  readonly expiresAt: string | null;
  /** `null` = jamais levé — distinct d'un ban simplement expiré. */
  readonly liftedAt: string | null;
  readonly liftReason: string | null;
  /** Servi par la passerelle, jamais recalculé ici. */
  readonly active: boolean;
};

const asDateOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

export function decodeAdminBans(raw: unknown): readonly AdminBan[] {
  const brut = Array.isArray(raw) ? raw : Array.isArray(asRecord(raw)?.bans) ? (asRecord(raw)!.bans as unknown[]) : [];

  return brut
    .map((entree): AdminBan | null => {
      const ligne = asRecord(entree);
      if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;

      return {
        id: ligne.id,
        reason: asText(ligne.reason),
        createdAt: asDateOrNull(ligne.createdAt),
        expiresAt: asDateOrNull(ligne.expiresAt),
        liftedAt: asDateOrNull(ligne.liftedAt),
        liftReason: asDateOrNull(ligne.liftReason),
        // Fail-closed : un ban dont la charge ne DIT pas qu'il est en vigueur
        // ne doit pas se présenter comme tel.
        active: ligne.active === true,
      };
    })
    .filter((ban): ban is AdminBan => ban !== null);
}

export const adminUserBansQueryKey = (userId: string) => ['admin', 'user', userId, 'bans'] as const;

/**
 * L'HISTORIQUE, sous `canViewUsers` — une lecture plus largement ouverte que
 * l'écriture, qui exige ADMIN+. Un MODERATOR peut donc consulter les
 * bannissements d'un membre sans pouvoir en prononcer.
 *
 * Elle passe par le MÊME décodeur que les deux écritures : un ban servi après
 * un bannissement et un ban servi par l'historique sont la même chose. Deux
 * décodages divergeraient sur `active` — précisément la valeur qu'on a choisi
 * de ne jamais recalculer.
 */
export async function loadAdminUserBans(
  params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<readonly AdminBan[]>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/bans`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminBans(result.data) };
}

/** Le minimum que la passerelle impose (`creerBanSchema`) — un bannissement
 * sans motif ne se justifierait devant personne. */
const MOTIF_MINIMAL = 3;

export async function banAdminUser(
  params: AdminDeps & {
    readonly userId: string;
    readonly reason: string;
    readonly expiresAt?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<readonly AdminBan[]>> {
  const motif = params.reason.trim();
  if (motif.length < MOTIF_MINIMAL) {
    return { ok: false, status: 0, error: `Le motif doit compter au moins ${MOTIF_MINIMAL} caractères` };
  }

  /**
   * Une échéance PASSÉE est refusée ici comme elle l'est là-bas : « un ban déjà
   * expiré à la création n'est jamais l'intention d'un admin ». C'est un refus
   * certain d'avance — le faire voyager coûterait un aller-retour pour
   * apprendre ce qu'on sait déjà.
   */
  if (params.expiresAt !== undefined && new Date(params.expiresAt).getTime() <= Date.now()) {
    return { ok: false, status: 0, error: "L'échéance doit être dans le futur" };
  }

  const corps: Record<string, unknown> = { reason: motif };
  // Absent = PERMANENT. On n'envoie pas `null` explicite : la passerelle traite
  // les deux pareil, et omettre dit mieux « pas d'échéance » que poser un vide.
  if (params.expiresAt !== undefined) corps.expiresAt = params.expiresAt;

  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/ban`,
    body: corps,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminBans(result.data) };
}

export async function liftAdminUserBan(
  params: AdminDeps & {
    readonly userId: string;
    readonly banId: string;
    readonly reason?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<readonly AdminBan[]>> {
  const motif = params.reason?.trim() ?? '';
  const corps: Record<string, unknown> = {};
  // Lever n'exige AUCUN motif (`leverBanSchema`) — contrairement à bannir.
  if (motif !== '') corps.reason = motif;

  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/bans/${encodeURIComponent(params.banId)}/lift`,
    body: corps,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminBans(result.data) };
}
