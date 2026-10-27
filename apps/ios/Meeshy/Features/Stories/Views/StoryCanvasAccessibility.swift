import Foundation
import MeeshySDK

/// Compose l'annonce VoiceOver du canvas de lecture.
///
/// Le canvas est rendu en `CALayer` : ni le texte, ni les stickers (dits depuis
/// #4825), ni le média ne sont visibles d'UIAccessibility, et `.accessibilityElement(children:
/// .ignore)` scelle l'affaire. Le label était donc une constante — « Story en
/// cours de lecture » — qui décrivait le CONTENANT sans jamais dire le
/// CONTENU. Un utilisateur non-voyant savait qu'une story jouait et rien
/// d'autre, alors que l'app dispose du texte, de l'auteur, de la position dans
/// le groupe et, depuis peu, de la transcription du vocal.
///
/// Fonction pure pour rester testable sans instancier SwiftUI (même patron que
/// `StoryIndexResolver` / `StoryPlaybackSkipResolver`). La résolution de langue
/// passe par `StoryTextObject.resolvedText(preferredLanguages:)` : l'annonce
/// suit le Prisme, donc dit exactement ce que l'écran montre — un oral qui
/// contredirait le visuel serait pire que pas d'oral du tout.
/// `nonisolated` sur le TYPE : le projet impose
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, qui isolerait cette fonction
/// pure sans raison — et la rendrait intestable hors MainActor. Elle ne touche
/// aucun état partagé, seulement ses arguments.
nonisolated enum StoryCanvasAccessibility {

    /// - Parameter stickerDescriptions: ce que chaque sticker DIT, déjà
    ///   composé par `StoryStickerAccessibility.description(for:)` (MeeshyUI,
    ///   MainActor) — cette fonction reste pure et hors acteur (#4825).
    static func label(index: Int,
                      total: Int,
                      authorName: String?,
                      textObjects: [StoryTextObject],
                      preferredLanguages: [String],
                      voiceTranscript: String?,
                      stickerDescriptions: [String] = []) -> String {
        var segments: [String] = []

        segments.append(String(
            localized: "story.viewer.a11y.position",
            defaultValue: "Story \(index + 1) sur \(total)",
            bundle: .main
        ))

        if let authorName, !authorName.trimmed.isEmpty {
            segments.append(String(
                localized: "story.viewer.a11y.author",
                defaultValue: "de \(authorName)",
                bundle: .main
            ))
        }

        let texts = textObjects
            .map { $0.resolvedText(preferredLanguages: preferredLanguages) }
            .map(\.trimmed)
            .filter { !$0.isEmpty }
        if !texts.isEmpty {
            segments.append(texts.joined(separator: ". "))
        }

        // Les stickers APRÈS les textes : ils commentent, ils ne portent pas
        // le message — et dans l'ordre où l'auteur les a posés.
        let stickers = stickerDescriptions.map(\.trimmed).filter { !$0.isEmpty }
        if !stickers.isEmpty {
            segments.append(stickers.joined(separator: ". "))
        }

        if let voiceTranscript, !voiceTranscript.trimmed.isEmpty {
            segments.append(String(
                localized: "story.viewer.a11y.transcript",
                defaultValue: "Transcription : \(voiceTranscript.trimmed)",
                bundle: .main
            ))
        }

        return segments.joined(separator: ", ")
    }
}

private nonisolated extension String {
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
