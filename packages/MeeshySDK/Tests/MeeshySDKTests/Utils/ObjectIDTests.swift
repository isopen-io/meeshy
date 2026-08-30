import XCTest
@testable import MeeshySDK

/// #4044 — le prédicat « cette chaîne est-elle une clé que le serveur sait
/// adresser ? », miroir Swift de la SSOT partagée.
///
/// La règle existait déjà en TROIS exemplaires — `packages/shared/utils/object-id.ts`,
/// `apps/web/utils/object-id.ts`, `services/gateway/src/utils/object-id.ts` — qui
/// portent DÉLIBÉRÉMENT le même nom de constante et de fonction « pour rester
/// repérables d'un package à l'autre ». Le Swift était le seul client à ne pas
/// l'avoir, et c'est le seul qui fabrique des identifiants LOCAUX
/// (`pending_<uuid>`) susceptibles de partir vers une route qui attend un
/// ObjectId.
final class ObjectIDTests: XCTestCase {

    func test_isValid_acceptsA24CharHexString() {
        XCTAssertTrue(MeeshyObjectID.isValid("507f1f77bcf86cd799439011"))
    }

    /// La casse est indifférente — la SSOT partagée déclare `[0-9a-fA-F]{24}`.
    func test_isValid_isCaseInsensitive() {
        XCTAssertTrue(MeeshyObjectID.isValid("507F1F77BCF86CD799439011"))
        XCTAssertTrue(MeeshyObjectID.isValid("507f1F77bCf86Cd799439011"))
    }

    /// **Le cas du terrain.** Une story encore en file de publication porte
    /// l'identifiant LOCAL que `StoryPublishQueue` lui a donné. Envoyé à
    /// `POST /posts/:id/view`, il fait lever Prisma (`P2023`, ObjectId
    /// malformé) — d'où le 500 permanent des 19 lignes `markStoryViewed`
    /// épuisées relevées sur appareil réel.
    func test_isValid_rejectsAPendingLocalStoryId() {
        XCTAssertFalse(MeeshyObjectID.isValid("pending_\(UUID().uuidString)"))
    }

    /// Les autres identifiants locaux du dépôt, pour la même raison.
    func test_isValid_rejectsTheOtherLocalIdShapes() {
        XCTAssertFalse(MeeshyObjectID.isValid(ClientMessageId.generate()))
        XCTAssertFalse(MeeshyObjectID.isValid(ClientMutationId.generate()))
        XCTAssertFalse(MeeshyObjectID.isValid(UUID().uuidString))
    }

    func test_isValid_rejectsWrongLength() {
        XCTAssertFalse(MeeshyObjectID.isValid(""))
        XCTAssertFalse(MeeshyObjectID.isValid("507f1f77bcf86cd79943901"))   // 23
        XCTAssertFalse(MeeshyObjectID.isValid("507f1f77bcf86cd7994390111")) // 25
    }

    /// Vingt-quatre caractères ne suffisent pas : ils doivent être hexadécimaux.
    /// Sans ce cas, une garde de longueur seule passerait pour la bonne règle.
    func test_isValid_rejectsNonHexOfTheRightLength() {
        XCTAssertFalse(MeeshyObjectID.isValid("zzzzzzzzzzzzzzzzzzzzzzzz"))
        XCTAssertFalse(MeeshyObjectID.isValid("507f1f77bcf86cd79943901g"))
        XCTAssertFalse(MeeshyObjectID.isValid("507f1f77-bcf8-6cd7994390"))
    }
}
