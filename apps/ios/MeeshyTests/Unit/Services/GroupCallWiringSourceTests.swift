import XCTest

/// Le câblage de l'appel de groupe dans `CallManager`, singleton sans
/// injection : les règles vivent dans le maillage et `CallOfferData`, testées
/// par comportement ; ces témoins gardent que `CallManager` les consulte.
final class GroupCallWiringSourceTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent(path)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(of signature: String, in path: String, length: Int = 2_400) throws -> String {
        let text = try source(path)
        guard let start = text.range(of: signature) else {
            XCTFail("\(signature) introuvable dans \(path)")
            return ""
        }
        let end = text.index(start.lowerBound, offsetBy: length, limitedBy: text.endIndex) ?? text.endIndex
        return String(text[start.lowerBound ..< end])
    }

    // MARK: - #9084 — l'invité répond à l'invitant

    func test_handleCallOffer_ringsThePrincipal_notTheInitiator() throws {
        let handler = try body(
            of: "func handleCallOffer(",
            in: "Meeshy/Features/Main/Services/CallManager+IncomingOffer.swift"
        )

        XCTAssertTrue(
            handler.contains("fromUserId: event.principalUserId"),
            "l'invité d'un appel en cours reçoit l'offre de l'INVITANT : c'est lui le pair "
            + "principal, sinon sa réponse part à l'initiateur et une seule liaison s'établit"
        )
    }
}
