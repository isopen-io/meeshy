import XCTest
import MeeshySDK
@testable import Meeshy

/// Vecteurs inter-plateformes pour `LentilleBridgeFormatter.buildBridgeData`
/// — miroir Swift de `buildBridgeData` (`packages/shared/utils/conversation-bridge.ts`,
/// LWS-1, **gelé S1**). Fixtures : ressource de bundle copiée depuis
/// `packages/shared/fixtures/reading-modes/bridge.vectors.json` (câblage
/// `type: folder` dans `project.yml`, même mécanique que
/// `LentilleMetricsTests` pour `design/lentille-tokens.json`).
///
/// **Nommage** — comme #3010 WS-0 / M-045 : aucun jeton de
/// `FINAL_PHASE_CLASS_PATTERN` (`meeshy.sh` ~:1591) dans `BridgeFormatterVectorTests`
/// (contrat LWS-5, validé).
///
/// **Garde de harnais (leçon 257)** : une suite de vecteurs qui charge ZÉRO
/// cas doit ÉCHOUER, jamais rester vert en silence — `test_vectors_fileLoadsAtLeastOneCase`
/// verrouille ce plancher explicitement, en plus du `XCTFail` du loader
/// lui-même si le fichier est introuvable ou vide.
final class BridgeFormatterVectorTests: XCTestCase {

    // MARK: - Forme d'un cas de vecteur

    /// Décodeur TOLÉRANT aux clés inconnues : `Decodable` ignore par défaut
    /// toute clé JSON absente de `CodingKeys`/des propriétés déclarées — un
    /// champ ajouté côté TS (ex. futur `_label`, RÉSERVE 8) ne fait jamais
    /// échouer ce décodage.
    ///
    /// `expected` décode DIRECTEMENT en `ConversationBridgeData?` (type du
    /// SDK, C-029) : `null` JSON décode nativement en `nil` pour un type
    /// optionnel, sans DTO intermédiaire à maintenir en double.
    private struct BridgeVectorCase: Decodable {
        struct Input: Decodable {
            let messages: [LentilleBridgeFormatter.BridgeMessage]
            let viewerId: String
            let unreadCount: Int
        }

        let input: Input
        let expected: ConversationBridgeData?
    }

    // MARK: - Chargement du fichier de vecteurs

    /// Ressource de bundle : `packages/shared/fixtures/reading-modes/bridge.vectors.json`,
    /// câblée via `project.yml` (`MeeshyTests.resources`, `path: ../../packages/shared/fixtures`,
    /// `type: folder`) — l'arborescence `reading-modes/` est préservée sous
    /// le conteneur `fixtures/` du bundle.
    private static func loadVectors() -> [BridgeVectorCase] {
        guard let url = Bundle(for: BridgeFormatterVectorTests.self).url(
            forResource: "bridge.vectors",
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                bridge.vectors.json introuvable dans le bundle de tests sous \
                `fixtures/reading-modes/`. Vérifier la ressource `../../packages/shared/fixtures` \
                (type: folder) dans project.yml, puis `xcodegen generate`.
                """)
            return []
        }
        guard let data = try? Data(contentsOf: url) else {
            XCTFail("bridge.vectors.json présent à \(url.path) mais illisible.")
            return []
        }
        guard let vectors = try? JSONDecoder().decode([BridgeVectorCase].self, from: data) else {
            XCTFail("bridge.vectors.json présent mais mal formé — attendu un tableau de { input, expected }.")
            return []
        }
        return vectors
    }

    // MARK: - Garde de harnais (leçon 257)

    /// Le pire mode de panne d'une suite de vecteurs est le vert silencieux :
    /// un fichier vide, ou une régression de chargement, ferait passer cette
    /// suite alors qu'elle n'a rien vérifié. Ce témoin échoue explicitement
    /// si `loadVectors()` renvoie zéro cas — indépendamment du `XCTFail`
    /// déjà posé dans le loader lui-même sur fichier absent/illisible.
    func test_vectors_fileLoadsAtLeastOneCase() {
        XCTAssertFalse(Self.loadVectors().isEmpty, "bridge.vectors.json a chargé ZÉRO cas — leçon 257, jamais de vert silencieux")
    }

    // MARK: - Rejeu des cas

    /// Un `it()` par cas, sur le modèle du harnais TS (`runVectors`) : chaque
    /// vecteur devient un témoin distinct, nommé par son index, pour qu'un
    /// échec pointe directement le cas en cause plutôt qu'une boucle opaque.
    func test_buildBridgeData_matchesAllVectors() {
        let vectors = Self.loadVectors()
        guard !vectors.isEmpty else {
            XCTFail("aucun vecteur chargé — voir test_vectors_fileLoadsAtLeastOneCase")
            return
        }

        for (index, vector) in vectors.enumerated() {
            let actual = LentilleBridgeFormatter.buildBridgeData(
                messages: vector.input.messages,
                viewerId: vector.input.viewerId,
                unreadCount: vector.input.unreadCount
            )
            XCTAssertEqual(
                actual, vector.expected,
                """
                case \(index) ne correspond pas :
                  viewerId:    \(vector.input.viewerId)
                  unreadCount: \(vector.input.unreadCount)
                  expected:    \(String(describing: vector.expected))
                  actual:      \(String(describing: actual))
                """
            )
        }
    }

    // MARK: - Témoins unitaires de formatBridge (sélection One/Other, preuve E7)

    /// Condition 2, REV-2 : `messageCount == 1` sélectionne `messagesOne`,
    /// JAMAIS `messagesOther` — jamais une clé unique. On capture les clés
    /// effectivement demandées au `t` injecté plutôt que de parser la phrase
    /// rendue, pour rester indépendant de tout catalogue de traduction réel.
    func test_formatBridge_singleMessage_selectsMessagesOneKey() {
        let data = ConversationBridgeData(authors: ["Alice"], extraAuthorCount: 0, messageCount: 1)
        var requestedKeys: [String] = []
        let t: LentilleBridgeFormatter.BridgeTranslate = { key, _ in
            requestedKeys.append(key)
            return key
        }

        _ = LentilleBridgeFormatter.formatBridge(data: data, t: t)

        XCTAssertTrue(requestedKeys.contains("lentille.bridge.messagesOne"))
        XCTAssertFalse(requestedKeys.contains("lentille.bridge.messagesOther"))
    }

    /// Le pendant `count > 1` : sélectionne `messagesOther`, jamais `messagesOne`.
    func test_formatBridge_threeMessages_selectsMessagesOtherKey() {
        let data = ConversationBridgeData(authors: ["Alice"], extraAuthorCount: 0, messageCount: 3)
        var requestedKeys: [String] = []
        let t: LentilleBridgeFormatter.BridgeTranslate = { key, _ in
            requestedKeys.append(key)
            return key
        }

        _ = LentilleBridgeFormatter.formatBridge(data: data, t: t)

        XCTAssertTrue(requestedKeys.contains("lentille.bridge.messagesOther"))
        XCTAssertFalse(requestedKeys.contains("lentille.bridge.messagesOne"))
    }

    /// Preuve E7 côté Swift : le MÊME `data` passé à deux `t` factices de
    /// « langues » différentes rend deux phrases différentes — l'étage
    /// déterministe n'a jamais besoin d'être traduit lui-même, toute la
    /// langue vit dans le `t` injecté par l'appelant.
    func test_formatBridge_sameDataTwoTranslators_rendersTwoDifferentSentences() {
        let data = ConversationBridgeData(
            authors: ["Alice", "Bob"],
            extraAuthorCount: 1,
            messageCount: 4
        )

        let englishT: LentilleBridgeFormatter.BridgeTranslate = { key, params in
            switch key {
            case "lentille.bridge.authorsMore":
                return "\(params["a"] ?? ""), \(params["b"] ?? "") and \(params["count"] ?? "") others"
            case "lentille.bridge.messagesOther":
                return "\(params["count"] ?? "") messages"
            default:
                return key
            }
        }
        let frenchT: LentilleBridgeFormatter.BridgeTranslate = { key, params in
            switch key {
            case "lentille.bridge.authorsMore":
                return "\(params["a"] ?? ""), \(params["b"] ?? "") et \(params["count"] ?? "") autres"
            case "lentille.bridge.messagesOther":
                return "\(params["count"] ?? "") messages"
            default:
                return key
            }
        }

        let english = LentilleBridgeFormatter.formatBridge(data: data, t: englishT)
        let french = LentilleBridgeFormatter.formatBridge(data: data, t: frenchT)

        XCTAssertNotEqual(english, french, "le même data côté deux t différents doit rendre deux phrases différentes (E7)")
        XCTAssertEqual(english, "Alice, Bob and 1 others · 4 messages")
        XCTAssertEqual(french, "Alice, Bob et 1 autres · 4 messages")
    }

    /// Absence totale de segment média : `mediaCounts == nil` ⇒ aucun
    /// séparateur `" · "` orphelin, pas de segment vide inséré dans la phrase.
    func test_formatBridge_noMediaCounts_omitsMediaSegment() {
        let data = ConversationBridgeData(authors: ["Alice"], extraAuthorCount: 0, messageCount: 1)
        let t: LentilleBridgeFormatter.BridgeTranslate = { key, params in
            switch key {
            case "lentille.bridge.authorsOne": return "\(params["name"] ?? "")"
            case "lentille.bridge.messagesOne": return "1 message"
            default: return key
            }
        }

        XCTAssertEqual(LentilleBridgeFormatter.formatBridge(data: data, t: t), "Alice · 1 message")
    }

    /// Le segment média compose plusieurs buckets avec `, ` — séparateur
    /// distinct du `" · "` entre segments.
    func test_formatBridge_multipleMediaBuckets_joinsWithComma() {
        let data = ConversationBridgeData(
            authors: ["Alice"],
            extraAuthorCount: 0,
            messageCount: 1,
            mediaCounts: ConversationBridgeMediaCounts(images: 2, audio: 1)
        )
        let t: LentilleBridgeFormatter.BridgeTranslate = { key, params in
            switch key {
            case "lentille.bridge.authorsOne": return "\(params["name"] ?? "")"
            case "lentille.bridge.messagesOne": return "1 message"
            case "lentille.bridge.media.images": return "\(params["count"] ?? "") photos"
            case "lentille.bridge.media.audio": return "\(params["count"] ?? "") audio"
            default: return key
            }
        }

        XCTAssertEqual(LentilleBridgeFormatter.formatBridge(data: data, t: t), "Alice · 1 message · 2 photos, 1 audio")
    }
}
