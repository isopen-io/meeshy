import Foundation
import MeeshySDK

/// Libellé d'opération pour un `OutboxUIItem`, dérivé de son `kind` et de son
/// `iconKind`. Vit dans la couche app (pas le SDK) parce que la pureté du SDK
/// interdit les préoccupations de localisation applicatives — le SDK expose les
/// énumérations structurelles `OutboxUIItem.Kind` / `IconKind`, l'app décide
/// comment les formuler à l'utilisateur.
///
/// Les libellés rendus décrivent **l'action en cours**, pas l'objet mis en file
/// (« Envoi de message » plutôt que « Message »), pour que la pastille se lise
/// comme un état du travail de fond et non comme une liste d'objets en attente.
///
/// Utilisé par `SyncPill`.
enum SyncPillLabels {

    /// Libellé traduit d'une opération en file.
    ///
    /// Sensible au statut : une ligne `.failed` / `.exhausted` n'est PLUS en
    /// cours d'envoi — lui laisser le verbe actif « Envoi de… » était faux (la
    /// ligne peut traîner des jours après un échec définitif). Les lignes
    /// terminales se lisent donc comme un échec, les lignes en attente ou en
    /// vol gardent le verbe d'action.
    static func operationLabel(for item: OutboxUIItem,
                               bundle: Bundle = .main,
                               locale: Locale = .current) -> String {
        switch item.status {
        case .failed, .exhausted:
            return failedLabel(for: item, bundle: bundle, locale: locale)
        case .pending, .inflight:
            return inProgressLabel(for: item, bundle: bundle, locale: locale)
        }
    }

    /// Formulation « en cours » — l'opération est en attente ou en vol. Retombe
    /// sur « Synchronisation » pour un genre inconnu, afin que la pastille garde
    /// du sens si un nouveau `OutboxKind` sort sans formulation dédiée.
    private static func inProgressLabel(for item: OutboxUIItem,
                                        bundle: Bundle,
                                        locale: Locale) -> String {
        switch item.kind {
        case .message:
            switch item.iconKind {
            case .audio:
                return String(localized: "sync.pill.sending.audio", defaultValue: "Envoi d'audio", bundle: bundle, locale: locale)
            case .image:
                return String(localized: "sync.pill.sending.image", defaultValue: "Envoi d'image", bundle: bundle, locale: locale)
            case .video:
                return String(localized: "sync.pill.sending.video", defaultValue: "Envoi de vidéo", bundle: bundle, locale: locale)
            case .file:
                return String(localized: "sync.pill.sending.file", defaultValue: "Envoi de fichier", bundle: bundle, locale: locale)
            case .sticker:
                return String(localized: "sync.pill.sending.sticker", defaultValue: "Envoi de sticker", bundle: bundle, locale: locale)
            case .text, .reaction, .none:
                return String(localized: "sync.pill.sending.message", defaultValue: "Envoi de message", bundle: bundle, locale: locale)
            }
        case .edit:
            return String(localized: "sync.pill.editing.message", defaultValue: "Édition de message", bundle: bundle, locale: locale)
        case .delete:
            return String(localized: "sync.pill.deleting.message", defaultValue: "Suppression de message", bundle: bundle, locale: locale)
        case .reaction:
            return String(localized: "sync.pill.sending.reaction", defaultValue: "Envoi de réaction", bundle: bundle, locale: locale)
        case .story:
            switch item.iconKind {
            case .video:
                return String(localized: "sync.pill.publishing.story.video", defaultValue: "Publication de story vidéo", bundle: bundle, locale: locale)
            default:
                return String(localized: "sync.pill.publishing.story", defaultValue: "Publication de story", bundle: bundle, locale: locale)
            }
        case .postComment:
            switch item.iconKind {
            case .audio:
                return String(localized: "sync.pill.sending.comment.audio", defaultValue: "Envoi de commentaire audio", bundle: bundle, locale: locale)
            default:
                return String(localized: "sync.pill.sending.comment", defaultValue: "Envoi de commentaire", bundle: bundle, locale: locale)
            }
        case .postReaction:
            return String(localized: "sync.pill.reacting.post", defaultValue: "Réaction au post", bundle: bundle, locale: locale)
        case .other(let raw):
            return otherLabel(forRaw: raw, bundle: bundle, locale: locale)
        }
    }

    /// Formulation d'échec — l'opération a renoncé (`.failed` / `.exhausted`).
    /// Le point de la pastille est déjà rouge ; le texte énonce le résultat
    /// (« … non envoyé ») au lieu d'un verbe actif, pour qu'une ligne terminale
    /// oubliée ne se lise jamais comme un travail encore en cours.
    private static func failedLabel(for item: OutboxUIItem,
                                    bundle: Bundle,
                                    locale: Locale) -> String {
        switch item.kind {
        case .message:
            return String(localized: "sync.pill.failed.message", defaultValue: "Message non envoyé", bundle: bundle, locale: locale)
        case .edit:
            return String(localized: "sync.pill.failed.edit", defaultValue: "Édition non envoyée", bundle: bundle, locale: locale)
        case .delete:
            return String(localized: "sync.pill.failed.delete", defaultValue: "Suppression non effectuée", bundle: bundle, locale: locale)
        case .reaction:
            return String(localized: "sync.pill.failed.reaction", defaultValue: "Réaction non envoyée", bundle: bundle, locale: locale)
        case .story:
            return String(localized: "sync.pill.failed.story", defaultValue: "Story non publiée", bundle: bundle, locale: locale)
        case .postComment:
            return String(localized: "sync.pill.failed.comment", defaultValue: "Commentaire non envoyé", bundle: bundle, locale: locale)
        case .postReaction:
            return String(localized: "sync.pill.failed.postReaction", defaultValue: "Réaction non envoyée", bundle: bundle, locale: locale)
        case .other(let raw):
            return failedOtherLabel(forRaw: raw, bundle: bundle, locale: locale)
        }
    }

    /// Formulation au mieux pour les `OutboxKind` sans `OutboxUIItem.Kind`
    /// dédié (accusés de lecture, mises à jour de profil, demandes d'ami,
    /// blocages…). Chacun a son verbe propre pour que la rotation se lise comme
    /// une liste d'opérations de fond distinctes, pas comme dix
    /// « Synchronisation » identiques.
    private static func otherLabel(forRaw raw: String,
                                   bundle: Bundle,
                                   locale: Locale) -> String {
        switch raw {
        case "markAsRead":
            return String(localized: "sync.pill.other.markAsRead", defaultValue: "Synchronisation des lus", bundle: bundle, locale: locale)
        case "markStoryViewed":
            return String(localized: "sync.pill.other.markStoryViewed", defaultValue: "Synchronisation des vues story", bundle: bundle, locale: locale)
        case "reportAttachmentStatus":
            return String(localized: "sync.pill.other.attachmentStatus", defaultValue: "Synchronisation des lectures média", bundle: bundle, locale: locale)
        case "sendFriendRequest":
            return String(localized: "sync.pill.other.friendRequest", defaultValue: "Demande d'ami", bundle: bundle, locale: locale)
        case "respondFriendRequest":
            return String(localized: "sync.pill.other.friendResponse", defaultValue: "Réponse demande d'ami", bundle: bundle, locale: locale)
        case "blockUser":
            return String(localized: "sync.pill.other.block", defaultValue: "Blocage utilisateur", bundle: bundle, locale: locale)
        case "unblockUser":
            return String(localized: "sync.pill.other.unblock", defaultValue: "Déblocage utilisateur", bundle: bundle, locale: locale)
        case "createConversation":
            return String(localized: "sync.pill.other.createConversation", defaultValue: "Création de conversation", bundle: bundle, locale: locale)
        case "updateConversation":
            return String(localized: "sync.pill.other.updateConversation", defaultValue: "Mise à jour conversation", bundle: bundle, locale: locale)
        case "updateProfile":
            return String(localized: "sync.pill.other.updateProfile", defaultValue: "Mise à jour profil", bundle: bundle, locale: locale)
        case "updateSettings":
            return String(localized: "sync.pill.other.updateSettings", defaultValue: "Mise à jour réglages", bundle: bundle, locale: locale)
        case "createPost":
            return String(localized: "sync.pill.other.createPost", defaultValue: "Publication de post", bundle: bundle, locale: locale)
        case "createReel":
            return String(localized: "sync.pill.other.createReel", defaultValue: "Publication de réel", bundle: bundle, locale: locale)
        case "createStatus":
            return String(localized: "sync.pill.other.createStatus", defaultValue: "Publication de mood", bundle: bundle, locale: locale)
        case "deleteComment":
            return String(localized: "sync.pill.other.deleteComment", defaultValue: "Suppression commentaire", bundle: bundle, locale: locale)
        default:
            return String(localized: "sync.pill.other.generic", defaultValue: "Synchronisation", bundle: bundle, locale: locale)
        }
    }

    /// Formulation d'échec pour les genres `.other(raw)`.
    private static func failedOtherLabel(forRaw raw: String,
                                         bundle: Bundle,
                                         locale: Locale) -> String {
        switch raw {
        case "markAsRead":
            return String(localized: "sync.pill.failed.markAsRead", defaultValue: "Lus non synchronisés", bundle: bundle, locale: locale)
        case "markStoryViewed":
            return String(localized: "sync.pill.failed.markStoryViewed", defaultValue: "Vues story non synchronisées", bundle: bundle, locale: locale)
        case "reportAttachmentStatus":
            return String(localized: "sync.pill.failed.attachmentStatus", defaultValue: "Lectures média non synchronisées", bundle: bundle, locale: locale)
        case "sendFriendRequest":
            return String(localized: "sync.pill.failed.friendRequest", defaultValue: "Demande d'ami non envoyée", bundle: bundle, locale: locale)
        case "respondFriendRequest":
            return String(localized: "sync.pill.failed.friendResponse", defaultValue: "Réponse demande d'ami échouée", bundle: bundle, locale: locale)
        case "blockUser":
            return String(localized: "sync.pill.failed.block", defaultValue: "Blocage non effectué", bundle: bundle, locale: locale)
        case "unblockUser":
            return String(localized: "sync.pill.failed.unblock", defaultValue: "Déblocage non effectué", bundle: bundle, locale: locale)
        case "createConversation":
            return String(localized: "sync.pill.failed.createConversation", defaultValue: "Conversation non créée", bundle: bundle, locale: locale)
        case "updateConversation":
            return String(localized: "sync.pill.failed.updateConversation", defaultValue: "Conversation non mise à jour", bundle: bundle, locale: locale)
        case "updateProfile":
            return String(localized: "sync.pill.failed.updateProfile", defaultValue: "Profil non mis à jour", bundle: bundle, locale: locale)
        case "updateSettings":
            return String(localized: "sync.pill.failed.updateSettings", defaultValue: "Réglages non enregistrés", bundle: bundle, locale: locale)
        case "createPost":
            return String(localized: "sync.pill.failed.createPost", defaultValue: "Post non publié", bundle: bundle, locale: locale)
        case "createReel":
            return String(localized: "sync.pill.failed.createReel", defaultValue: "Réel non publié", bundle: bundle, locale: locale)
        case "createStatus":
            return String(localized: "sync.pill.failed.createStatus", defaultValue: "Mood non publié", bundle: bundle, locale: locale)
        case "deleteComment":
            return String(localized: "sync.pill.failed.deleteComment", defaultValue: "Commentaire non supprimé", bundle: bundle, locale: locale)
        default:
            return String(localized: "sync.pill.failed.generic", defaultValue: "Échec de synchronisation", bundle: bundle, locale: locale)
        }
    }
}
