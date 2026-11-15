import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Suite COMPLÈTE du `==` de `LentilleConversationRow` (contrat LWS-7,
/// workshop I-068 — nom cité par le contrat §LWS-7). `LentilleFlatRowTests`
/// (I-065) embarquait trois témoins minimaux sur ce portillon ; cette suite
/// les COMPLÈTE, elle ne les rejoue pas : chacune des TREIZE clauses de
///
/// ```swift
/// lhs.conversation.id == rhs.conversation.id &&                    // 1
/// lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint && // 2
/// lhs.conversation.bridge == rhs.conversation.bridge &&             // 3
/// lhs.typingUsername == rhs.typingUsername &&                      // 4
/// lhs.availableWidth == rhs.availableWidth &&                      // 5
/// lhs.isDragging == rhs.isDragging &&                               // 6
/// lhs.isDark == rhs.isDark &&                                       // 7
/// lhs.storyRingState == rhs.storyRingState &&                       // 8
/// lhs.moodStatus?.id == rhs.moodStatus?.id &&                       // 9
/// lhs.presenceState == rhs.presenceState &&                         // 10
/// lhs.isSelected == rhs.isSelected &&                               // 11
/// lhs.draftSummary == rhs.draftSummary &&                           // 12
/// lhs.preferredContentLanguages == rhs.preferredContentLanguages    // 13
/// ```
///
/// (12 clauses COPIÉES depuis `ThemedConversationRow.==`, `bridge` ÉTENDU en
/// clause 3 — contrat §LWS-7 : « sous-comparer, c'est geler une ligne ;
/// sur-comparer, c'est perdre le portillon ») a SA PROPRE paire de témoins :
/// deux rangs qui ne divergent QUE sur cette clause sont `!=` ; deux rangs
/// strictement identiques sur les treize sont `==`. Un `&&` oublié à
/// n'importe quel rang de la chaîne se traduirait par une clause dont le
/// témoin « diffère seule » resterait vert par erreur (portillon trop
/// large) — c'est exactement ce que chaque test ci-dessous empêche.
@MainActor
final class LentilleRowEquatableTests: XCTestCase {

    // MARK: - Fabriques
    //
    // Date FIXE (même piège que `BridgeFingerprintTests`/`LentilleFlatRowTests` :
    // `MeeshyConversation.init` défaute `lastMessageAt` à `Date()`, replié dans
    // `renderFingerprint` — deux instances construites séparément sans
    // épinglage diffèrent TOUJOURS, ce qui rendrait vacuoirement vert
    // n'importe quel `XCTAssertNotEqual`).
    private static let pinnedDate = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(
        id: String = "conv-1",
        unreadCount: Int = 0,
        lastMessagePreview: String = "Hello",
        bridge: ConversationBridge? = nil
    ) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: id,
            identifier: id,
            type: .group,
            title: "Equipe Produit",
            lastMessageAt: Self.pinnedDate,
            createdAt: Self.pinnedDate,
            updatedAt: Self.pinnedDate,
            unreadCount: unreadCount,
            lastMessagePreview: lastMessagePreview
        )
        conversation.bridge = bridge
        return conversation
    }

    private func makeFallbackBridge(unreadCount: Int = 4) -> ConversationBridge {
        ConversationBridge(
            kind: .fallback,
            unreadCount: unreadCount,
            suggestedMode: .focal,
            data: ConversationBridgeData(authors: ["Marie"], extraAuthorCount: 0, messageCount: 3)
        )
    }

    /// Étage AGENT du pont — même paire `translations`/`originalLanguage` que
    /// le préview (E7), voir `LentilleRowPrismeTests` pour l'étage agent côté
    /// résolution ; ici seule l'égalité structurelle importe.
    private func makeAgentBridge(
        unreadCount: Int = 4,
        text: String? = "Marie shared the plan",
        translations: [String: String]? = ["fr": "Marie a partagé le plan"],
        originalLanguage: String? = "en"
    ) -> ConversationBridge {
        ConversationBridge(
            kind: .agent,
            unreadCount: unreadCount,
            suggestedMode: .resume,
            text: text,
            translations: translations,
            originalLanguage: originalLanguage
        )
    }

    private func makeStatusEntry(id: String) -> StatusEntry {
        StatusEntry(
            id: id,
            userId: "user-\(id)",
            username: "alice",
            avatarColor: "FF2E63",
            moodEmoji: "🎉",
            createdAt: Self.pinnedDate
        )
    }

    // MARK: - Clause 1 — `conversation.id`
    //
    // `id` n'entre dans AUCUN `h.combine` de `renderFingerprint`
    // (`CoreModels.swift`) : deux conversations identiques sur tout le reste
    // mais d'`id` différent ont donc le MÊME fingerprint — l'isolation est
    // directe, sans effet de bord sur la clause 2.

    func test_clause1_id_aloneDiffers_notEqual() {
        let a = LentilleConversationRow(conversation: makeConversation(id: "conv-1"))
        let b = LentilleConversationRow(conversation: makeConversation(id: "conv-2"))
        XCTAssertEqual(a.conversation.renderFingerprint, b.conversation.renderFingerprint, "témoin de contrôle : seul l'id doit différer ici")
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 2 — `conversation.renderFingerprint`
    //
    // Isolée en variant `lastMessagePreview` (hashé) à `id` et `bridge` (nil
    // des deux côtés) inchangés.

    func test_clause2_renderFingerprint_aloneDiffers_notEqual() {
        let a = LentilleConversationRow(conversation: makeConversation(lastMessagePreview: "Hello"))
        let b = LentilleConversationRow(conversation: makeConversation(lastMessagePreview: "Salut"))
        XCTAssertEqual(a.conversation.id, b.conversation.id, "témoin de contrôle : seul le fingerprint doit différer ici")
        XCTAssertNotEqual(a.conversation.renderFingerprint, b.conversation.renderFingerprint)
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 3 — `conversation.bridge`
    //
    // COUPLÉE PAR CONSTRUCTION à la clause 2 : `renderFingerprint` replie
    // `bridge` en entier sous `if let bridge` (E13, régression jumelle de B1
    // — voir le commentaire de `CoreModels.renderFingerprint`), donc TOUT
    // changement réel de `bridge` fait aussi bouger le fingerprint. Le
    // commentaire de `LentilleConversationRow.==` l'assume explicitement :
    // « la comparaison directe de bridge est donc redondante avec
    // renderFingerprint dans tous les cas atteints aujourd'hui […] parce
    // qu'un futur hash tronqué ou une collision ne doit jamais pouvoir geler
    // le pont derrière ce portillon ». Ce témoin vérifie donc la clause en
    // DÉFENSE-EN-PROFONDEUR (le champ lui-même discrimine, indépendamment du
    // fingerprint), pas en isolation pure — la seule des treize clauses où
    // l'isolation stricte n'est pas atteignable, et c'est documenté, pas
    // oublié.
    func test_clause3_bridge_differs_notEqual_coupledWithFingerprintByDesign() {
        let withoutBridge = LentilleConversationRow(conversation: makeConversation(bridge: nil))
        let withFallbackBridge = LentilleConversationRow(conversation: makeConversation(bridge: makeFallbackBridge(unreadCount: 4)))
        XCTAssertNotEqual(withoutBridge.conversation.bridge, withFallbackBridge.conversation.bridge, "témoin de contrôle : les deux ponts doivent bien différer")
        XCTAssertNotEqual(withoutBridge, withFallbackBridge)
    }

    /// Bridge : le TEXTE TRADUIT seul change (même clé `fr`, même
    /// `unreadCount`, même `suggestedMode`, même `originalLanguage`) ⇒ non
    /// égaux — jumeau, au niveau du rang plutôt que du fingerprint seul, de
    /// `BridgeFingerprintTests.test_renderFingerprint_bridgeTranslationTextChangesForSameLanguage_changes`
    /// (workshop C-030) : une retraduction du pont ne doit JAMAIS geler
    /// derrière `.equatable()`, exactement comme une retraduction du préview
    /// (B1) ne le doit pas.
    func test_clause3_bridge_translatedTextAloneChanges_notEqual_twinOfBridgeFingerprintC030() {
        let before = LentilleConversationRow(
            conversation: makeConversation(bridge: makeAgentBridge(translations: ["fr": "Marie a partagé le plan"]))
        )
        let after = LentilleConversationRow(
            conversation: makeConversation(bridge: makeAgentBridge(translations: ["fr": "Marie a transmis le plan"]))
        )
        XCTAssertNotEqual(
            before, after,
            "la ligne affiche la VALEUR traduite du pont (LentilleBridgeLine) — une retraduction doit rouvrir le portillon, comme C-030 le verrouille déjà au niveau du fingerprint seul"
        )
    }

    // MARK: - Clause 4 — `typingUsername`

    func test_clause4_typingUsername_aloneDiffers_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, typingUsername: nil)
        let b = LentilleConversationRow(conversation: conversation, typingUsername: "Marie")
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 5 — `availableWidth`

    func test_clause5_availableWidth_aloneDiffers_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, availableWidth: 200)
        let b = LentilleConversationRow(conversation: conversation, availableWidth: 320)
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 6 — `isDragging`

    func test_clause6_isDragging_aloneDiffers_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, isDragging: false)
        let b = LentilleConversationRow(conversation: conversation, isDragging: true)
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 7 — `isDark`

    func test_clause7_isDark_aloneDiffers_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, isDark: false)
        let b = LentilleConversationRow(conversation: conversation, isDark: true)
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 8 — `storyRingState`

    func test_clause8_storyRingState_aloneDiffers_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, storyRingState: .none)
        let b = LentilleConversationRow(conversation: conversation, storyRingState: .unread)
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 9 — `moodStatus?.id`

    func test_clause9_moodStatusId_aloneDiffers_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, moodStatus: makeStatusEntry(id: "mood-1"))
        let b = LentilleConversationRow(conversation: conversation, moodStatus: makeStatusEntry(id: "mood-2"))
        XCTAssertNotEqual(a, b)
    }

    /// `nil` → présent doit aussi rouvrir le portillon (pas seulement deux
    /// valeurs non-nil distinctes).
    func test_clause9_moodStatusId_nilToPresent_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, moodStatus: nil)
        let b = LentilleConversationRow(conversation: conversation, moodStatus: makeStatusEntry(id: "mood-1"))
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 10 — `presenceState`

    func test_clause10_presenceState_aloneDiffers_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, presenceState: .offline)
        let b = LentilleConversationRow(conversation: conversation, presenceState: .online)
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 11 — `isSelected`

    func test_clause11_isSelected_aloneDiffers_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, isSelected: false)
        let b = LentilleConversationRow(conversation: conversation, isSelected: true)
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 12 — `draftSummary`

    func test_clause12_draftSummary_aloneDiffers_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, draftSummary: nil)
        let b = LentilleConversationRow(
            conversation: conversation,
            draftSummary: DraftSummary(previewText: "En cours…", updatedAt: Self.pinnedDate)
        )
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Clause 13 — `preferredContentLanguages`

    func test_clause13_preferredContentLanguages_aloneDiffers_notEqual() {
        let conversation = makeConversation()
        let a = LentilleConversationRow(conversation: conversation, preferredContentLanguages: ["fr"])
        let b = LentilleConversationRow(conversation: conversation, preferredContentLanguages: ["en"])
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Pendant non-discriminant — les treize clauses identiques ⇒ égaux
    //
    // Sans ce témoin, chacun des treize témoins « diffère seule » ci-dessus
    // serait vacuoirement vert si `==` renvoyait toujours `false` par erreur
    // (portillon qui ne s'ouvre JAMAIS — invalidation à chaque frame, mais
    // aucun test « differs » ne le détecterait). Renseigne délibérément
    // TOUTES les propriétés non-défaut pour ne pas laisser une clause
    // « toujours à sa valeur par défaut des deux côtés » hors de la preuve.
    func test_allThirteenClauses_identical_areEqual() {
        let conversation = makeConversation(unreadCount: 4, bridge: makeFallbackBridge(unreadCount: 4))
        let moodStatus = makeStatusEntry(id: "mood-1")
        let draft = DraftSummary(previewText: "En cours…", updatedAt: Self.pinnedDate)

        func makeRow() -> LentilleConversationRow {
            LentilleConversationRow(
                conversation: conversation,
                availableWidth: 320,
                isDragging: true,
                presenceState: .online,
                isDark: true,
                storyRingState: .unread,
                moodStatus: moodStatus,
                typingUsername: "Marie",
                isSelected: true,
                draftSummary: draft,
                preferredContentLanguages: ["fr", "en"]
            )
        }

        XCTAssertEqual(makeRow(), makeRow())
    }
}
