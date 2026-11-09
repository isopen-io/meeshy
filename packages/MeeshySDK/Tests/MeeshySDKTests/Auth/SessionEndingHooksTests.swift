import Foundation
import Testing
@testable import MeeshySDK

/// Ce qui doit se défaire SOUS la session qui finit (#17143) : un jeton de push retiré du serveur part avec les
/// identifiants du compte sortant, donc AVANT leur effacement — attendu, mais borné pour ne jamais bloquer la sortie.
@MainActor
struct SessionEndingHooksTests {

    private final class Log: @unchecked Sendable {
        var calls: [String] = []
    }

    @Test func lesCrochets_tournentDansLOrdre_etSontAttendus() async {
        let hooks = SessionEndingHooks()
        let log = Log()
        hooks.add { log.calls.append("a") }
        hooks.add {
            await Task.yield()
            log.calls.append("b")
        }

        await hooks.runAll()

        #expect(log.calls == ["a", "b"])
    }

    /// Le crochet qui traîne est ANNULÉ passé le délai — vérifié par son effet, jamais par une durée mesurée : sur un
    /// runner chargé, l'acteur principal peut rester pris plusieurs secondes et fausser tout chronomètre (8 s en CI).
    @Test func unCrochetQuiTraine_estAnnulePasseLeDelai() async {
        let hooks = SessionEndingHooks(timeout: 0.05)
        let log = Log()
        hooks.add {
            do {
                try await Task.sleep(for: .seconds(60))
                log.calls.append("fini")
            } catch {
                log.calls.append("annulé")
            }
        }

        await hooks.runAll()

        #expect(log.calls == ["annulé"])
    }
}
