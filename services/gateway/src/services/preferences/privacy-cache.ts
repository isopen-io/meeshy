/**
 * L'UNIQUE mémoire des préférences de confidentialité côté serveur.
 *
 * ## Pourquoi ce module existe
 *
 * Une même préférence — « montrer mes accusés de lecture », « mon statut en
 * ligne », « mon vu à », « que je suis en train d'écrire » — gouverne SIX portes
 * de diffusion, servies par des objets différents :
 *
 * | Porte | Lecteur |
 * |---|---|
 * | indicateur de frappe | `StatusHandler` |
 * | accusés de livraison | `MessageHandler` |
 * | drain de reconnexion | `MeeshySocketIOManager` |
 * | statut en ligne, « vu à » | `PresenceVisibilityService` |
 * | accusés de lecture (diffusion) | `broadcastReadStatus`, depuis TROIS plugins de routes |
 * | accusés de lecture (exposition) | `MessageReadStatusService` |
 *
 * Chacun mémoïsait dans son coin : cinq `Map` d'instance de
 * `PrivacyPreferencesService` — le gestionnaire Socket.IO, le singleton de
 * présence et un par plugin de routes, chacune avec son propre `setInterval` de
 * nettoyage — plus un cache statique dans `MessageReadStatusService`. Six copies
 * de la même donnée, six horloges, et **aucun point où une écriture pouvait les
 * atteindre** : `PrivacyPreferencesService.invalidateCache` existait sans le
 * moindre appelant, et l'y brancher n'aurait purgé qu'une copie sur six.
 *
 * Conséquence vécue : couper ses accusés de lecture prenait effet jusqu'à cinq
 * minutes plus tard, pendant lesquelles le serveur diffusait exactement ce que
 * l'utilisateur venait de demander de taire — pendant que l'écran lui confirmait
 * que le réglage était pris.
 *
 * ## La règle
 *
 * Une donnée, un cache. Il vit au niveau MODULE, à côté du résolveur dont il
 * mémoïse le résultat (`privacy-storage.ts`) — pas dans une instance, parce que
 * les instances se comptent par plugin et par requête. Toute porte d'écriture
 * appelle `invalidatePrivacyPreferences(userId)` : un seul point d'entrée,
 * atteignable sans tenir la référence d'un service, donc sans câblage.
 *
 * `BoundedTtlCache` plutôt qu'une `Map` : elle borne la mémoire et expire seule,
 * sans le `setInterval` qui, capturant `this`, empêchait la collecte de chaque
 * instance de `PrivacyPreferencesService`.
 *
 * ## Ce qu'on ne met PAS en cache
 *
 * Les échecs. `loadStoredPrivacyPreferences` ne rattrape rien et ce module non
 * plus : un incident transitoire de base ne doit pas figer un repli pour cinq
 * minutes. Chaque appelant garde son propre repli, et la lecture suivante
 * retente.
 *
 * **Le repli appartient à l'appelant, et il n'est pas le même partout** — cette
 * phrase disait « tous « ouvert », tout le monde reste visible », ce qui décrit
 * cinq appelants sur six et ne prescrit rien. Le discriminant, mesuré (#4530) :
 *
 * | ce que la préférence décide | repli | appelants |
 * |---|---|---|
 * | si un CHAMP part dans une charge qui part de toute façon | **ouvert** — se fermer priverait tout le monde d'un contenu sur la foi d'un incident | `PrivacyPreferencesService` (×2), `MessageReadStatusService._loadReadReceiptOptOuts`, `forward-source-visibility` (×2) |
 * | à QUI la charge est adressée | **restrictif** — la room de l'acteur : il reste synchronisé, l'audience ne s'élargit pas | `routes/messages-writes.ts` (`attachment-status:updated`) |
 *
 * Et un appelant SANS repli à lui n'hérite pas d'un défaut raisonnable : il
 * hérite du `catch` qui l'entoure. Celui de la diffusion ne se replie sur rien
 * — il journalise et passe —, si bien qu'une lecture en échec faisait
 * DISPARAÎTRE l'événement pendant que la route rendait 200.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BoundedTtlCache } from '../../utils/bounded-cache.js';
import {
  loadStoredPrivacyPreferences,
  type StoredPrivacyPreferences,
} from './privacy-storage.js';

/**
 * TTL de 5 min : les préférences changent rarement, et une écriture purge —
 * l'expiration ne rattrape donc plus qu'un changement venu d'un AUTRE processus
 * de gateway, jamais celui de l'utilisateur qui vient de régler.
 *
 * Borne de 5000 entrées, alignée sur les autres caches chauds de la gateway.
 */
const PRIVACY_PREFERENCES_CACHE = new BoundedTtlCache<string, StoredPrivacyPreferences>({
  maxSize: 5000,
  ttlMs: 5 * 60 * 1000,
});

/** Un utilisateur sans réglage stocké est un résultat comme un autre : le
 *  mémoïser évite de repayer la requête à chaque accusé qu'il déclenche. */
const NOTHING_STORED: StoredPrivacyPreferences = Object.freeze({});

/**
 * Résout les préférences stockées, en ne demandant à la base que ce qui manque.
 *
 * Rend une entrée pour CHAQUE identifiant demandé — `{}` quand la base ne porte
 * rien pour lui. Les deux lecteurs traitent déjà l'absence de clé comme « le
 * défaut s'applique », l'entrée vide leur est donc transparente.
 *
 * Ne rattrape aucune erreur : voir l'en-tête du module.
 */
export async function loadPrivacyPreferencesCached(
  prisma: PrismaClient,
  userIds: ReadonlyArray<string>
): Promise<Map<string, StoredPrivacyPreferences>> {
  const resolved = new Map<string, StoredPrivacyPreferences>();
  const misses: string[] = [];

  for (const userId of new Set(userIds)) {
    const cached = PRIVACY_PREFERENCES_CACHE.get(userId);
    if (cached) resolved.set(userId, cached);
    else misses.push(userId);
  }

  if (misses.length === 0) return resolved;

  const stored = await loadStoredPrivacyPreferences(prisma, misses);

  for (const userId of misses) {
    const preferences = stored.get(userId) ?? NOTHING_STORED;
    PRIVACY_PREFERENCES_CACHE.set(userId, preferences);
    resolved.set(userId, preferences);
  }

  return resolved;
}

/**
 * Le point d'entrée que TOUTE porte d'écriture doit appeler.
 *
 * Purge un seul utilisateur : une écriture n'a aucune raison de refroidir la
 * mémoire des autres, et le faire rendrait chaque réglage coûteux à l'échelle
 * d'un serveur chargé.
 */
export function invalidatePrivacyPreferences(userId: string): void {
  PRIVACY_PREFERENCES_CACHE.delete(userId);
}

/** Remise à zéro complète — pour l'isolation des tests et `clearCache()`. */
export function clearPrivacyPreferencesCache(): void {
  PRIVACY_PREFERENCES_CACHE.clear();
}

/** Nombre d'utilisateurs actuellement mémoïsés (métriques). */
export function privacyPreferencesCacheSize(): number {
  return PRIVACY_PREFERENCES_CACHE.size;
}
