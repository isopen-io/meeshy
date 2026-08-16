/**
 * Lecture des préférences de confidentialité STOCKÉES — le pont entre ce que
 * l'application écrit et ce que les portes de diffusion lisent.
 *
 * Le dépôt possède deux rangements pour la même donnée :
 *
 *  1. `UserPreferences.privacy` — un document JSON par utilisateur. C'est le
 *     SEUL que l'application écrive : `PUT`/`PATCH /me/preferences/privacy`
 *     (`routes/me/preferences/preference-router-factory.ts`), appelé par le web
 *     (`stores/user-preferences-store.ts`) comme par iOS
 *     (`OutboxDispatcher` → `/me/preferences/:category`). Le `GET` de la même
 *     porte le relit : l'écran Confidentialité affiche donc fidèlement ce
 *     document.
 *
 *  2. `UserPreference` — des lignes clé/valeur en kebab-case, écrites par
 *     l'endpoint `/user-preferences/privacy` présent du 12 au 18 janvier 2026,
 *     puis retiré sans reprise de données. Plus aucune porte vivante ne les
 *     écrit.
 *
 * Toutes les portes de diffusion lisaient le rangement (2) ; l'application
 * n'écrit que le rangement (1). Un utilisateur qui coupait ses accusés de
 * lecture, son statut en ligne, son « vu à » ou son indicateur de frappe voyait
 * son réglage revenir correctement à l'écran — et le serveur continuait de
 * tout diffuser.
 *
 * Ce résolveur lit les deux, le document JSON faisant foi. Les lignes héritées
 * ne sont interrogées que pour les utilisateurs SANS document : elles ne
 * peuvent donc plus contredire un réglage courant, mais un opt-out posé pendant
 * la fenêtre de janvier reste honoré — le perdre rouvrirait en silence la fuite
 * que ce module ferme.
 *
 * Les deux lectures sont SÉQUENTIELLES, non parallèles. Les paralléliser
 * gagnerait un aller-retour sur les lots mixtes, au prix d'interroger le
 * rangement hérité pour TOUT LE MONDE, à demeure. Séquentiel, le second appel
 * se restreint aux utilisateurs sans document et disparaît complètement dès
 * qu'un lot n'en compte plus — la dépense décroît à mesure que les réglages se
 * posent, au lieu de rester fixe. Les deux appelants mémoïsant par utilisateur
 * (TTL 5 min côté `PrivacyPreferencesService`, cache borné côté
 * `MessageReadStatusService`), la latence de l'échec de cache est amortie ;
 * la requête permanente, elle, ne l'aurait pas été.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  PRIVACY_KEY_MAPPING,
  PRIVACY_KEY_REVERSE_MAPPING,
  type PrivacyPreferencesDefaults,
} from '../../config/user-preferences-defaults';

/** Ce que la base porte VRAIMENT : les clés absentes relèvent des défauts. */
export type StoredPrivacyPreferences = Partial<Record<keyof PrivacyPreferencesDefaults, boolean>>;

const PRIVACY_DTO_KEYS = Object.keys(PRIVACY_KEY_MAPPING) as Array<
  keyof PrivacyPreferencesDefaults
>;

const LEGACY_DB_KEYS = Object.values(PRIVACY_KEY_MAPPING);

/**
 * Ne retient du document que les booléens portant une clé connue : un document
 * partiel, ou pollué par une clé retirée du schéma, ne doit ni jeter ni faire
 * passer une valeur non booléenne pour un consentement.
 *
 * Retourne `null` quand rien d'exploitable n'en sort — l'appelant traite alors
 * l'utilisateur comme dépourvu de document et redescend sur les lignes
 * héritées, plutôt que de laisser un `{}` écraser un opt-out de janvier.
 */
const fromJsonDocument = (privacy: unknown): StoredPrivacyPreferences | null => {
  if (!privacy || typeof privacy !== 'object' || Array.isArray(privacy)) return null;

  const source = privacy as Record<string, unknown>;
  const stored: StoredPrivacyPreferences = {};

  for (const key of PRIVACY_DTO_KEYS) {
    if (typeof source[key] === 'boolean') stored[key] = source[key] as boolean;
  }

  return Object.keys(stored).length > 0 ? stored : null;
};

/**
 * Résout les préférences stockées de plusieurs utilisateurs.
 *
 * Ne rattrape aucune erreur : chaque appelant décide de son repli, et surtout
 * ne met pas un échec en cache — `PrivacyPreferencesService` comme
 * `MessageReadStatusService` retombent tous deux sur « tout le monde reste
 * visible », plutôt que de masquer les accusés de TOUS sur un incident.
 */
export async function loadStoredPrivacyPreferences(
  prisma: PrismaClient,
  userIds: ReadonlyArray<string>
): Promise<Map<string, StoredPrivacyPreferences>> {
  const resolved = new Map<string, StoredPrivacyPreferences>();

  const wanted = [...new Set(userIds)];
  if (wanted.length === 0) return resolved;

  const documents = await prisma.userPreferences.findMany({
    where: { userId: { in: wanted } },
    select: { userId: true, privacy: true },
  });

  for (const row of documents) {
    const stored = fromJsonDocument(row.privacy);
    if (stored) resolved.set(row.userId, stored);
  }

  const withoutDocument = wanted.filter((userId) => !resolved.has(userId));
  if (withoutDocument.length === 0) return resolved;

  const legacyRows = await prisma.userPreference.findMany({
    where: { userId: { in: withoutDocument }, key: { in: LEGACY_DB_KEYS } },
    select: { userId: true, key: true, value: true },
  });

  for (const row of legacyRows) {
    const dtoKey = PRIVACY_KEY_REVERSE_MAPPING[row.key];
    if (!dtoKey) continue;

    const stored = resolved.get(row.userId) ?? {};
    stored[dtoKey] = row.value === 'true';
    resolved.set(row.userId, stored);
  }

  return resolved;
}
