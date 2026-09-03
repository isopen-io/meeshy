import { maskedAttachment, protectedPreview } from '../notifications/NotificationService';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  transformTranslationsToArray,
  type MessageTranslationJSON,
} from '../../utils/translation-transformer';

/**
 * Ce qu'une CITATION a le droit de transporter — site UNIQUE des trois
 * producteurs de `replyTo` (liste REST, `message:new` socket, `message:new`
 * REST/ZMQ).
 *
 * La garde posée au cycle #4945 ne retenait que les TRADUCTIONS du message
 * cité : deux lignes plus haut, `...message.replyTo` répandait la ligne
 * entière, `content` compris, et le `select` de la citation servait ses pièces
 * jointes par `attachmentFullSelect` — donc `fileUrl`, `thumbnailUrl`,
 * `thumbHash`, les dimensions et la TRANSCRIPTION d'un vocal. Répondre à un
 * message à vue unique republiait donc son secret en clair (texte ET média)
 * dans chaque bulle-citation du fil, pour tout lecteur, aussi longtemps que la
 * réponse existait. **Une garde se mesure sur tout ce que la charge
 * TRANSPORTE, jamais sur sa seule chaîne** (leçon 275).
 *
 * Le masquage vivait, lui, à 100 % dans les peaux SwiftUI d'iOS
 * (`APIMessageReplyTo.isProtected`, `QuotedReplyPresentation.thumbHash`) : le
 * web, un export ou un client tiers lisaient le secret. Ici la charge
 * elle-même cesse de le contenir.
 *
 * L'ÉPHÉMÈRE n'est pas une protection au sens de la citation — son texte est
 * lisible dans le fil jusqu'à l'expiration, et la citation vit dans ce même fil.
 * Même lecture exactement que `APIMessageReplyTo.isProtected` côté iOS : sans
 * cette symétrie, la passerelle masquerait un texte que le client affiche, ou
 * l'inverse.
 */
export type QuotedMessageRow = {
  readonly content?: string | null;
  readonly messageType?: string | null;
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly isEncrypted?: boolean | null;
  readonly effectFlags?: number | null;
  readonly createdAt?: Date | string | null;
  /// Lu par PERSONNE ici — déclaré pour que le site d'appel puisse répandre
  /// une ligne entière sans conversion : l'éphémère n'est pas une protection
  /// au sens de la citation (voir l'en-tête).
  readonly expiresAt?: Date | string | null;
  readonly id?: string;
  readonly translations?: unknown;
  readonly attachments?: unknown;
};

const MASKING_FLAGS = MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED;

/**
 * Vue unique, flouté ou chiffré — par les champs hérités OU par le bitfield
 * canonique (`effectFlags`, seul porteur quand un client envoie le bit sans le
 * champ). Le prédicat historique ne lisait pas le bitfield ; le contrat
 * `reply-message-protection-contract` le nomme pourtant comme le porteur
 * canonique, et iOS le lit.
 */
export const quotedMessageIsProtected = (quoted: QuotedMessageRow | null | undefined): boolean => {
  if (!quoted) return false;
  const flags = quoted.effectFlags ?? 0;
  return Boolean(
    quoted.isViewOnce || quoted.isBlurred || quoted.isEncrypted || (flags & MASKING_FLAGS) !== 0
  );
};

/** Le strict discriminant d'une pièce jointe masquée : de quoi choisir une icône, rien de plus. */
const maskedQuotedAttachment = (att: Record<string, unknown>): Record<string, unknown> => ({
  id: att['id'],
  messageId: att['messageId'],
  mimeType: att['mimeType'],
  isViewOnce: att['isViewOnce'] ?? null,
  isBlurred: att['isBlurred'] ?? null,
  effectFlags: att['effectFlags'] ?? null,
});

/**
 * Les champs qu'une citation a le droit de SERVIR, à étaler PAR-DESSUS la
 * forme propre à chaque transport (le sender reste au site d'appel : les deux
 * fils le composent délibérément différemment).
 *
 * Trois décisions, jamais une :
 *  1. le TEXTE — remplacé par le placeholder de `protectedPreview`, le même
 *     vocabulaire que la bannière et que le placeholder iOS ; jamais vidé, un
 *     corps VIDE n'étant pas un choix de produit (cycle 125 bis) ;
 *  2. les TRADUCTIONS — projetées carte Mongo → tableau (la forme que tout
 *     client lit), et retirées quand le message est protégé : une traduction
 *     est le même secret en N langues ;
 *  3. le MÉDIA — retenu aux DEUX niveaux qui déclarent une protection, celui
 *     du MESSAGE et celui de la PIÈCE JOINTE (`maskedAttachment`), miroir de
 *     `QuotedReplyPresentation.thumbHash` qui refuse déjà le flou ThumbHash
 *     d'un média protégé.
 */
export function servedQuotedMessage(
  quoted: QuotedMessageRow | null | undefined,
  options?: { readonly includeTranslations?: boolean; readonly languages?: readonly string[] }
): Record<string, unknown> {
  if (!quoted) return {};
  const isProtected = quotedMessageIsProtected(quoted);
  const served: Record<string, unknown> = {};

  if (isProtected) {
    // La protection VOYAGE AVEC le placeholder. Un texte masqué sans la
    // déclaration qui le qualifie est un texte qu'aucun client ne peut
    // interpréter : iOS compose SON placeholder depuis `isProtected` et refuse
    // le ThumbHash sur cette seule foi. Le producteur REST/ZMQ reconstruisait
    // sa citation champ par champ et n'en portait AUCUN.
    served['isViewOnce'] = Boolean(quoted.isViewOnce);
    served['isBlurred'] = Boolean(quoted.isBlurred);
    served['isEncrypted'] = Boolean(quoted.isEncrypted);
    served['effectFlags'] = quoted.effectFlags ?? 0;
    // `expiresAt: null` DÉLIBÉRÉMENT : la précédence de `protectedPreview` met
    // l'éphémère devant, et la citation ne le tient pas pour une protection.
    served['content'] = protectedPreview({
      messageType: quoted.messageType ?? null,
      isViewOnce: quoted.isViewOnce,
      isBlurred: quoted.isBlurred,
      isEncrypted: quoted.isEncrypted,
      effectFlags: quoted.effectFlags,
      expiresAt: null,
    })?.preview ?? '';
  }

  // Toujours POSÉE, même absente : la clé étale `undefined` par-dessus la
  // carte Mongo brute que `...message.replyTo` vient de répandre au site
  // d'appel — sans quoi le blob voyagerait sous un nom que les clients lisent
  // comme un tableau, et le décodage iOS de la citation entière échouerait.
  const mayServeTranslations = options?.includeTranslations !== false && !isProtected;
  served['translations'] =
    mayServeTranslations && quoted.translations && typeof quoted.translations === 'object'
      ? Array.isArray(quoted.translations)
        ? quoted.translations
        : transformTranslationsToArray(
            quoted.id ?? '',
            quoted.translations as Record<string, MessageTranslationJSON>,
            options?.languages && options.languages.length > 0 ? { languages: options.languages } : undefined
          )
      : undefined;

  if (Array.isArray(quoted.attachments)) {
    served['attachments'] = quoted.attachments.map((att) => {
      const row = (att ?? {}) as Record<string, unknown>;
      const protection = {
        isViewOnce: row['isViewOnce'] as boolean | null | undefined,
        isBlurred: row['isBlurred'] as boolean | null | undefined,
        effectFlags: row['effectFlags'] as number | null | undefined,
      };
      return isProtected || maskedAttachment(protection) ? maskedQuotedAttachment(row) : att;
    });
  }

  return served;
}
