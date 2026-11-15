import SwiftUI
import MeeshySDK

// MARK: - Chrome (tenues de rendu)

/// Tenue de rendu du player — paramètre OPAQUE : le SDK rend la tenue qu'on
/// lui tend, il ne décide JAMAIS laquelle s'applique à quelle rangée. La
/// décision (« rangée ordinaire vs rangée élue » du mode Focal) vit côté app
/// (SDK Purity — même règle que `initialTranscriptionLanguage` ci-dessous).
nonisolated public enum AudioPlayerChrome: String, Sendable, Equatable, CaseIterable {
    /// Rendu historique : carte (fond + bord), chips, bloc karaoké. Défaut de
    /// tous les sites d'appel existants.
    case card
    /// Bande NUE : play + waveform + durée, transcription à plat en italique
    /// « … » tronquée — rien d'autre.
    case flatMinimal
    /// Bande nue ENRICHIE : + vitesse, pourcentage d'avancement,
    /// glyphes/drapeaux de traduction, re-transcrire, transcription entière.
    case flatFocused
}

/// Plan PUR de la tenue — décide QUI apparaît, jamais comment. Extrait en
/// type valeur testable (même patron que `AudioProgressDisplay`).
nonisolated public struct AudioPlayerChromePlan: Equatable, Sendable {
    public let showsCardBackground: Bool
    public let showsRightChips: Bool
    public let showsLanguageStrip: Bool
    public let showsRetranscribe: Bool
    public let showsTranscribeCTA: Bool
    public let rendersFlatTranscription: Bool
    /// `nil` = transcription entière (tenue élue et carte).
    public let flatTranscriptionLineLimit: Int?
    /// La transcription à plat suit la LECTURE (segments karaoké
    /// interactifs, surlignage synchronisé) plutôt qu'un texte statique.
    /// Tenue complète seulement — la tenue minimale garde sa citation
    /// tronquée (un karaoké coupé à 2 lignes n'aurait rien à surligner
    /// passé la coupe).
    public let flatTranscriptionFollowsPlayback: Bool
    /// Coupe du bloc karaoké, en MOTS — `nil` = pas de coupe (tenue minimale,
    /// qui n'a pas de karaoké mais une citation statique déjà bornée en
    /// lignes). Directive 2026-08-24 : « la transcription d'un audio limitée
    /// à quelques trentaine de mots, et un bouton voir plus qui affiche cela
    /// en plein écran ». C'est une coupe sur les SEGMENTS, jamais un
    /// `lineLimit` : le karaoké surligne des segments, borner la hauteur du
    /// bloc laisserait le surlignage courir hors champ.
    public let transcriptionWordLimit: Int?

    /// La trentaine de mots — coupe de la RANGÉE PLATE seule.
    ///
    /// La tenue carte (mode bulles) garde son dépliage en ligne à 255
    /// caractères : il convient là où la bulle a déjà sa carte pour
    /// s'étendre (arbitrage user 2026-08-24, « la transcription en mode
    /// bulle est déjà ok comme ça »). C'est la rangée plate qui n'a pas
    /// cette place — d'où le renvoi au plein écran plutôt qu'un dépliage
    /// qui repousserait tout le fil.
    public static let standardTranscriptionWordLimit = 30

    public init(
        showsCardBackground: Bool,
        showsRightChips: Bool,
        showsLanguageStrip: Bool,
        showsRetranscribe: Bool,
        showsTranscribeCTA: Bool,
        rendersFlatTranscription: Bool,
        flatTranscriptionLineLimit: Int?,
        flatTranscriptionFollowsPlayback: Bool = false,
        transcriptionWordLimit: Int? = nil
    ) {
        self.showsCardBackground = showsCardBackground
        self.showsRightChips = showsRightChips
        self.showsLanguageStrip = showsLanguageStrip
        self.showsRetranscribe = showsRetranscribe
        self.showsTranscribeCTA = showsTranscribeCTA
        self.rendersFlatTranscription = rendersFlatTranscription
        self.flatTranscriptionLineLimit = flatTranscriptionLineLimit
        self.flatTranscriptionFollowsPlayback = flatTranscriptionFollowsPlayback
        self.transcriptionWordLimit = transcriptionWordLimit
    }

    public static func plan(for chrome: AudioPlayerChrome) -> AudioPlayerChromePlan {
        switch chrome {
        case .card:
            return AudioPlayerChromePlan(
                showsCardBackground: true,
                showsRightChips: true,
                showsLanguageStrip: true,
                showsRetranscribe: true,
                showsTranscribeCTA: true,
                rendersFlatTranscription: false,
                flatTranscriptionLineLimit: nil
            )
        case .flatMinimal:
            return AudioPlayerChromePlan(
                showsCardBackground: false,
                showsRightChips: false,
                showsLanguageStrip: false,
                showsRetranscribe: false,
                showsTranscribeCTA: false,
                rendersFlatTranscription: true,
                flatTranscriptionLineLimit: 2
            )
        case .flatFocused:
            return AudioPlayerChromePlan(
                showsCardBackground: false,
                showsRightChips: true,
                showsLanguageStrip: true,
                showsRetranscribe: true,
                showsTranscribeCTA: true,
                rendersFlatTranscription: true,
                flatTranscriptionLineLimit: nil,
                flatTranscriptionFollowsPlayback: true,
                transcriptionWordLimit: standardTranscriptionWordLimit
            )
        }
    }
}
