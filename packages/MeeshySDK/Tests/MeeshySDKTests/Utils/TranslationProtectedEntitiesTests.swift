import Foundation
import Testing
@testable import MeeshySDK

/// Les cas témoins de `services/translator/tests/test_protected_identities.py`
/// (#14327), rejoués sur la règle de l'appareil (#14333).
struct TranslationProtectedEntitiesTests {

    private static let sharedReel = "🔗 Reel de recretrait_b: https://staging.meeshy.me/l/I0tqQp"

    /// Le moteur bouchonné réécrit chaque mot hors marqueur, comme NLLB sur un pseudo.
    private func rewriteWords(_ masked: String) -> String {
        masked.components(separatedBy: " ")
            .map { $0.contains("🔹") ? $0 : "«\($0)»" }
            .joined(separator: " ")
    }

    private func protectedValues(_ text: String) -> [String] {
        TranslationProtectedEntities.protect(text).entities.sorted { $0.key < $1.key }.map(\.value)
    }

    @Test(arguments: [
        (sharedReel, "recretrait_b"),
        ("🔗 Réel de Jean Dupont : https://meeshy.me/l/abc", "Jean Dupont"),
        ("🔗 Story by Marie: https://meeshy.me/l/abc", "Marie"),
        ("🔗 Publicación de Ana López: https://meeshy.me/l/abc", "Ana López"),
        ("🔗 Beitrag von Jürgen: https://meeshy.me/l/abc", "Jürgen"),
        ("🔗 Storia di Luca: https://meeshy.me/l/abc", "Luca"),
        ("🔗 Publicação de João: https://meeshy.me/l/abc", "João"),
        ("🔗 قصة سارة: https://meeshy.me/l/abc", "سارة"),
    ])
    func theAuthorOfASharePhraseIsNeverGivenToTheEngine(phrase: String, author: String) {
        let masked = TranslationProtectedEntities.protect(phrase)

        #expect(!masked.text.contains(author))
        #expect(masked.entities.values.contains(author))
        let restored = TranslationProtectedEntities.restore(rewriteWords(masked.text), entities: masked.entities)
        #expect(restored.components(separatedBy: author).count == 2)
    }

    @Test func theSharePhraseKeepsItsKindToTranslate() {
        #expect(TranslationProtectedEntities.protect(Self.sharedReel).text.contains("Reel de"))
    }

    @Test func aSentenceThatOnlyMentionsSharingKeepsItsWordsTranslatable() {
        let masked = TranslationProtectedEntities.protect("🔗 Voici le lien de la soirée : https://meeshy.me/x")

        #expect(masked.text.contains("la soirée"))
        #expect(masked.entities.values.contains("https://meeshy.me/x"))
    }

    @Test(arguments: ["recretrait_b", "jean_42", "user42", "_dark_"])
    func aBareHandleCrossesTheTranslationIdentically(identity: String) {
        let masked = TranslationProtectedEntities.protect("Demande à \(identity) demain")

        #expect(!masked.text.contains(identity))
        #expect(TranslationProtectedEntities.restore(rewriteWords(masked.text), entities: masked.entities).contains(identity))
    }

    @Test(arguments: ["1er", "2e", "14h30", "demain"])
    func ordinaryWordsAndOrdinalsStayTranslatable(word: String) {
        #expect(TranslationProtectedEntities.protect("On se voit le \(word) matin").text.contains(word))
    }

    @Test(arguments: ["contact@meeshy.me", "jean.dupont+tag@mail.example.org", "@recretrait_b", "#11783"])
    func emailsMentionsAndHashtagsCrossWhole(entity: String) {
        #expect(protectedValues("Écris à \(entity) ce soir.").contains(entity))
    }

    @Test func anEmailKeepsTheSentenceFinalPeriodOutside() {
        #expect(protectedValues("Écris à contact@meeshy.me.") == ["contact@meeshy.me"])
    }

    @Test func emojisAndTheShareLinkAreMaskedAndTheKindIsNot() {
        let masked = TranslationProtectedEntities.protect(Self.sharedReel)

        #expect(masked.entities.values.contains("🔗"))
        #expect(masked.entities.values.contains("https://staging.meeshy.me/l/I0tqQp"))
        #expect(TranslationProtectedEntities.restore(rewriteWords(masked.text), entities: masked.entities)
            .hasPrefix("🔗"))
    }

    @Test func aMarkdownLinkKeepsItsLabelToTranslateAndItsTarget() {
        let masked = TranslationProtectedEntities.protect("Lis [la note](https://a.com/n) vite")

        #expect(masked.text.contains("[la note]"))
        #expect(masked.entities.values.contains("(https://a.com/n)"))
    }

    @Test func anAddressAloneHasNothingToTranslate() {
        let masked = TranslationProtectedEntities.protect("https://staging.meeshy.me/l/I0tqQp")

        #expect(!TranslationProtectedEntities.hasTranslatableText(masked.text))
    }

    @Test func aCJKSentenceIsNeverTakenForAnEmoji() {
        #expect(TranslationProtectedEntities.protect("你好世界").entities.isEmpty)
    }

    @Test func alreadyMaskedMarkersStayOpaqueAndNumberingContinues() {
        let masked = TranslationProtectedEntities.protect("Voici 🔹EMOJI_3🔹 et @ami")

        #expect(masked.entities == [4: "@ami"])
        #expect(masked.text == "Voici 🔹EMOJI_3🔹 et 🔹EMOJI_4🔹")
    }

    @Test func aLostOrAlteredMarkerIsDetected() {
        let masked = TranslationProtectedEntities.protect("Voici @ami et @amie").text

        #expect(TranslationProtectedEntities.placeholdersKept(masked: masked, translated: "Here 🔹 EMOJI_0 🔹 and 🔹EMOJI_1🔹"))
        #expect(!TranslationProtectedEntities.placeholdersKept(masked: masked, translated: "Here and 🔹EMOJI_1🔹"))
        #expect(!TranslationProtectedEntities.placeholdersKept(masked: masked, translated: "Here 🔹EMOJI_1🔹 and 🔹EMOJI_1🔹"))
    }

    @Test func theMaskedTextSplitsIntoFreeTextAndMarkers() {
        let parts = TranslationProtectedEntities.splitOnPlaceholders("Regarde 🔹EMOJI_0🔹 maintenant")

        #expect(parts == ["Regarde ", "🔹EMOJI_0🔹", " maintenant"])
        #expect(parts.map(TranslationProtectedEntities.isPlaceholder) == [false, true, false])
    }

    @Test func restoreToleratesTheSpacesAnEngineInsertsInAMarker() {
        #expect(TranslationProtectedEntities.restore("Mira 🔹 EMOJI_0 🔹", entities: [0: "$1 @ami"]) == "Mira $1 @ami")
    }
}
