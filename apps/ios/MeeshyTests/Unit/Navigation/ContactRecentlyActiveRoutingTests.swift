import XCTest
@testable import Meeshy
import MeeshySDK

/// « X était sur Meeshy récemment » (#8285) : toucher la notification ouvre le
/// PROFIL de X — depuis le push, la bannière in-app et la liste, sur iPhone
/// comme sur iPad.
///
/// Les aiguillages vivent dans des méthodes `private` de vues SwiftUI lourdes
/// (`RootView.navigateFromNotification`, les trois gestionnaires de
/// `iPadRootView+Navigation`) : même convention que
/// `NotificationCallRoutingTests`, ce sont des gardes de SOURCE. Elles
/// reconnaissent la branche « profil » par ce qu'elle FAIT (elle pose
/// `router.deepLinkProfileUser` depuis l'identifiant de l'expéditeur), jamais
/// par sa place — et exigent que `.contactRecentlyActive` y soit rangé.
/// L'acteur qui voyage jusqu'à cette branche est vérifié côté SDK
/// (`ContactRecentlyActiveNotificationTests`, chemins liste, bannière et push).
final class ContactRecentlyActiveRoutingTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Les branches `case … :` dont le corps ouvre le profil de l'expéditeur.
    private func profileBranchLabels(in source: String) -> [String] {
        source.components(separatedBy: "case .").dropFirst().compactMap { segment in
            guard let colon = segment.range(of: ":\n") else { return nil }
            let label = String(segment[..<colon.lowerBound])
            let body = String(segment[colon.upperBound...])
            guard body.contains("router.deepLinkProfileUser = ProfileSheetUser("),
                  body.contains("senderId") else { return nil }
            return "." + label
        }
    }

    func test_navigateFromNotification_contactRecentlyActive_opensTheActorProfile_onIPhone() throws {
        let labels = profileBranchLabels(in: try source("Meeshy/Features/Main/Views/RootView.swift"))

        XCTAssertEqual(labels.count, 1, "une seule branche « profil » dans l'aiguillage iPhone (push, liste, bannière)")
        XCTAssertTrue(labels.allSatisfy { $0.contains(".contactRecentlyActive") },
                      "le toucher de « X était sur Meeshy récemment » doit ouvrir le profil de X")
    }

    func test_handleNotificationTaps_contactRecentlyActive_opensTheActorProfile_onIPadListSocketAndPush() throws {
        let labels = profileBranchLabels(in: try source("Meeshy/Features/Main/Views/iPadRootView+Navigation.swift"))

        XCTAssertEqual(labels.count, 3, "liste, bannière in-app et push : trois gestionnaires iPad")
        for label in labels {
            XCTAssertTrue(label.contains(".contactRecentlyActive"),
                          "gestionnaire iPad sans « X était sur Meeshy récemment » : \(label)")
        }
    }

    func test_profileBranches_everyTypeThatOpensAProfileOnIPhone_opensItOnIPadToo() throws {
        let iPhone = try profileBranchLabels(in: source("Meeshy/Features/Main/Views/RootView.swift")).joined()
        let iPad = try profileBranchLabels(in: source("Meeshy/Features/Main/Views/iPadRootView+Navigation.swift"))

        for type in [".contactJoined", ".contactRecentlyActive"] {
            XCTAssertTrue(iPhone.contains(type))
            XCTAssertTrue(iPad.allSatisfy { $0.contains(type) }, "\(type) diverge entre iPhone et iPad")
        }
    }
}
