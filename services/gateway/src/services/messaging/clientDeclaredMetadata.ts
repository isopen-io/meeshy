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

export type ClientDeclaredMetadataInput = {
  readonly location?: unknown;
  readonly sticker?: unknown;
};

export type ClientDeclaredMetadata = {
  readonly location?: SharedPlace;
  readonly sticker?: MessageSticker;
};

/** Ne pose une clé que pour un bloc VALIDE : un bloc refusé n'existe pas. */
export function clientDeclaredMetadata(input: ClientDeclaredMetadataInput): ClientDeclaredMetadata {
  const location = parseSharedPlace(input.location);
  const sticker = parseMessageSticker(input.sticker);
  return {
    ...(location ? { location } : {}),
    ...(sticker ? { sticker } : {}),
  };
}
