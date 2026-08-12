import XCTest
import MeeshySDK
@testable import Meeshy

/// Lot 3 (spec 2026-07-30-composer-drop-paste-and-location-design) — le rendu
/// du lieu reçu. Le serveur ne produit plus jamais de pièce jointe `.location`
/// (aucun champ géographique en Prisma) : le lieu voyage dans
/// `message.location` (colonne `locationJson` du cache GRDB). Ces tests
/// vérifient le routage du builder vers la nouvelle source, la survie de la
/// branche héritée par pièce jointe (anciennes lignes du cache local),
/// l'exclusivité du rendu quand un message porte les deux, et la mention
/// d'accessibilité.
@MainActor
final class BubbleLocationRenderingTests: XCTestCase {

    private func makePlace() -> SharedPlace {
        SharedPlace(latitude: 48.8566, longitude: 2.3522,
                    name: "Tour Eiffel", address: "Champ de Mars, Paris")
    }

    private func makeMessage(
        content: String = "",
        attachments: [MeeshyMessageAttachment] = [],
        location: SharedPlace? = nil
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: "m1",
            conversationId: "c1",
            senderId: "u2",
            content: content,
            originalLanguage: "fr",
            attachments: attachments,
            senderName: "Bob",
            cachedTimeString: "12:34",
            location: location
        )
    }

    private func build(_ msg: MeeshyMessage) -> BubbleContent {
        BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")
    }

    // MARK: - Routage du builder

    /// Voie serveur actuelle : le lieu arrive dans `message.location`, sans
    /// aucune pièce jointe. Le builder doit le propager et considérer la bulle
    /// comme porteuse de contenu (sinon un message « lieu seul », au `content`
    /// vide, ne rendrait rien du tout).
    func test_messageLocation_isPropagated_andCountsAsContent() {
        let place = makePlace()
        let content = build(makeMessage(location: place))

        XCTAssertEqual(content.location, place)
        XCTAssertEqual(content.attachments, .none)
        XCTAssertTrue(content.hasTextOrNonMediaContent,
                      "Un message « lieu seul » doit atteindre la bulle qui héberge LocationMessageView")
    }

    /// Branche héritée : une ancienne ligne du cache local porte le lieu comme
    /// pièce jointe `.location` et n'a pas de `message.location`. Elle doit
    /// continuer à rendre par la voie pièce jointe.
    func test_legacyLocationAttachment_withoutMessageLocation_keepsAttachmentPath() {
        let att = MeeshyMessageAttachment.location(latitude: 48.85, longitude: 2.35)
        let content = build(makeMessage(attachments: [att]))

        XCTAssertNil(content.location)
        guard case .nonMedia(let items) = content.attachments else {
            return XCTFail("La pièce jointe .location héritée doit rester routée en .nonMedia, obtenu \(content.attachments)")
        }
        XCTAssertEqual(items.map(\.id), [att.id])
        XCTAssertTrue(content.hasTextOrNonMediaContent)
    }

    /// Exclusivité : un message qui porte LES DEUX (lieu hissé + doublon
    /// hérité en pièce jointe) ne doit rendre le lieu qu'UNE fois — la source
    /// `message.location` gagne, la pièce jointe est écartée.
    func test_messageWithBothSources_rendersLocationOnlyOnce() {
        let place = makePlace()
        let att = MeeshyMessageAttachment.location(latitude: place.latitude, longitude: place.longitude)
        let content = build(makeMessage(attachments: [att], location: place))

        XCTAssertEqual(content.location, place)
        XCTAssertEqual(content.attachments, .none,
                       "La pièce jointe .location doit être écartée quand message.location est présent")
    }

    /// L'écartement ne doit toucher QUE les pièces jointes `.location` : un
    /// fichier qui accompagne le lieu reste rendu.
    func test_messageWithLocationAndFile_keepsTheFileAttachment() {
        let file = MeeshyMessageAttachment.file(name: "rapport.pdf", size: 1234)
        let content = build(makeMessage(attachments: [file], location: makePlace()))

        XCTAssertNotNil(content.location)
        guard case .nonMedia(let items) = content.attachments else {
            return XCTFail("Le fichier doit rester en .nonMedia, obtenu \(content.attachments)")
        }
        XCTAssertEqual(items.map(\.id), [file.id])
    }

    /// Un emoji accompagné d'un lieu ne doit PAS être routé en emoji libre
    /// hors bulle (ce qui escamoterait le lieu) : même sémantique qu'avec
    /// l'ancienne pièce jointe `.location`, qui désarmait déjà la détection
    /// emoji-only.
    func test_emojiWithLocation_isNotEmojiOnly() {
        let content = build(makeMessage(content: "🔥", location: makePlace()))

        XCTAssertFalse(content.isEmojiOnly)
        XCTAssertNotNil(content.location)
        XCTAssertTrue(content.hasTextOrNonMediaContent)
    }

    // MARK: - Accessibilité

    /// Le libellé d'accessibilité doit mentionner le lieu quand il vient de
    /// `message.location` — pas seulement d'une pièce jointe de type location.
    /// Comparé à la MÊME résolution de catalogue (pas un littéral) pour rester
    /// indépendant de la locale du simulateur.
    func test_accessibilityParts_mentionLocation_fromMessageLocation() {
        let expected = String(localized: "a11y.message.location", bundle: .main)
        let parts = BubbleStandardLayout.nonMediaAccessibilityParts(
            hasSharedPlace: true,
            nonMedia: []
        )

        XCTAssertEqual(parts, [expected])
        XCTAssertFalse(expected.isEmpty)
    }

    /// La branche héritée conserve sa mention — même clé, une seule fois.
    func test_accessibilityParts_mentionLocation_fromLegacyAttachment() {
        let expected = String(localized: "a11y.message.location", bundle: .main)
        let parts = BubbleStandardLayout.nonMediaAccessibilityParts(
            hasSharedPlace: false,
            nonMedia: [.location(latitude: 1, longitude: 2)]
        )

        XCTAssertEqual(parts, [expected])
    }

    /// Un fichier joint au lieu produit sa propre mention, distincte de celle
    /// du lieu, et la mention de lieu n'apparaît qu'une fois.
    func test_accessibilityParts_locationOnce_plusFileMention() {
        let locationLabel = String(localized: "a11y.message.location", bundle: .main)
        let parts = BubbleStandardLayout.nonMediaAccessibilityParts(
            hasSharedPlace: true,
            nonMedia: [.file(name: "rapport.pdf", size: 1234)]
        )

        XCTAssertEqual(parts.count, 2)
        XCTAssertEqual(parts.filter { $0 == locationLabel }.count, 1)
        XCTAssertTrue(parts[1].contains("rapport.pdf"))
    }
}
