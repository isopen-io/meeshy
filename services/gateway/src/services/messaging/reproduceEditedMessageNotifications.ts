import { enhancedLogger } from '../../utils/logger-enhanced';
import { textSynthesis } from '../notifications/content-synthesis';
import { protectedPreview } from '../notifications/notification-preview';
import { editedMessageBody, editedReactionBody } from '../notifications/edited-synthesis';
import { RECIPIENT_LANG_SELECT, recipientLanguage, type RecipientLanguagePrefs } from '../../utils/recipient-language';
import type {
  ReproducedNotification,
  ReproducedNotificationAnnouncer,
} from '../notifications/reproducedNotifications';

const log = enhancedLogger.child({ module: 'reproduceEditedMessageNotifications' });

/**
 * ANNULER puis REPRODUIRE les notifications d'un message qu'on vient d'éditer.
 *
 * Le pendant exact de `retractMessageNotifications`, et la même cause que toute
 * la famille des cycles 46/47/48/50/51 : la ligne `Notification` garde une copie
 * DÉNORMALISÉE du contenu, qu'aucune lecture ne rafraîchit — elle ne relit
 * jamais le message. Le retrait rendait cette copie mensongère et l'emportait ;
 * l'ÉDITION la rend tout aussi mensongère, et RIEN ne passait la corriger. Le
 * destinataire gardait indéfiniment dans sa liste le texte d'AVANT, y compris
 * quand l'édition existait précisément pour retirer ce qui n'aurait pas dû être
 * écrit.
 *
 * **Réécriture EN PLACE, et non `delete` + `create`.** C'est l'arbitrage
 * central, et il tient à `isRead` : détruire puis recréer ferait repasser en NON
 * LUE une notification déjà consommée, si bien que la moindre correction de
 * faute de frappe re-sonnerait chez le destinataire et remonterait son compteur
 * de non-lus. Une édition doit RAFRAÎCHIR le texte, pas ressusciter l'alerte.
 * L'écriture ne mentionne donc jamais `isRead` ni `readAt`.
 *
 * **L'ANNONCE, elle, est bien un couple annuler/reproduire** — c'est là que le
 * geste demandé se voit. Les clients ne connaissent que `notification:deleted`
 * et `notification:new` ; il n'existe pas d'événement « modifiée », et en
 * introduire un demanderait de le câbler sur web, iOS et Android avant que quoi
 * que ce soit ne s'affiche. Le couple exprime la mise à jour avec les deux seuls
 * verbes que les clients savent DÉJÀ recevoir.
 *
 * DEUX différences de forme avec le retrait, et elles décident l'implémentation :
 *
 *  1. **La cible se lit par une VRAIE COLONNE.** `Notification.messageId`
 *     duplique `context.messageId` précisément pour cet usage, donc pas de
 *     `$runCommandRaw` ici : un `findMany` Prisma typé suffit, et il rend les
 *     blobs `context`/`metadata` dont la réécriture a besoin — ce qu'une
 *     commande brute rendrait en Extended JSON.
 *  2. **Chaque type porte l'extrait SOUS UNE CLÉ DIFFÉRENTE, et deux d'entre
 *     eux ne dérivent pas leur corps du message.** D'où la table ci-dessous
 *     plutôt qu'une réécriture uniforme : appliquer le nouveau texte au
 *     `content` d'un `message_reaction` remplacerait « X a réagi ❤️ » par le
 *     message lui-même.
 */

/**
 * Ce que chaque type de notification a copié du message, et où.
 *
 * Les quatre types sont exactement ceux qui écrivent `context.messageId` (donc
 * la colonne) : `new_message`, `user_mentioned`, `message_reply` et
 * `message_reaction`. Les trois premiers font de l'extrait leur CORPS ; le
 * quatrième a pour corps une phrase qui ne dérive pas du message, et range sa
 * copie sous une troisième clé.
 */
const PREVIEW_METADATA_KEY: Readonly<Record<string, string>> = {
  new_message: 'messagePreview',
  user_mentioned: 'messagePreview',
  message_reply: 'messagePreview',
  message_reaction: 'messageContent',
};

/** Les types dont `content` EST l'extrait (éventuellement suivi de badges). */
const BODY_DERIVES_FROM_MESSAGE = new Set(['new_message', 'user_mentioned', 'message_reply']);

interface NotificationRow {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly content: string;
  readonly context: unknown;
  readonly metadata: unknown;
}

/**
 * La seule surface Prisma que la reproduction touche, énumérée pour qu'un
 * appelant sache exactement ce qu'il autorise.
 */
export interface EditedMessageNotificationPrisma {
  /**
   * Cycle 123 bis — la relecture des drapeaux de PROTECTION. Le port grandit
   * d'un délégué parce que la question ne peut pas être posée à l'appelant :
   * `applyMessageEditEffects` reçoit un `EditedMessageRecord` qui ne porte que
   * l'identité et les deux contenus, et les QUATRE transports d'édition le
   * construisent chacun de leur côté. Une garde de confidentialité qui dépend
   * du câblage de l'appelant échoue en montrant PLUS.
   */
  message: {
    findUnique(args: {
      where: { id: string };
      select: {
        messageType: true;
        isEncrypted: true;
        isViewOnce: true;
        isBlurred: true;
        effectFlags: true;
        expiresAt: true;
        createdAt: true;
      };
    }): Promise<ProtectionFlagsRow | null>;
  };
  /** #14309 — la langue de CADRAGE de chaque destinataire, dans laquelle sa synthèse est écrite. */
  user: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: typeof RECIPIENT_LANG_SELECT & { id: true };
    }): Promise<ReadonlyArray<RecipientLanguagePrefs & { readonly id: string }>>;
  };
  notification: {
    // Le `select` est typé LITTÉRALEMENT (`true`, pas `boolean`) : c'est ce qui
    // permet à la signature générique de Prisma d'être structurellement
    // assignable à ce port. Avec `Record<string, boolean>`, Prisma ne peut
    // inférer aucun champ et rend `{}[]`.
    findMany(args: {
      where: { messageId: string };
      select: {
        id: true;
        userId: true;
        type: true;
        content: true;
        context: true;
        metadata: true;
      };
    }): Promise<readonly NotificationRow[]>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

/** Ce que la relecture de protection rend — la forme que `protectedPreview` lit. */
export interface ProtectionFlagsRow {
  readonly messageType: string | null;
  readonly isEncrypted: boolean | null;
  readonly isViewOnce: boolean | null;
  readonly isBlurred: boolean | null;
  readonly effectFlags: number | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date | null;
}

/**
 * Le message édité est-il PROTÉGÉ ?
 *
 * Fail-CLOSED, à l'inverse du reste de cette unité (best-effort) : une lecture
 * qui ne conclut pas répond OUI, et l'édition laisse alors les copies telles
 * quelles. Le pire cas est une ligne qui garde un texte périmé d'un cycle ;
 * l'autre sens démasquerait un secret, et personne ne le rattraperait.
 */
async function isProtectedMessage(
  prisma: EditedMessageNotificationPrisma,
  messageId: string
): Promise<boolean> {
  try {
    const row = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        messageType: true, isEncrypted: true, isViewOnce: true,
        isBlurred: true, effectFlags: true, expiresAt: true, createdAt: true,
      },
    });
    if (!row) return true;
    return protectedPreview(row) !== null;
  } catch (error) {
    log.warn('message edit: protection re-read failed — copies left untouched', { messageId, error });
    return true;
  }
}

function asBlob(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/**
 * #14309 — la langue de CADRAGE de chaque destinataire, lue une fois pour
 * toutes les lignes. Best-effort : une lecture qui tombe retombe sur le repli,
 * la synthèse ne porte aucun texte du message quelle que soit sa langue.
 */
async function framingLanguages(
  prisma: EditedMessageNotificationPrisma,
  userIds: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { ...RECIPIENT_LANG_SELECT, id: true },
    });
    return new Map(users.map((user) => [user.id, recipientLanguage(user, 'fr')]));
  } catch (error) {
    log.warn('message edit: recipient language read failed — fallback language', { error });
    return new Map();
  }
}

export async function reproduceEditedMessageNotifications(
  prisma: EditedMessageNotificationPrisma,
  edited: { readonly messageId: string; readonly content: string | null },
  announcer: ReproducedNotificationAnnouncer | undefined
): Promise<number> {
  if (!edited.messageId) return 0;

  // Un contenu vidé est une édition LÉGITIME — le retrait de la légende d'un
  // message à pièce jointe — et non un « rien à faire » : la copie dénormalisée
  // doit bien perdre l'ancien texte. Seul `null` (aucune écriture de contenu)
  // se lit comme une chaîne vide, ce que le producteur faisait déjà.
  const rows = await prisma.notification.findMany({
    where: { messageId: edited.messageId },
    select: { id: true, userId: true, type: true, content: true, context: true, metadata: true },
  });

  if (rows.length === 0) return 0;

  // Cycle 123 bis — un message PROTÉGÉ ne se DÉMASQUE pas par une édition.
  //
  // Les lignes de ce message portent un placeholder (« 👁️ 💬 »), posé par
  // l'éventail via `protectedPreview`, et cette réécriture y substituait le
  // nouveau texte EN CLAIR — pour tous ceux déjà notifiés, des TIERS — avant de
  // le réannoncer (`notification:deleted` + `notification:new`). Mesuré : rien
  // n'interdit d'éditer un message protégé.
  //
  // Ne RIEN réécrire est la bonne issue, pas seulement la prudente : le
  // placeholder ne dérive pas du contenu, donc une édition du contenu ne le
  // périme pas. Sa seule part variable — la durée d'un éphémère — ne bouge pas
  // non plus, l'édition ne touchant aucun drapeau.
  if (await isProtectedMessage(prisma, edited.messageId)) return 0;

  const reproduced: ReproducedNotification[] = [];
  const languages = await framingLanguages(prisma, rows.map((row) => row.userId));

  for (const row of rows) {
    const previewKey = PREVIEW_METADATA_KEY[row.type];
    // Un type inconnu porte peut-être `messageId` sans rien avoir copié du
    // texte : le réécrire à l'aveugle inventerait un contenu.
    if (!previewKey) continue;

    const metadata = asBlob(row.metadata);
    const context = asBlob(row.context);
    const previousPreview = typeof metadata[previewKey] === 'string'
      ? (metadata[previewKey] as string)
      : '';

    const lang = languages.get(row.userId) ?? 'fr';

    // L'édition PURGE `Message.translations` (le pipeline retraduit le nouveau
    // texte). La traduction embarquée ici décrit donc l'ANCIEN texte — et c'est
    // elle que le Prisme affiche EN PRIORITÉ, si bien que la laisser
    // remplacerait le nouveau message par l'ancien, traduit. La purge vise ces
    // deux clés seulement ; le reste du contexte (conversation, pièces jointes,
    // horodatage) décrit le message et non son texte.
    delete context['translatedContent'];
    delete context['translatedLanguage'];

    // #14309 — le corps est une SYNTHÈSE : seule la longueur du texte change,
    // et l'aperçu persisté (que les clients in-app préfèrent au corps) le suit.
    const content = BODY_DERIVES_FROM_MESSAGE.has(row.type)
      ? editedMessageBody({ lang, body: row.content ?? '', previousPreview, nextText: edited.content ?? '' })
      : editedReactionBody({ lang, body: row.content ?? '', nextText: edited.content ?? '' });
    metadata[previewKey] = BODY_DERIVES_FROM_MESSAGE.has(row.type) ? content : textSynthesis(lang, edited.content);
    const data: Record<string, unknown> = { metadata, context, content };

    try {
      await prisma.notification.update({ where: { id: row.id }, data });
      reproduced.push({ id: row.id, userId: row.userId });
    } catch (err) {
      // Une ligne récalcitrante ne doit pas priver les AUTRES destinataires de
      // leur rafraîchissement : l'édition est déjà persistée pour tout le monde.
      // Elle n'est pas annoncée non plus — annoncer une réécriture qui n'a pas
      // eu lieu ferait ré-afficher un texte que la base ne porte pas.
      log.warn('message edit: notification reproduction failed for one row', {
        messageId: edited.messageId,
        notificationId: row.id,
        err,
      });
    }
  }

  // L'annonce APRÈS l'écriture durable, et jamais l'inverse : ce que les
  // clients ré-affichent doit être ce que la base porte.
  if (reproduced.length > 0) {
    await announcer?.announceNotificationsReproduced(reproduced);
  }

  return reproduced.length;
}
