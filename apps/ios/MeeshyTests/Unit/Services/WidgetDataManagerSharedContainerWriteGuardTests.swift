import XCTest
@testable import Meeshy

/// Garde de source : AUCUNE écriture App Group ne doit contourner
/// `writingToSharedContainer`.
///
/// **Le crash** — 5 rapports `.ips` device `RUNNINGBOARD 3735883980`
/// (`0xDEAD10CC`) entre le 2026-07-31 et le 2026-08-17. La pile de
/// `Meeshy-2026-08-17-074340` est sans ambiguïté :
///
///     ConversationListViewModel.syncBadgeOnUnreadChange   (sink Combine, debounce 200 ms)
///       → NotificationCoordinator.registerConversations
///         → WidgetDataManager.publishConversations
///           → -[NSUserDefaults setObject:forKey:]
///             → CFPrefsPlistSource … xpc_connection_send_message_with_reply_sync
///               → mach_msg2_trap                      ← BLOQUÉ pendant la suspension
///
/// `0xDEAD10CC` signifie exactement : « le process détenait un verrou de
/// fichier/base au moment où il a été suspendu ». Une écriture `UserDefaults`
/// sur une suite App Group est un appel XPC SYNCHRONE vers `cfprefsd`, donc un
/// verrou — et le `.debounce(200 ms)` en amont la replante jusqu'à 200 ms après
/// la dernière mutation, potentiellement dans la fenêtre de suspension.
///
/// Le remède est l'assertion de tâche d'arrière-plan (`beginBackgroundTask`),
/// qui diffère la suspension jusqu'à la fin de l'écriture. Cette garde existe
/// pour qu'un futur `publishX` n'oublie pas de la prendre : c'est l'oubli, pas
/// le mécanisme, qui a produit les 5 crashs.
final class WidgetDataManagerSharedContainerWriteGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Services
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Services/WidgetDataManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_everySharedDefaultsWrite_isWrappedInABackgroundTaskAssertion() throws {
        let stripped = AppSourceGuard.stripComments(try source())

        // Chaque ligne portant un `.set(` sur les defaults partagés doit, sur
        // la même ligne ou dans le bloc ouvert juste au-dessus, passer par le
        // parapluie. On vérifie ligne à ligne en suivant l'ouverture du bloc.
        var unprotected: [String] = []
        var openAssertionDepth: Int?
        var depth = 0

        for rawLine in stripped.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine)
            let opensAssertion = line.contains("writingToSharedContainer {")

            if line.contains("defaults.set(") || line.contains("sharedDefaults?.set(") {
                let protectedInline = opensAssertion
                let protectedByBlock = openAssertionDepth != nil
                if !protectedInline && !protectedByBlock {
                    unprotected.append(line.trimmingCharacters(in: .whitespaces))
                }
            }

            if opensAssertion, !line.contains("}") {
                openAssertionDepth = depth
            }
            depth += line.filter { $0 == "{" }.count - line.filter { $0 == "}" }.count
            if let opened = openAssertionDepth, depth <= opened {
                openAssertionDepth = nil
            }
        }

        XCTAssertTrue(
            unprotected.isEmpty,
            """
            Écriture(s) App Group hors assertion de tâche d'arrière-plan :
            \(unprotected.joined(separator: "\n"))
            Une écriture `UserDefaults` sur une suite App Group est un appel XPC \
            SYNCHRONE vers cfprefsd. Si la suspension tombe pendant, RunningBoard \
            tue le process (0xDEAD10CC — 5 crashs device, cf. doc de la classe). \
            Envelopper dans `writingToSharedContainer { … }`.
            """
        )
    }

    /// Le parapluie doit rester STRICTEMENT synchrone : une version `async`
    /// laisserait la suspension se glisser entre la prise de l'assertion et
    /// l'écriture, ce qui reproduirait le crash tout en donnant l'illusion
    /// d'être protégé.
    func test_backgroundTaskAssertion_isSynchronous_andAlwaysEnded() throws {
        let stripped = AppSourceGuard.stripComments(try source())
        XCTAssertTrue(
            stripped.contains("private func writingToSharedContainer(_ body: () -> Void)"),
            "Le parapluie doit prendre une closure SYNCHRONE non-escaping."
        )
        XCTAssertTrue(
            stripped.contains("UIApplication.shared.beginBackgroundTask(withName: \"meeshy.widget.publish\")"),
            "Le parapluie doit prendre une vraie assertion de tâche d'arrière-plan."
        )
        XCTAssertTrue(
            stripped.contains("defer {") && stripped.contains("UIApplication.shared.endBackgroundTask(taskId)"),
            "L'assertion doit être rendue par `defer` — une sortie anticipée qui la " +
            "laisserait ouverte déclencherait le watchdog 0x8BADF00D."
        )
    }
}
