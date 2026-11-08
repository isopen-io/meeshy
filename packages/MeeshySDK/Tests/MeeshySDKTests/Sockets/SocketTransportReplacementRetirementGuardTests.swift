import XCTest
@testable import MeeshySDK

/// #16744 — **un transport qu'on REMPLACE est un transport qu'on démonte.**
///
/// `SocketTransportRetirement` existe parce que Socket.IO arme l'expiration
/// d'un `emitWithAck` avec une référence FAIBLE au client : le transport
/// relâché n'appelle ni la réponse ni l'expiration, et la tâche qui attendait
/// — un envoi, un `call:end` — reste suspendue pour toujours. Son
/// doc-comment ÉNUMÈRE ses moments : « arrière-plan, rotation du jeton,
/// reconnexion forcée ». Les trois sont des DÉMONTAGES ; le REMPLACEMENT est
/// un quatrième, et il manquait à la liste (leçon 261).
///
/// Les deux gestionnaires DÉTIENNENT la loi et l'appellent à leur porte de
/// démontage (`suspendTransport()`). `establishTransport()` et
/// `armConnection()`, eux, réassignaient `manager` sans elle, alors que leur
/// garde-fou d'entrée ne couvre QUE `.connected || .connecting` : un socket
/// coupé par le serveur (expiration de JWT côté passerelle) reste non-nil et
/// `.disconnected`, donc passe dessous avec ses accusés en vol.
///
/// La garde est une garde de SOURCE parce qu'aucune surface publique ne rend
/// la retraite observable : `transportRetirement` est `private let` sur deux
/// singletons, sans point d'injection. Motif déjà présent au dépôt
/// (`SocketCompressionSourceGuardTests`, `CallEmitSourceGuardTests`).
///
/// Sa portée est la FONCTION, jamais une fenêtre de N lignes : une retraite
/// écrite dans la fonction précédente ne couvre pas le site suivant, et le
/// dernier test l'éprouve sur une source fabriquée.
final class SocketTransportReplacementRetirementGuardTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Le prédicat

    /// Une ligne qui BÂTIT le transport du gestionnaire, c'est-à-dire qui
    /// relâche celui que `manager` tenait. `makeTransport`, qui rend un
    /// `SocketManager` sans l'affecter, n'en est pas un.
    private func isTransportBuild(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        return trimmed.hasPrefix("manager = SocketManager(")
            || trimmed.hasPrefix("manager = makeTransport(")
    }

    /// Les deux façons d'appliquer la loi : l'appeler, ou passer par la porte
    /// de démontage qui l'appelle. Un commentaire ne compte pas — les
    /// doc-comments de ces fichiers CITENT `suspendTransport()` par son nom.
    private func isRetirement(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard !trimmed.hasPrefix("//") else { return false }
        return trimmed.contains("transportRetirement.retire(")
            || trimmed.contains("suspendTransport()")
    }

    private func isFunctionDeclaration(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.contains("func ") else { return false }
        guard !trimmed.hasPrefix("//") else { return false }
        for prefix in ["func ", "public func ", "private func ", "internal func ",
                       "fileprivate func ", "@MainActor func ", "@discardableResult func "] {
            if trimmed.hasPrefix(prefix) { return true }
        }
        return false
    }

    private func transportBuilds(in source: String) -> [String] {
        source
            .components(separatedBy: "\n")
            .filter { isTransportBuild($0) }
            .map { $0.trimmingCharacters(in: .whitespaces) }
    }

    /// Les fonctions qui bâtissent un transport sans qu'une retraite les
    /// précède DANS LEUR CORPS.
    private func uncoveredTransportBuilds(in source: String) -> [String] {
        var uncovered: [String] = []
        var enclosingFunction = "<hors fonction>"
        var retiredInThisFunction = false

        for line in source.components(separatedBy: "\n") {
            if isFunctionDeclaration(line) {
                enclosingFunction = line.trimmingCharacters(in: .whitespaces)
                retiredInThisFunction = false
                continue
            }
            if isRetirement(line) {
                retiredInThisFunction = true
                continue
            }
            if isTransportBuild(line) && !retiredInThisFunction {
                uncovered.append(enclosingFunction)
            }
        }
        return uncovered
    }

    // MARK: - Les sites réels

    func test_messageSocketManager_everyTransportBuildRetiresThePreviousOne() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/MessageSocketManager.swift")

        XCTAssertEqual(
            transportBuilds(in: source).count, 2,
            "MessageSocketManager bâtit exactement deux transports (establishTransport + connectAnonymous) — " +
            "un site de plus doit faire rougir cette garde tant qu'il ne retire pas le précédent"
        )
        XCTAssertEqual(
            uncoveredTransportBuilds(in: source), [],
            "Toute fonction qui remplace `manager` doit retirer le transport précédent : sans la retraite, " +
            "Socket.IO n'en garde qu'une référence FAIBLE et un `emitWithAck` en vol ne reçoit NI réponse NI expiration — " +
            "l'envoi reste sur l'horloge et ne se replie jamais sur REST"
        )
    }

    func test_socialSocketManager_everyTransportBuildRetiresThePreviousOne() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/SocialSocketManager.swift")

        XCTAssertEqual(
            transportBuilds(in: source).count, 1,
            "SocialSocketManager bâtit exactement un transport (armConnection)"
        )
        XCTAssertEqual(
            uncoveredTransportBuilds(in: source), [],
            "Le jumeau social porte la même loi : ses quatre accusés de réaction se suspendent de la même façon"
        )
    }

    // MARK: - La garde peut TOMBER (sources fabriquées)

    func test_guard_namesTheFunctionThatReplacesWithoutRetiring() {
        let fabricated = """
            private func establishTransport() -> SocketConnectOutcome {
                guard let url = SocketConfig.baseURL else { return .notArmed }
                manager = makeTransport(url: url, token: token)
                socket = manager?.defaultSocket
            }
            """
        XCTAssertEqual(
            uncoveredTransportBuilds(in: fabricated),
            ["private func establishTransport() -> SocketConnectOutcome {"]
        )
    }

    func test_guard_acceptsAnExplicitRetirement() {
        let fabricated = """
            private func establishTransport() -> SocketConnectOutcome {
                transportRetirement.retire(manager)
                manager = makeTransport(url: url, token: token)
            }
            """
        XCTAssertEqual(uncoveredTransportBuilds(in: fabricated), [])
    }

    func test_guard_acceptsTheTeardownDoorThatRetires() {
        let fabricated = """
            public func connectAnonymous(sessionToken: String) {
                suspendTransport()
                manager = SocketManager(socketURL: url, config: [])
            }
            """
        XCTAssertEqual(uncoveredTransportBuilds(in: fabricated), [])
    }

    /// Le point qui distingue cette garde d'une fenêtre de N lignes : une
    /// retraite écrite dans la fonction PRÉCÉDENTE ne couvre rien.
    func test_guard_doesNotLetARetirementInAnotherFunctionCoverTheBuild() {
        let fabricated = """
            private func suspendTransport() {
                transportRetirement.retire(manager)
                manager = nil
            }

            private func establishTransport() -> SocketConnectOutcome {
                manager = makeTransport(url: url, token: token)
            }
            """
        XCTAssertEqual(
            uncoveredTransportBuilds(in: fabricated),
            ["private func establishTransport() -> SocketConnectOutcome {"]
        )
    }

    /// Un doc-comment qui CITE la porte ne la fait pas appeler.
    func test_guard_doesNotAcceptAMentionInAComment() {
        let fabricated = """
            private func armConnection() -> SocketConnectOutcome {
                // Jumeau de MessageSocketManager.suspendTransport()
                manager = SocketManager(socketURL: url, config: [])
            }
            """
        XCTAssertEqual(
            uncoveredTransportBuilds(in: fabricated),
            ["private func armConnection() -> SocketConnectOutcome {"]
        )
    }
}
