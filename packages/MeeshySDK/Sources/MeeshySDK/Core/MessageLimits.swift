import Foundation

/// **Les limites qu'un message tient côté CLIENT** — miroir de
/// `MAX_MESSAGE_LENGTH` de `@meeshy/shared` (`packages/shared/utils/languages.ts`).
///
/// Décision porteur 2026-10-01 : les frontends déclarent 2000 caractères ; la
/// passerelle en accepte 4000 (`services/gateway/src/config/message-limits.ts`),
/// mais seulement pour les envois API programmatiques. Au-delà de 2000, un texte
/// composé dans l'app part en pièce jointe `.txt` (#9037).
///
/// La mesure se fait comme en JavaScript (`content.length`), en unités UTF-16 :
/// sur `utf16.count`, jamais sur `count` (un emoji y vaut 1, le serveur 2).
public enum MessageLimits {
    /// `MAX_MESSAGE_LENGTH` de `@meeshy/shared` : la longueur d'un message composé par un frontend.
    public static let maxMessageLength = 2000
}
