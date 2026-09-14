/**
 * Les blocs de `Message.metadata` que le CLIENT déclare — par des champs DÉDIÉS.
 *
 * Le client n'envoie JAMAIS de `metadata` brut : l'enveloppe porte des champs à
 * autorité serveur (`postReplyTo`, `trackingLinks`, résumés d'appel) qu'un
 * passthrough permettrait de forger. Ce qu'il a le droit d'y déposer voyage
 * dans un champ racine de la requête (`location`, `sticker`), passe par SON
 * parseur — qui rend une copie blanchie ou `null` — et c'est le serveur seul
 * qui range le résultat sous `metadata`.
 *
 * Site UNIQUE de cette composition : ajouter un bloc déclaré par le client se
 * fait ici, jamais en posant une clé de plus dans `saveMessage` — c'est ainsi
 * que chaque bloc passe par un parseur, sans exception qu'on oublie.
 *
 * Chiffrement : ces blocs se stockent EN CLAIR, au même régime que
 * `postReplyTo` / `trackingLinks` (décision assumée, cf. `sharedPlace.ts`).
 */
import { parseSharedPlace, type SharedPlace } from '../location/sharedPlace';
import { parseMessageSticker } from '../stickers/messageSticker';
import type { MessageSticker } from '@meeshy/shared/types/message-sticker';
import { parseAttachmentReplyTo, type AttachmentReplyTo } from './attachmentReplySnapshot';

export type ClientDeclaredMetadataInput = {
  readonly location?: unknown;
  readonly sticker?: unknown;
  readonly attachmentReplyTo?: unknown;
};

export type ClientDeclaredMetadata = {
  readonly location?: SharedPlace;
  readonly sticker?: MessageSticker;
  readonly attachmentReplyTo?: AttachmentReplyTo;
};

/** Ne pose une clé que pour un bloc VALIDE : un bloc refusé n'existe pas. */
export function clientDeclaredMetadata(input: ClientDeclaredMetadataInput): ClientDeclaredMetadata {
  const location = parseSharedPlace(input.location);
  const sticker = parseMessageSticker(input.sticker);
  // #6164 — la pièce NOMMÉE d'une réponse. Le transport ne dépose ici que ce
  // qu'`admitAttachmentReply` a déjà ADMIS : l'appartenance au message cité se
  // vérifie en base, ce que ce site (pur) ne peut pas faire. Le parseur reste
  // posé quand même — il est la frontière de la FORME, et c'est lui qui
  // garantit qu'aucun champ révocable (vignette, nom, taille, durée) ne se fige
  // sous `metadata`, quel que soit ce que l'appelant a bien voulu passer.
  const attachmentReplyTo = parseAttachmentReplyTo(input.attachmentReplyTo);
  return {
    ...(location ? { location } : {}),
    ...(sticker ? { sticker } : {}),
    ...(attachmentReplyTo ? { attachmentReplyTo } : {}),
  };
}
