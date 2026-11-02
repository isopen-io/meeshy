import XCTest
import MeeshySDK
@testable import Meeshy

/// Rejeu iOS du fichier de vecteurs partagé
/// `packages/shared/fixtures/reading-modes/prism-preview.vectors.json` — le
/// CONTRAT cross-plateforme de la résolution du Prisme sur l'aperçu de dernier
/// message (CLAUDE.md § *Prisme Linguistique*, règle #3). TS le rejoue
/// (`packages/shared/__tests__/vectors/prism-preview.vectors.test.ts`) et Android
/// aussi (`apps/android/core/model/.../lang/PrismPreviewVectorParityTest.kt`).
///
/// Les trois clients rendent la MÊME ligne depuis le MÊME payload REST, et chacun
/// portait jusqu'ici sa propre suite écrite À LA MAIN se déclarant « one-for-one
/// mirror » des deux autres — l'en-tête de `ConversationPrismeResolutionTests`
/// (SDK) et de `LastMessagePreviewResolverTest.kt` (Android) le dit mot pour mot.
/// Une parité affirmée en prose, gardée par rien : c'est le trou « N miroirs,
/// zéro témoin de parité » (leçons 291/292). Ce fichier remplace la prose par un
/// témoin machine.
///
/// **API réelle rejouée** — `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)`
/// (SDK), le chemin exact que `LentilleConversationRow.resolvedPreviewText`
/// consomme en production, jamais une réimplémentation locale de la boucle ici.
///
/// Le dossier `packages/shared/fixtures/reading-modes/` est déjà câblé au bundle
/// de tests (`project.yml`, `MeeshyTests.resources`, `../../packages/shared/fixtures`,
/// `type: folder`) — aucune modification de `project.yml` n'est nécessaire, le
/// nouveau fichier JSON y entre par la même folder reference que `accent.vectors.json`.
final class PrismPreviewVectorTests: XCTestCase {

    // MARK: - Décodage du fichier de vecteurs

    private struct VectorInputJSON: Decodable {
        let preview: String?
        let translations: [String: String]?
        let originalLanguage: String?
        let preferredLanguages: [String]
    }

    private struct VectorCaseJSON: Decodable {
        let label: String?
        let input: VectorInputJSON
        let expected: String?

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    private struct VectorFileJSON: Decodable {
        let vectors: [VectorCaseJSON]
    }

    private static func loadCases() -> [VectorCaseJSON] {
        guard let url = Bundle(for: PrismPreviewVectorTests.self).url(
            forResource: "prism-preview.vectors",
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                prism-preview.vectors.json introuvable dans le bundle de tests sous \
                fixtures/reading-modes/. Vérifier la ressource \
                `../../packages/shared/fixtures` (type: folder) dans project.yml, \
                puis `xcodegen generate`.
                """)
            return []
        }

        do {
            let data = try Data(contentsOf: url)
            let file = try JSONDecoder().decode(VectorFileJSON.self, from: data)
            guard !file.vectors.isEmpty else {
                XCTFail("""
                    prism-preview.vectors.json contient ZÉRO cas — une suite de vecteurs ne \
                    doit jamais charger zéro cas (leçon 257, jamais de vert silencieux)
                    """)
                return []
            }
            return file.vectors
        } catch {
            XCTFail("prism-preview.vectors.json présent mais illisible/mal formé : \(error)")
            return []
        }
    }

    // MARK: - Gardes de harnais (leçon 257) + RE-PREUVE du compte

    func test_vectors_fileLoadsAtLeastOneCase() {
        XCTAssertFalse(Self.loadCases().isEmpty, "prism-preview.vectors.json a chargé ZÉRO cas — leçon 257, jamais de vert silencieux")
    }

    func test_vectors_totalCaseCount_isThirtyThree() {
        XCTAssertEqual(Self.loadCases().count, 33, "prism-preview.vectors.json ne contient plus 33 cas — vérifier si des vecteurs ont été ajoutés/retirés avant d'ajuster ce nombre.")
    }

    // MARK: - Rejeu de tous les vecteurs contre l'API RÉELLE (jamais de loi réimplémentée)

    private func makeConversation(_ input: VectorInputJSON) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "prism-vector",
            identifier: "prism-vector",
            type: .direct,
            lastMessagePreview: input.preview
        )
        conversation.lastMessageOriginalLanguage = input.originalLanguage
        conversation.lastMessageTranslations = input.translations
        return conversation
    }

    func test_everyVector_matchesResolvedLastMessagePreview() {
        let cases = Self.loadCases()
        XCTAssertFalse(cases.isEmpty)

        for vector in cases {
            let conversation = makeConversation(vector.input)
            let actual = conversation.resolvedLastMessagePreview(
                preferredLanguages: vector.input.preferredLanguages
            )
            XCTAssertEqual(actual, vector.expected, "cas «\(vector.label ?? "?")»")
        }
    }
}
