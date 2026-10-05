import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// **La remise de l'atelier, aiguillée par la cardinalité** (#8520). Le relais
// que le meuble donne à l'atelier (`MeeshyComposerHost+Surfaces`) est le seul
// point par où passe toute remise de l'atelier : les portes fournissent la
// fermeture, le meuble la transmet. C'est donc ici, et nulle part plus bas,
// qu'un post de M scènes cesse de partir en M posts.

extension MeeshyComposerHost {

    /// `true` ⇒ la remise reste sur le canal de l'atelier (une publication par
    /// scène : la story, ou une composition d'une seule scène).
    ///
    /// `false` ⇒ elle a été prise en charge ICI — par le canal DOCUMENT, le même
    /// que « Post + agencement » (`publishDocument`), qui publie UNE fois et
    /// porte les M scènes dans `canvasV3` ; ou par un refus qui le dit. L'atelier
    /// reçoit `false` : il ne gèle pas son brouillon et ne pose pas son loquet,
    /// et c'est `publishDocument` qui ferme le composer sur une acceptation.
    func atelierHandOffStaysOnAtelier(targetType: PostType, sceneCount: Int) -> Bool {
        let route = ComposerAtelierHandOff.route(
            targetType: targetType,
            sceneCount: sceneCount,
            // La MÊME lecture que celle qui offre les agencements au menu
            // (`publishMenuEntries`) : le canal document ne porte que ce que
            // le pont `URL source → objet` connaît.
            documentCarriesEveryMedia: ComposerPublishMenuRule.documentCarriesEveryMedia(
                slides: viewModel.slides,
                slideImageIds: Set(viewModel.slideImages.keys),
                bridgedObjectIds: Set(documentMediaObjectIdBySource.values))
        )
        os.Logger(subsystem: "me.meeshy.app", category: "composer").info(
            "atelier hand-off: type=\(targetType.rawValue, privacy: .public) scenes=\(sceneCount) route=\(String(describing: route), privacy: .public)"
        )
        switch route {
        case .atelier:
            return true
        case .document:
            publishDocument(ComposerPublishChoice(format: ComposerAtelierHandOff.format(for: targetType),
                                                  layout: nil))
            return false
        case .refuse:
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(ComposerAtelierHandOffCopy.mediaNotCarried)
            return false
        }
    }
}

nonisolated enum ComposerAtelierHandOffCopy {
    static var mediaNotCarried: String {
        String(localized: "composer.publish.multiScene.mediaNotCarried",
               defaultValue: "Ce post à plusieurs scènes porte des médias qui ne peuvent pas encore partir en une seule publication",
               bundle: .main)
    }
}
