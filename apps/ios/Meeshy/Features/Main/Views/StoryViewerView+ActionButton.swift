import SwiftUI
import MeeshyUI

// =============================================================================
// Le BOUTON du rail d'actions du lecteur de story — sorti de
// `StoryViewerView+Content.swift` (#6704), puis ramené sur l'atome du plein écran
// (`FullscreenActionButton`, #8878) : la cellule, son halo, son libellé, son état
// actif et ses traits VoiceOver sont ceux de tous les rails. Ne reste ici que ce
// que la story ajoute : le schéma que la luminance de la slide commande
// (`mediaChromeGlyph`, #6704) et les indications lues par VoiceOver.
// =============================================================================

struct StoryActionButton: View {
    let icon: String
    let label: String
    var isActive: Bool = false
    var activeTint: Color? = nil
    /// Sites porteurs d'un geste séquencé longpress→drag (scrub) : le tap
    /// interne d'un `Button` consomme le touch et la séquence posée en
    /// `.highPriorityGesture` ne s'active JAMAIS. `true` = l'atome sert le tap
    /// court par un `TapGesture` et VoiceOver par une `accessibilityAction`.
    var handlesTapViaGesture: Bool = false
    let action: () -> Void

    var body: some View {
        FullscreenActionButton(
            systemImage: icon,
            label: label,
            hint: Self.hint(label: label, isActive: isActive),
            style: .floating,
            caption: label,
            isActive: isActive,
            activeTint: activeTint,
            handlesTapViaGesture: handlesTapViaGesture,
            action: action
        )
        .mediaChromeGlyph()
    }

    static func hint(label: String, isActive: Bool) -> String {
        isActive ? "\(label) actif, toucher pour desactiver" : "Toucher pour \(label.lowercased())"
    }
}
