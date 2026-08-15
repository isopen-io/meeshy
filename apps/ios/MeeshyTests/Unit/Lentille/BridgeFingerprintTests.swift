import XCTest
import MeeshySDK

/// Le pont ✦ de la Lentille (contrat §3.2) traverse le MÊME portillon de
/// mémoïsation que le reste de la ligne : `ThemedConversationRow.==` et
/// `ConversationRowItem.==` ne comparent la conversation QUE par
/// `renderFingerprint`, derrière `.equatable()`. Un champ affiché mais non
/// replié dedans n'est pas une optimisation approximative — c'est un rendu qui
/// ne se rafraîchit JAMAIS, puisque SwiftUI n'appelle même pas `body`.
///
/// Ces témoins verrouillent les deux critères contractuels de LWS-2 :
/// - **(a)** un pont dont SEUL le texte traduit change (même clé, même
///   `unreadCount`) fait CHANGER le fingerprint. C'est la régression jumelle de
///   B1 : un pont ré-émis garde le même `lastMessageId`, le même
///   `lastMessagePreview`, le même `lastMessageAt` et le même jeu de clés —
///   seule la valeur bouge, et c'est elle que la ligne affiche.
/// - **(b)** un pont `nil` rend le MÊME fingerprint qu'avant l'existence du
///   champ : drapeau éteint ⇒ zéro invalidation nouvelle.
///
/// **Toutes les variantes dérivent d'UNE SEULE fabrique, par mutation du seul
/// champ testé.** `MeeshyConversation.init` défaute `lastMessageAt` à `Date()`,
/// qui EST replié dans le hash : deux instances construites séparément
/// diffèrent donc toujours, et un `XCTAssertNotEqual` entre elles passerait
/// sans rien prouver (piège documenté par `ConversationRenderFingerprintTests`,
/// qui a coûté trois témoins vacuoirement verts à sa première rédaction).
final class BridgeFingerprintTests: XCTestCase {

    // MARK: - Fabriques

    /// Date FIXE : voir la note de classe. Sans épinglage, aucune comparaison
    /// entre deux instances ne dit quoi que ce soit.
    private static let pinnedDate = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(bridge: ConversationBridge? = nil) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "conv-bridge",
            identifier: "conv-bridge",
            type: .group,
            title: "Equipe Produit",
            lastMessageAt: Self.pinnedDate,
            createdAt: Self.pinnedDate,
            updatedAt: Self.pinnedDate,
            unreadCount: 3,
            lastMessagePreview: "Hello"
        )
        conversation.bridge = bridge
        return conversation
    }

    /// Étage `agent` — une phrase, donc la paire de résolution du Prisme.
    private func makeAgentBridge(
        unreadCount: Int = 4,
        suggestedMode: ConversationBridge.SuggestedMode = .resume,
        isComplete: Bool? = nil,
        text: String? = "Marie shared the plan",
        translations: [String: String]? = ["fr": "Marie a partagé le plan"],
        originalLanguage: String? = "en"
    ) -> ConversationBridge {
        ConversationBridge(
            kind: .agent,
            unreadCount: unreadCount,
            suggestedMode: suggestedMode,
            isComplete: isComplete,
            text: text,
            translations: translations,
            originalLanguage: originalLanguage
        )
    }

    /// Étage `fallback` — des données, formatées par l'i18n du client.
    private func makeFallbackBridge(
        unreadCount: Int = 4,
        suggestedMode: ConversationBridge.SuggestedMode = .focal,
        isComplete: Bool? = nil,
        authors: [String] = ["Marie", "Ali"],
        extraAuthorCount: Int = 2,
        messageCount: Int = 12,
        mediaCounts: ConversationBridgeMediaCounts? = nil
    ) -> ConversationBridge {
        ConversationBridge(
            kind: .fallback,
            unreadCount: unreadCount,
            suggestedMode: suggestedMode,
            isComplete: isComplete,
            data: ConversationBridgeData(
                authors: authors,
                extraAuthorCount: extraAuthorCount,
                messageCount: messageCount,
                mediaCounts: mediaCounts
            )
        )
    }

    private func conversationJSON(bridge: String?) -> Data {
        let bridgeEntry = bridge.map { "\"bridge\": \($0)," } ?? ""
        return """
        {
          "id": "conv-bridge",
          "identifier": "conv-bridge",
          "type": "group",
          "title": "Equipe Produit",
          "memberCount": 2,
          "isActive": true,
          "lastMessageAt": "2023-11-14T22:13:20Z",
          "createdAt": "2023-11-14T22:13:20Z",
          "updatedAt": "2023-11-14T22:13:20Z",
          \(bridgeEntry)
          "lastMessagePreview": "Hello",
          "unreadCount": 3
        }
        """.data(using: .utf8)!
    }

    private func decodeConversation(from data: Data) throws -> MeeshyConversation {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(MeeshyConversation.self, from: data)
    }

    // MARK: - Stabilité (le portillon doit rester un portillon)

    /// Non-discriminant seul, et c'est sa seule fonction : verrouiller que le
    /// hash ne devient pas « toujours différent ». Un fingerprint instable
    /// annulerait le gain de `.equatable()` sans qu'aucun autre témoin ne
    /// rougisse — pire, il rendrait tous les témoins `_changes` vacuoirement
    /// verts.
    func test_renderFingerprint_identicalBridges_areEqual() {
        let a = makeConversation(bridge: makeAgentBridge())
        let b = makeConversation(bridge: makeAgentBridge())
        XCTAssertEqual(a.renderFingerprint, b.renderFingerprint)
    }

    // MARK: - Critère (b) — pont nil ⇒ fingerprint inchangé

    /// Poser explicitement `bridge = nil` ne doit RIEN ajouter au hash. Le
    /// repli est entièrement sous `if let` : un `h.combine(bridge)`
    /// inconditionnel replierait `Optional.none` et décalerait le hash de
    /// toutes les lignes, y compris celles qui n'ont jamais vu de pont.
    func test_renderFingerprint_nilBridge_equalsUntouchedConversation() {
        let untouched = makeConversation()
        let explicitlyNil = makeConversation(bridge: nil)
        XCTAssertNil(untouched.bridge)
        XCTAssertEqual(untouched.renderFingerprint, explicitlyNil.renderFingerprint)
    }

    /// Le témoin de compatibilité : une charge utile SANS la clé `bridge` —
    /// c'est-à-dire tout ce que le gateway émet aujourd'hui, drapeau éteint —
    /// décode sans lever, rend `bridge == nil`, et son fingerprint est celui
    /// d'une conversation bâtie sans pont. Aucune ligne existante n'est
    /// invalidée par l'arrivée du champ.
    func test_renderFingerprint_payloadWithoutBridgeKey_decodesToNilBridge() throws {
        let decoded = try decodeConversation(from: conversationJSON(bridge: nil))
        XCTAssertNil(decoded.bridge)
        XCTAssertEqual(decoded.renderFingerprint, makeConversation().renderFingerprint)
    }

    /// Le même invariant à travers l'aller-retour de cache : une conversation
    /// sans pont n'émet pas la clé (`encodeIfPresent`), se relit avec
    /// `bridge == nil`, et retrouve EXACTEMENT son fingerprint d'origine.
    func test_renderFingerprint_bridgelessRoundTrip_isUnchanged() throws {
        let original = makeConversation()
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let restored = try decodeConversation(from: encoder.encode(original))

        XCTAssertNil(restored.bridge)
        XCTAssertEqual(original.renderFingerprint, restored.renderFingerprint)
    }

    /// Le pendant discriminant des trois témoins ci-dessus : l'apparition d'un
    /// pont sur une ligne qui n'en avait pas DOIT rouvrir le portillon.
    func test_renderFingerprint_bridgeAppears_changes() {
        let before = makeConversation()
        let after = makeConversation(bridge: makeAgentBridge())
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    // MARK: - Critère (a) — la VALEUR traduite, pas seulement la clé

    /// Le défaut réel, jumeau de B1. Une retraduction du pont garde le même
    /// jeu de clés, le même `unreadCount`, le même `originalLanguage` : seule
    /// la valeur change, et c'est précisément elle que la ligne affiche.
    /// Hasher les seules clés gèlerait le pont sur sa première phrase,
    /// définitivement.
    func test_renderFingerprint_bridgeTranslationTextChangesForSameLanguage_changes() {
        let before = makeConversation(
            bridge: makeAgentBridge(translations: ["fr": "Marie a partagé le plan"])
        )
        let after = makeConversation(
            bridge: makeAgentBridge(translations: ["fr": "Marie a transmis le plan"])
        )
        XCTAssertNotEqual(
            before.renderFingerprint, after.renderFingerprint,
            "la ligne affiche la VALEUR traduite du pont — une retraduction doit rouvrir le portillon"
        )
    }

    /// Première traduction du pont qui atterrit : le jeu de clés passe de vide
    /// à `["fr"]`.
    func test_renderFingerprint_bridgeFirstTranslationArrives_changes() {
        let before = makeConversation(bridge: makeAgentBridge(translations: nil))
        let after = makeConversation(bridge: makeAgentBridge(translations: ["fr": "Bonjour"]))
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    /// Une langue AJOUTÉE au pont change le jeu de clés.
    func test_renderFingerprint_bridgeAdditionalLanguageAdded_changes() {
        let before = makeConversation(bridge: makeAgentBridge(translations: ["fr": "Bonjour"]))
        let after = makeConversation(
            bridge: makeAgentBridge(translations: ["fr": "Bonjour", "es": "Hola"])
        )
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    /// Deux cartes de mêmes clés et mêmes valeurs, construites dans un ordre
    /// d'insertion différent, sont le MÊME rendu : le hash doit être stable.
    /// `Dictionary` n'a pas d'ordre d'itération — sans le tri explicite des
    /// clés, le portillon s'ouvrirait au hasard d'un lancement à l'autre.
    func test_renderFingerprint_bridgeSameMapDifferentInsertionOrder_isStable() {
        var first: [String: String] = [:]
        first["fr"] = "Bonjour"
        first["es"] = "Hola"
        var second: [String: String] = [:]
        second["es"] = "Hola"
        second["fr"] = "Bonjour"

        XCTAssertEqual(
            makeConversation(bridge: makeAgentBridge(translations: first)).renderFingerprint,
            makeConversation(bridge: makeAgentBridge(translations: second)).renderFingerprint
        )
    }

    /// Deux cartes dont la concaténation naïve `clé+valeur` se confondrait.
    /// `["a": "bc"]` et `["ab": "c"]` rendent la même chaîne si on colle sans
    /// séparateur ; combiner clé et valeur SÉPARÉMENT les distingue.
    func test_renderFingerprint_bridgeAmbiguousKeyValueSplit_distinguished() {
        XCTAssertNotEqual(
            makeConversation(bridge: makeAgentBridge(translations: ["a": "bc"])).renderFingerprint,
            makeConversation(bridge: makeAgentBridge(translations: ["ab": "c"])).renderFingerprint
        )
    }

    /// La phrase d'origine du pont (étage agent, lecteur servi dans la langue
    /// d'origine) change seule.
    func test_renderFingerprint_bridgeTextChanges_changes() {
        let before = makeConversation(bridge: makeAgentBridge(text: "Marie shared the plan"))
        let after = makeConversation(bridge: makeAgentBridge(text: "Marie sent the plan"))
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    /// `originalLanguage` décide de la branche du Prisme qui sert la ligne :
    /// le même texte annoncé dans une autre langue d'origine est un autre
    /// rendu.
    func test_renderFingerprint_bridgeOriginalLanguageChanges_changes() {
        let before = makeConversation(bridge: makeAgentBridge(originalLanguage: "en"))
        let after = makeConversation(bridge: makeAgentBridge(originalLanguage: "es"))
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    // MARK: - Champs de décision du pont

    /// Le chiffre vit dans le pont, plus dans un badge : `unreadCount` du pont
    /// doit bouger le hash même quand celui de `userState` ne bouge pas.
    func test_renderFingerprint_bridgeUnreadCountAloneChanges_changes() {
        let before = makeConversation(bridge: makeAgentBridge(unreadCount: 4))
        let after = makeConversation(bridge: makeAgentBridge(unreadCount: 5))
        XCTAssertEqual(before.userState.unreadCount, after.userState.unreadCount)
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    /// `suggestedMode` est une décision d'orchestrateur AFFICHÉE (l'affordance
    /// que la ligne propose) : elle doit invalider le rendu.
    func test_renderFingerprint_bridgeSuggestedModeChanges_changes() {
        let before = makeConversation(bridge: makeAgentBridge(suggestedMode: .resume))
        let after = makeConversation(bridge: makeAgentBridge(suggestedMode: .focal))
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    // MARK: - Partialité de la fenêtre (`isComplete`)

    /// Le critère du blocage 6 : à DONNÉES ÉGALES — mêmes auteurs, mêmes
    /// compteurs, même `unreadCount` — un pont qui passe d'incomplet à complet
    /// est un autre rendu. La ligne retire la mention « sur les N derniers
    /// messages » ; sans repli, le portillon `.equatable()` la laisserait
    /// affichée sur un pont désormais total.
    func test_renderFingerprint_bridgeIncompleteBecomesComplete_changes() {
        let partial = makeConversation(bridge: makeFallbackBridge(isComplete: false))
        let complete = makeConversation(bridge: makeFallbackBridge(isComplete: true))
        XCTAssertNotEqual(
            partial.renderFingerprint, complete.renderFingerprint,
            "la mention de partialité est AFFICHÉE — sa disparition doit rouvrir le portillon"
        )
    }

    /// La bascule inverse, sur l'étage agent : un substitut borné (`false`)
    /// remplacé par le pont du gateway, qui n'annonce rien (`nil` = complet).
    func test_renderFingerprint_bridgeIsCompleteAppears_changes() {
        let absent = makeConversation(bridge: makeAgentBridge(isComplete: nil))
        let partial = makeConversation(bridge: makeAgentBridge(isComplete: false))
        XCTAssertNotEqual(absent.renderFingerprint, partial.renderFingerprint)
    }

    /// Le pendant NON discriminant : le champ absent ne change rien. Un pont
    /// bâti sans `isComplete` rend le fingerprint qu'il rendait avant
    /// l'existence du champ — les deux instances ci-dessous ne diffèrent par
    /// AUCUN champ, et le témoin verrouille que la fabrique par défaut
    /// (`isComplete: nil`) reste bien le cas de référence.
    func test_renderFingerprint_bridgeWithoutIsComplete_isStable() {
        XCTAssertEqual(
            makeConversation(bridge: makeAgentBridge()).renderFingerprint,
            makeConversation(bridge: makeAgentBridge(isComplete: nil)).renderFingerprint
        )
    }

    /// Le témoin de compatibilité de fil : une charge utile SANS la clé
    /// `isComplete` — tout ce que le gateway émet aujourd'hui — décode en
    /// `nil` et rend EXACTEMENT le fingerprint d'un pont bâti sans le champ.
    /// L'arrivée du champ n'invalide aucun rang existant.
    func test_renderFingerprint_payloadWithoutIsCompleteKey_matchesFieldlessBridge() throws {
        let payload = """
        {
          "kind": "agent",
          "unreadCount": 4,
          "suggestedMode": "resume",
          "text": "Marie shared the plan",
          "translations": { "fr": "Marie a partagé le plan" },
          "originalLanguage": "en"
        }
        """
        let decoded = try decodeConversation(from: conversationJSON(bridge: payload))

        XCTAssertNil(decoded.bridge?.isComplete)
        XCTAssertEqual(
            decoded.renderFingerprint,
            makeConversation(bridge: makeAgentBridge()).renderFingerprint
        )
    }

    /// Décodage tolérant du champ lui-même : présent et `false`, il traverse
    /// le fil sans perte — sans quoi la ligne perdrait la partialité entre le
    /// producteur et le rang, exactement le défaut que le blocage 6 corrige.
    func test_decode_bridgeIsCompleteFalse_populatesField() throws {
        let payload = """
        {
          "kind": "fallback",
          "unreadCount": 12,
          "suggestedMode": "focal",
          "isComplete": false,
          "data": { "authors": ["Marie"], "extraAuthorCount": 0, "messageCount": 6 }
        }
        """
        let decoded = try decodeConversation(from: conversationJSON(bridge: payload))
        let bridge = try XCTUnwrap(decoded.bridge)

        XCTAssertEqual(bridge.isComplete, false)
        XCTAssertEqual(bridge.data?.messageCount, 6)
    }

    /// Aller-retour de cache : un pont partiel encodé puis relu reste partiel.
    /// `isComplete` étant optionnel, un encodage qui l'omettrait ferait
    /// silencieusement passer un pont partiel pour complet au premier
    /// redémarrage à froid.
    func test_partialBridge_roundTrip_keepsIsComplete() throws {
        let original = makeConversation(bridge: makeFallbackBridge(isComplete: false))
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let restored = try decodeConversation(from: encoder.encode(original))

        XCTAssertEqual(restored.bridge?.isComplete, false)
        XCTAssertEqual(original.renderFingerprint, restored.renderFingerprint)
    }

    /// La bascule d'étage — agent indisponible, hors budget, conversation
    /// inéligible — remplace une phrase par des données. Le rendu change
    /// entièrement.
    func test_renderFingerprint_bridgeKindChanges_changes() {
        let agent = makeConversation(bridge: makeAgentBridge(unreadCount: 4, suggestedMode: .focal))
        let fallback = makeConversation(bridge: makeFallbackBridge(unreadCount: 4, suggestedMode: .focal))
        XCTAssertNotEqual(agent.renderFingerprint, fallback.renderFingerprint)
    }

    /// `kind` SEUL, toutes charges égales par ailleurs. Le témoin de bascule
    /// ci-dessus fait varier davantage (une phrase remplace des données) ;
    /// celui-ci isole le champ, sur une paire de ponts volontairement
    /// dégénérés — une forme que le serveur n'émet jamais, mais qui rend le
    /// témoin discriminant sur un seul octet de sens.
    func test_renderFingerprint_bridgeKindAloneChanges_changes() {
        let agent = makeConversation(
            bridge: ConversationBridge(kind: .agent, unreadCount: 4, suggestedMode: .focal)
        )
        let fallback = makeConversation(
            bridge: ConversationBridge(kind: .fallback, unreadCount: 4, suggestedMode: .focal)
        )
        XCTAssertNotEqual(agent.renderFingerprint, fallback.renderFingerprint)
    }

    // MARK: - Étage fallback : les données

    func test_renderFingerprint_bridgeMessageCountAloneChanges_changes() {
        let before = makeConversation(bridge: makeFallbackBridge(messageCount: 12))
        let after = makeConversation(bridge: makeFallbackBridge(messageCount: 13))
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    /// Le « +N » de la ligne.
    func test_renderFingerprint_bridgeExtraAuthorCountAloneChanges_changes() {
        let before = makeConversation(bridge: makeFallbackBridge(extraAuthorCount: 2))
        let after = makeConversation(bridge: makeFallbackBridge(extraAuthorCount: 3))
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    func test_renderFingerprint_bridgeAuthorsChange_changes() {
        let before = makeConversation(bridge: makeFallbackBridge(authors: ["Marie", "Ali"]))
        let after = makeConversation(bridge: makeFallbackBridge(authors: ["Marie", "Nadia"]))
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    /// Deux listes d'auteurs dont la concaténation naïve se confondrait :
    /// `Array.hash(into:)` replie le nombre d'éléments avant les éléments.
    func test_renderFingerprint_bridgeAmbiguousAuthorSplit_distinguished() {
        XCTAssertNotEqual(
            makeConversation(bridge: makeFallbackBridge(authors: ["Ma", "rie"])).renderFingerprint,
            makeConversation(bridge: makeFallbackBridge(authors: ["Marie"])).renderFingerprint
        )
    }

    func test_renderFingerprint_bridgeMediaCountsAppear_changes() {
        let before = makeConversation(bridge: makeFallbackBridge(mediaCounts: nil))
        let after = makeConversation(
            bridge: makeFallbackBridge(mediaCounts: ConversationBridgeMediaCounts(images: 3))
        )
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    /// Chaque catégorie de médias est repliée séparément : un compteur audio
    /// qui remplace un compteur d'images est un autre rendu.
    func test_renderFingerprint_bridgeMediaCountsCategoryMoves_changes() {
        let before = makeConversation(
            bridge: makeFallbackBridge(mediaCounts: ConversationBridgeMediaCounts(images: 3))
        )
        let after = makeConversation(
            bridge: makeFallbackBridge(mediaCounts: ConversationBridgeMediaCounts(audio: 3))
        )
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    // MARK: - Décodage tolérant

    /// Un pont bien formé traverse le fil sans perte, valeurs de traductions
    /// comprises — sans quoi le repli du fingerprint hasherait des données que
    /// la ligne n'a jamais reçues.
    func test_decode_bridgePayload_populatesEveryField() throws {
        let payload = """
        {
          "kind": "agent",
          "unreadCount": 7,
          "suggestedMode": "resume",
          "text": "Marie shared the plan",
          "translations": { "fr": "Marie a partagé le plan" },
          "originalLanguage": "en"
        }
        """
        let decoded = try decodeConversation(from: conversationJSON(bridge: payload))
        let bridge = try XCTUnwrap(decoded.bridge)

        XCTAssertEqual(bridge.kind, .agent)
        XCTAssertEqual(bridge.unreadCount, 7)
        XCTAssertEqual(bridge.suggestedMode, .resume)
        XCTAssertEqual(bridge.text, "Marie shared the plan")
        XCTAssertEqual(bridge.translations?["fr"], "Marie a partagé le plan")
        XCTAssertEqual(bridge.originalLanguage, "en")
        XCTAssertNil(bridge.data)
    }

    /// L'étage `fallback` traverse le fil avec ses données imbriquées.
    func test_decode_fallbackBridgePayload_populatesData() throws {
        let payload = """
        {
          "kind": "fallback",
          "unreadCount": 12,
          "suggestedMode": "focal",
          "data": {
            "authors": ["Marie", "Ali"],
            "extraAuthorCount": 2,
            "messageCount": 12,
            "mediaCounts": { "images": 3, "audio": 1 }
          }
        }
        """
        let decoded = try decodeConversation(from: conversationJSON(bridge: payload))
        let data = try XCTUnwrap(decoded.bridge?.data)

        XCTAssertEqual(data.authors, ["Marie", "Ali"])
        XCTAssertEqual(data.extraAuthorCount, 2)
        XCTAssertEqual(data.messageCount, 12)
        XCTAssertEqual(data.mediaCounts?.images, 3)
        XCTAssertEqual(data.mediaCounts?.audio, 1)
        XCTAssertNil(data.mediaCounts?.files)
    }

    /// Tolérance dans l'autre sens : un `kind` d'une forme FUTURE ne doit pas
    /// faire échouer le décodage de la conversation entière. Une ligne sans
    /// pont reste une ligne ; une ligne perdue est un trou dans la liste.
    func test_decode_unknownBridgeKind_yieldsNilBridgeWithoutFailingConversation() throws {
        let payload = """
        { "kind": "oracle", "unreadCount": 7, "suggestedMode": "resume", "text": "…" }
        """
        let decoded = try decodeConversation(from: conversationJSON(bridge: payload))

        XCTAssertNil(decoded.bridge)
        XCTAssertEqual(decoded.id, "conv-bridge")
        XCTAssertEqual(decoded.lastMessagePreview, "Hello")
    }

    /// Même tolérance pour un pont amputé d'un champ requis.
    func test_decode_bridgeMissingRequiredField_yieldsNilBridgeWithoutFailingConversation() throws {
        let payload = """
        { "kind": "agent", "text": "…" }
        """
        let decoded = try decodeConversation(from: conversationJSON(bridge: payload))

        XCTAssertNil(decoded.bridge)
        XCTAssertEqual(decoded.userState.unreadCount, 3)
    }
}
