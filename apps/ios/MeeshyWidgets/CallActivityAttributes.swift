import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// **Ce que la Live Activity d'appel montre** (#9782) — l'appel Meeshy en
/// cours, dans la Dynamic Island et sur l'écran verrouillé.
///
/// Compilé dans les DEUX cibles (`project.yml`) : l'app l'écrit
/// (`CallActivityLaw`), l'extension de widgets le peint. Tout le texte arrive
/// LOCALISÉ par l'app : l'extension ne traduit rien.
nonisolated struct CallActivitySnapshot: Codable, Hashable, Sendable {
    enum Phase: String, Codable, Hashable, Sendable {
        case ringing
        case connecting
        case connected
        case onHold
        case reconnecting
        case ended
    }

    /// La dernière phrase sous-titrée, déjà servie dans la langue du lecteur.
    struct Caption: Codable, Hashable, Sendable {
        var speaker: String
        var text: String
        /// « EN → FR » quand la phrase est une traduction, `nil` sinon.
        var languageTag: String?
    }

    var phase: Phase
    var title: String
    var statusLabel: String
    var initials: String
    var accentHex: String
    var isVideo: Bool
    var isMuted: Bool
    /// Début du compteur de durée — `nil` tant que le média n'est pas établi.
    var connectedSince: Date?
    /// Le compteur se répète dans l'îlot compact seulement quand le système ne
    /// montre pas déjà l'appel (CallKit affiche sa propre durée).
    var showsDurationInCompact: Bool
    var caption: Caption?
}

/// Les mots fixes de l'activité, localisés par l'app à l'ouverture.
nonisolated struct CallActivityLabels: Codable, Hashable, Sendable {
    var mute: String
    var unmute: String
    var hangUp: String
}

#if canImport(ActivityKit)
@available(iOS 16.1, *)
nonisolated struct CallActivityAttributes: ActivityAttributes, Sendable {
    typealias ContentState = CallActivitySnapshot
    var labels: CallActivityLabels
}
#endif
