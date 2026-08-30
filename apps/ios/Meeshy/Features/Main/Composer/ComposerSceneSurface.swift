import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La surface de SCÈNE — la quatrième vue du meuble** (#4070, planche § P4
/// et tâche 4.3).
///
/// ## Pourquoi elle existe
///
/// La scène incrustée (Phase 2, #3939) vivait comme un `if showsScene` dans
/// `ComposerDocumentSurface`, avec ses propres entrées — la slide, son ratio,
/// les relais de sélection, l'inspecteur, la description. Chacune était une
/// exception que la règle du DOCUMENT devait porter.
///
/// C'est exactement ce que la tâche 4.3 de la planche a fermé pour le mood :
///
///   > « `.mood` devient une SURFACE, pas un cas du document. […] une humeur
///   > n'est pas un post court, et la traiter comme tel obligeait chaque règle
///   > du document à porter une exception. »
///
/// Une scène n'est pas un document avec une image. Elle a ses portes, ses
/// contrôleurs, sa géométrie et sa description ; les loger dans le document
/// obligeait ce dernier à savoir ce qu'est un `MeeshyObject`.
///
/// ## Ce qu'elle porte, et sur quel niveau du modèle
///
/// | zone | niveau |
/// |---|---|
/// | barre haute (`ComposerTopBar`) | la `MeeshyPublication` |
/// | rail *leading* — les portes | crée un `MeeshyObject` (sauf « description ») |
/// | la scène 9:16, encastrée | une `MeeshyScene` |
/// | rail *trailing* — les contrôleurs | UN `MeeshyObject` |
/// | la description | la `MeeshySlide` |
///
/// Le SOCLE n'est pas ici : il vit au meuble, sous les trois surfaces, et ne
/// bouge jamais (loi 5).
struct ComposerSceneSurface: View {

    // MARK: - La publication

    let localMedia: [ComposerDocumentMedia]
    let selectedMediaURL: URL?
    let selectableMediaURLs: Set<URL>
    let formatFan: AnyView?
    let overflowMenu: AnyView?
    let onClose: () -> Void
    var onRemoveMedia: ((ComposerDocumentMedia) -> Void)?
    var onSelectMedia: ((ComposerDocumentMedia) -> Void)?

    /// L'historique, en PRIMITIVES — voir `ComposerTopBar.canUndo` pour le
    /// pourquoi du choix. La scène est la seule surface qui le sert
    /// (`ComposerHistoryService`), parce qu'elle est la seule où les gestes ne
    /// se défont par rien d'autre.
    var canUndo: Bool = false
    var canRedo: Bool = false
    var onUndo: (() -> Void)?
    var onRedo: (() -> Void)?

    // MARK: - La scène

    @Binding var slide: StorySlide
    let aspectRatio: CGFloat
    let plateauTint: Color
    var sceneImages: [String: UIImage] = [:]
    var sceneImagesVersion: UInt64 = 0
    var onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?
    var onBackgroundTapped: (() -> Void)?

    // MARK: - Les deux rails

    /// Les portes SERVIES — déjà filtrées par `ComposerRailDoor.offered`. Cette
    /// vue ne re-filtre rien : une seconde loi 4 divergerait de la première.
    var railDoors: [ComposerRailDoor] = []
    var onRailDoor: ((ComposerRailDoor) -> Void)?

    /// Les contrôleurs SERVIS — déjà filtrés par `ComposerTrailingRailPolicy`.
    var trailingActions: [StoryCanvasContextAction] = []
    var onTrailingAction: ((StoryCanvasContextAction) -> Void)?

    // MARK: - La bande contextuelle

    /// La bande OUVERTE — déjà résolue par `ComposerSceneBand.opened`. `nil` ⇒
    /// le bas ne porte que le socle (#4064). Cette vue ne re-filtre rien : une
    /// seconde loi 4 divergerait de la première, exactement comme pour les
    /// deux rails.
    var band: ComposerSceneBand?
    var bandColors: [String] = []
    var onPickBandColor: ((String) -> Void)?

    // MARK: - La description

    @Binding var description: String
    let descriptionPlaceholder: String


    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ComposerTopBar(
                localMedia: localMedia,
                selectedMediaURL: selectedMediaURL,
                selectableMediaURLs: selectableMediaURLs,
                formatFan: formatFan,
                overflowMenu: overflowMenu,
                onClose: onClose,
                onRemoveMedia: onRemoveMedia,
                onSelectMedia: onSelectMedia,
                canUndo: canUndo,
                canRedo: canRedo,
                onUndo: onUndo,
                onRedo: onRedo
            )

            VStack(spacing: 8) {
                EmbeddedSceneCanvas(
                    slide: $slide,
                    aspectRatio: aspectRatio,
                    cornerRadius: 22,
                    onItemTapped: onItemTapped,
                    onBackgroundTapped: onBackgroundTapped,
                    loadedImages: sceneImages,
                    loadedImagesVersion: sceneImagesVersion
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                // **La scène s'ENCASTRE entre les deux couloirs** (#4061). Le
                // nombre se lit de la règle, jamais d'un littéral : il n'est pas
                // un goût de marge mais une conséquence — cible tactile 44 pt,
                // gouttière, marge de bord.
                //
                // Les rails se posent DANS ces couloirs par surimpression : le
                // repère de la vue paddée les inclut, donc `.bottomLeading` et
                // `.bottomTrailing` tombent sur le plateau, jamais sur la scène.
                // C'est la loi 6 — un rail posé sur la scène ferait mentir
                // l'aperçu sur le rendu final.
                .padding(.horizontal, ComposerRailGeometry.sceneInset(railsShown: true))
                .overlay(alignment: .bottomLeading) {
                    if !railDoors.isEmpty {
                        ComposerLeadingRail(doors: railDoors,
                                            plateauTint: plateauTint,
                                            onDoor: onRailDoor)
                            .padding(.leading, ComposerRailGeometry.outerMargin)
                            .padding(.bottom, ComposerRailGeometry.gutter)
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    if !trailingActions.isEmpty {
                        ComposerTrailingRail(actions: trailingActions,
                                             plateauTint: plateauTint,
                                             onAction: onTrailingAction)
                            .padding(.trailing, ComposerRailGeometry.outerMargin)
                            .padding(.bottom, ComposerRailGeometry.gutter)
                    }
                }
                .padding(.top, 8)

                // **La bande contextuelle, entre la scène et la description**
                // (#4064). L'ordre n'est pas un rangement : de haut en bas, le
                // bas de l'écran descend les niveaux du modèle — l'objet (les
                // rails, sur la scène), la SCÈNE (cette bande), la SLIDE (la
                // description), la PUBLICATION (le socle, au meuble).
                //
                // Montée sans transition ni animation : la bande est un frère
                // du canvas, et animer son insertion ferait varier la frame de
                // `StoryCanvasUIView` sur chaque image du ressort.
                if let band {
                    ComposerSceneBandView(band: band,
                                          colors: bandColors,
                                          onPickColor: onPickBandColor)
                }

            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // **Le champ PERMANENT est parti** (directive porteur 2026-08-30) :
    //
    // > « La zone de description en bas ne doit pas être affichée si on ne
    // > touche pas l'icône description, même si une description existe ! »
    //
    // Il vivait ici en calque de lecture (#4065) et occupait le bas dès qu'un
    // texte existait — la place que la scène centrée réclame, pour un texte que
    // l'auteur ne regarde pas la plupart du temps. La description s'ouvre
    // désormais par sa PORTE, comme les autres niveaux du modèle, et le meuble
    // monte l'éditeur en zone basse (`sceneDescriptionEditor`).
    //
    // `description` et `descriptionPlaceholder` restent au contrat : la porte
    // est servie par le meuble, qui possède le texte. Les retirer obligerait
    // chaque site de montage à re-prouver qu'il n'en a pas besoin.
}
