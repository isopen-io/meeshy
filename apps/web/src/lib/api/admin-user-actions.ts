import { type AdminDeps } from './admin';
import { decodeAdminUserDetail, type AdminUserDetail } from './admin-user-detail';
import type { ApiResult } from './http';

/**
 * **ÉDITER UN MEMBRE** (#6819) — `PATCH /api/v1/admin/users/:userId`, sous
 * `canUpdateUsers` ET `requireHierarchy` : l'acteur doit SURCLASSER sa cible,
 * fail-closed en 403 même lorsque la cible est introuvable.
 *
 * ## Le corps est PLAT, et son méta-champ s'appelle `reason`
 *
 * La passerelle lit `Object.keys(corps)` pour savoir quels champs sont
 * présentés (`champsPresentes`), en excluant `reason` — qu'elle renomme
 * ensuite `motif` dans son propre code. **Les deux noms coexistent côté
 * serveur ; celui du fil est `reason`.** Envoyer `motif` ferait perdre le
 * motif sans rien signaler : le geste passerait, la trace d'audit serait
 * muette. C'est le genre de défaut qu'aucun écran ne révèle.
 *
 * ## Une édition vide se refuse ICI
 *
 * La passerelle rend 400 « Aucun champ à écrire ». On le dit sans l'appeler :
 * un refus qui n'apprend rien ne mérite pas un aller-retour, et l'écran a
 * déjà tout pour le savoir.
 *
 * ## Ce que la route REND, et ce qu'on en garde
 *
 * Elle rend le membre à jour, sanitisé — la même forme que `GET`. On le décode
 * donc par `decodeAdminUserDetail`, ce qui fait hériter l'édition de la règle
 * du détail : **les huit champs traçants restent écartés**, y compris sur le
 * chemin d'écriture. Une réponse de PATCH n'est pas moins persistée dans
 * `localStorage` qu'une réponse de GET.
 *
 * ## Ce que ce port ne fait PAS
 *
 * Les familles `sécurité`, `vérifications` et `consentements` ont leurs
 * propres routes (`/security`, `/verifications`, `/consents`) et leurs propres
 * lois — les consentements de voix exigent le rang souverain ET un motif
 * écrit, parce qu'ils fabriquent une pièce légale au nom d'autrui. Les mêler
 * dans UNE fonction donnerait un port dont l'appelant ne pourrait plus deviner
 * le coût : sécurité et vérifications ont donc chacune la leur
 * (`updateAdminUserSecurity`, `updateAdminUserVerifications`, #7845), et les
 * consentements n'en ont aucune ici.
 */
/**
 * Chaque champ admet `| undefined` EXPLICITEMENT, et ce n'est pas une
 * facilité : `exactOptionalPropertyTypes` (`tsconfig.json:15`) distingue « clé
 * absente » de « clé posée à `undefined` », et sans cette union le type
 * REFUSERAIT `{ bio: undefined }`.
 *
 * Or cette forme est exactement celle qu'un FORMULAIRE produit : un champ non
 * rempli rend `undefined` à l'exécution, quoi qu'en dise le type. L'interdire
 * ici ne l'empêcherait pas d'arriver — cela rendrait seulement le cas
 * impossible à TESTER, ce qui est la pire des deux situations.
 */
export type AdminUserEdit = {
  readonly username?: string | undefined;
  readonly firstName?: string | undefined;
  readonly lastName?: string | undefined;
  readonly displayName?: string | undefined;
  readonly bio?: string | undefined;
  readonly avatar?: string | undefined;
  readonly banner?: string | undefined;
  readonly email?: string | undefined;
  readonly phoneNumber?: string | undefined;
  readonly phoneCountryCode?: string | undefined;
  readonly timezone?: string | undefined;
  readonly systemLanguage?: string | undefined;
  readonly regionalLanguage?: string | undefined;
  readonly customDestinationLanguage?: string | undefined;
  readonly birthDate?: string | undefined;
  readonly role?: string | undefined;
  readonly isActive?: boolean | undefined;
};

/**
 * Les champs réellement PRÉSENTÉS — miroir de `champsPresentes` côté serveur.
 *
 * Une valeur `undefined` ne compte pas : en JSON elle n'existe pas, donc la
 * passerelle ne la verrait pas non plus. Un formulaire qui envoie
 * `{ bio: undefined }` croit écrire et ne présente aucun champ ; mieux vaut le
 * lui dire que lui laisser croire qu'un 400 vient du serveur.
 */
export function editableFieldsOf(edit: AdminUserEdit): readonly string[] {
  return Object.keys(edit).filter((champ) => edit[champ as keyof AdminUserEdit] !== undefined);
}

/**
 * Déverrouiller (`unlock: true`, jamais `false` — la passerelle n'accepte que
 * le littéral) et armer ou désarmer la double authentification. Désarmer celle
 * d'un compte que l'on ne surclasse pas serait le premier maillon d'une
 * escalade : la passerelle tient la hiérarchie, ce port ne la contourne pas.
 */
export type AdminUserSecurityChange = {
  readonly unlock?: true | undefined;
  readonly twoFactorEnabled?: boolean | undefined;
};

/** Les trois preuves qu'un administrateur peut poser — ou retirer. */
export type AdminUserVerificationsChange = {
  readonly emailVerified?: boolean | undefined;
  readonly phoneVerified?: boolean | undefined;
  readonly ageVerified?: boolean | undefined;
};

/**
 * UN corps plat, le motif en `reason` — la même grammaire que l'édition, pour
 * deux routes de plus. Écrite une fois : trois compositions divergeraient au
 * premier méta-champ ajouté.
 */
async function ecrireFamille(
  params: AdminDeps & {
    readonly userId: string;
    readonly famille: '' | '/security' | '/verifications';
    readonly change: Readonly<Record<string, unknown>>;
    readonly reason?: string | undefined;
    readonly signal?: AbortSignal | undefined;
  },
): Promise<ApiResult<AdminUserDetail>> {
  const champs = Object.keys(params.change).filter((champ) => params.change[champ] !== undefined);
  if (champs.length === 0) return { ok: false, status: 0, error: 'Aucun champ à écrire' };

  const motif = params.reason?.trim() ?? '';
  const corps: Record<string, unknown> = Object.fromEntries(champs.map((champ) => [champ, params.change[champ]]));
  // Un méta-champ VIDE n'est pas un motif : l'envoyer blanc remplirait le
  // journal d'audit de raisons qui n'en sont pas.
  if (motif !== '') corps.reason = motif;

  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}${params.famille}`,
    body: corps,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const membre = decodeAdminUserDetail(result.data);
  return membre === null ? { ok: false, status: 0, error: 'Membre illisible' } : { ok: true, data: membre };
}

export function updateAdminUserSecurity(
  params: AdminDeps & {
    readonly userId: string;
    readonly change: AdminUserSecurityChange;
    readonly reason?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminUserDetail>> {
  return ecrireFamille({ ...params, famille: '/security' });
}

export function updateAdminUserVerifications(
  params: AdminDeps & {
    readonly userId: string;
    readonly change: AdminUserVerificationsChange;
    readonly reason?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminUserDetail>> {
  return ecrireFamille({ ...params, famille: '/verifications' });
}

export async function updateAdminUser(
  params: AdminDeps & {
    readonly userId: string;
    readonly edit: AdminUserEdit;
    readonly reason?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminUserDetail>> {
  return ecrireFamille({
    source: params.source,
    transport: params.transport,
    userId: params.userId,
    famille: '',
    change: params.edit,
    reason: params.reason,
    signal: params.signal,
  });
}
