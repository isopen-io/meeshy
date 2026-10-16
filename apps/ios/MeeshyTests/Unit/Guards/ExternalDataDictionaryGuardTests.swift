import XCTest
@testable import Meeshy

/// `Dictionary(uniqueKeysWithValues:)` PIÈGE sur une clé répétée. Sur des
/// données qui viennent du serveur, du cache disque ou d'une page de recherche,
/// un doublon n'est pas impossible : la liste en cache (`"list"`) est écrite
/// telle que reçue par `saveSorted(firstPage, …)`, et un seul doublon sur
/// disque faisait planter CHAQUE recherche globale, à chaque lancement.
/// Ces sites construisent désormais leur index avec `uniquingKeysWith`.
final class ExternalDataDictionaryGuardTests: XCTestCase {

    private static let externalDataUnits = [
        "Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift",
        "Meeshy/Features/Main/ViewModels/ConversationViewModel+StoreObservation.swift",
        "Meeshy/Features/Main/Focal/Summary/FaceRampRanking.swift",
        "Meeshy/Features/Main/Focal/Summary/DeterministicDigestBuilder.swift",
        "Meeshy/Features/Main/Services/PresenceManager.swift",
        "Meeshy/Features/Main/Focal/Row/FocalAudioBlock.swift",
        "Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift",
    ]

    func test_externalDataIndexes_neverTrapOnADuplicateKey() throws {
        for path in Self.externalDataUnits {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
            XCTAssertFalse(
                code.contains("uniqueKeysWithValues"),
                "\(path) indexe des données externes : un doublon y ferait planter l'app"
            )
        }
    }
}
