import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import {
  conversationMessageStatsService,
  statsAuthorKey,
} from '../ConversationMessageStatsService';
import { sharedTranslationSourceVersion } from '@meeshy/shared/utils/shared-translation-eligibility';
import { reproduceEditedMessageNotifications } from './reproduceEditedMessageNotifications';
import type { ReproducedNotificationAnnouncer } from '../notifications/reproducedNotifications';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { eraseSharedTranslations } from './sharedTranslationErasure';

const log = enhancedLogger.child({ module: 'messageEditEffects' });

/**
 * TOUT ce qu'une édition de message doit écrire en base, en un seul endroit.
 *
 * Troisième unité de la même famille, après `runMessagePostSaveEffects` (ce
 * qu'un message committé doit à sa conversation) et `applyMessageRemovalEffects`
 * (ce que son retrait lui doit). Elle existe pour la même raison mesurée :
 * QUATRE transports écrivent un nouveau contenu — le handler socket
 * `message:edit`, `PUT /conversations/:id/messages/:mid`, `PUT /messages/:id`
 * (iOS) et `PATCH /messages/:id` (Android) — et un seul ajustait les compteurs
 * de la conversation. Chez les trois autres, `totalWords` et `totalCharacters`
 * restaient ceux du texte D'ORIGINE, définitivement : il n'existe aucun
 * recalcul périodique pour les rattraper.
 *
 * C'est le jumeau d'`messageEditAdmission` du côté des ÉCRITURES : celui-là dit
 * qui peut éditer et jusqu'à quand, `messageEditContent` dit ce qu'on a le droit
 * d'écrire, celui-ci dit ce que l'écriture entraîne. Dont l'effacement des
 * traductions PARTAGÉES des versions que l'édition périme (#9899) : la table
 * voisine de `Message.translations` gardait la version scellée du texte
 * d'AVANT, que l'édition existait peut-être précisément pour retirer.
 *
 * BEST-EFFORT, délibérément : quand ceci s'exécute, le nouveau contenu est DÉJÀ
 * committé. Un compteur récalcitrant ne doit jamais transformer une édition
 * réussie en 500.
 */
export interface EditedMessageRecord {
  readonly id: string;
  readonly conversationId: string;
  /** `Participant.id` de l'auteur. */
  readonly senderId: string;
  /** `Participant.userId` — `null` pour un anonyme. Cf. `statsAuthorKey`. */
  readonly senderUserId: string | null;
  /** Le contenu AVANT l'écriture. */
  readonly previousContent: string | null;
  /**
   * Le contenu tel qu'il est PERSISTÉ — après `trim` et après réécriture des
   * liens. C'est lui que relit `recompute()`, l'autorité : compter le contenu
   * de la REQUÊTE ferait diverger l'ajustement de son propre recalcul.
   */
  readonly content: string | null;
  /**
   * L'instant d'édition TEL QU'IL VIENT D'ÊTRE ÉCRIT dans `Message.editedAt` —
   * la même valeur, pas un `new Date()` relu plus loin : la version de source
   * d'une traduction partagée en est l'ISO (`sharedTranslationSourceVersion`), et
   * deux instants distincts de quelques millisecondes feraient effacer par
   * erreur la version courante, ou épargner une version périmée. REQUIS, pour
   * qu'un cinquième transport d'édition ne puisse pas l'oublier.
   */
  readonly editedAt: Date;
}

/**
 * La version de source que cette édition vient d'écrire, ou `undefined` quand
 * rien ne permet de la lire.
 *
 * `undefined` a ici un sens précis : TOUTES les versions du message partent.
 * C'est le sens sûr, et ce n'est pas celui que la fonction partagée donnerait
 * d'elle-même — `sharedTranslationSourceVersion(undefined)` rend `'original'`,
 * soit exactement la version que toute édition PÉRIME. Une date absente ou
 * illisible, passée telle quelle, épargnerait donc les lignes du texte d'avant.
 */
function writtenSourceVersion(editedAt: Date | null | undefined): string | undefined {
  if (!editedAt) return undefined;
  return sharedTranslationSourceVersion(editedAt) ?? undefined;
}

export async function applyMessageEditEffects(
  prisma: PrismaClient,
  message: EditedMessageRecord,
  // Défaut = le service PARTAGÉ du processus, le seul câblé avec `io`. Même
  // résolution que `applyPostRemovalEffects` : les quatre transports d'édition
  // n'ont ainsi rien à câbler, et un appelant hors serveur (worker, script,
  // test) réécrit quand même les lignes, sans annonce.
  announcer: ReproducedNotificationAnnouncer | undefined = getSharedNotificationService()
): Promise<void> {
  // Les traductions PARTAGÉES des versions que cette édition vient de périmer
  // (#9899). Elles passent EN PREMIER pour la raison des notifications ci-dessous
  // — leur retard se lit comme une fuite : le texte d'avant reste lisible, pour
  // qui détient la clé. Ne lit que `id` et `editedAt`, que rien de ce qui suit
  // ne peut invalider. La version qu'on vient d'écrire est ÉPARGNÉE : un appareil
  // a pu la partager entre l'écriture de l'édition et cet appel, et c'est la
  // seule que la passerelle sert encore. BEST-EFFORT dans l'unité même.
  await eraseSharedTranslations(prisma, {
    messageIds: [message.id],
    keepSourceVersion: writtenSourceVersion(message.editedAt),
  });

  try {
    await conversationMessageStatsService.onMessageEdited(
      prisma,
      message.conversationId,
      statsAuthorKey(message.senderId, message.senderUserId),
      message.previousContent ?? '',
      message.content ?? ''
    );
  } catch (err) {
    log.warn('message edit: stats adjustment failed', { messageId: message.id, err });
  }

  // Les notifications que le message a produites portent une copie
  // DÉNORMALISÉE de son texte, qu'aucune lecture ne rafraîchit. Le second des
  // deux effets, et le SEUL des deux dont le retard se voit : tant qu'il n'a
  // pas eu lieu, l'inbox de tous les destinataires affiche le texte d'AVANT —
  // y compris quand l'édition existait précisément pour retirer ce qui
  // n'aurait pas dû être écrit. Les compteurs, eux, ne se lisent nulle part en
  // temps réel.
  try {
    await reproduceEditedMessageNotifications(
      prisma,
      { messageId: message.id, content: message.content },
      announcer
    );
  } catch (err) {
    log.warn('message edit: notification reproduction failed', { messageId: message.id, err });
  }
}
