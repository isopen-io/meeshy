import SwiftUI
import MeeshyUI

/// #3918, refonte #3928/#3935bis — au tap d'envoi, une copie visuelle du
/// texte vient du BAS DE L'ÉCRAN, hors champ visuel (sous le clavier s'il est
/// ouvert), DERRIÈRE la barre du composer (retour porteur 2026-08-27 : la
/// course ne doit jamais se dessiner par-dessus la barre — voir l'hôte,
/// `ConversationView.swift`, qui la pose en PREMIER calque d'un `ZStack`),
/// puis MONTE en ralentissant jusqu'à son emplacement naturel — juste
/// au-dessus du composer, là où atterrit une bulle neuve — pour s'y poser en
/// douceur. Overlay TOTALEMENT séparé de la liste de messages : la directive
/// ROULEAU (2026-08-18) interdit toute animation d'insertion/suppression dans
/// `MessageListLayout`/le data source diffable (un chantier de crashs SIGTRAP
/// a été fermé sur cette base) — cette vue ne touche ni l'un ni l'autre, elle
/// vit uniquement dans `ConversationView`.
///
/// La liste étant INVERSÉE (le message le plus récent apparaît juste
/// AU-DESSUS du composer), l'emplacement d'ARRIVÉE est déjà celui où l'hôte
/// ancre cette vue (`.padding(.bottom, composerHeight)`) — pas de géométrie
/// inter-vues complexe à calculer. Seul le DÉPART change : `startOffset`
/// pousse la position initiale sous le bord bas visible (+ le clavier).
struct ComposerSendFlyPreview: View {
    let text: String
    /// Mode de lecture RÉEL de la conversation — décide de la FORME (voir
    /// `usesBubbleShape`). Injecté par l'hôte (`readingModeController.mode`),
    /// jamais recalculé ici : une seule source de vérité pour le mode.
    let readingMode: ConversationReadingMode
    let isDark: Bool
    /// Hauteur du composer telle que mesurée par l'hôte — distance entre
    /// l'emplacement d'arrivée (ancré par l'hôte) et le bord bas de l'écran.
    let composerHeight: CGFloat
    /// Hauteur du clavier système si ouvert, 0 sinon (`ConversationView`).
    let keyboardHeight: CGFloat

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    /// Position (montée, effet ressort) — séparé de `faded` : un spring avec
    /// overshoot dépasserait momentanément [0, 1] s'il pilotait aussi le
    /// fondu, et un fondu qui suit LA MÊME courbe que la montée s'étale sur
    /// toute la trajectoire au lieu de s'effacer une fois arrivé.
    @State private var risen = false
    @State private var faded = false

    /// Durée totale — le point où `sendFlyPayload` est effacé par l'hôte
    /// (`triggerSendFlyAnimation`), donc ≥ fin du fondu.
    static let duration: TimeInterval = 0.5
    /// Le fondu n'entame qu'après que le ressort a eu le temps de se
    /// stabiliser — sinon la capsule s'efface avant même d'avoir fini de
    /// « coller » à sa place, et le rebond devient invisible.
    private static let fadeDelay: TimeInterval = 0.32
    private static let fadeDuration: TimeInterval = Self.duration - Self.fadeDelay
    /// Marge sous le bord bas visible : le départ se lit comme venant de
    /// HORS ÉCRAN plutôt que d'un bord pile aligné.
    private static let offscreenMargin: CGFloat = 40
    /// Même rayon que la bulle réelle (`BubbleBackground.swift`,
    /// `cornerRadius: 18`) — la forme ne doit JAMAIS différer, ni au départ
    /// (retour porteur 2026-08-27) ni à l'arrivée.
    private static let bubbleCornerRadius: CGFloat = 18

    /// Distance parcourue depuis le départ (hors écran, sous le clavier s'il
    /// est ouvert) jusqu'à l'emplacement naturel ancré par l'hôte.
    private var startOffset: CGFloat {
        composerHeight + keyboardHeight + Self.offscreenMargin
    }

    /// #3935bis (retour porteur 2026-08-27) : Focal/Script rendent une
    /// rangée PLATE, SANS fond teinté (`FocalRow.textBlock`, `isMe: false`
    /// forcé — « la rangée plate n'a AUCUN fond teinté » : la coloration
    /// « isMe » y rendrait le texte blanc, illisible en clair). Bulles/
    /// Rivière (et Résumé, faute de mode dédié — défaut le plus proche du
    /// rendu conversationnel courant) rendent la bulle pleine
    /// (`BubbleBackground.swift` : `RoundedRectangle(cornerRadius: 18)`,
    /// fond plat `MeeshyColors.brandPrimary`, texte blanc). Le survol doit
    /// DÉJÀ porter cette forme en émergeant de derrière le composer — jamais
    /// une capsule générique qui changerait de forme à l'atterrissage.
    private var usesBubbleShape: Bool {
        switch readingMode {
        case .focal, .script:
            return false
        case .bubbles, .river, .summary:
            return true
        }
    }

    var body: some View {
        Group {
            if usesBubbleShape {
                Text(text)
                    .font(.system(size: 15))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(
                        RoundedRectangle(cornerRadius: Self.bubbleCornerRadius)
                            .fill(MeeshyColors.brandPrimary)
                    )
                    .frame(maxWidth: DeviceLayout.bubbleMaxWidth(sizeClass: horizontalSizeClass), alignment: .trailing)
            } else {
                Text(text)
                    .font(.system(size: 15))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: usesBubbleShape ? .trailing : .leading)
        .padding(.horizontal, 12)
        .opacity(faded ? 0 : 1)
        .offset(y: risen ? 0 : startOffset)
        .allowsHitTesting(false)
        .onAppear {
            // #3935bis : un damping plus élevé qu'avant (`0.68` → `0.86`)
            // ralentit nettement l'approche et réduit le rebond — un posé
            // « en douceur », jamais un `.easeOut` linéaire qui ne
            // décélérerait pas VRAIMENT au contact.
            withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
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
