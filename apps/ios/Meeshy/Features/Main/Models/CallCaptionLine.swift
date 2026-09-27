import Foundation
import MeeshySDK

/// #8396 — la couleur STABLE d'une personne dans un appel : dérivée de son
/// identifiant (jamais de son nom, qui change), la même pour sa ligne de
/// sous-titres et pour le liseré de sa vignette de groupe. Palette et hachage
/// sont ceux du SDK (`DynamicColorGenerator`), éclaircis pour l'écran d'appel,
/// épinglé en sombre.
enum CallSpeakerColor {
    static func hex(for userId: String) -> String {
        DynamicColorGenerator.adaptedColor(DynamicColorGenerator.colorForName(userId), for: .dark)
    }
}

/// Une ligne de sous-titres telle que l'écran d'appel la dessine.
///
/// Le Prisme s'applique : la parole d'un pair se lit dans sa traduction quand
/// elle existe, marquée d'une étiquette discrète « EN → FR » ; toucher la
/// ligne montre l'original (et inversement quand le journal est réglé sur
/// « Original »). Ma propre parole n'est jamais traduite pour moi.
struct CallCaptionLine: Equatable, Identifiable {
    let id: UUID
    let speakerId: String
    let speakerName: String
    let text: String
    let languageTag: String?
    let isFinal: Bool
    let capturedAt: Date
    let isShowingOriginal: Bool
    let canRevealOriginal: Bool

    var speakerColorHex: String { CallSpeakerColor.hex(for: speakerId) }

    /// Ce que VoiceOver lit : la phrase FINALE seulement — une révision
    /// partielle, remplacée quelques centaines de millisecondes plus tard,
    /// n'a rien à annoncer.
    var announcement: String? {
        isFinal ? "\(speakerName) : \(text)" : nil
    }

    static func make(
        segment: TranscriptionSegment,
        isLocal: Bool,
        speakerName: String,
        prefersOriginal: Bool,
        isRevealed: Bool
    ) -> CallCaptionLine {
        let translation = isLocal ? nil : servedTranslation(segment)
        let showsOriginal = translation == nil || (prefersOriginal != isRevealed)
        let tag: String? = {
            guard !showsOriginal, let target = segment.translatedLanguage, !target.isEmpty else { return nil }
            return "\(segment.language.uppercased()) → \(target.uppercased())"
        }()
        return CallCaptionLine(
            id: segment.id,
            speakerId: segment.speakerId,
            speakerName: speakerName,
            text: showsOriginal ? segment.text : (translation ?? segment.text),
            languageTag: tag,
            isFinal: segment.isFinal,
            capturedAt: segment.capturedAt,
            isShowingOriginal: showsOriginal,
            canRevealOriginal: translation != nil
        )
    }

    private static func servedTranslation(_ segment: TranscriptionSegment) -> String? {
        guard let text = segment.translatedText,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text
    }
}
