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

    /// **Créer une SLIDE** (directive porteur 2026-08-30) : « on garde à droite
    /// les outils permettant de contrôler la scène, dont tout en haut de la
    /// liste une frame `[+]` permettant de créer un slide ».
    ///
    /// `nil` ⇒ l'hôte ne sait pas en créer, donc aucune frame (loi 4).
    var onAddSlide: (() -> Void)?

    /// **L'HISTORIQUE, qui vivait au socle** (directive porteur 2026-08-31) :
    ///
    /// > « À droite, ça agit sur les dimensions des objets, + undo/redo devrait
    /// > y être, + création d'un autre slide. »
    ///
    /// Ce qu'il défait, ce sont des gestes sur les OBJETS — poser un texte,
    /// déplacer un média, tracer. Au socle, il voisinait avec l'audience et le
    /// bouton publier, qui décident de l'ENVOI : la zone dit « ce qui part »,
    /// l'historique dit « ce que j'ai fait ». Deux niveaux du modèle dans une
    /// seule rangée.
    ///
    /// `nil` ⇒ absent, jamais grisé — même contrat que `onAddSlide`, et pour la
    /// même raison : défaire un geste qui n'existe pas n'est pas un état, c'est
    /// une promesse creuse.
    var onUndo: (() -> Void)?
    var onRedo: (() -> Void)?

    @State private var lastTapped: String?

    /// **Le rail EXISTE dès qu'il a le `[+]`**, même sans objet sélectionné.
    /// C'est ce qui distingue les deux côtés depuis la directive : le gauche
    /// suit ce que l'auteur FAIT, le droit ce que la SCÈNE offre — et créer une
    /// slide s'offre en permanence.
    private var isEmpty: Bool {
        actions.isEmpty && onAddSlide == nil && onUndo == nil && onRedo == nil
    }

    var body: some View {
        if !isEmpty {
            VStack(spacing: 10) {
                Spacer(minLength: 0)
                // **`[+]` TOUT EN HAUT**, jamais mêlée aux contrôleurs de
                // l'objet : elle n'agit pas sur le même niveau du modèle. Les
                // contrôleurs modifient UN objet ; celle-ci ajoute une PAGE à
                // la publication. Les voisiner sans les distinguer ferait
                // ranger « dupliquer » et « nouvelle slide » dans le même
                // geste mental.
                if let onAddSlide {
                    addSlideButton(onAddSlide)
                    if !actions.isEmpty {
                        Divider()
                            .frame(width: 22)
                            .overlay(MeeshyColors.textSecondary(isDark: true).opacity(0.25))
                    }
                }
                ForEach(actions, id: \.self) { action in
                    actionButton(action)
                }
                // **L'historique en BAS, le plus près du pouce.** Défaire est le
                // geste le plus fréquent du rail, et le ressort qui pousse le
                // contenu vers le bas met la dernière entrée à portée. Le `[+]`
                // garde sa place tout en haut : il n'agit pas sur un objet mais
                // ajoute une PAGE, et la directive du 2026-08-30 l'y a mis.
                if onUndo != nil || onRedo != nil {
                    if !actions.isEmpty || onAddSlide != nil {
                        Divider()
                            .frame(width: 22)
                            .overlay(MeeshyColors.textSecondary(isDark: true).opacity(0.25))
                    }
                    if let onUndo {
                        historyButton(systemName: "arrow.uturn.backward",
                                      label: ComposerHistoryCopy.undo, action: onUndo)
                    }
                    if let onRedo {
                        historyButton(systemName: "arrow.uturn.forward",
                                      label: ComposerHistoryCopy.redo, action: onRedo)
                    }
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

    /// La frame `[+]`. Un CADRE, pas un cercle : ce qu'on ajoute est une
    /// surface, et le glyphe le dit.
    private func addSlideButton(_ action: @escaping () -> Void) -> some View {
        Button {
            lastTapped = "slide.add"
            action()
            HapticFeedback.light()
        } label: {
            Image(systemName: "plus.rectangle.on.rectangle")
                .font(.title3)
                .symbolRenderingMode(.hierarchical)
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .composerToolBounce(active: lastTapped == "slide.add")
                .frame(width: ComposerRailGeometry.railWidth,
                       height: ComposerRailGeometry.railWidth)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(ComposerTrailingRailCopy.addSlide))
    }

    private func actionButton(_ action: StoryCanvasContextAction) -> some View {
        Button {
            lastTapped = String(describing: action)
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
                .composerToolBounce(active: lastTapped == String(describing: action))
                .frame(width: ComposerRailGeometry.railWidth,
                       height: ComposerRailGeometry.railWidth)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(action.title))
    }

    /// Une entrée d'historique — même gabarit que les contrôleurs voisins, pour
    /// que la colonne reste une colonne. Le verre de la capsule du socle ne la
    /// suit pas : ici c'est le socle du RAIL qui le porte, pour toutes.
    private func historyButton(systemName: String,
                               label: String,
                               action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                // `.title3`, comme les deux contrôleurs voisins de la même
                // colonne : une taille figée ne scalerait pas avec le Dynamic
                // Type, et l'historique n'a aucune raison d'être le seul bouton
                // du rail à ne pas grossir avec les autres.
                .font(.title3)
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .frame(width: ComposerRailGeometry.railWidth,
                       height: ComposerRailGeometry.railWidth)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(label))
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

    static var addSlide: String {
        String(localized: "composer.rail.slide.add",
               defaultValue: "Nouvelle slide", bundle: .main)
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
            canLeaveScene: canLeaveScene,
            // Une image et un texte n'ont pas de source a rogner : le predicat
            // interroge le MODELE, comme ses trois voisins ci-dessus. Ce que
            // l'HOTE sait faire reste dans `served`, une ligne plus bas.
            hasTrimmableSource: StorySceneObjectPredicates.hasTrimmableSource(
                slide: slide, id: selectedId)
        )
        .filter(served.contains)
    }
}

