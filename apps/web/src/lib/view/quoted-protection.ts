import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

/* Extrait de `quoted-preview.ts` (#7926) : le puits temps réel des éditions
   en a besoin sans tirer les catalogues d'interface dans le chunk du socket. */
const MASKING_FLAGS = MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED;

type QuotedProtectionFields = {
  readonly isViewOnce?: boolean;
  readonly isBlurred?: boolean;
  readonly isEncrypted?: boolean;
  readonly effectFlags?: number;
};

/**
 * LA MOITIÉ CLIENTE DE `quotedMessageIsProtected`
 * (`services/gateway/src/services/messaging/servedQuotedMessage.ts`) — MÊME
 * prédicat, MÊME lecture du bitfield canonique.
 *
 * DISTINCT de `protectionOf` (`lib/reading-mode/protection.ts`), et ce n'est
 * pas une jumelle : celle-là répond « quel tombstone cette RANGÉE peint-elle,
 * à cet instant ? » et compte donc l'éphémère échu ; celle-ci répond « cette
 * CITATION a-t-elle le droit de décrire ce qu'elle cite ? », question à
 * laquelle la passerelle a déjà répondu dans la charge — et pour laquelle
 * l'éphémère n'est PAS une protection (son texte est lisible dans le fil
 * jusqu'à l'expiration, et la citation vit dans ce même fil). Poser ici la
 * loi de la rangée masquerait un texte que le serveur sert, et le client
 * dirait alors autre chose que les deux autres.
 */
export const quotedIsProtected = (quoted: QuotedProtectionFields): boolean =>
  Boolean(
    quoted.isViewOnce ||
      quoted.isBlurred ||
      quoted.isEncrypted ||
      ((quoted.effectFlags ?? 0) & MASKING_FLAGS) !== 0,
  );
