import XCTest
import MeeshySDK
@testable import Meeshy

/// La tuile de lieu du composer suit le motif « snapshot → apply local →
/// rollback » (#4948, D-SEND-02) : elle disparaît AU TAP, avec le vidage du
/// champ texte, et ne revient que si l'envoi qui la porte a échoué. Avant, son
/// retrait attendait l'ACK réseau (jusqu'à 12 s) — le tap semblait n'avoir
/// rien fait.
final class SendPlaceTileLawTests: XCTestCase {

    private let paris = SharedPlace(
        latitude: 48.8566, longitude: 2.3522,
        name: "Café de Flore", address: "172 boulevard Saint-Germain, Paris"
    )

    // MARK: - outcome(sent:)

    func test_outcome_sent_isCleared() {
        XCTAssertEqual(SendPlaceTileLaw.outcome(sent: true), .cleared)
    }

    func test_outcome_notSent_isRestored() {
        XCTAssertEqual(SendPlaceTileLaw.outcome(sent: false), .restored)
    }

    // MARK: - restoration(of:sent:current:)

    func test_restoration_sent_returnsNil() {
        // Envoi réussi (ACK ou file durable) : rien ne revient dans le composer.
        XCTAssertNil(SendPlaceTileLaw.restoration(of: paris, sent: true, current: nil))
    }

    func test_restoration_notSent_returnsSnapshot() {
        let restored = SendPlaceTileLaw.restoration(of: paris, sent: false, current: nil)
        XCTAssertEqual(restored?.name, "Café de Flore")
    }

    func test_restoration_notSent_noSnapshot_returnsNil() {
        // Un envoi sans lieu n'a rien à restaurer, même en échec.
        XCTAssertNil(SendPlaceTileLaw.restoration(of: nil, sent: false, current: nil))
    }

    func test_restoration_notSent_userAlreadyPickedAnotherPlace_keepsTheNewOne() {
        // Pendant l'aller-retour réseau, l'utilisateur a choisi un autre lieu :
        // le rollback ne doit pas écraser un choix plus récent que le snapshot.
        let lyon = SharedPlace(latitude: 45.764, longitude: 4.8357, name: "Lyon", address: nil)
        XCTAssertNil(SendPlaceTileLaw.restoration(of: paris, sent: false, current: lyon))
    }
}

/// Le type de la bulle OPTIMISTE d'un groupe média se lit sur TOUTES ses
/// pièces, jamais sur la première seule : un document partait typé `.image`
/// (« Photo » dans la liste jusqu'à l'écho serveur). Miroir de la règle
/// gateway `deriveMessageTypeForAttachments` (un lot hétérogène ⇒ `file`).
final class OptimisticMediaMessageTypeTests: XCTestCase {

    func test_optimisticMessageType_audioGroup_isAudio() {
        XCTAssertEqual(ConversationView.optimisticMessageType(isAudioGroup: true, mimeTypes: ["audio/mp4"]), .audio)
    }

    func test_optimisticMessageType_onlyImages_isImage() {
        XCTAssertEqual(ConversationView.optimisticMessageType(isAudioGroup: false, mimeTypes: ["image/jpeg", "image/heic"]), .image)
    }

    func test_optimisticMessageType_onlyVideos_isVideo() {
        XCTAssertEqual(ConversationView.optimisticMessageType(isAudioGroup: false, mimeTypes: ["video/mp4"]), .video)
    }

    func test_optimisticMessageType_singleDocument_isFile() {
        XCTAssertEqual(ConversationView.optimisticMessageType(isAudioGroup: false, mimeTypes: ["application/pdf"]), .file)
    }

    func test_optimisticMessageType_imagesAndVideosMixed_isFile() {
        // Deux CATÉGORIES dans un même lot ⇒ `.file`, comme la règle partagée
        // (`messageTypeFromMimeTypes`) — et surtout comme ce que le serveur
        // écrira : le planificateur met images, vidéos et documents dans le
        // MÊME groupe `.visual`, donc suivre la première pièce ferait sauter
        // l'aperçu de « Vidéo » à « Document » à la réconciliation.
        XCTAssertEqual(ConversationView.optimisticMessageType(isAudioGroup: false, mimeTypes: ["video/mp4", "image/png"]), .file)
        XCTAssertEqual(ConversationView.optimisticMessageType(isAudioGroup: false, mimeTypes: ["image/png", "video/mp4"]), .file)
    }

    func test_optimisticMessageType_imageWithDocument_isFile() {
        XCTAssertEqual(ConversationView.optimisticMessageType(isAudioGroup: false, mimeTypes: ["image/png", "application/pdf"]), .file)
    }

    func test_optimisticMessageType_emptyMime_isFile() {
        // Un MIME vide n'est pas une photo : la règle gateway dit « jamais text », ici « jamais image ».
        XCTAssertEqual(ConversationView.optimisticMessageType(isAudioGroup: false, mimeTypes: [""]), .file)
    }

    func test_optimisticMessageType_noMimeAtAll_isFile() {
        // « Je n'ai pas l'information » n'est pas « il n'y a rien à joindre » :
        // le repli est la catégorie générique, jamais `.text` (miroir de
        // `messageTypeForClientAttachments`).
        XCTAssertEqual(ConversationView.optimisticMessageType(isAudioGroup: false, mimeTypes: []), .file)
    }
}
