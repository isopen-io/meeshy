import XCTest
@testable import MeeshySDK

/// #19519 — le miroir Swift de `personHandleFromLink` (`packages/shared/utils/person-link.ts`), tenu par les
/// MÊMES vecteurs que `packages/shared/__tests__/person-link.test.ts`.
final class PersonLinkTests: XCTestCase {

    func test_handle_readsUAndAtForms_inProductionAndStaging() {
        XCTAssertEqual(PersonLink.handle(from: "https://meeshy.me/u/amani"), "amani")
        XCTAssertEqual(PersonLink.handle(from: "https://meeshy.me/@amani"), "amani")
        XCTAssertEqual(PersonLink.handle(from: "https://www.meeshy.me/u/Amani_D-2"), "Amani_D-2")
        XCTAssertEqual(PersonLink.handle(from: "https://staging.meeshy.me/@amani"), "amani")
    }

    func test_handle_toleratesTrailingSlashQueryFragmentAndHostCase() {
        XCTAssertEqual(PersonLink.handle(from: "https://meeshy.me/u/amani/"), "amani")
        XCTAssertEqual(PersonLink.handle(from: "https://MEESHY.me/@amani?ref=chat#top"), "amani")
        XCTAssertEqual(PersonLink.handle(from: "  https://meeshy.me/u/amani  "), "amani")
    }

    func test_handle_readsNothingOutsideMeeshyHostsPathsOrScheme() {
        let refused = [
            "https://evil.example/u/amani",
            "https://meeshy.me.evil.example/u/amani",
            "https://evilmeeshy.me/u/amani",
            "https://user@evil.example/u/amani",
            "http://meeshy.me/u/amani",
            "javascript:alert(1)//meeshy.me/u/amani",
            "https://meeshy.me/u/amani/posts",
            "https://meeshy.me/u/ami.ni",
            "https://meeshy.me/u/",
            "https://meeshy.me/@",
            "https://meeshy.me/users/amani",
            "https://meeshy.me/u/\(String(repeating: "x", count: 65))",
            "pas une adresse",
            "",
        ]
        for link in refused {
            XCTAssertNil(PersonLink.handle(from: link), "\(link)")
        }
    }

    func test_handle_refusesCredentialsAndPortOnAMeeshyHost() {
        XCTAssertNil(PersonLink.handle(from: "https://user@meeshy.me/u/amani"))
        XCTAssertNil(PersonLink.handle(from: "https://meeshy.me:8443/u/amani"))
    }

    func test_hosts_nameOnlyTheMeeshyHosts() {
        XCTAssertEqual(PersonLink.hosts.sorted(), ["meeshy.me", "staging.meeshy.me", "www.meeshy.me"])
    }
}
