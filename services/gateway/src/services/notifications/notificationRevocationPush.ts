import { notificationLogger } from '../../utils/logger-enhanced';
import type { RetractedNotification } from './retractedNotifications';

/**
 * Le push de RÉVOCATION — la moitié « appareil » d'un retrait de notification.
 *
 * La famille `retract*` supprime la ligne `Notification` et l'annonce sur le
 * socket (`notification:deleted`). Ce canal n'atteint qu'un appareil déjà là :
 * un téléphone dont l'app est tuée garde la bannière qu'APNs/FCM lui a livrée,
 * et « X a réagi ❤️ » y survit au ❤️ retiré exactement comme la ligne survivait
 * en base avant la famille `retract*`. Le push de révocation est le geste
 * symétrique du push nominal : un signal de CONTRÔLE, silencieux, sans rien
 * d'affichable, que chaque client traduit en « retirer ces bannières ».
 *
 * Le contrat, partagé par les trois clients :
 *
 *   data = {
 *     type: 'notification_revoked',
 *     notificationIds: '<id1>,<id2>,…',       // ≤ 40 ids par push
 *     conversationIds?: '<c1>,,<c3>',         // même ordre ; '' sans conversation ;
 *     types?: 'new_message,,message_reaction',// même ordre ; le type de la ligne
 *   }                                         // LÀ où elle porte une conversation.
 *                                             // Les deux absents si aucune ligne
 *                                             // ne porte de conversation.
 *
 * `conversationIds` existe parce que deux clients n'indexent PAS leurs bannières
 * par notification : le web (`tag = conversationId`) et Android
 * (`notify(conversationId.hashCode())`) les remplacent par conversation, et ne
 * savent retirer qu'à cette maille.
 *
 * `types` existe parce que cette maille ne vaut QUE pour un arrivage de message.
 * `createNotification` pose `data.conversationId` pour tous les types — une
 * réaction à un message porte la conversation de ce message —, si bien qu'un
 * client qui révoque « par conversation » sans regarder le type annule la
 * bannière du DERNIER message du fil : un message valide, jamais lu, que plus
 * rien ne rappelle. Le type ne voyage que là où une conversation l'accompagne :
 * ailleurs il ne qualifierait rien, et la charge APNs est bornée à 4 Ko.
 *
 * Aucun `unreadCount` ni badge ici : les compteurs voyagent déjà par
 * `notification:counts`, et un push de contrôle ne porte rien qui se lise.
 *
 * MOBILE uniquement (`NOTIFICATION_REVOCATION_PUSH_PLATFORMS`) : voir le
 * commentaire de cette constante — sur le web, un data-only n'est pas
 * silencieux et la dérogation aux préférences ne se justifie plus.
 *
 * Seules les lignes dont un push EST parti (`delivery.pushSent`) entrent : sans
 * push nominal il n'y a aucune bannière sur l'appareil, et l'audience d'un post
 * se compte en dizaines de milliers de lignes dont la plupart n'ont jamais rien
 * poussé.
 *
 * Ce module construit les lots (fonction pure) et les remet au transport en
 * BEST EFFORT, EN SÉRIE : le push est un effet du retrait, jamais sa condition.
 */

export const NOTIFICATION_REVOCATION_PUSH_TYPE = 'notification_revoked';

/**
 * Plafond d'ids par push. 40 ObjectIds joints tiennent dans ~1 Ko, très loin du
 * budget APNs (4 Ko) même avec `conversationIds` en face — et un retrait qui
 * révoque davantage (un post à large audience) n'envoie de toute façon qu'une
 * ligne ou deux par destinataire.
 */
export const NOTIFICATION_REVOCATION_PUSH_BATCH_SIZE = 40;

/** `voip` exclu : un push de contrôle vers PushKit ferait sonner un faux appel. */
export const NOTIFICATION_REVOCATION_PUSH_TOKEN_TYPES: ReadonlyArray<'apns' | 'fcm'> = ['apns', 'fcm'];

/**
 * MOBILE seulement — le web est exclu, même motif que `call-push-mirroring`,
 * et pour deux raisons qui se cumulent :
 *
 *  1. Un push data-only sans `webpush.notification` n'est pas silencieux sur le
 *     web : Chrome affiche sa bannière générique (« Ce site a été mis à jour en
 *     arrière-plan ») dès que le budget d'engagement du site est épuisé. Une
 *     RÉVOCATION produirait alors une notification FANTÔME, chez quelqu'un qui
 *     n'avait peut-être aucune bannière à faire disparaître — l'inverse exact
 *     de ce que ce push existe pour faire.
 *  2. Le contournement des préférences (`bypassDnd`, y compris
 *     `pushEnabled: false`) se justifie par l'INVISIBILITÉ du signal : sur iOS
 *     et Android, un push data-only ne s'affiche jamais. Sur le web, cette
 *     prémisse est fausse, donc la dérogation ne tient plus.
 *
 * Ce que le web perd, et c'est assumé : un onglet FERMÉ garde sa bannière
 * jusqu'au clic. L'onglet ouvert, lui, la retire par le socket
 * (`notification:deleted` → `closeDeliveredNotifications`), déjà câblé.
 */
export const NOTIFICATION_REVOCATION_PUSH_PLATFORMS: ReadonlyArray<'ios' | 'android'> = ['ios', 'android'];

/**
 * Durée de vie du push de révocation chez FCM — SIX HEURES.
 *
 * Un TTL est indispensable, et celui de la sonnerie (60 s) ne convient pas.
 * FCM ne stocke que 100 messages NON-COLLAPSIBLES par appareil hors ligne,
 * puis les jette TOUS : la purge d'un post à large audience, sans TTL, occupe
 * ces créneaux pendant les ~4 semaines de rétention par défaut et évince les
 * pushes de VRAIS messages qui attendaient le même appareil. Elle le réveille
 * aussi hors Doze, en priorité haute, pour une dé-réaction vieille de
 * plusieurs semaines.
 *
 * Six heures parce que la borne doit couvrir une nuit d'appareil éteint — la
 * bannière est encore là au réveil — sans survivre au-delà : passé ce délai,
 * la notification qu'elle vise a été vue, balayée, ou noyée. Contrairement à
 * la sonnerie, rien de PIRE n'arrive si elle expire : la bannière périmée
 * reste, et le tap retombe sur le retrait déjà appliqué côté serveur.
 */
export const NOTIFICATION_REVOCATION_TTL_MS = 6 * 60 * 60 * 1_000;

export type NotificationRevocationPushData = {
  readonly type: typeof NOTIFICATION_REVOCATION_PUSH_TYPE;
  readonly notificationIds: string;
  readonly conversationIds?: string;
  readonly types?: string;
};

export type NotificationRevocationPush = {
  readonly userId: string;
  readonly payload: {
    readonly title: '';
    readonly body: '';
    readonly silent: true;
    readonly data: NotificationRevocationPushData;
  };
  readonly types: Array<'apns' | 'fcm'>;
  readonly platforms: Array<'ios' | 'android'>;
  readonly bypassDnd: true;
};

/**
 * La seule surface du service push que la révocation touche — structurelle,
 * pour que ni ce module ni `PushNotificationService` n'importe l'autre.
 */
export interface NotificationRevocationPushSender {
  sendToUser(options: NotificationRevocationPush): Promise<unknown>;
}

/** Reconnaît la charge de révocation — ce que le transport lit pour la classer en contrôle. */
export function isNotificationRevocationPush(payload: {
  readonly data?: Readonly<Record<string, string>>;
}): boolean {
  return payload.data?.type === NOTIFICATION_REVOCATION_PUSH_TYPE;
}

type RecipientBatch = {
  readonly ids: readonly string[];
  readonly conversationIds: readonly string[];
  readonly types: readonly string[];
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );
}

function groupByRecipient(revoked: readonly RetractedNotification[]): Map<string, RecipientBatch> {
  return revoked.reduce((groups, row) => {
    if (!row.id || !row.userId) return groups;
    // Rien n'a été livré à un appareil : il n'y a rien à y retirer.
    if (row.pushSent !== true) return groups;
    const current = groups.get(row.userId) ?? { ids: [], conversationIds: [], types: [] };
    if (current.ids.includes(row.id)) return groups;
    const conversationId = row.conversationId ?? '';
    return new Map(groups).set(row.userId, {
      ids: [...current.ids, row.id],
      conversationIds: [...current.conversationIds, conversationId],
      // Le type QUALIFIE la conversation : hors d'elle il ne décide rien, et
      // l'omettre garde la charge loin du plafond APNs.
      types: [...current.types, conversationId ? row.type ?? '' : ''],
    });
  }, new Map<string, RecipientBatch>());
}

function buildPush(userId: string, batch: RecipientBatch): NotificationRevocationPush {
  const carriesConversation = batch.conversationIds.some((conversationId) => conversationId !== '');
  return {
    userId,
    payload: {
      title: '',
      body: '',
      silent: true,
      data: {
        type: NOTIFICATION_REVOCATION_PUSH_TYPE,
        notificationIds: batch.ids.join(','),
        ...(carriesConversation
          ? {
              conversationIds: batch.conversationIds.join(','),
              types: batch.types.join(','),
            }
          : {}),
      },
    },
    types: [...NOTIFICATION_REVOCATION_PUSH_TOKEN_TYPES],
    platforms: [...NOTIFICATION_REVOCATION_PUSH_PLATFORMS],
    bypassDnd: true,
  };
}

/** Un push par destinataire et par lot de 40 — jamais un par ligne. */
export function buildNotificationRevocationPushes(
  revoked: readonly RetractedNotification[]
): NotificationRevocationPush[] {
  return [...groupByRecipient(revoked)].flatMap(([userId, batch]) => {
    const idChunks = chunk(batch.ids, NOTIFICATION_REVOCATION_PUSH_BATCH_SIZE);
    const conversationChunks = chunk(batch.conversationIds, NOTIFICATION_REVOCATION_PUSH_BATCH_SIZE);
    const typeChunks = chunk(batch.types, NOTIFICATION_REVOCATION_PUSH_BATCH_SIZE);
    return idChunks.map((ids, index) =>
      buildPush(userId, {
        ids,
        conversationIds: conversationChunks[index] ?? [],
        types: typeChunks[index] ?? [],
      })
    );
  });
}

/**
 * Remet les lots au transport, UN À UN. Ne rejette JAMAIS : la ligne est déjà
 * partie de la base, et l'appelant est un retrait dont le résultat ne doit pas
 * dépendre d'APNs. Les destinataires sont indépendants — la panne de l'un
 * n'emporte pas les autres.
 *
 * En SÉRIE, et non en `Promise.all` : le drainage de
 * `retractPostNotifications` documente que « le pic reste celui d'un seul lot
 * quelle que soit la taille de l'audience », pour une audience qu'il chiffre à
 * 40 000 lignes. Une rafale parallèle sur tous les destinataires rendait ce
 * plafond caduc et ouvrait des dizaines de milliers d'envois concurrents vers
 * APNs et FCM. La révocation est un effet de FOND : rien n'attend sa vitesse.
 */
export async function sendNotificationRevocationPushes(params: {
  readonly pushService: NotificationRevocationPushSender | undefined;
  readonly revoked: readonly RetractedNotification[];
}): Promise<void> {
  const { pushService } = params;
  if (!pushService) return;

  const pushes = buildNotificationRevocationPushes(params.revoked);

  for (const push of pushes) {
    try {
      await pushService.sendToUser(push);
    } catch (error) {
      notificationLogger.warn('notification revocation push failed — retraction already durable', {
        userId: push.userId,
        notificationIds: push.payload.data.notificationIds,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
