import XCTest
@testable import MeeshySDK

/// Garde de source pour l'arbitrage A4 (`tasks/todo-composer-lot-c-et-v2-2026-08-23.md`
/// §A4) : le fonctionnel était fait — les 3 `URLRequest(` de
/// `TusUploadManager.swift` (:319 PATCH, :451 POST création, :499 HEAD) posent
/// déjà leurs en-têtes via `Self.applyClientHeaders(await
/// ClientInfoProvider.shared.buildHeaders(), to: &req)` — mais rien ne
/// l'empêchait de régresser : un futur `URLRequest(` ajouté à la main, ou un
/// `setValue` direct de `X-App-Version`/`X-App-Platform`/`X-Canvas-Caps`,
/// aurait échappé à tous les tests comportementaux existants (aucun ne fait
/// d'assertion sur les en-têtes HTTP bruts d'une requête TUS). Comportemental
/// impossible ici pour la même raison que
/// `MediaSessionCoordinatorTryOptionalLoggingSourceGuardTests` : `URLSession`
/// réel, pas de seam pour intercepter la requête construite en interne.
///
/// Deux invariants, mesurés sur le fichier réel (commentaires retirés — une
/// garde qui compte des occurrences dans un commentaire valide la doc, pas le
/// code) :
///  1. chaque `URLRequest(` est suivi, dans sa fenêtre, d'un appel à
///     `Self.applyClientHeaders(` — la fonction interne UNIQUE qui enveloppe
///     `ClientInfoProvider.buildHeaders()` (déclarée :492, doc-comment
///     l'affirme comme le seul point de pose) ;
///  2. aucun `setValue(_:forHTTPHeaderField:)` ne pose littéralement
///     `X-App-Version` / `X-App-Platform` / `X-Canvas-Caps` — ces 3 clés
///     n'existent que comme valeurs DYNAMIQUES dans la boucle
///     `applyClientHeaders`, jamais comme littéral au site d'appel.
final class TusUploadManagerSourceGuardTests: XCTestCase {

    // MARK: - Source loading (commentaires retirés)

    private func managerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // ce fichier de test
            .deletingLastPathComponent() // Networking/
            .deletingLastPathComponent() // MeeshySDKTests/
            .deletingLastPathComponent() // Tests/
            .appendingPathComponent("Sources/MeeshySDK/Networking/TusUploadManager.swift")
        return Self.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Retire les commentaires ligne et bloc en respectant les littéraux de
    /// chaîne (un `//` ou `/*` DANS une chaîne ne doit pas ouvrir de
    /// commentaire). Même forme que `ComposerSourceGuard.stripComments`
    /// (`Tests/MeeshyUITests/Story/Controls/ComposerSourceGuard.swift`) —
    /// dupliquée ici plutôt qu'importée : ce helper vit dans la cible de test
    /// `MeeshyUITests`, inatteignable depuis `MeeshySDKTests`.
    private static func stripComments(_ source: String) -> String {
        enum Mode { case code, string, lineComment, blockComment }
        var mode: Mode = .code
        var result = ""
        var escaped = false
        var pending: Character?

        for character in source {
            switch mode {
            case .code:
                if let slash = pending {
                    pending = nil
                    if character == "/" { mode = .lineComment; continue }
                    if character == "*" { mode = .blockComment; continue }
                    result.append(slash)
                }
                if character == "/" { pending = "/"; continue }
                if character == "\"" { mode = .string }
                result.append(character)
            case .string:
                result.append(character)
                if escaped { escaped = false; continue }
                if character == "\\" { escaped = true; continue }
                if character == "\"" { mode = .code }
            case .lineComment:
                if character == "\n" { mode = .code; result.append(character) }
            case .blockComment:
                if let star = pending, star == "*", character == "/" {
                    pending = nil
                    mode = .code
                    continue
                }
                pending = character == "*" ? "*" : nil
                if character == "\n" { result.append(character) }
            }
        }
        if let slash = pending, mode == .code { result.append(slash) }
        return result
    }

    /// Toutes les fenêtres suivant chaque `URLRequest(` du fichier — bornées
    /// au prochain `URLRequest(` (ou à la fin du fichier), jamais à un
    /// offset fixe : un offset fixe de 400 caractères déborde sur le site
    /// suivant dès qu'un `URLRequest(` non conforme est inséré moins de 400
    /// caractères avant un site conforme, et la garde ne rougit plus jamais
    /// (constat de revue R1-garde-A4-vacuous, 2026-08-25).
    private func windowsAfterEachURLRequest(in code: String) -> [String] {
        var windows: [String] = []
        var searchStart = code.startIndex
        while let range = code.range(of: "URLRequest(", range: searchStart..<code.endIndex) {
            let nextRange = code.range(of: "URLRequest(", range: range.upperBound..<code.endIndex)
            let windowEnd = nextRange?.lowerBound ?? code.endIndex
            windows.append(String(code[range.upperBound..<windowEnd]))
            searchStart = range.upperBound
        }
        return windows
    }

    // MARK: - Invariant 1 : chaque URLRequest( est suivie d'applyClientHeaders(

    func test_troisSitesURLRequestExistentDansLeFichier() throws {
        let code = try managerSource()
        let windows = windowsAfterEachURLRequest(in: code)
        XCTAssertEqual(
            windows.count, 3,
            "3 sites `URLRequest(` attendus (PATCH :319, POST création :451, HEAD :499) — " +
            "un compte différent signifie que cette garde doit être mise à jour AVEC le site ajouté/retiré, " +
            "pas après coup."
        )
    }

    func test_chaqueURLRequestConstruiteEstSuivieDApplyClientHeaders() throws {
        let code = try managerSource()
        let windows = windowsAfterEachURLRequest(in: code)
        XCTAssertFalse(windows.isEmpty, "aucun site URLRequest( trouvé — la garde ne protège rien")

        for (index, window) in windows.enumerated() {
            XCTAssertTrue(
                window.contains("applyClientHeaders("),
                "le site URLRequest( n°\(index + 1) n'est pas suivi, dans sa fenêtre, d'un appel à " +
                "Self.applyClientHeaders( — une requête Tus construite à la main échapperait au funnel " +
                "ClientInfoProvider.buildHeaders() et partirait sans X-App-Version/X-App-Platform/X-Canvas-Caps"
            )
        }
    }

    // MARK: - Invariant 2 : aucun setValue littéral des 3 en-têtes gardées

    func test_aucunSetValueNePoseXAppVersionAMain() throws {
        let code = try managerSource()
        XCTAssertFalse(
            code.contains("forHTTPHeaderField: \"X-App-Version\""),
            "X-App-Version ne doit être posé QUE par la boucle dynamique d'applyClientHeaders, " +
            "jamais littéralement à un site d'appel — poser cette clé à la main la découple de la porte " +
            "de version gateway (AppVersionHeader.value())"
        )
    }

    func test_aucunSetValueNePoseXAppPlatformAMain() throws {
        let code = try managerSource()
        XCTAssertFalse(
            code.contains("forHTTPHeaderField: \"X-App-Platform\""),
            "X-App-Platform ne doit être posé QUE par la boucle dynamique d'applyClientHeaders"
        )
    }

    func test_aucunSetValueNePoseXCanvasCapsAMain() throws {
        let code = try managerSource()
        XCTAssertFalse(
            code.contains("forHTTPHeaderField: \"X-Canvas-Caps\""),
            "X-Canvas-Caps ne doit être posé QUE par la boucle dynamique d'applyClientHeaders — " +
            "un littéral figé à un site d'appel ne suivrait jamais un bump de niveau côté gateway"
        )
    }

    // MARK: - applyClientHeaders reste le seul point de pose dynamique

    func test_applyClientHeadersPoseLesEnTetesDynamiquementPasEnDur() throws {
        let code = try managerSource()
        guard let start = code.range(of: "private static func applyClientHeaders(") else {
            XCTFail("applyClientHeaders introuvable — la garde ci-dessus référence une fonction renommée")
            return
        }
        let end = code.range(of: "private func headOffset(", range: start.upperBound..<code.endIndex)?.lowerBound
            ?? code.endIndex
        let body = String(code[start.lowerBound..<end])

        XCTAssertTrue(
            body.contains("request.setValue(value, forHTTPHeaderField: key)"),
            "applyClientHeaders doit pose chaque en-tête DYNAMIQUEMENT depuis la paire (key, value) du " +
            "dictionnaire retourné par ClientInfoProvider.buildHeaders() — jamais une clé/valeur en dur"
        )
    }
}
