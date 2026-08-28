import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le rail *trailing* — les CONTRÔLEURS de l'objet sélectionné** (#4063,
/// planche rév. 27 § P4, loi 12).
///
/// ## Ce qu'il porte, et pourquoi ce n'est pas une invention
///
/// Exactement ce que l'appui long propose déjà sur un objet de la scène
/// (#4046, `StoryCanvasContextAction`) : modifier · monter · reculer · sortir
/// de la scène · dupliquer · supprimer. **Même règle, autre géographie.**
///
/// Écrire ici une seconde liste aurait produit deux inventaires d'un même
/// geste, et la divergence n'aurait rougi nulle part — chacun restant cohérent
/// avec lui-même pendant que le menu offrirait ce que le rail refuse.
///
/// ## Loi 4, et elle décide de l'existence du rail entier
///
/// **Aucune sélection ⇒ aucun contrôleur ⇒ aucun rail.** Pas un rail vide, pas
/// un rail grisé : rien. La liste arrive déjà filtrée par
/// `StoryCanvasContextAction.offered` — cette vue ne décide de rien, comme sa
/// jumelle *leading*.
///
/// ## Trois décisions communes au rail *leading*, et pour les mêmes raisons
///
/// `trailing` jamais « à droite » (l'arabe échange les deux) ; ancré EN BAS
/// (le pouce) ; la vue ne filtre pas.
struct ComposerTrailingRail: View {

    /// Les actions SERVIES pour l'objet courant, dans leur ordre. Vide ⇒ le
    /// rail n'existe pas.
    let actions: [StoryCanvasContextAction]

    let plateauTint: Color

    var onAction: ((StoryCanvasContextAction) -> Void)?

    @State private var lastTapped: StoryCanvasContextAction?

    var body: some View {
        if !actions.isEmpty {
            VStack(spacing: 10) {
                Spacer(minLength: 0)
                ForEach(actions, id: \.self) { action in
                    actionButton(action)
                }
            }
            .frame(width: ComposerRailGeometry.railWidth)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: ComposerRailGeometry.railWidth / 2, style: .continuous)
                    .fill(plateauTint.opacity(0.55))
            )
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text(ComposerTrailingRailCopy.railLabel))
        }
    }

    private func actionButton(_ action: StoryCanvasContextAction) -> some View {
        Button {
            lastTapped = action
            onAction?(action)
            HapticFeedback.light()
        } label: {
            Image(systemName: action.systemImage)
                .font(.title3)
                .symbolRenderingMode(.hierarchical)
                // La seule action DESTRUCTRICE porte la couleur sémantique
                // d'erreur — jamais une couleur de format (U15).
                .foregroundColor(action == .delete
                                 ? MeeshyColors.error
                                 : MeeshyColors.textSecondary(isDark: true))
                .composerToolBounce(active: lastTapped == action)
                .frame(width: ComposerRailGeometry.railWidth,
                       height: ComposerRailGeometry.railWidth)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(action.title))
    }
}

/// Le libellé du rail. Les ACTIONS, elles, portent déjà le leur
/// (`StoryCanvasContextAction.title`) — le réemployer garde le menu et le rail
/// d'accord sur les mots, ce qu'une seconde table de libellés perdrait au
/// premier renommage.
nonisolated enum ComposerTrailingRailCopy {
    static var railLabel: String {
        String(localized: "composer.rail.trailing.label",
               defaultValue: "Modifier l'objet sélectionné", bundle: .main)
    }
}

/// **Ce que le rail *trailing* offre pour l'objet sélectionné** — une règle
/// PURE, entre la sélection et `StoryCanvasContextAction.offered`.
///
/// Elle existe pour une raison précise : `offered` prend cinq PRIMITIVES, et
/// c'est très bien pour un menu qui les a sous la main. Un hôte SwiftUI, lui,
/// n'a qu'une `StorySlide` et un id — et les dériver au site d'appel ferait
/// naître, à chaque hôte, une lecture de plus des mêmes champs.
nonisolated enum ComposerTrailingRailPolicy {

    /// - Parameter selectedId: `nil` ⇒ aucune sélection ⇒ **aucune action**, et
    ///   donc aucun rail (loi 4).
    /// - Parameter served: les actions dont l'HÔTE possède la primitive.
    ///   L'empilement, par exemple, ne vit aujourd'hui que sur la
    ///   `StoryCanvasUIView` — le meuble n'a aucune référence à cette vue et le
    ///   ViewModel n'expose pas l'équivalent. Peindre « Monter » ici ouvrirait
    ///   un bouton sans effet, ce que la loi 4 interdit, et il ne fait pas
    ///   d'exception pour ce qu'on compte câbler bientôt.
    ///
    ///   **Ce filtre est APP-side, délibérément.** La règle du SDK
    ///   (`offered`) dit ce qu'un OBJET admet ; ce paramètre dit ce que CE
    ///   meuble sait faire. Les mêler aurait fait grandir la signature partagée
    ///   d'un paramètre par capacité d'hôte.
    /// - Parameter hasEditor: l'hôte sait-il ouvrir un éditeur pour cet objet ?
    /// - Parameter canLeaveScene: l'hôte sait-il RECEVOIR un objet qui sort ?
    ///   Le SDK ne connaît ni « Story » ni « Post » : il demande l'EFFET, pas
    ///   le profil (#4046).
    static func actions(
        slide: StorySlide?,
        selectedId: String?,
        served: Set<StoryCanvasContextAction>,
        hasEditor: Bool,
        canLeaveScene: Bool
    ) -> [StoryCanvasContextAction] {
        guard let slide, let selectedId else { return [] }
        return StoryCanvasContextAction.offered(
            isLocked: StorySceneObjectPredicates.isLocked(slide: slide, id: selectedId),
            isBackground: StorySceneObjectPredicates.isBackground(slide: slide, id: selectedId),
            sharesPlaneWithAnother: StorySceneObjectPredicates.sharesPlaneWithAnother(
                slide: slide, besides: selectedId),
            hasEditor: hasEditor,
            canLeaveScene: canLeaveScene
        )
        .filter(served.contains)
    }
}
