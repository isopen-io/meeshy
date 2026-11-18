import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #19442 — « Envoyer son profil », sur la fiche d'un autre, passe par la feuille d'envoi Meeshy quand l'app l'offre :
/// sa carte (nom, pseudo, avatar, bio, adresse) part dans une conversation. Sans app, la feuille système reste ; sans
/// pseudo, il n'y a rien à envoyer.
final class ProfileSendRouteTests: XCTestCase {

    private func resolve(userId: String? = "u-leo", displayName: String = "Léo Marchetti",
                         username: String? = "leo.m", avatarURL: String? = "https://cdn/leo.jpg",
                         bio: String? = "Photographe de rue.", hostOffered: Bool = true) -> ProfileSendRoute? {
        ProfileSendRoute.resolve(userId: userId, displayName: displayName, link: ProfileLink(username: username),
                                 avatarURL: avatarURL, bio: bio, hostOffered: hostOffered)
    }

    func test_resolve_withTheAppHost_sendsTheirCardThroughMeeshy() {
        let route = resolve()

        guard case .meeshy(let request) = route else { return XCTFail("feuille Meeshy attendue, reçu \(String(describing: route))") }
        XCTAssertEqual(request.userId, "u-leo")
        XCTAssertEqual(request.displayName, "Léo Marchetti")
        XCTAssertEqual(request.username, "leo.m")
        XCTAssertEqual(request.avatarURL, "https://cdn/leo.jpg")
        XCTAssertEqual(request.bio, "Photographe de rue.")
        XCTAssertEqual(request.url.absoluteString, "https://meeshy.me/@leo.m")
    }

    func test_resolve_withoutTheAppHost_keepsTheSystemSheet() {
        XCTAssertEqual(resolve(hostOffered: false), .system(URL(string: "https://meeshy.me/@leo.m")!))
    }

    func test_resolve_withoutAnIdentifier_keepsTheSystemSheet() {
        XCTAssertEqual(resolve(userId: nil), .system(URL(string: "https://meeshy.me/@leo.m")!))
        XCTAssertEqual(resolve(userId: "  "), .system(URL(string: "https://meeshy.me/@leo.m")!))
    }

    func test_resolve_withoutAHandle_sendsNothing() {
        XCTAssertNil(resolve(username: nil))
        XCTAssertNil(resolve(username: nil, hostOffered: false))
    }

    func test_resolve_aBlankBioOrAvatar_travelsAsAbsent() {
        guard case .meeshy(let request) = resolve(avatarURL: "", bio: "  \n ") else { return XCTFail("feuille Meeshy attendue") }
        XCTAssertNil(request.bio)
        XCTAssertNil(request.avatarURL)
    }

    func test_resolve_aBlankName_fallsBackToTheHandle() {
        guard case .meeshy(let request) = resolve(displayName: " ") else { return XCTFail("feuille Meeshy attendue") }
        XCTAssertEqual(request.displayName, "leo.m")
    }
}
