import XCTest
@testable import Meeshy

// MARK: - MyStoriesDeleteConfirmationTests
//
// I9/I10 : TOUTE suppression dans « Mes stories » demande confirmation —
// stories publiées (existant), brouillons (dernier état local du travail non
// publié) et échecs de publication (la DERNIÈRE copie du travail : la
// supprimer sans confirmation détruit définitivement une story jamais montée
// au serveur).
//
// Les gardes de source interrogent `MyStoriesSourceCorpus` (commentaires
// retirés, corpus multi-fichiers) et s'ancrent sur les SITES D'INVOCATION des
// effets destructifs — jamais sur des fenêtres de caractères fixes.
@MainActor
final class MyStoriesDeleteConfirmationTests: XCTestCase {

    // MARK: - Copy resolver

    func test_confirmationCopy_everyTarget_hasTitleAndMessage() {
        for target in MyStoriesDeleteConfirmation.Target.allCases {
            XCTAssertFalse(
                MyStoriesDeleteConfirmation.title(for: target).isEmpty,
                "\(target) doit avoir un titre de confirmation"
            )
            XCTAssertFalse(
                MyStoriesDeleteConfirmation.message(for: target).isEmpty,
                "\(target) doit avoir un message de confirmation"
            )
        }
    }

    func test_confirmationCopy_targetsHaveDistinctMessages() {
        let messages = MyStoriesDeleteConfirmation.Target.allCases
            .map { MyStoriesDeleteConfirmation.message(for: $0) }
        XCTAssertEqual(
            Set(messages).count, messages.count,
            "Chaque cible décrit SA conséquence (story visible par personne / brouillon perdu / dernière copie détruite)"
        )
    }

    // MARK: - Gardes de source (corpus)

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// L'effet destructif sur un brouillon (`draftsViewModel.delete(`) n'a
    /// qu'UN site d'invocation : le bouton de confirmation de l'alerte. Le
    /// menu « … » et l'action VoiceOver ne font que POSER le candidat.
    func test_draftDelete_singleInvocationSite_behindConfirmation() {
        let corpus = MyStoriesSourceCorpus.text()

        XCTAssertEqual(
            occurrences(of: "draftsViewModel.delete(", in: corpus), 1,
            "Supprimer un brouillon doit passer par la confirmation — un seul site d'invocation (l'alerte)"
        )
        XCTAssertGreaterThanOrEqual(
            occurrences(of: "draftDeleteCandidate = draft", in: corpus), 2,
            "Le menu ET le chemin VoiceOver doivent poser le candidat (jamais supprimer directement)"
        )
    }

    /// L'effet destructif sur un échec (`discardFailedItem(item)`) n'a qu'UN
    /// site d'invocation : le bouton de confirmation de l'alerte. Le menu
    /// contextuel et l'action VoiceOver posent le candidat.
    func test_failedItemDelete_singleInvocationSite_behindConfirmation() {
        let corpus = MyStoriesSourceCorpus.text()

        XCTAssertEqual(
            occurrences(of: "discardFailedItem(item)", in: corpus), 1,
            "Supprimer un échec de publication (dernière copie du travail) doit passer par la confirmation"
        )
        XCTAssertGreaterThanOrEqual(
            occurrences(of: "failedDeleteCandidate = item", in: corpus), 2,
            "Le menu contextuel ET le chemin VoiceOver doivent poser le candidat"
        )
    }
}
