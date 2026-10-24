import XCTest
@testable import Meeshy

/// D2 (ios-full-remediation, Lane AV) — banners and ad hoc avatar chips must
/// never surface `CachedAsyncImage`'s retry button: they already paint an
/// elegant fallback (gradient / initials) that degrades silently on failure.
/// This project does not write SwiftUI tap/render-simulation tests (no
/// ViewInspector dependency) — source-guard confirms the wiring itself,
/// matching the established convention (`CallBubbleViewMiniMenuWiringTests`,
/// `CallParticipantVisualTests` in `FloatingCallPillViewTests.swift`). Read
/// the code, not comments.
@MainActor
final class AvatarBannerNoRetryWiringTests: XCTestCase {

    private func appSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func block(from startMarker: String, upTo endMarker: String, in source: String) throws -> String {
        guard let start = source.range(of: startMarker) else {
            XCTFail("Marker not found: \(startMarker)")
            return ""
        }
        let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_conversationInfoSheetHeroBanner_suppressesRetryOverlay() throws {
        let source = try appSource("Meeshy/Features/Main/Components/ConversationInfoSheet.swift")
        let hero = try block(
            from: "private var heroBannerImage: some View {",
            upTo: "private var heroBannerPlaceholder",
            in: source
        )
        XCTAssertTrue(hero.contains("showsStatusOverlays: false"),
                      "The 140pt hero banner must suppress the retry button — it already renders heroBannerPlaceholder on failure.")
    }

    /// #9200 — une bannière CHANGÉE (image plus haute que 140 pt, rendue en
    /// `.fill`) débordait de son cadre : `clipShape` rogne le DESSIN, pas la
    /// zone de toucher, et l'image ({{20,-116},{400,600}}) recouvrait l'en-tête
    /// de la feuille — la roue dentée et « Fermer » ne répondaient plus.
    func test_conversationInfoSheetHeroBanner_neverCapturesTouchesOutsideItsFrame() throws {
        let source = try appSource("Meeshy/Features/Main/Components/ConversationInfoSheet.swift")
        let hero = try block(
            from: "private var heroConversationHeader: some View {",
            upTo: "// Avatar overlapping banner",
            in: source
        )
        XCTAssertTrue(hero.contains("Color.clear"),
                      "The banner slot must be a fixed-size container (Color.clear) whose size never depends on the image.")
        XCTAssertTrue(hero.contains(".allowsHitTesting(false)"),
                      "The banner image is decorative: it must never take a touch, so its overflow cannot swallow the header buttons.")
        XCTAssertTrue(hero.contains(".clipped()") || hero.contains(".clipShape("),
                      "The banner must stay clipped to its 140 pt frame.")
        XCTAssertTrue(hero.contains(".contentShape("),
                      "The banner's hit area must be bounded to its own frame.")

        XCTAssertTrue(source.contains("headerBar\n                    .zIndex(1)"),
                      "The header bar must sit above the content that follows it, so no overflow can cover its buttons.")
    }

    func test_callParticipantVisualAvatar_migratesToCachedAvatarImage() throws {
        let source = try appSource("Meeshy/Features/Main/Views/CallParticipantVisual.swift")
        let avatar = try block(
            from: "private var avatarView: some View {",
            upTo: "/// Résolution cache-first",
            in: source
        )
        XCTAssertTrue(avatar.contains("CachedAvatarImage("),
                      "avatarView must use CachedAvatarImage — a 44-56pt call circle has no room for the retry icon+label.")
        XCTAssertTrue(avatar.contains("name: callManager.remoteUsername"),
                      "CachedAvatarImage needs a name for its initials fallback.")
        XCTAssertTrue(avatar.contains("accentColor: MeeshyColors.brandPrimaryHex"),
                      "CachedAvatarImage must reuse the documented brand hex constant (never a raw literal).")
        XCTAssertFalse(avatar.contains("CachedAsyncImage("),
                        "avatarView must no longer construct a bare CachedAsyncImage for the remote avatar.")
    }

    // MARK: - #12568 — un seul visage par identité : la photo, sinon les initiales

    func test_miniAudioPlayerBar_showsTheSenderPhoto() throws {
        let source = try appSource("Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift")
        XCTAssertTrue(source.contains("CachedAvatarImage("),
                      "La barre du lecteur audio monte le visage de l'expéditeur (photo, sinon initiales).")
        XCTAssertTrue(source.contains("urlString: context.senderAvatarURL"),
                      "La photo de l'expéditeur servie dans le contexte de lecture ne doit plus être ignorée.")
        XCTAssertFalse(source.contains("context.senderName.prefix(1)"),
                       "Plus d'initiale locale à une lettre : CachedAvatarImage porte le repli.")
    }

    func test_callSelfView_suspendedTile_showsTheLocalUserPhoto() throws {
        let source = try appSource("Meeshy/Features/Main/Views/CallView+SelfView.swift")
        let tile = try block(from: "private var videoSuspendedTileBody: some View {", upTo: "VStack(spacing: MeeshySpacing.xsPlus)", in: source)
        XCTAssertTrue(tile.contains("CachedAvatarImage("))
        XCTAssertTrue(tile.contains("localUser?.avatar"), "La vignette « vidéo en pause » montre la photo de l'utilisateur local.")
        XCTAssertFalse(tile.contains("Text(initial)"))
    }

    func test_callAvatars_neverStackInitialsUnderThePhoto() throws {
        let states = try appSource("Meeshy/Features/Main/Views/CallView+States.swift")
        let circle = try block(from: "func avatarCircle(size: CGFloat) -> some View {", upTo: "func callAvatarPair", in: states)
        let badge = try block(from: "private func localAvatarBadge(size: CGFloat) -> some View {", upTo: "var callTypeBadge", in: states)
        let incoming = try block(
            from: "private var avatarView: some View {",
            upTo: "// MARK: - Call Type Badge",
            in: try appSource("Meeshy/Features/Main/Views/IncomingCallView.swift")
        )
        for (label, body) in [("avatarCircle", circle), ("localAvatarBadge", badge), ("IncomingCallView.avatarView", incoming)] {
            XCTAssertTrue(body.contains("CachedAvatarImage("), "\(label) monte CachedAvatarImage (photo OU initiales).")
            XCTAssertFalse(body.contains("Text(initial)"), "\(label) ne garde plus d'initiale sous la photo.")
            XCTAssertFalse(body.contains("CachedAsyncImage("), "\(label) n'est pas un composant d'avatar.")
        }
        XCTAssertTrue(circle.contains(".avatarRingWithin("), "Le contour équipé reste posé une fois sur le grand cercle.")
        XCTAssertTrue(incoming.contains(".avatarRingWithin("))
    }

    func test_storyCommentRow_avatarIsAnAvatarComponent() throws {
        let source = try appSource("Meeshy/Features/Main/Views/StoryCommentRowView.swift")
        let avatar = try block(from: "private var avatar: some View {", upTo: "private var headerRow", in: source)
        XCTAssertTrue(avatar.contains("MeeshyAvatar(") || avatar.contains("CachedAvatarImage("))
        XCTAssertFalse(avatar.contains("CachedAsyncImage("),
                       "CachedAsyncImage n'est pas un composant d'avatar (spinner, « Réessayer », politique de téléchargement).")
    }

    func test_contactCardDetailHeader_showsTheLinkedAccountPhoto() throws {
        let source = try appSource("Meeshy/Features/Main/Components/ContactCard/ContactCardDetailSheet.swift")
        let face = try block(from: "private var headerFace: some View {", upTo: "// MARK: - Un champ copiable", in: source)
        XCTAssertTrue(face.contains("avatarURL: account.avatarUrl"),
                      "L'en-tête de la fiche montre la photo du compte associé, comme la bulle.")
        XCTAssertFalse(source.contains("static func initials"), "Pas de jumelle locale des initiales.")
    }

    func test_shareLinkIdentity_accountChipCarriesThePhoto() throws {
        let sheet = try appSource("Meeshy/Features/Main/Views/ShareLinkIdentitySheet.swift")
        XCTAssertTrue(sheet.contains("avatarURL: accountAvatarURL"))
        let layers = try appSource("Meeshy/Features/Main/Views/RootLayers/RootSharedLayers.swift")
        XCTAssertTrue(layers.contains("accountAvatarURL: AuthManager.shared.currentUser?.avatar"))
    }

    func test_newConversationPickers_passTheSearchedUserPhoto() throws {
        let source = try appSource("Meeshy/Features/Main/Views/NewConversationView.swift")
        XCTAssertEqual(source.components(separatedBy: "avatarURL: user.avatar").count - 1, 2,
                       "La puce de sélection et la rangée résultat montrent la photo de SearchedUser.")
    }
}
