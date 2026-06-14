import Foundation
import MeeshySDK

/// French operation label for an `OutboxUIItem`, derived from its `kind` and
/// `iconKind`. Lives in the app layer (not the SDK) because SDK purity bans
/// app-side localization concerns — the SDK exposes the structural
/// `OutboxUIItem.Kind` / `IconKind` enums, the app decides how to phrase them
/// to the user.
///
/// Returned labels are the **action being performed**, not the noun being
/// queued (e.g. "Envoi de message" not "Message"), so the pill reads as a
/// status of latent background work rather than a list of queued objects.
///
/// Used by `SyncPill` (replaces the generic single-label "Synchronisation…"
/// chip in `ConnectionBanner` when `OfflineQueue` has pending items).
enum SyncPillLabels {

    /// Maps `(kind, iconKind)` to the user-facing French operation label.
    /// Falls back to "Synchronisation" for unknown kinds so the pill still
    /// makes sense if a new `OutboxKind` ships without explicit phrasing.
    static func operationLabel(for item: OutboxUIItem) -> String {
        switch item.kind {
        case .message:
            switch item.iconKind {
            case .audio:    return "Envoi d'audio"
            case .image:    return "Envoi d'image"
            case .video:    return "Envoi de vidéo"
            case .file:     return "Envoi de fichier"
            case .sticker:  return "Envoi de sticker"
            case .text, .reaction, .none:
                return "Envoi de message"
            }
        case .edit:
            return "Édition de message"
        case .delete:
            return "Suppression de message"
        case .reaction:
            return "Envoi de réaction"
        case .story:
            switch item.iconKind {
            case .video:    return "Publication de story vidéo"
            case .image:    return "Publication de story"
            default:        return "Publication de story"
            }
        case .postComment:
            switch item.iconKind {
            case .audio:    return "Envoi de commentaire audio"
            default:        return "Envoi de commentaire"
            }
        case .postReaction:
            return "Réaction au post"
        case .other(let raw):
            return otherLabel(forRaw: raw)
        }
    }

    /// Best-effort phrasing for `OutboxKind` cases that don't map onto a
    /// dedicated `OutboxUIItem.Kind` (markAsRead, profile updates, friend
    /// requests, blocks, etc.). Each surfaces as a distinct verb so the
    /// rotation reads like a list of in-flight background ops, not a queue
    /// of "Synchronisation" duplicates.
    private static func otherLabel(forRaw raw: String) -> String {
        switch raw {
        case "markAsRead":              return "Synchronisation des lus"
        case "sendFriendRequest":       return "Demande d'ami"
        case "respondFriendRequest":    return "Réponse demande d'ami"
        case "blockUser":               return "Blocage utilisateur"
        case "unblockUser":             return "Déblocage utilisateur"
        case "createConversation":      return "Création de conversation"
        case "updateConversation":      return "Mise à jour conversation"
        case "updateProfile":           return "Mise à jour profil"
        case "updateSettings":          return "Mise à jour réglages"
        case "createPost":              return "Publication de post"
        case "createReel":              return "Publication de réel"
        case "deleteComment":           return "Suppression commentaire"
        default:                        return "Synchronisation"
        }
    }
}
