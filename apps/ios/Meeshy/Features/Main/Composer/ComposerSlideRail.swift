import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une mini-preview par SCÈNE, dans la rangée haute** (constat porteur
/// 2026-09-06 : « lorsque je crée une nouvelle scène elle n'apparaît pas
/// immédiatement dans la mini-preview »).
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
/// ## Pourquoi ça ne se voyait pas
///
/// La bande de pastilles du couloir bas comptait les slides, elle, et couvrait
/// donc ce trou. Elle est partie le matin même sur directive porteur (« cet
/// indicateur est inutile »), et le trou est devenu le seul retour visible.
///
/// > **Retirer un doublon révèle ce que l'autre ne couvrait pas.** Les deux
/// > indicateurs n'étaient pas redondants : ils comptaient deux choses
/// > différentes qui se ressemblaient.
///
/// ## Pourquoi la vue vit ici et non dans `ComposerTopBar`
///
/// Une mini-preview demande les effets VIVANTS de la slide et les bitmaps
/// chargés — donc le ViewModel. `ComposerTopBar` ne le connaît pas et n'a pas à
/// le connaître : elle reçoit ce rail en slot opaque, comme `formatFan`.
///
/// Les effets sont vivants sans effort : `currentEffects` est une projection de
/// `currentSlide.effects` (lecture ET écriture), donc composer met à jour la
/// slide, donc la tuile suit. C'est ce qui rend ce lot petit.
struct ComposerSlideRail: View {

    let slides: [StorySlide]
    let currentIndex: Int
    /// Les fonds de slide déjà chargés, par identifiant de slide.
    let slideImages: [String: UIImage]
    /// Les bitmaps des objets, par identifiant d'objet.
    let loadedImages: [String: UIImage]
    /// **Le bump que SwiftUI ne peut pas voir.** `[String: UIImage]` n'est pas
    /// `Equatable` : muter un bitmap sous une clé existante ne re-rend rien.
    /// `loadedImagesVersion` existe pour ça, et la tuile en dépend explicitement
    /// — sinon une image éditée resterait affichée dans son état d'avant.
    let imagesVersion: UInt64
    let onSelect: (Int) -> Void

    private static let height: CGFloat = 44

    var body: some View {
        if slides.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(slides.enumerated()), id: \.element.id) { index, slide in
                        Button { onSelect(index) } label: {
                            tuile(slide, index: index)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text(ComposerSlideRailCopy.position(
                            index: index + 1, total: slides.count)))
                    }
                }
                .padding(.vertical, 2)
            }
            .id(imagesVersion)
        }
    }

    private func tuile(_ slide: StorySlide, index: Int) -> some View {
        let cote = Self.height
        return SlideMiniPreview(
            effects: slide.effects,
            bgImage: slideImages[slide.id],
            drawingData: slide.effects.drawingData,
            loadedImages: loadedImages,
            index: index
        )
        .frame(width: cote * 9 / 16, height: cote)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .strokeBorder(index == currentIndex
                              ? MeeshyColors.brandPrimary
                              : Color.white.opacity(0.25),
                              lineWidth: index == currentIndex ? 1.5 : 0.5)
        )
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

    static func position(index: Int, total: Int) -> String {
        String(format: String(localized: "composer.slide.rail.position",
                              defaultValue: "Scène %1$d sur %2$d", bundle: .main),
               index, total)
    }
}
