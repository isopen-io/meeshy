import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une vignette par SCÈNE, dans la rangée haute** (constat porteur
/// 2026-09-06 : « lorsque je crée une nouvelle scène elle n'apparaît pas
/// immédiatement dans la mini-preview » ; fusion #5009 + #5037 actée le
/// 2026-09-03 : « il faut que les rails de slide soient des vignettes de
/// scène »).
///
/// ## Ce que la rangée montrait, et pourquoi une scène pouvait y manquer
///
/// Elle recevait une liste de MÉDIAS, filtrée par l'index des fondations. La
/// règle disait « une tuile par média posé en fond », et le doc-comment de
/// `ComposerTopBar` énonçait l'équivalence comme une définition : « une par
/// `MeeshySlide`, ce qui veut dire une par média posé en FOND ».
///
/// Les deux termes ont coïncidé tant que toute scène naissait d'un média. Un
/// fond COLORÉ les sépare — la scène existe, elle n'a aucun média — et la
/// rangée n'avait alors rien à montrer.
///
/// > **Retirer un doublon révèle ce que l'autre ne couvrait pas.** La bande de
/// > pastilles du couloir bas comptait les slides et couvrait ce trou ; elle est
/// > partie le matin même sur directive porteur.
///
/// ## Ce que la tuile peint
///
/// La VIGNETTE de sa scène — fond et objets posés, noire quand la scène est
/// vide — rendue par le composite partagé (`SceneThumbnailRenderer`, SDK), le
/// même qui produit la couverture du plateau et le ThumbHash. Elle peignait
/// auparavant `SlideMiniPreview`, un second chemin de rendu en modifiers
/// SwiftUI que #5037 nommait comme piège : il approxime les filtres et pouvait
/// mentir sur le rendu final.
///
/// ## Pourquoi la vue vit ici et non dans `ComposerTopBar`
///
/// Une vignette demande les effets VIVANTS de la slide et les bitmaps chargés —
/// donc le ViewModel. `ComposerTopBar` ne le connaît pas et n'a pas à le
/// connaître : elle reçoit ce rail en slot opaque, comme `formatFan`.
struct ComposerSlideRail: View {

    let slides: [StorySlide]
    let currentIndex: Int
    /// Les fonds de slide déjà chargés, par identifiant de slide.
    let slideImages: [String: UIImage]
    /// Les bitmaps des objets, par identifiant d'objet. Un bitmap remplacé est
    /// une INSTANCE neuve : l'empreinte de la vignette le voit sans compteur.
    let loadedImages: [String: UIImage]
    let onSelect: (Int) -> Void
    /// **Supprimer la scène courante** (constat porteur 2026-09-06 : « il
    /// manque la poubelle pour supprimer les scènes »). L'ancienne rangée de
    /// médias portait cette croix ; ma rangée de scènes ne l'avait pas reprise
    /// — une capacité perdue au passage d'un lot.
    let onDelete: ((Int) -> Void)?

    private static let height: CGFloat = 44

    /// Le rail se monte dès qu'une scène existe (`ComposerHeaderTiles.showsRail`,
    /// décidé par l'hôte) ; une vignette SEULE est un aperçu, pas un bouton —
    /// elle ne navigue vers rien (loi 4).
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(Array(slides.enumerated()), id: \.element.id) { index, slide in
                    if ComposerHeaderTiles.tilesNavigate(sceneCount: slides.count) {
                        Button { onSelect(index) } label: {
                            tuile(slide, index: index)
                        }
                        .buttonStyle(.plain)
                        .overlay(alignment: .topTrailing) { corbeille(index) }
                        .accessibilityLabel(Text(ComposerSlideRailCopy.position(
                            index: index + 1, total: slides.count)))
                        .accessibilityAddTraits(index == currentIndex ? .isSelected : [])
                    } else {
                        tuile(slide, index: index)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(Text(ComposerSlideRailCopy.position(
                                index: index + 1, total: slides.count)))
                            .accessibilityAddTraits([.isImage, .isSelected])
                    }
                }
            }
            .padding(.vertical, MeeshySpacing.xxs)
        }
    }

    /// La corbeille — sur la tuile COURANTE, et jamais sous deux scènes. La
    /// règle vit dans `ComposerHeaderTiles.showsDelete`, où elle s'éprouve ;
    /// cette vue la consulte, elle ne la refait pas.
    @ViewBuilder
    private func corbeille(_ index: Int) -> some View {
        if let onDelete, ComposerHeaderTiles.showsDelete(sceneIndex: index,
                                           currentIndex: currentIndex,
                                           sceneCount: slides.count) {
            Button { onDelete(index) } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(8, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(MeeshySpacing.xxs)
                    .background(Circle().fill(Color.black.opacity(0.55)))
            }
            .buttonStyle(.plain)
            // La CIBLE reste visible sans déborder de la tuile : la corbeille
            // est un contrôle secondaire, la sélection reste le geste premier.
            .offset(x: 4, y: -4)
            .accessibilityLabel(Text(ComposerSlideRailCopy.delete(index: index + 1)))
        }
    }

    private func tuile(_ slide: StorySlide, index: Int) -> some View {
        // La diapositive est une scène : TOUJOURS 9:16 (`SceneShape.aspect`, #6896/#6904).
        let cote = CGSize(width: Self.height * SceneShape.aspect, height: Self.height)
        return ComposerSceneThumbnailTile(slide: slide, bgImage: slideImages[slide.id],
                                          loadedImages: loadedImages, size: cote)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xxs))
        // Le rognage ne rogne pas le TOUCHER : la tuile voisine recouvrait la
        // première (#9126).
        .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.xxs))
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.xxs)
                .strokeBorder(index == currentIndex
                              ? MeeshyColors.brandPrimary
                              : Color.white.opacity(0.25),
                              lineWidth: index == currentIndex ? 1.5 : 0.5)
        )
    }
}

/// **Une tuile = la vignette de SA scène**, peinte par le composite partagé
/// (`SceneThumbnailRenderer.thumbnail(`, SDK) depuis des bitmaps réduits à la
/// tuile — jamais la photo de 1600 px peinte dans 44 points (#6922).
///
/// Elle se repeint quand l'EMPREINTE de la scène change, et seulement alors ;
/// `ComposerSceneThumbnailRefresh` décide si elle attend. Pendant un geste sur
/// la scène, l'image précédente reste à l'écran — jamais de trou, jamais un
/// rendu par image du glisser.
struct ComposerSceneThumbnailTile: View {
    let slide: StorySlide
    let bgImage: UIImage?
    let loadedImages: [String: UIImage]
    let size: CGSize
    @Environment(\.displayScale) private var displayScale
    @State private var shown: UIImage?

    var body: some View {
        let empreinte = SceneThumbnailFingerprint(slide: slide, bgImage: bgImage, loadedImages: loadedImages,
                                                  size: size, scale: displayScale)
        ZStack {
            // Le noir est l'état VIDE dessiné (#5037), et le fond tant que la
            // première vignette n'est pas peinte.
            Color.black
            if let image = shown ?? SceneThumbnailStore.shared.cached(empreinte) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            }
        }
        .frame(width: size.width, height: size.height)
        .task(id: empreinte) { await repaint(empreinte) }
    }

    private func repaint(_ empreinte: SceneThumbnailFingerprint) async {
        let attend = ComposerSceneThumbnailRefresh.waits(
            isShowingImage: shown != nil,
            isCached: SceneThumbnailStore.shared.cached(empreinte) != nil,
            isBlank: SceneThumbnailContent.isBlank(slide, bgImage: bgImage))
        if attend {
            try? await Task.sleep(nanoseconds: ComposerSceneThumbnailRefresh.debounceNanoseconds)
            guard !Task.isCancelled else { return }
        }
        shown = SceneThumbnailRenderer.thumbnail(slide: slide, bgImage: bgImage, loadedImages: loadedImages,
                                                 size: size, scale: displayScale)
    }
}

/// **Quand repeindre une vignette** — la règle, hors de la vue.
///
/// - la PREMIÈRE image d'une tuile se peint tout de suite : attendre ne
///   montrerait que du noir à la place d'une scène qui en a ;
/// - une vignette déjà en cache, ou une scène vide (du noir), ne coûtent rien ;
/// - sinon la scène change sous le doigt : on attend qu'elle se pose, la
///   vignette précédente restant affichée.
nonisolated enum ComposerSceneThumbnailRefresh {

    static let debounceNanoseconds: UInt64 = 150_000_000

    static func waits(isShowingImage: Bool, isCached: Bool, isBlank: Bool) -> Bool {
        isShowingImage && !isCached && !isBlank
    }
}

/// **Toucher (+) crée une scène — ou dit pourquoi non** (#5009).
///
/// Au plafond de dix (`StoryComposerViewModel.canAddSlide`), `addSlide()` est un
/// no-op : un geste dont l'effet est invisible se lit exactement comme un
/// bouton inerte. Le refus s'ANNONCE donc, il ne se tait pas.
nonisolated enum ComposerSceneAddition: Equatable {
    case added
    case refusedAtCap

    static func outcome(canAddSlide: Bool) -> ComposerSceneAddition {
        canAddSlide ? .added : .refusedAtCap
    }
}

/// Le libellé du rail, hors de la vue pour la raison habituelle du dépôt : une
/// chaîne composée dans un corps de vue échappe au cliquet de complétude.
@MainActor
enum ComposerSlideRailCopy {
    /// Le nom de la RANGÉE, distinct du libellé d'une tuile : VoiceOver
    /// annonce le conteneur avant de parcourir ses éléments.
    static var rail: String {
        String(localized: "composer.slide.rail", defaultValue: "Scènes de la publication",
               bundle: .main)
    }

    /// Le refus du onzième `(+)` (#5009) — dit, jamais tu.
    static var capReached: String {
        String(localized: "composer.slide.rail.capReached",
               defaultValue: "Dix scènes au maximum — supprimez-en une pour en créer une autre",
               bundle: .main)
    }

    static func delete(index: Int) -> String {
        String(format: String(localized: "composer.slide.rail.delete",
                              defaultValue: "Supprimer la scène %1$d", bundle: .main), index)
    }

    static func position(index: Int, total: Int) -> String {
        String(format: String(localized: "composer.slide.rail.position",
                              defaultValue: "Scène %1$d sur %2$d", bundle: .main),
               index, total)
    }
}
