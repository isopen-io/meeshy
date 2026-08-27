import SwiftUI

/// #3918, refonte #3928 — au tap d'envoi, une copie visuelle du texte vient
/// du BAS DE L'ÉCRAN, hors champ visuel (sous le clavier s'il est ouvert),
/// puis MONTE jusqu'à son emplacement naturel — juste au-dessus du composer,
/// là où atterrit une bulle neuve — avec un léger effet ressort au moment où
/// elle « colle » à sa place. Overlay TOTALEMENT séparé de la liste de
/// messages : la directive ROULEAU (2026-08-18) interdit toute animation
/// d'insertion/suppression dans `MessageListLayout`/le data source diffable
/// (un chantier de crashs SIGTRAP a été fermé sur cette base) — cette vue ne
/// touche ni l'un ni l'autre, elle vit uniquement dans `ConversationView`.
///
/// La liste étant INVERSÉE (le message le plus récent apparaît juste
/// AU-DESSUS du composer), l'emplacement d'ARRIVÉE est déjà celui où l'hôte
/// ancre cette vue (`.padding(.bottom, composerHeight)`) — pas de géométrie
/// inter-vues complexe à calculer. Seul le DÉPART change : `startOffset`
/// pousse la position initiale sous le bord bas visible (+ le clavier).
struct ComposerSendFlyPreview: View {
    let text: String
    let accentColor: String
    let secondaryColor: String
    /// Hauteur du composer telle que mesurée par l'hôte — distance entre
    /// l'emplacement d'arrivée (ancré par l'hôte) et le bord bas de l'écran.
    let composerHeight: CGFloat
    /// Hauteur du clavier système si ouvert, 0 sinon (`ConversationView`).
    let keyboardHeight: CGFloat

    /// Position (montée, effet ressort) — séparé de `faded` : un spring avec
    /// overshoot dépasserait momentanément [0, 1] s'il pilotait aussi le
    /// fondu, et un fondu qui suit LA MÊME courbe que la montée s'étale sur
    /// toute la trajectoire au lieu de s'effacer une fois arrivé.
    @State private var risen = false
    @State private var faded = false

    /// Durée totale — le point où `sendFlyPayload` est effacé par l'hôte
    /// (`triggerSendFlyAnimation`), donc ≥ fin du fondu.
    static let duration: TimeInterval = 0.46
    /// Le fondu n'entame qu'après que le ressort a eu le temps de se
    /// stabiliser — sinon la capsule s'efface avant même d'avoir fini de
    /// « coller » à sa place, et le rebond devient invisible.
    private static let fadeDelay: TimeInterval = 0.30
    private static let fadeDuration: TimeInterval = Self.duration - Self.fadeDelay
    /// Marge sous le bord bas visible : le départ se lit comme venant de
    /// HORS ÉCRAN plutôt que d'un bord pile aligné.
    private static let offscreenMargin: CGFloat = 40

    /// Distance parcourue depuis le départ (hors écran, sous le clavier s'il
    /// est ouvert) jusqu'à l'emplacement naturel ancré par l'hôte.
    private var startOffset: CGFloat {
        composerHeight + keyboardHeight + Self.offscreenMargin
    }

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
            .opacity(faded ? 0 : 1)
            .offset(y: risen ? 0 : startOffset)
            .allowsHitTesting(false)
            .onAppear {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.68)) {
                    risen = true
                }
                withAnimation(.easeIn(duration: Self.fadeDuration).delay(Self.fadeDelay)) {
                    faded = true
                }
            }
    }
}

/// Une émission = un envoi de texte. `id` change à chaque envoi (même texte
/// répété inclus) pour que SwiftUI monte une INSTANCE neuve de
/// `ComposerSendFlyPreview` à chaque fois — un `id` stable rejouerait
/// l'animation sur une vue déjà à son état final (`risen = true`, `faded =
/// true`) sans jamais retraverser `onAppear`.
struct ComposerSendFlyPayload: Identifiable, Equatable {
    let id = UUID()
    let text: String
}
