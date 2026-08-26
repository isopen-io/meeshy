import SwiftUI

/// #3918 — au tap d'envoi, une copie visuelle du texte s'élève depuis la
/// zone de saisie et s'estompe, donnant l'impression qu'il « quitte le
/// composer pour rejoindre le fil ». Overlay TOTALEMENT séparé de la liste
/// de messages : la directive ROULEAU (2026-08-18) interdit toute animation
/// d'insertion/suppression dans `MessageListLayout`/le data source diffable
/// (un chantier de crashs SIGTRAP a été fermé sur cette base) — cette vue ne
/// touche ni l'un ni l'autre, elle vit uniquement dans `ConversationView`.
///
/// La liste étant INVERSÉE (le message le plus récent apparaît juste
/// AU-DESSUS du composer), un déplacement vertical modeste suffit à faire
/// atterrir visuellement le texte là où la bulle réelle apparaît déjà —
/// pas de géométrie inter-vues complexe à calculer.
struct ComposerSendFlyPreview: View {
    let text: String
    let accentColor: String
    let secondaryColor: String

    @State private var lifted = false

    /// Distance parcourue vers le haut, en points.
    static let liftDistance: CGFloat = 64
    /// Durée totale — même famille que le rebond du bouton d'envoi
    /// (`sendBounce`, `UniversalComposerBar.swift`) pour une continuité de
    /// geste : le texte s'envole pendant que le bouton retombe.
    static let duration: TimeInterval = 0.32

    var body: some View {
        Text(text)
            .font(.system(size: 15))
            .foregroundStyle(.white)
            .lineLimit(2)
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                Capsule().fill(
                    LinearGradient(
                        colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            )
            .opacity(lifted ? 0 : 1)
            .scaleEffect(lifted ? 0.82 : 1, anchor: .bottom)
            .offset(y: lifted ? -Self.liftDistance : 0)
            .allowsHitTesting(false)
            .onAppear {
                withAnimation(.easeOut(duration: Self.duration)) {
                    lifted = true
                }
            }
    }
}

/// Une émission = un envoi de texte. `id` change à chaque envoi (même texte
/// répété inclus) pour que SwiftUI monte une INSTANCE neuve de
/// `ComposerSendFlyPreview` à chaque fois — un `id` stable rejouerait
/// l'animation sur une vue déjà à son état final (`lifted = true`) sans
/// jamais retraverser `onAppear`.
struct ComposerSendFlyPayload: Identifiable, Equatable {
    let id = UUID()
    let text: String
}
