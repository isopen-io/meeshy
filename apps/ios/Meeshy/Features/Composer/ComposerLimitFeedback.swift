import Foundation
import MeeshySDK
import MeeshyUI

/// **Le refus d'un plafond se DIT** (#13590) : un geste sans effet visible se
/// lit comme un bouton inerte. Le viewmodel annonce la borne atteinte
/// (`onLimitReached`) ; ce site la traduit en haptique d'erreur et en message
/// qui chiffre la borne — le chiffre vient de `StoryComposerLimits`, jamais
/// recopié ici.
@MainActor
enum ComposerLimitFeedback {

    /// Le message du refus, dans la langue de l'interface.
    static func message(for limit: StoryComposerLimit) -> String {
        let format: String
        switch limit {
        case .sticker:
            format = String(localized: "composer.limit.sticker", defaultValue: "%lld stickers au maximum par scène", bundle: .main)
        case .image:
            format = String(localized: "composer.limit.image", defaultValue: "%lld images au maximum par scène", bundle: .main)
        case .text:
            format = String(localized: "composer.limit.text", defaultValue: "%lld textes au maximum par scène", bundle: .main)
        case .audio:
            format = String(localized: "composer.limit.audio", defaultValue: "%lld audios au maximum par scène", bundle: .main)
        case .video:
            format = String(localized: "composer.limit.video", defaultValue: "%lld vidéos au maximum par scène", bundle: .main)
        case .textLength:
            format = String(localized: "composer.limit.textLength", defaultValue: "%lld caractères au maximum par texte", bundle: .main)
        case .duration:
            format = String(localized: "composer.limit.duration", defaultValue: "Une story dure %lld h au maximum", bundle: .main)
        }
        return String(format: format, limit.value)
    }

    /// Branche le retour sur `composer` : haptique d'erreur + message.
    static func attach(to composer: StoryComposerViewModel) {
        composer.onLimitReached = { limit in
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(message(for: limit))
        }
    }
}
