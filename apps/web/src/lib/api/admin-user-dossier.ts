import { type AdminDeps, asCount, asRecord, asText, pageServie } from './admin';
import type { ApiResult } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

/**
 * **LE DOSSIER D'UN MEMBRE** (#7845, #7873) — les deux onglets de la fiche que
 * seule cette adresse sert : ses COMMUNAUTÉS et son PROFIL VOCAL. Contacts,
 * sessions, événements de sécurité et signalements ont chacun leur module
 * (`admin-user-activity.ts`, `admin-user-security.ts`) : deux décodeurs pour
 * une même route divergeraient au premier champ ajouté, et deux clés de cache
 * pour une même lecture la feraient partir deux fois.
 *
 * ## Aucune de ces clés ne touche le disque
 *
 * Le cache des requêtes est persisté sur le disque du navigateur de
 * l'administrateur (`query-client.ts`). Le PROFIL VOCAL est une donnée
 * biométrique (même sans ses octets) ; la liste des COMMUNAUTÉS d'un membre
 * dit à quels groupes, parfois privés, une personne NOMMÉE appartient — ce
 * n'est pas un agrégat. Les deux clés descendent d'`ADMIN_SOUVERAIN_PREFIXE`,
 * que le filtre de déshydratation exclut.
 *
 * Chaque décodeur construit sa ligne champ par champ — jamais de `...spread`
 * de la charge, qui recopierait en silence ce que la passerelle ajoutera.
 */

const dateOuNull = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur !== '' ? valeur : null);

export const ADMIN_DOSSIER_PAGE_SIZE = 20;

export type AdminDossierPage<T> = {
  readonly rows: readonly T[];
  readonly total: number;
  readonly hasMore: boolean;
};

function page<T>(lignes: readonly T[], meta: Readonly<Record<string, unknown>>, offset: number): AdminDossierPage<T> {
  const total = asCount(meta.total) || lignes.length;
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : offset + lignes.length < total;
  return { rows: lignes, total, hasMore };
}

const garder = <T>(valeur: T | null): valeur is T => valeur !== null;

async function lire<T>(
  deps: AdminDeps & { readonly signal?: AbortSignal },
  path: string,
  decode: (resultat: { readonly data: unknown; readonly pagination?: unknown }) => T,
): Promise<ApiResult<T>> {
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path,
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decode(result) };
}

const cheminMembre = (userId: string, suite: string) => `/api/v1/admin/users/${encodeURIComponent(userId)}/${suite}`;

const pagine = (offset: number) =>
  new URLSearchParams({ offset: String(offset), limit: String(ADMIN_DOSSIER_PAGE_SIZE) }).toString();

// ---------------------------------------------------------------------------
// LES COMMUNAUTÉS — GET /admin/users/:userId/communities
// ---------------------------------------------------------------------------

export type AdminCommunity = {
  readonly id: string;
  readonly name: string;
  readonly identifier: string;
  readonly avatar: string;
  readonly isPrivate: boolean;
  readonly memberCount: number;
  readonly role: string;
  readonly joinedAt: string | null;
  readonly isActive: boolean;
  readonly leftAt: string | null;
  readonly isCreator: boolean;
};

function decodeCommunity(brut: unknown): AdminCommunity | null {
  const ligne = asRecord(brut);
  if (ligne === null) return null;
  const communaute = asRecord(ligne.community) ?? ligne;
  const adhesion = asRecord(ligne.membership) ?? ligne;
  const id = typeof communaute.id === 'string' ? communaute.id : null;
  if (id === null) return null;
  return {
    id,
    name: asText(communaute.name) || asText(communaute.identifier) || '—',
    identifier: asText(communaute.identifier),
    avatar: asText(communaute.avatar),
    isPrivate: communaute.isPrivate === true,
    memberCount: asCount(communaute.memberCount),
    role: asText(adhesion.role) || asText(adhesion.memberRole) || 'member',
    joinedAt: dateOuNull(adhesion.joinedAt),
    isActive: adhesion.isActive !== false,
    leftAt: dateOuNull(adhesion.leftAt),
    isCreator: ligne.isCreator === true || communaute.isCreator === true,
  };
}

export function decodeAdminCommunities(resultat: { readonly data: unknown; readonly pagination?: unknown }, offset: number) {
  const charge = asRecord(resultat.data);
  const servie = pageServie(resultat);
  const lignes = Array.isArray(charge?.communities) ? charge.communities : servie.lignes;
  const meta = asRecord(charge?.pagination) ?? servie.meta;
  return page(lignes.map(decodeCommunity).filter(garder), meta, offset);
}

export const adminUserCommunitiesQueryKey = (userId: string, offset: number) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'communities', offset] as const;

export function loadAdminUserCommunities(params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal }) {
  return lire(params, `${cheminMembre(params.userId, 'communities')}?${pagine(params.offset)}`, (r) => decodeAdminCommunities(r, params.offset));
}

// ---------------------------------------------------------------------------
// LE PROFIL VOCAL — GET /admin/users/:userId/voice-profile (souverain)
// ---------------------------------------------------------------------------

export type AdminVoiceProfile = {
  readonly profile: {
    readonly audioCount: number;
    readonly totalDurationMs: number;
    readonly model: string;
    readonly createdAt: string | null;
    readonly updatedAt: string | null;
  } | null;
  readonly consents: {
    readonly voiceProfile: string | null;
    readonly voiceData: string | null;
    readonly voiceCloning: string | null;
  };
};

export function decodeAdminVoiceProfile(raw: unknown): AdminVoiceProfile {
  const charge = asRecord(raw) ?? {};
  const profil = asRecord(charge.voiceProfile);
  const consentements = asRecord(charge.consents) ?? {};
  return {
    profile:
      profil === null
        ? null
        : {
            audioCount: asCount(profil.audioCount),
            totalDurationMs: asCount(profil.totalDurationMs),
            model: asText(profil.embeddingModel),
            createdAt: dateOuNull(profil.createdAt),
            updatedAt: dateOuNull(profil.updatedAt),
          },
    consents: {
      voiceProfile: dateOuNull(consentements.voiceProfileConsentAt),
      voiceData: dateOuNull(consentements.voiceDataConsentAt),
      voiceCloning: dateOuNull(consentements.voiceCloningEnabledAt),
    },
  };
}

export const adminUserVoiceQueryKey = (userId: string) => [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'voice'] as const;

export function loadAdminUserVoice(params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal }) {
  return lire(params, cheminMembre(params.userId, 'voice-profile'), (r) => decodeAdminVoiceProfile(r.data));
}
