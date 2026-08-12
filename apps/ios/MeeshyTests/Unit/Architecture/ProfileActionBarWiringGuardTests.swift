import XCTest
@testable import Meeshy

/// Gardes de source du câblage de la barre d'actions dans le listing
/// posts/réels du profil (`ProfileUserPostsList`) et des cibles tactiles des
/// boutons de `ReelFeedCard`.
///
/// Deux pannes distinctes rendaient la barre « inopérante » :
/// 1. Les boutons de `ReelFeedCard` n'avaient ni `.frame(minWidth: 44,
///    minHeight: 44)` ni `.contentShape(Rectangle())` : la zone de hit se
///    limitait au tracé du glyphe (18 pt) et un tap approximatif tombait dans
///    le `.onTapGesture` du ZStack parent (`onTapMedia`) — qui, dans le
///    profil, FERMAIT la feuille pour ouvrir le viewer.
/// 2. `ProfileUserPostsList` câblait `onComment` d'un réel sur `openReel`
///    (même effet), et le bouton commentaire des posts dépendait de la sheet
///    INTERNE de `FeedPostCard`, en concurrence avec les feuilles empilées du
///    profil. Les deux passent désormais par `commentingPost` hoisté au
///    niveau liste.
final class ProfileActionBarWiringGuardTests: XCTestCase {

    private func source(_ repoRelativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .deletingLastPathComponent()  // …/apps
            .deletingLastPathComponent()  // racine du dépôt
        return try String(contentsOf: root.appendingPathComponent(repoRelativePath), encoding: .utf8)
    }

    func test_reelFeedCard_actionButtons_carryHIGTouchTargets() throws {
        let code = AppSourceGuard.stripComments(
            try source("apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift"))

        let touchTargets = code.components(separatedBy: ".frame(minWidth: 44, minHeight: 44)").count - 1
        XCTAssertGreaterThanOrEqual(touchTargets, 2,
            "likeButton ET reelButton doivent porter la cible tactile 44×44 — sans elle, " +
            "un tap à côté du glyphe tombe dans le onTapGesture parent (openReel)")

        let contentShapes = code.components(separatedBy: ".contentShape(Rectangle())").count - 1
        XCTAssertGreaterThanOrEqual(contentShapes, 2,
            "la frame élargie sans contentShape(Rectangle()) reste non hit-testable hors du tracé")
    }

    func test_profileList_reelCommentButton_opensCommentsSheet_notTheViewer() throws {
        let code = AppSourceGuard.stripComments(
            try source("apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift"))

        XCTAssertFalse(
            code.contains("onComment: { _ in openReel(post) }"),
            "le bouton commentaire d'un réel ne doit plus fermer le profil pour ouvrir le viewer")
        XCTAssertTrue(
            code.contains("commentingPost = post"),
            "le commentaire (réel ET poste) passe par la feuille hoistée au niveau liste")
        XCTAssertTrue(
            code.contains("onOpenComments:"),
            "FeedPostCard doit recevoir onOpenComments pour ne pas dépendre de sa sheet interne")
        XCTAssertTrue(
            code.contains(".sheet(item: $commentingPost)"),
            "la feuille de commentaires est présentée par la LISTE (une seule pile de sheets)")
    }
}
