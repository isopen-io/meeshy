import { enhancedLogger } from '../../utils/logger-enhanced';
import { truncateByCodePoints } from '../../utils/truncate-text';
import { protectedPreview } from '../notifications/NotificationService';
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

/**
 * Longueur d'extrait. Même valeur que `createReactionNotification`, qui est le
 * seul producteur à tronquer lui-même : un extrait laissé entier gonflerait la
 * ligne à chaque édition d'un long message.
 */
const PREVIEW_MAX_LENGTH = 100;

type JsonBlob = Record<string, unknown> | null | undefined;

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
 * Le corps d'un `new_message` n'est PAS l'extrait : c'est ce que
 * `buildMessageNotificationBodyI18n` en a fait — l'extrait SUIVI des badges de
 * pièces jointes (« 📎 2 fichiers »). Remplacer `content` par le seul nouvel
 * extrait détruirait ces badges.
 *
 * On ne remplace donc que le PRÉFIXE, et l'ancien extrait — lisible dans
 * `metadata` — donne sa longueur. Le suffixe est reconduit tel quel, ce qui
 * évite d'avoir à re-résoudre la langue du destinataire (les badges sont
 * localisés) et à reconstruire la liste des pièces jointes, dont la ligne ne
 * garde qu'un résumé.
 *
 * Quand l'ancien extrait était VIDE, le corps est entièrement dérivé des pièces
 * jointes (« Photo · 📎 2 fichiers ») : il n'y a pas de préfixe à remplacer, et
 * on le laisse tel quel. C'est le seul cas approximatif — le libellé de pièce
 * jointe reste EXACT, il ne devient pas mensonger, il ignore juste la légende
 * que l'édition vient d'ajouter.
 */
function rewriteBody(previousBody: string, previousPreview: string, nextPreview: string): string {
  if (previousPreview === '') return previousBody;
  if (!previousBody.startsWith(previousPreview)) return nextPreview;
  return nextPreview + previousBody.slice(previousPreview.length);
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
  const nextPreview = truncateByCodePoints(edited.content ?? '', PREVIEW_MAX_LENGTH, '…');

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

    metadata[previewKey] = nextPreview;

    // L'édition PURGE `Message.translations` (le pipeline retraduit le nouveau
    // texte). La traduction embarquée ici décrit donc l'ANCIEN texte — et c'est
    // elle que le Prisme affiche EN PRIORITÉ, si bien que la laisser
    // remplacerait le nouveau message par l'ancien, traduit. La purge vise ces
    // deux clés seulement ; le reste du contexte (conversation, pièces jointes,
    // horodatage) décrit le message et non son texte.
    delete context['translatedContent'];
    delete context['translatedLanguage'];

    const data: Record<string, unknown> = { metadata, context };
    if (BODY_DERIVES_FROM_MESSAGE.has(row.type)) {
      data['content'] = rewriteBody(row.content ?? '', previousPreview, nextPreview);
    }

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
