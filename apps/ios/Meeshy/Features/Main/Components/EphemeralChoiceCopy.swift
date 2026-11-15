import Foundation
import MeeshySDK

/// Les mots du sélecteur d'éphémère (#8303) — la flamme-œil n'a pas de
/// secondes à afficher, elle a un NOM, dit dans la langue de l'app.
enum EphemeralChoiceCopy {

    /// Le libellé court de la pastille : « Après lecture » ou « 15s ».
    static func chipLabel(_ choice: EphemeralChoice) -> String {
        switch choice {
        case .afterRead:
            return String(localized: "composer.ephemeral.after_read", defaultValue: "Après lecture", bundle: .main)
        case .duration(let duration):
            return duration.label
        }
    }

    /// Le libellé complet, dit par VoiceOver.
    static func displayLabel(_ choice: EphemeralChoice?) -> String {
        switch choice {
        case .afterRead:
            return String(localized: "composer.ephemeral.after_read.a11y",
                          defaultValue: "Après lecture, quand le lecteur quitte la conversation", bundle: .main)
        case .duration(let duration):
            return duration.displayLabel
        case nil:
            return ""
        }
    }
}
