import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Débloquer un contact échouait TOUJOURS, et pour une raison invisible à
/// l'écran** — rapport porteur 2026-08-28 : « il est impossible de débloquer
/// les contacts bloqués ».
///
/// Rien ne manquait à la chaîne : l'écran existe (`BlockedTab`), le bouton et
/// sa confirmation aussi, le view-model enfile bien `.unblockUser` dans
/// l'outbox durable, le dispatcher vise la bonne route (`DELETE
/// /directory/blocks/:id`, ex-`/users/:id/block`) et le gateway la sert. **Le défaut était dans le TYPE de
/// la réponse attendue** :
///
/// ```
/// dispatchBlockUser    APIResponse<BlockActionResponse>   // { message: String? }
/// dispatchUnblockUser  APIResponse<[String: Bool]>        // ← faux
/// ```
///
/// Le gateway répond `{ "message": "User unblocked" }` — son propre schéma le
/// déclare. Décoder cette charge en dictionnaire de `Bool` LÈVE, donc
/// `dispatchUnblockUser` jetait toujours, l'enregistrement d'outbox n'était
/// jamais acquitté, et `BlockedViewModel.observeUnblockOutcome` affichait
/// « Impossible de débloquer » — le symptôme exact, sur un serveur qui avait
/// pourtant fait le travail.
///
/// > **Un type de réponse trop STRICT transforme un succès serveur en échec
/// > client.** Le geste part, la base est écrite, et l'app affiche l'inverse.
/// > C'est le pire des trois modes d'échec possibles : ni erreur réseau, ni
/// > refus explicite, mais une divergence entre ce qui EST et ce qui se voit.
///
/// Les deux jumeaux frappent la MÊME route sous deux verbes et rendent la même
/// forme : leur asymétrie était le défaut, et c'est elle que la seconde moitié
/// de cette suite interdit de revenir.
final class OutboxDispatcherUnblockDecodingTests: XCTestCase {

    /// La charge EXACTE que `routes/directory/blocks.ts` renvoie — son schéma
    /// déclare `data: { message: string }`.
    private let served = #"{"success":true,"data":{"message":"User unblocked"}}"#

    // MARK: - Le type attendu doit décoder ce que le serveur envoie

    func test_theServedPayload_decodesAsTheTypeTheTwinAlreadyUses() throws {
        let data = Data(served.utf8)

        let decoded = try JSONDecoder().decode(APIResponse<BlockActionResponse>.self, from: data)

        XCTAssertTrue(decoded.success)
        XCTAssertEqual(decoded.data.message, "User unblocked")
    }

    /// Le témoin qui aurait attrapé le défaut : la forme SERVIE ne peut pas se
    /// décoder en dictionnaire de booléens.
    func test_theServedPayload_cannotDecodeAsADictionaryOfBool() {
        let data = Data(served.utf8)

        XCTAssertThrowsError(
            try JSONDecoder().decode(APIResponse<[String: Bool]>.self, from: data),
            "un `message` textuel n'est pas un `Bool` — c'est ce décodage qui faisait échouer tout déblocage"
        )
    }

    /// Le blocage rend la même forme, et son type la décodait déjà : la preuve
    /// que le contrat n'a jamais changé côté serveur, seul le client divergeait.
    func test_theBlockPayload_hasTheSameShape() throws {
        let data = Data(#"{"success":true,"data":{"message":"User blocked"}}"#.utf8)

        let decoded = try JSONDecoder().decode(APIResponse<BlockActionResponse>.self, from: data)

        XCTAssertEqual(decoded.data.message, "User blocked")
    }

    // MARK: - Les deux jumeaux ne doivent plus diverger

    /// Garde de forme : `message` est optionnel côté client, donc une réponse
    /// SANS message reste décodable. Un producteur plus ancien, ou une route
    /// qui cesserait de renvoyer le libellé, ne doit pas refaire échouer le
    /// déblocage — c'est précisément le mode d'échec qu'on vient de corriger.
    func test_aResponseWithoutAnyMessage_stillDecodes() throws {
        let data = Data(#"{"success":true,"data":{}}"#.utf8)

        let decoded = try JSONDecoder().decode(APIResponse<BlockActionResponse>.self, from: data)

        XCTAssertNil(decoded.data.message)
    }

    func test_bothDispatchers_expectTheSameResponseType() throws {
        let source = try dispatcherSource()

        let block = try XCTUnwrap(body(of: "private func dispatchBlockUser", in: source))
        let unblock = try XCTUnwrap(body(of: "private func dispatchUnblockUser", in: source))

        XCTAssertTrue(
            block.contains("APIResponse<BlockActionResponse>"),
            "le blocage décodait déjà la bonne forme — si ce n'est plus vrai, la garde mesure autre chose"
        )
        XCTAssertTrue(
            unblock.contains("APIResponse<BlockActionResponse>"),
            "les deux jumeaux frappent la MÊME route et rendent la MÊME forme : leur asymétrie était le défaut"
        )
        XCTAssertFalse(
            unblock.contains("[String: Bool]"),
            "un dictionnaire de booléens ne peut pas décoder `{ message: String }` — c'est le défaut d'origine"
        )
    }

    // MARK: - Lecture

    private func dispatcherSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/OutboxDispatcher.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(of anchor: String, in source: String) -> String? {
        guard let start = source.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in source[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }
}
