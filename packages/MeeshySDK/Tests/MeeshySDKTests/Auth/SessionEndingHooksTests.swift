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

    @Test func unCrochetQuiTraine_neRetientPasLaSortieAuDelaDuDelai() async {
        let hooks = SessionEndingHooks(timeout: 0.05)
        hooks.add { try? await Task.sleep(for: .seconds(5)) }
        let start = Date()

        await hooks.runAll()

        #expect(Date().timeIntervalSince(start) < 2)
    }
}
