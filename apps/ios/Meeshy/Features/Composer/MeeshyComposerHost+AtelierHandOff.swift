import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// **Un geste, une requête par format** (#13920, décision porteur : « le choix
// du type de post est composite et non exclusif »). Les formats cochés partent
// tous à l'appui sur Publier, chacun par son canal et sous ses règles. Le
// compositeur ne se ferme que si tout est parti ; sinon il reste, ne garde
// cochés que les formats refusés et les nomme.

extension MeeshyComposerHost {

    func publishEachFormat(_ choice: ComposerPublishChoice) {
        let plan = ComposerSeveralFormats.plan(choice, accepts: { canPublishDocument(as: $0) })
        Task {
            let refuses = await ComposerSeveralFormats.run(plan, sendDocument: { await sendDocumentLeg($0) }) { dejaRefuses in
                if case .remains(let reste) = ComposerSeveralFormats.outcome(of: choice, refused: dejaRefuses) {
                    chooseArmedPublish(reste)
                    flushAutosave()
                }
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
    private func sendDocumentLeg(_ leg: ComposerPublishChoice) async -> Bool {
        guard canPublishDocument(as: leg.format) else { return false }
        return await withCheckedContinuation { suite in publishDocument(leg) { suite.resume(returning: $0) } }
    }
}

