import XCTest
@testable import Meeshy

// MARK: - StoryTrayWiringGuardTests
//
// Deux invariants de câblage du tray, exigés par la spec
// 2026-08-01-story-drafts-multi-and-recovery-design.md :
//
// 1. Incrément 1 — `StoryUploadOverlay` est PUREMENT INFORMATIF : il ne doit
//    porter aucun `allowsHitTesting` conditionnel ni aucun geste. L'état
//    d'origine du bug P0 (`allowsHitTesting(isFailed)`) avalait le tap destiné
//    à l'avatar exactement quand l'utilisateur devait atteindre son travail.
//
// 2. Reprise d'un brouillon — un SEUL écrivain de `pendingDraftId` : les
//    handlers `.resumeDraft` passent par `StoryViewModel.openComposer(
//    resumingDraftId:)` (qui pose l'id AVANT de présenter), le cover racine le
//    remet au meuble (`MeeshyComposerHost`) qui l'adopte, puis le cover remet
//    l'id à `nil` au dismiss. Le bug d'origine : la mini-trail épinglée
//    écrivait un `@State` local jamais lu → composer VIERGE.
//
// Gardes ancrées sur les sites d'invocation (jamais de fenêtre de caractères
// fixe), bornes dynamiques, commentaires retirés via
// `MyStoriesSourceCorpus.strippingComments`.
@MainActor
final class StoryTrayWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = MyStoriesSourceCorpus.appRoot().appendingPathComponent(relativePath)
        return MyStoriesSourceCorpus.strippingComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// Corps du struct `StoryUploadOverlay`, borné dynamiquement par la
    /// déclaration de struct suivante (ou la fin du fichier).
    private func uploadOverlayBlock() throws -> String {
        let tray = try source("Meeshy/Features/Main/Views/StoryTrayView.swift")
        guard let start = tray.range(of: "struct StoryUploadOverlay") else {
            XCTFail("StoryUploadOverlay introuvable dans StoryTrayView.swift")
            return ""
        }
        let tail = tray[start.upperBound...]
        let nextStruct = tail.range(of: "struct ", range: tail.startIndex..<tail.endIndex)
        let end = nextStruct?.lowerBound ?? tail.endIndex
        return String(tray[start.lowerBound..<end])
    }

    // MARK: - Incrément 1 : l'overlay d'upload ne vole jamais le tap

    func test_uploadOverlay_allowsHitTestingFalse_unconditionally() throws {
        let block = try uploadOverlayBlock()

        XCTAssertEqual(
            occurrences(of: "allowsHitTesting(", in: block), 1,
            "L'overlay ne doit porter qu'UN allowsHitTesting. Bloc lu: \(block.suffix(400))"
        )
        XCTAssertTrue(
            block.contains(".allowsHitTesting(false)"),
            "L'overlay doit être inconditionnellement transparent aux gestes — `.allowsHitTesting(isFailed)` rendait la liste inaccessible en état d'échec (bug P0, directive 2026-08-01)"
        )
    }

    func test_uploadOverlay_carriesNoGestureOrMenu() throws {
        let block = try uploadOverlayBlock()

        for forbidden in ["onTapGesture", "contextMenu", "onLongPressGesture", ".gesture("] {
            XCTAssertFalse(
                block.contains(forbidden),
                "L'overlay est purement informatif : `\(forbidden)` y réintroduirait une surface d'action sur la pastille. Retry/suppression/reprise vivent dans MyStoriesView."
            )
        }
    }

    // MARK: - Reprise : un seul écrivain de pendingDraftId

    func test_resumeDraft_handlers_routeThroughOpenComposer() throws {
        let tray = try source("Meeshy/Features/Main/Views/StoryTrayView.swift")

        let resumeCases = occurrences(of: "case .resumeDraft", in: tray)
        XCTAssertGreaterThanOrEqual(resumeCases, 2, "Grande trail ET mini-trail épinglée doivent gérer .resumeDraft")
        XCTAssertEqual(
            occurrences(of: "openComposer(resumingDraftId:", in: tray), resumeCases,
            "Chaque handler .resumeDraft doit passer par openComposer(resumingDraftId:) — la seule séquence qui pose pendingDraftId AVANT showStoryComposer"
        )
        XCTAssertEqual(
            occurrences(of: "pendingDraftId", in: tray), 0,
            "Aucun état pendingDraftId (local ou direct) dans StoryTrayView : le @State orphelin de la mini-trail ouvrait un composer VIERGE (écrit ligne ~848, jamais lu)"
        )
    }

    /// V3-2 — la chaîne d'adoption a GAGNÉ un maillon, elle n'a rien perdu.
    ///
    /// Le cover ne construit plus le ViewModel du composer : il monte le meuble
    /// (`MeeshyComposerHost`), qui construit le sien et lui fait adopter le
    /// brouillon dès sa construction. L'invariant est le même, et son enjeu
    /// aussi — sans adoption, l'autosave écrit sous un id NEUF et le brouillon
    /// repris reste intact à côté, en double.
    ///
    /// La garde suit donc les DEUX maillons : la porte passe l'id, le meuble
    /// l'adopte. Ne lire que le premier laisserait le meuble arrêter d'adopter
    /// sans que rien ne rougisse ; ne lire que le second laisserait la porte
    /// arrêter de le passer.
    func test_composerCover_handsThePendingDraftToTheHost_whichAdoptsIt_andResetsOnDismiss() throws {
        let actions = try source("Meeshy/Features/Main/Views/StoryTrayActions.swift")
        let host = try AppSourceGuard.composerHostSource()

        XCTAssertTrue(
            actions.contains("draftId: viewModel.pendingDraftId"),
            "Le cover racine doit REMETTRE au meuble le brouillon à reprendre — sans lui, le meuble ouvre une session neuve et le brouillon repris reste orphelin"
        )
        // **L'APPEL, jamais le nom du local qui le nourrit** : le meuble lit
        // depuis #4611 la graine de la porte en repli du paramètre
        // (`draftId ?? intent.origin.resumedDraftId`), ce qui a renommé la
        // variable. Épingler `adoptDraft(id: draftId)` faisait tomber cette
        // garde sur un changement qui ne touchait ni l'appel ni son rôle.
        XCTAssertTrue(
            host.contains("composer.adoptDraft(id:"),
            "Le meuble doit adopter le brouillon reçu — sans adoption, l'autosave écrit sous un id neuf et duplique le brouillon"
        )
        XCTAssertTrue(
            actions.contains("viewModel.pendingDraftId = nil"),
            "Le dismiss du cover doit consommer pendingDraftId — sinon le PROCHAIN « + » rouvrirait le dernier brouillon repris"
        )
    }
}
