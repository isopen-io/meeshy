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
        MeeshyLog.logger(.composer).info(
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


// **Un geste, une requête par format** (#13920, décision porteur : « le choix
// du type de post est composite et non exclusif »). Les formats cochés partent
// tous à l'appui sur Publier, chacun par son canal et sous ses règles. Le
// compositeur ne se ferme que si tout est parti ; sinon il reste, ne garde
// cochés que les formats refusés et les nomme.

extension MeeshyComposerHost {

    func publishEachFormat(_ choice: ComposerPublishChoice) {
        let plan = ComposerSeveralFormats.plan(choice, surface: mountedSurface, accepts: { canPublishDocument(as: $0) })
        Task {
            let refuses = await ComposerSeveralFormats.run(plan, sendDocument: { await sendDocumentLeg($0) }) { dejaRefuses in
                if case .remains(let reste) = ComposerSeveralFormats.outcome(of: choice, refused: dejaRefuses) {
                    chooseArmedPublish(reste)
                    flushAutosave()
                }
                pressAtelier(plan.atelier)
                return plan.scene.filter { !publishStoryScene(as: $0.format, alsoAsReel: $0.alsoAsReel, closing: false) }
                    .flatMap(\.formats)
            }
            switch ComposerSeveralFormats.outcome(of: choice, refused: refuses) {
            case .published:
                if plan.document.isEmpty { discardAutosavedDraft() } else { handOverAutosavedDraft() }
                onDismiss()
            case .remains(let reste):
                chooseArmedPublish(reste)
                ComposerSeveralFormats.sayRefused(reste.formats)
            }
        }
    }

    /// L'atelier ne publie qu'une fois par geste (son loquet) : il reçoit la
    /// file entière, que son relais distribue (`atelierFanOut`).
    private func pressAtelier(_ legs: [ComposerPublishChoice]) {
        guard let premiere = legs.first else { return }
        atelierFanOut.hold(legs)
        publishTrigger.requestPublish(as: premiere.format.postType, visibility: composerVisibility.rawValue,
                                      visibilityUserIds: composerVisibilityUserIds, alsoAsReel: premiere.alsoAsReel)
        atelierFanOut.hold([])
    }

    private func sendDocumentLeg(_ leg: ComposerPublishChoice) async -> Bool {
        guard canPublishDocument(as: leg.format) else { return false }
        return await withCheckedContinuation { suite in publishDocument(leg) { suite.resume(returning: $0) } }
    }
}

