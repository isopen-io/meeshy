import Testing
import Foundation
@testable import MeeshySDK

/// Le message CITÉ descend le Prisme et honore sa protection — au moment où
/// la citation est COMPOSÉE, sur le fil REST comme au cache (#4945,
/// D-QUOTE-05).
///
/// Trois règles, chacune avec son témoin :
/// 1. la descente est ORDONNÉE et la première langue servie gagne — le témoin
///    de rang s'écrit sur un rang AUTRE que le premier, sinon le court-circuit
///    interdit et la règle juste rendent le même verdict (leçon 261) ;
/// 2. `nil` ⇒ original, JAMAIS `translations.first` ;
/// 3. un message à vue unique / flouté / chiffré ne republie pas son texte
///    dans chaque citation : placeholder, même vocabulaire que
///    `protectedPreview` côté passerelle.
@Suite("APIMessageReplyTo — Prisme, protection et faits du média cité")
struct APIMessageReplyToPrismTests {

    // MARK: - Fabriques

    private static func decodeReplyTo(_ json: String) throws -> APIMessageReplyTo {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIMessageReplyTo.self, from: Data(json.utf8))
    }

    private static func translation(_ lang: String, _ text: String, isEncrypted: Bool = false) -> String {
        """
        {"id":"q1-\(lang)","messageId":"q1","targetLanguage":"\(lang)","translatedContent":"\(text)",
         "translationModel":"nllb","isEncrypted":\(isEncrypted)}
        """
    }

    private static func quoted(
        content: String = "Hello",
        originalLanguage: String? = "en",
        translations: [String] = [],
        protection: String = "",
        attachments: String = "[]"
    ) -> String {
        let lang = originalLanguage.map { "\"originalLanguage\":\"\($0)\"," } ?? ""
        return """
        {"id":"q1","content":"\(content)",\(lang)"senderId":"p-bob",
         "sender":{"id":"p-bob","displayName":"Bob","userId":"u-bob","avatar":"https://cdn.meeshy.me/bob.jpg"},
         "translations":[\(translations.joined(separator: ","))],\(protection)
         "attachments":\(attachments)}
        """
    }

    private static let photo = """
    {"id":"a1","mimeType":"image/jpeg","fileSize":204800,"width":1024,"height":768,
     "thumbnailUrl":"https://cdn.meeshy.me/a1-t.jpg","thumbHash":"1QcSHQRnh493V4dIh4eXh1h4kJUI"}
    """

    private static let location = """
    {"id":"a0","mimeType":"application/x-location","latitude":48.85,"longitude":2.35}
    """

    // MARK: - Décodage complet

    @Test("les champs de Prisme et de protection décodent depuis le fil REST")
    func decodesPrismAndProtectionFields() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(
            translations: [Self.translation("fr", "Bonjour")],
            protection: """
            "isViewOnce":true,"isBlurred":false,"expiresAt":"2026-09-03T10:00:00Z",
            "effectFlags":4,"isEncrypted":false,"encryptionMode":null,
            """
        ))
        #expect(reply.originalLanguage == "en")
        #expect(reply.translations?.count == 1)
        #expect(reply.translations?.first?.translatedContent == "Bonjour")
        #expect(reply.isViewOnce == true)
        #expect(reply.isBlurred == false)
        #expect(reply.expiresAt != nil)
        #expect(reply.effectFlags == 4)
        #expect(reply.isEncrypted == false)
        #expect(reply.encryptionMode == nil)
    }

    @Test("un fil ancien sans ces champs décode toujours — tout est optionnel")
    func legacyWireDecodes() throws {
        let reply = try Self.decodeReplyTo("""
        {"id":"q1","content":"Hello","senderId":"p-bob"}
        """)
        #expect(reply.id == "q1")
        #expect(reply.originalLanguage == nil)
        #expect(reply.translations == nil)
        #expect(reply.isViewOnce == nil)
        #expect(reply.isProtected == false)
    }

    @Test("une entrée de traduction malformée ne fait pas tomber la citation")
    func malformedTranslationEntryIsIsolated() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(translations: ["{\"targetLanguage\":\"fr\"}"]))
        #expect(reply.id == "q1")
        #expect(reply.translations == nil)
        #expect(reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr"]).previewText == "Hello")
    }

    // MARK: - Prisme

    @Test("rang 2 servi quand le rang 1 n'a pas de traduction")
    func secondRankWinsWhenFirstIsAbsent() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(
            translations: [Self.translation("es", "Hola"), Self.translation("de", "Hallo")]
        ))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr", "es", "de"])
        #expect(reference.previewText == "Hola")
    }

    @Test("rang 1 servi même quand la langue d'origine occupe un rang inférieur")
    func primaryRankBeatsOriginalAtLowerRank() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(translations: [Self.translation("fr", "Bonjour")]))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr", "en"])
        #expect(reference.previewText == "Bonjour")
    }

    @Test("la langue d'origine gagne À SON RANG : l'original, pas une traduction de rang inférieur")
    func originalWinsAtItsOwnRank() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(translations: [Self.translation("fr", "Bonjour")]))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["en", "fr"])
        #expect(reference.previewText == "Hello")
    }

    @Test("aucune langue servie ⇒ l'original, jamais translations.first")
    func noServedLanguageFallsBackToOriginalNeverFirst() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(
            translations: [Self.translation("es", "Hola"), Self.translation("de", "Hallo")]
        ))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr", "it"])
        #expect(reference.previewText == "Hello")
    }

    @Test("sans prisme du lecteur, l'original")
    func emptyPrismServesOriginal() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(translations: [Self.translation("fr", "Bonjour")]))
        #expect(reply.toReplyReference(currentUserId: nil, preferredLanguages: []).previewText == "Hello")
    }

    @Test("un cryptogramme n'est pas une traduction : la descente le saute")
    func encryptedTranslationIsSkipped() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(
            translations: [Self.translation("fr", "Y2lwaGVy", isEncrypted: true), Self.translation("es", "Hola")]
        ))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr", "es"])
        #expect(reference.previewText == "Hola")
    }

    @Test("les codes régionaux se rapprochent de leur langue primaire")
    func regionTaggedCodesMatchPrimarySubtag() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(translations: [Self.translation("fr", "Bonjour")]))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr-CA"])
        #expect(reference.previewText == "Bonjour")
    }

    /// Deux clés qui se canonisent PAREIL — `"fr"` et `"fr-CA"` coexistent sur
    /// le fil — se départagent par leur CONTENU, jamais par l'ordre du
    /// dictionnaire : un `Dictionary` Swift n'en a aucun, si bien qu'écrire la
    /// dernière rencontrée ferait rendre à la MÊME charge deux textes
    /// différents d'un lancement à l'autre. La clé DÉJÀ canonique gagne.
    @Test("entre « fr » et « fr-CA », la clé déjà canonique gagne")
    func canonicalKeyBeatsRegionTaggedTwin() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(
            translations: [Self.translation("fr-CA", "Salut"), Self.translation("fr", "Bonjour")]
        ))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr"])
        #expect(reference.previewText == "Bonjour")
    }

    /// Aucune des deux n'étant canonique, le départage reste STABLE : la plus
    /// petite lexicographiquement. Arbitraire — mais le même texte à chaque
    /// lancement, ce qu'un `Dictionary` seul ne garantit pas.
    @Test("entre deux variantes régionales, le départage est stable")
    func regionTaggedTwinsAreBrokenDeterministically() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(
            translations: [Self.translation("fr-CA", "Salut"), Self.translation("fr-BE", "Bonjour une fois")]
        ))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr"])
        #expect(reference.previewText == "Bonjour une fois")
    }

    // MARK: - Protection

    @Test("vue unique ⇒ placeholder « 👁️ 🖼️ » et citation protégée, jamais le texte")
    func viewOnceQuoteServesPlaceholder() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(
            content: "le secret",
            translations: [Self.translation("fr", "le secret traduit")],
            protection: "\"isViewOnce\":true,",
            attachments: "[\(Self.photo)]"
        ))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr"])
        #expect(reference.previewText == "👁️ 🖼️")
        #expect(reference.attachmentIsProtected == true)
        #expect(reference.quotedMediaIsProtected)
        #expect(!reference.offersMediaGate)
    }

    @Test("flouté ⇒ « 🌫️ 💬 » sur un message texte")
    func blurredTextQuoteServesPlaceholder() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(content: "le secret", protection: "\"isBlurred\":true,"))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["en"])
        #expect(reference.previewText == "🌫️ 💬")
        #expect(reference.attachmentIsProtected == true)
    }

    @Test("chiffré ⇒ « 🔒 💬 »")
    func encryptedQuoteServesPlaceholder() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(
            content: "Y2lwaGVy", protection: "\"isEncrypted\":true,\"encryptionMode\":\"e2ee\","
        ))
        #expect(reply.toReplyReference(currentUserId: nil, preferredLanguages: []).previewText == "🔒 💬")
    }

    @Test("le bitfield canonique protège seul, quand le champ hérité est faux")
    func effectFlagsAloneProtect() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(
            content: "le secret", protection: "\"isViewOnce\":false,\"effectFlags\":4,"
        ))
        #expect(reply.isProtected)
        #expect(reply.toReplyReference(currentUserId: nil, preferredLanguages: []).previewText == "👁️ 💬")
    }

    @Test("un message éphémère non protégé sert son texte : la protection ne se devine pas")
    func ephemeralAloneIsNotProtected() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(
            content: "à bientôt", protection: "\"expiresAt\":\"2026-09-03T10:00:00Z\",\"effectFlags\":1,"
        ))
        #expect(!reply.isProtected)
        #expect(reply.toReplyReference(currentUserId: nil, preferredLanguages: []).previewText == "à bientôt")
    }

    // MARK: - Média représentatif et faits

    @Test("le média représentatif saute la localisation, et ses sept faits voyagent")
    func representativeSkipsLocationAndCarriesFacts() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(attachments: "[\(Self.location),\(Self.photo)]"))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: [])
        #expect(reference.attachmentType == "image")
        #expect(reference.attachmentThumbnailUrl == "https://cdn.meeshy.me/a1-t.jpg")
        #expect(reference.attachmentThumbHash == "1QcSHQRnh493V4dIh4eXh1h4kJUI")
        #expect(reference.attachmentWidth == 1024)
        #expect(reference.attachmentHeight == 768)
        #expect(reference.attachmentFileSize == 204800)
        #expect(reference.attachmentDurationMs == nil)
        #expect(reference.attachmentPageCount == nil)
        #expect(reference.attachmentMimeType == "image/jpeg")
        #expect(reference.attachmentIsProtected == nil)
    }

    @Test("une localisation seule reste le média représentatif")
    func locationAloneIsRepresentative() throws {
        let reply = try Self.decodeReplyTo(Self.quoted(attachments: "[\(Self.location)]"))
        #expect(reply.attachments?.quotedRepresentative?.id == "a0")
    }

    @Test("la protection déclarée de la pièce jointe voyage quand le message ne l'est pas")
    func attachmentProtectionTravels() throws {
        let protectedPhoto = """
        {"id":"a2","mimeType":"image/jpeg","isViewOnce":true,"thumbnailUrl":"https://cdn.meeshy.me/a2-t.jpg"}
        """
        let reply = try Self.decodeReplyTo(Self.quoted(content: "", attachments: "[\(protectedPhoto)]"))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: [])
        #expect(reference.attachmentIsProtected == true)
        #expect(reference.previewText == "")
    }

    // MARK: - Identité

    @Test("isMe se résout sur l'utilisateur, pas sur l'identifiant de participant")
    func isMeResolvesOnUserId() throws {
        let reply = try Self.decodeReplyTo(Self.quoted())
        #expect(reply.toReplyReference(currentUserId: "u-bob", preferredLanguages: []).isMe)
        #expect(!reply.toReplyReference(currentUserId: "u-me", preferredLanguages: []).isMe)
        #expect(!reply.toReplyReference(currentUserId: nil, preferredLanguages: []).isMe)
    }

    @Test("l'auteur et son avatar sont gravés")
    func authorIsEngraved() throws {
        let reference = try Self.decodeReplyTo(Self.quoted())
            .toReplyReference(currentUserId: nil, preferredLanguages: [])
        #expect(reference.messageId == "q1")
        #expect(reference.authorName == "Bob")
        #expect(reference.authorAvatarUrl == "https://cdn.meeshy.me/bob.jpg")
        #expect(!reference.isStoryReply)
    }

    // MARK: - APIMessage.toMessage câble la même descente

    @Test("toMessage(preferredLanguages:) sert la citation dans la langue du lecteur")
    func toMessageThreadsThePrism() throws {
        let json = """
        {"id":"m1","conversationId":"c1","senderId":"p-me","content":"ma réponse",
         "createdAt":"2026-09-03T10:00:00Z","replyToId":"q1",
         "replyTo":\(Self.quoted(translations: [Self.translation("fr", "Bonjour")]))}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let api = try decoder.decode(APIMessage.self, from: Data(json.utf8))
        #expect(api.toMessage(currentUserId: "u-me", preferredLanguages: ["fr"]).replyTo?.previewText == "Bonjour")
        #expect(api.toMessage(currentUserId: "u-me").replyTo?.previewText == "Hello")
    }
}
