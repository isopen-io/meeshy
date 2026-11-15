import Foundation
import MeeshySDK

/// Les chaînes de l'écran « Médias, liens et documents » (#8103) — mêmes clés
/// et mêmes mots que le web (`apps/web/src/lib/interface-catalogs/catalog-*-media-hub.ts`).
enum ConversationMediaHubCopy {

    static var title: String { String(localized: "media_hub.title", defaultValue: "Médias, liens et documents", bundle: .main) }
    static var searchPlaceholder: String { String(localized: "media_hub.search.placeholder", defaultValue: "Rechercher", bundle: .main) }
    static var segmentsLabel: String { String(localized: "media_hub.segments.label", defaultValue: "Genres", bundle: .main) }
    static var loading: String { String(localized: "media_hub.loading", defaultValue: "Chargement…", bundle: .main) }
    static var error: String { String(localized: "media_hub.error", defaultValue: "Impossible de charger cette liste.", bundle: .main) }
    static var retry: String { String(localized: "media_hub.retry", defaultValue: "Réessayer", bundle: .main) }
    static var offline: String { String(localized: "media_hub.offline", defaultValue: "Hors ligne — les éléments déjà vus restent affichés.", bundle: .main) }
    static var offlineEmpty: String { String(localized: "media_hub.offline_empty", defaultValue: "Hors ligne — cette liste n’a pas encore été chargée.", bundle: .main) }
    static var moreError: String { String(localized: "media_hub.more_error", defaultValue: "La suite n’a pas pu être chargée.", bundle: .main) }
    static var goToMessage: String { String(localized: "media_hub.go_to_message", defaultValue: "Aller au message", bundle: .main) }
    static var openPlace: String { String(localized: "media_hub.open_place", defaultValue: "Ouvrir dans Plans", bundle: .main) }
    static var placeFallback: String { String(localized: "media_hub.place.fallback", defaultValue: "Lieu partagé", bundle: .main) }
    static var allLoaded: String { String(localized: "media_hub.all_loaded", defaultValue: "Tout est chargé", bundle: .main) }

    static func searchLabel(_ segment: String) -> String {
        String(format: String(localized: "media_hub.search.label", defaultValue: "Rechercher dans %@", bundle: .main), segment)
    }

    static func empty(_ segment: String) -> String {
        String(format: String(localized: "media_hub.empty", defaultValue: "Rien à afficher dans « %@ » pour l’instant.", bundle: .main), segment)
    }

    static func emptySearch(_ query: String) -> String {
        String(format: String(localized: "media_hub.empty_search", defaultValue: "Aucun résultat pour « %@ ».", bundle: .main), query)
    }

    static func openLink(_ host: String) -> String {
        String(format: String(localized: "media_hub.open_link", defaultValue: "Ouvrir %@", bundle: .main), host)
    }

    static func tile(isVideo: Bool, sender: String, date: String) -> String {
        let format = isVideo
            ? String(localized: "media_hub.tile.video", defaultValue: "Vidéo de %1$@, %2$@", bundle: .main)
            : String(localized: "media_hub.tile.image", defaultValue: "Photo de %1$@, %2$@", bundle: .main)
        return String(format: format, sender, date)
    }

    static func kind(_ kind: ConversationMediaKind) -> String {
        switch kind {
        case .visual: return String(localized: "media_hub.kind.visual", defaultValue: "Médias", bundle: .main)
        case .audio: return String(localized: "media_hub.kind.audio", defaultValue: "Audio", bundle: .main)
        case .document: return String(localized: "media_hub.kind.document", defaultValue: "Documents", bundle: .main)
        case .link: return String(localized: "media_hub.kind.link", defaultValue: "Liens", bundle: .main)
        case .contact: return String(localized: "media_hub.kind.contact", defaultValue: "Contacts", bundle: .main)
        case .conversation: return String(localized: "media_hub.kind.conversation", defaultValue: "Conversations", bundle: .main)
        case .location: return String(localized: "media_hub.kind.location", defaultValue: "Lieux", bundle: .main)
        }
    }

    static func icon(_ kind: ConversationMediaKind) -> String {
        switch kind {
        case .visual: return "photo.on.rectangle.angled"
        case .audio: return "waveform"
        case .document: return "doc.fill"
        case .link: return "link"
        case .contact: return "person.crop.rectangle"
        case .conversation: return "bubble.left.and.bubble.right.fill"
        case .location: return "mappin.and.ellipse"
        }
    }
}
