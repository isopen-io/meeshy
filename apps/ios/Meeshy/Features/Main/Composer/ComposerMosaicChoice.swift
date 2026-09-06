import Foundation
import MeeshySDK
import MeeshyUI

/// **L'auteur choisit COMMENT ses scènes se disposent** — l'écart composer ↔
/// reader mesuré le 2026-09-06.
///
/// ## L'écart
///
/// Le fil honore **cinq** dispositions (`MosaicLayoutMode`) : image par image,
/// défilement continu, hero, vague, sinusoïde. Le composer n'en choisissait
/// **aucune** — `CanvasV3.layout` partait toujours `nil`, donc toute
/// publication s'affichait dans le repli, le carrousel.
///
/// > Une capacité que le lecteur sait rendre et que l'auteur ne peut pas
/// > demander n'est pas une feature : c'est du code qui attend. Les quatre
/// > autres dispositions étaient écrites, testées, peintes — et inatteignables.
///
/// ## Le contrôle EXISTE exactement là où il a un EFFET (loi 4)
///
/// `isServed` porte les deux conditions qui décident si la disposition VOYAGE
/// — plusieurs slides, et un canal qui publie un document. Ce ne sont pas deux
/// règles qui se ressemblent : c'est la MÊME, lue une fois par le contrôle et
/// une fois par la publication. `ComposerMosaicChoiceTests` l'épingle en
/// interrogeant les deux ensemble, pour qu'un contrôle offert sur une
/// composition qui ne le transporte pas ne puisse pas exister.
///
/// Une slide seule n'a pas de disposition : il n'y a rien à disposer. Un canal
/// qui ne publie pas de document non plus — le canvas n'y voyage pas.
nonisolated enum ComposerMosaicChoice {

    /// Le contrôle est-il offert ? Mêmes termes que la garde de
    /// `ComposerStoryCanvas.publishedSlide`, et c'est délibéré.
    static func isServed(slideCount: Int, format: ComposerFormat) -> Bool {
        slideCount > 1 && ComposerPublishChannel.channel(for: format) == .document
    }

    /// L'ordre SERVI, et il n'est pas alphabétique : **le repli d'abord**, pour
    /// que le premier de la liste soit ce qu'on obtient sans rien choisir. Les
    /// deux suivantes montrent une scène à la fois (comme le carrousel), les
    /// deux dernières les montrent toutes — l'œil descend d'un regard porté sur
    /// UNE scène à un regard porté sur l'ENSEMBLE.
    static let ordered: [MosaicLayoutMode] = [.carousel, .reel, .hero, .wave, .sine]

    /// Le mode servi quand l'auteur n'a rien choisi — lu du modèle plutôt que
    /// répété, sinon le jour où le repli change, le composer proposerait comme
    /// « défaut » une disposition qui n'en est plus une.
    static var fallback: MosaicLayoutMode { .fallback }

    /// Le libellé dit ce que l'auteur VERRA, jamais le nom interne du mode :
    /// « sinusoïde » ne décrit rien pour qui publie deux photos.
    static func label(_ mode: MosaicLayoutMode) -> String {
        switch mode {
        case .carousel:
            return String(localized: "composer.mosaic.carousel",
                          defaultValue: "Image par image", bundle: .main)
        case .reel:
            return String(localized: "composer.mosaic.reel",
                          defaultValue: "Défilement continu", bundle: .main)
        case .hero:
            return String(localized: "composer.mosaic.hero",
                          defaultValue: "Une grande, les autres à côté", bundle: .main)
        case .wave:
            return String(localized: "composer.mosaic.wave",
                          defaultValue: "En vague", bundle: .main)
        case .sine:
            return String(localized: "composer.mosaic.sine",
                          defaultValue: "En zigzag", bundle: .main)
        }
    }

    /// Le glyphe ANNONCE la disposition, il ne dit pas un état. Chacun dessine
    /// la géométrie que le mode produit — c'est ce qui permet de choisir sans
    /// lire.
    static func symbol(_ mode: MosaicLayoutMode) -> String {
        switch mode {
        case .carousel: return "rectangle.portrait.on.rectangle.portrait"
        case .reel:     return "rectangle.split.3x1"
        case .hero:     return "rectangle.lefthalf.inset.filled"
        case .wave:     return "chart.bar"
        case .sine:     return "chart.bar.xaxis"
        }
    }
}
