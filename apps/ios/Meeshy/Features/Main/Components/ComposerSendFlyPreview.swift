import SwiftUI
import MeeshyUI

/// #3918, refonte #3928/#3935bis, retrait #3938 — au tap d'envoi, une copie
/// visuelle du texte apparaît EN PLACE, à son emplacement final — juste
/// au-dessus du composer, là où atterrit une bulle neuve — par un simple
/// FONDU (apparition puis disparition), DERRIÈRE la barre du composer (voir
/// l'hôte, `ConversationView.swift`, qui la pose en PREMIER calque d'un
/// `ZStack`). Retour porteur (2026-08-27) : la remontée depuis hors écran
/// introduite en #3928/affinée en #3935 était mal rendue — retirée sans
/// retour ; seul le fondu reste. Overlay TOTALEMENT séparé de la liste de
/// messages : la directive ROULEAU (2026-08-18) interdit toute animation
/// d'insertion/suppression dans `MessageListLayout`/le data source diffable
/// (un chantier de crashs SIGTRAP a été fermé sur cette base) — cette vue ne
/// touche ni l'un ni l'autre, elle vit uniquement dans `ConversationView`.
///
/// La liste étant INVERSÉE (le message le plus récent apparaît juste
/// AU-DESSUS du composer), l'emplacement d'apparition est déjà celui où
/// l'hôte ancre cette vue (`.padding(.bottom, composerHeight)`) — aucune
/// géométrie de départ à calculer : plus de position animée du tout.
struct ComposerSendFlyPreview: View {
    let text: String
    /// Mode de lecture RÉEL de la conversation — décide de la FORME (voir
    /// `usesBubbleShape`). Injecté par l'hôte (`readingModeController.mode`),
    /// jamais recalculé ici : une seule source de vérité pour le mode.
    let readingMode: ConversationReadingMode
    let isDark: Bool

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    @State private var opacityValue: Double = 0

    /// Durée totale — le point où `sendFlyPayload` est effacé par l'hôte
    /// (`triggerSendFlyAnimation`), donc ≥ fin du fondu de sortie.
    static let duration: TimeInterval = 0.35
    /// Fondu d'entrée — rapide, une apparition, pas un ralenti.
    private static let fadeInDuration: TimeInterval = 0.10
    /// Tenue à pleine opacité avant de s'effacer, pour rester lisible.
    private static let fadeOutDelay: TimeInterval = 0.20
    private static let fadeOutDuration: TimeInterval = Self.duration - Self.fadeOutDelay
    /// Même rayon que la bulle réelle (`BubbleBackground.swift`,
    /// `cornerRadius: 18`) — la forme ne doit JAMAIS différer de la bulle
    /// qui vient d'être postée.
    private static let bubbleCornerRadius: CGFloat = 18

    /// #3935bis (retour porteur 2026-08-27) : Focal/Script rendent une
    /// rangée PLATE, SANS fond teinté (`FocalRow.textBlock`, `isMe: false`
    /// forcé — « la rangée plate n'a AUCUN fond teinté » : la coloration
    /// « isMe » y rendrait le texte blanc, illisible en clair). Bulles/
    /// Rivière (et Résumé, faute de mode dédié — défaut le plus proche du
    /// rendu conversationnel courant) rendent la bulle pleine
    /// (`BubbleBackground.swift` : `RoundedRectangle(cornerRadius: 18)`,
    /// fond plat `MeeshyColors.brandPrimary`, texte blanc). Le survol doit
    /// DÉJÀ porter cette forme dès son apparition — jamais une capsule
    /// générique.
    private var usesBubbleShape: Bool {
        Self.landsAboveComposer(in: readingMode)
    }

    /// Le survol n'a de sens QUE dans les modes où une bulle neuve ATTERRIT
    /// juste au-dessus du composer (liste inversée) : bulles, rivière, résumé.
    /// En **Focal/Script**, le message paraît INSTANTANÉMENT dans le flux
    /// PLAT — une rangée plate à gauche, sous le label d'auteur (« Toi »),
    /// avec son propre indent (`FocalRow.emojiBlock`) — à un tout autre
    /// endroit que ce survol (collé au bord, `.padding(.horizontal, 12)`,
    /// ancré `.padding(.bottom, composerHeight)`). Le survol y DUPLIQUE donc
    /// l'emoji/texte en bas à gauche, un fantôme mal placé pendant que le
    /// vrai message a déjà pris sa place — retour porteur (2026-08-27) :
    /// « l'emoji apparaît à gauche avant de prendre sa place ». L'hôte NE LE
    /// MONTE PAS dans ces modes (voir `ConversationView.swift`).
    static func landsAboveComposer(in mode: ConversationReadingMode) -> Bool {
        switch mode {
        case .bubbles, .river, .summary:
            return true
        case .focal, .script:
            return false
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
        .opacity(opacityValue)
        .allowsHitTesting(false)
        .onAppear {
            withAnimation(.easeOut(duration: Self.fadeInDuration)) {
                opacityValue = 1
            }
            withAnimation(.easeIn(duration: Self.fadeOutDuration).delay(Self.fadeOutDelay)) {
                opacityValue = 0
            }
        }
    }
}

/// Une émission = un envoi de texte. `id` change à chaque envoi (même texte
/// répété inclus) pour que SwiftUI monte une INSTANCE neuve de
/// `ComposerSendFlyPreview` à chaque fois — un `id` stable rejouerait le
/// fondu sur une vue déjà à son état final (`opacityValue = 0`) sans jamais
/// retraverser `onAppear`.
struct ComposerSendFlyPayload: Identifiable, Equatable {
    let id = UUID()
    let text: String
}
