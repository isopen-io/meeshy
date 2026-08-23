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
 * ## Les routes lisent d'ici, elles aussi
 *
 * Ce module ne sert pas que les portes de diffusion : `/me/preferences` et
 * `/me/preferences/privacy` en dépendent par `resolveStoredPrivacyPreferences`.
 * Tant qu'elles lisaient le seul document, l'écran affichait « tout visible »
 * pendant que le serveur taisait — et, pire, le `PATCH` reconstruisait sa base
 * sur ce même défaut : toucher un réglage sans rapport réécrivait l'opt-out de
 * janvier à `true`. Un consentement détruit par un geste qui ne le visait pas.
 *
 * Une donnée, un résolveur : ce que l'écran montre est ce que les portes
 * obéissent, par construction et non par recopie.
 *
 * ## Et le rangement hérité finit par disparaître
 *
 * `retireLegacyPrivacyRows` est appelé après chaque écriture de la catégorie.
 * Une fois un document posé, `fromJsonDocument` le fait gagner et plus aucun
 * lecteur vivant n'atteint ces lignes : les garder ne conserverait qu'un
 * fantôme. Il n'est PAS que de l'hygiène — sans lui, « réinitialiser » remet le
 * document à `null`, la lecture redescend sur janvier, et la remise à zéro ne
 * remet rien à zéro tout en n'étant plus visible nulle part.
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
  PRIVACY_PREFERENCES_DEFAULTS,
  type PrivacyPreferencesDefaults,
} from '../../config/user-preferences-defaults';

/** Ce que la base porte VRAIMENT : les clés absentes relèvent des défauts. */
export type StoredPrivacyPreferences = Partial<Record<keyof PrivacyPreferencesDefaults, boolean>>;

/**
 * Les clés que le serveur OBÉIT, lues du document JSON.
 *
 * Elles se dérivent des DÉFAUTS, pas du mapping hérité. Les deux ensembles ont
 * coïncidé tant qu'aucune préférence n'était née après janvier 2026, et cette
 * coïncidence a été prise pour une définition : `PRIVACY_KEY_MAPPING` est FIGÉ
 * par l'histoire des lignes kebab-case, tandis que l'ensemble des préférences
 * obéies, lui, grandit. Dériver d'ici plutôt que de là fait qu'une préférence
 * neuve est lue du seul fait d'avoir un défaut — au lieu d'exiger qu'on lui
 * invente une clé héritée qui n'a jamais existé en base.
 */
const PRIVACY_DTO_KEYS = Object.keys(PRIVACY_PREFERENCES_DEFAULTS) as Array<
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

  const legacy = await loadLegacyPrivacyRows(prisma, withoutDocument);
  for (const [userId, stored] of legacy) resolved.set(userId, stored);

  return resolved;
}

/**
 * Les seules lignes de janvier, sans le document — le second temps de la
 * résolution, isolé pour que la lecture d'un seul utilisateur le réemprunte
 * plutôt que de le réécrire.
 */
async function loadLegacyPrivacyRows(
  prisma: PrismaClient,
  userIds: ReadonlyArray<string>
): Promise<Map<string, StoredPrivacyPreferences>> {
  const resolved = new Map<string, StoredPrivacyPreferences>();

  const rows = await prisma.userPreference.findMany({
    where: { userId: { in: [...userIds] }, key: { in: LEGACY_DB_KEYS } },
    select: { userId: true, key: true, value: true },
  });

  for (const row of rows) {
    const dtoKey = PRIVACY_KEY_REVERSE_MAPPING[row.key];
    if (!dtoKey) continue;

    const stored = resolved.get(row.userId) ?? {};
    stored[dtoKey] = row.value === 'true';
    resolved.set(row.userId, stored);
  }

  return resolved;
}

/**
 * Ce que le serveur tient pour STOCKÉ chez un utilisateur, à l'usage des routes.
 *
 * Diffère de `loadStoredPrivacyPreferences` sur un point : celui-ci ne modélise
 * que les huit clés que les portes de diffusion consultent, tandis que l'écran
 * en sert seize. Le document brut est donc superposé au résultat du résolveur —
 * il gagne partout où il parle, ce qui reproduit exactement la règle des portes
 * pour les huit, et préserve `encryptionPreference` et consorts pour le reste.
 *
 * NON mémoïsé, à dessein. Le cache des portes (`privacy-cache`) tolère cinq
 * minutes de retard parce qu'une écriture le purge ; un écran de réglages, lui,
 * n'a pas le droit d'afficher une valeur qu'un AUTRE processus vient de
 * changer — ce serait le défaut qu'on referme, sous un autre nom.
 */
export async function resolveStoredPrivacyPreferences(
  prisma: PrismaClient,
  userId: string
): Promise<Record<string, unknown>> {
  const row = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { privacy: true },
  });

  const document =
    row?.privacy && typeof row.privacy === 'object' && !Array.isArray(row.privacy)
      ? (row.privacy as Record<string, unknown>)
      : {};

  if (fromJsonDocument(row?.privacy)) return document;

  const legacy = await loadLegacyPrivacyRows(prisma, [userId]);

  return { ...(legacy.get(userId) ?? {}), ...document };
}

/**
 * Retire les lignes de janvier d'un utilisateur — voir l'en-tête du module.
 *
 * Ne touche QUE les huit clés de confidentialité : la table `UserPreference`
 * porte aussi le suivi d'affiliation (`AffiliateTrackingService`), qui n'a
 * rien à voir avec un réglage de confidentialité.
 */
export async function retireLegacyPrivacyRows(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  await prisma.userPreference.deleteMany({
    where: { userId, key: { in: LEGACY_DB_KEYS } },
  });
}
