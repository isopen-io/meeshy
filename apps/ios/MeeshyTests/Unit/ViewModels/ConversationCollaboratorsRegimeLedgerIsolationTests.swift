import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **Deux suites qui ne précisent pas de `regimeLedger` ne doivent JAMAIS
/// partager le registre E2EE process-wide** (#13211).
///
/// `EndToEndRegimeLedger.shared` — adossé à `EndToEndRegimeMemory.shared` —
/// est MONOTONE et vit pour tout le processus xctest : une conversation
/// apprise chiffrée par UNE suite le reste pour toujours, y compris pour une
/// autre suite qui réutilise son identifiant sans jamais l'avoir appris
/// elle-même. `ConversationCollaborators` isole désormais l'OMISSION sous le
/// harnais de test (`AppDatabase.runsUnderTestHarness`, même garde que
/// `AppDatabase.shared` pour le magasin GRDB, #6857) : sans `regimeLedger`
/// explicite, chaque construction reçoit un registre NEUF et ÉPHÉMÈRE.
@MainActor
final class ConversationCollaboratorsRegimeLedgerIsolationTests: XCTestCase {

    private func makePersistence() throws -> MessagePersistenceActor {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        return MessagePersistenceActor(dbWriter: pool)
    }

    func test_defaultRegimeLedger_underTestHarness_isNeverTheSharedSingleton() throws {
        let collaborators = ConversationCollaborators(
            persistence: try makePersistence(), syncEngine: ConversationSyncEngine.shared,
            messageService: MockMessageService()
        )

        XCTAssertFalse(
            collaborators.regimeLedger === EndToEndRegimeLedger.shared,
            "sous le harnais de test, le registre par défaut ne doit jamais être le singleton process-wide"
        )
    }

    func test_defaultRegimeLedger_eachConstructionWithoutInjection_getsItsOwnLedger() throws {
        let first = ConversationCollaborators(
            persistence: try makePersistence(), syncEngine: ConversationSyncEngine.shared,
            messageService: MockMessageService()
        )
        let second = ConversationCollaborators(
            persistence: try makePersistence(), syncEngine: ConversationSyncEngine.shared,
            messageService: MockMessageService()
        )

        XCTAssertFalse(
            first.regimeLedger === second.regimeLedger,
            "une suite ne doit jamais hériter d'une conversation apprise chiffrée par une autre"
        )
    }

    /// L'isolement par défaut ne retire pas la possibilité d'en injecter un
    /// délibérément — un test qui veut un registre PARTAGÉ (ex. pour éprouver
    /// une persistance inter-vues) garde la main.
    func test_explicitRegimeLedger_isNeverOverridden() throws {
        let injected = EndToEndRegimeLedger()

        let collaborators = ConversationCollaborators(
            persistence: try makePersistence(), syncEngine: ConversationSyncEngine.shared,
            messageService: MockMessageService(), regimeLedger: injected
        )

        XCTAssertTrue(collaborators.regimeLedger === injected)
    }
}
