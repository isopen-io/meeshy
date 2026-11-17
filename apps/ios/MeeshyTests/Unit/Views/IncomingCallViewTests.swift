import XCTest
@testable import Meeshy

// MARK: - IncomingCallView Source Inspection Tests

@MainActor
final class IncomingCallViewTests: XCTestCase {

    private func incomingCallViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Call/Views/IncomingCallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Photo et contour du correspondant (#12336)

    func test_incomingCallView_showsThePeersPhotoInsideItsEquippedRing() throws {
        let source = AppSourceGuard.stripComments(try incomingCallViewSource())
        XCTAssertTrue(
            source.contains("let peerProfile: MeeshyUser?"),
            "IncomingCallView doit recevoir le profil résolu du correspondant."
        )
        XCTAssertTrue(
            source.contains("CachedAvatarImage(") && source.contains("urlString: peerProfile?.avatar"),
            "Le disque de l'appel entrant montre la photo du correspondant, sinon ses " +
            "initiales — jamais les initiales SOUS la photo (#12568)."
        )
        XCTAssertTrue(
            source.contains(".avatarRingWithin(") && source.contains("ProfileDecorResolver.ring(peerProfile?.profileDecor?.avatarRing)"),
            "Le disque de l'appel entrant doit porter le contour équipé du correspondant."
        )
    }

    // MARK: - VoiceOver announcement on appear

    func test_incomingCallView_postsScreenChangedOnAppear() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("UIAccessibility.post") && source.contains(".screenChanged"),
            "IncomingCallView must post a UIAccessibility.screenChanged notification " +
            "on appear so VoiceOver users are immediately informed of the incoming call " +
            "when the view slides up — without it the ringing animation is completely silent."
        )
    }

    func test_incomingCallView_announcementUsesCallerName() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("call.incoming.a11y.announced"),
            "IncomingCallView must reference the call.incoming.a11y.announced localization " +
            "key in the screenChanged notification so the announcement is localizable."
        )
    }

    func test_incomingCallView_announcementIncludesCallType() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("callTypeLabel"),
            "The screenChanged announcement must incorporate the call type (audio vs video) " +
            "so VoiceOver announces 'Appel vidéo entrant' or 'Appel entrant' as appropriate."
        )
    }

    // MARK: - Reduce Motion support

    func test_incomingCallView_readsReduceMotionEnvironment() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("accessibilityReduceMotion"),
            "IncomingCallView must read @Environment(\\.accessibilityReduceMotion) " +
            "to conditionally suppress ring pulse and avatar bounce animations."
        )
    }

    func test_incomingCallView_ringAnimation_isStaticWhenReduceMotion() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("reduceMotion ? nil"),
            "Ring pulse animations must be nil when reduceMotion is enabled — " +
            "repeating scale animations can trigger vestibular discomfort."
        )
    }

    // MARK: - Action button accessibility

    func test_declineButton_hasAccessibilityLabel() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("call.incoming.decline.label"),
            "The decline button must carry an accessibility label so VoiceOver users " +
            "can identify it without exploring by touch."
        )
    }

    func test_acceptButton_hasAccessibilityLabel() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("call.incoming.accept.label"),
            "The accept button must carry an accessibility label describing its function."
        )
    }

    func test_declineButton_hasAccessibilityHint() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("call.incoming.decline.hint"),
            "The decline button must carry an accessibility hint explaining the tap outcome."
        )
    }

    func test_acceptButton_hasAccessibilityHint() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("call.incoming.accept.hint"),
            "The accept button must carry an accessibility hint explaining the tap outcome."
        )
    }

    func test_ringAnimation_isAccessibilityHidden() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("ringAnimation") && source.contains(".accessibilityHidden(true)"),
            "The decorative ring pulse animation must be hidden from VoiceOver " +
            "(.accessibilityHidden(true)) to avoid polluting the accessibility tree."
        )
    }

    // MARK: - Dead code

    func test_doesNotDeclareUnusedColorSchemeReader() throws {
        // Neither `colorScheme` nor the derived `isDark` is read anywhere in
        // this file — IncomingCallView never overrides or branches on the
        // color scheme itself.
        let source = try incomingCallViewSource()
        XCTAssertFalse(
            source.contains("colorScheme"),
            "IncomingCallView must not declare an unused @Environment(\\.colorScheme) reader."
        )
        XCTAssertFalse(
            source.contains("isDark"),
            "IncomingCallView must not declare an unused isDark computed property."
        )
    }

    // MARK: - P17.2 / P17.13 — l'appel entrant pose ses puces et ses boutons en verre (#18211)

    private func callViewsSource(_ file: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/\(file)"))
    }

    func test_activerLeSon_isAGlassChip_notAFlatWhiteCapsule() throws {
        let preview = try callViewsSource("CallPreviewViews.swift")
        let button = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct CallPreviewSoundButton: View", in: preview))
        XCTAssertFalse(button.contains("Capsule().fill(Color.white)"), "Plus de capsule blanche pleine (P17.2)")
        XCTAssertFalse(button.contains(".black"), "Plus d'encre noire : le texte est clair sur le verre")
        XCTAssertTrue(button.contains(".adaptiveLiquidGlass(in: Capsule()"), "Le verre du kit, iOS 16 à 26 (P17.13)")
        XCTAssertTrue(button.contains("interactive: true"))
        XCTAssertTrue(button.contains("minHeight: 50"), "Cible tenue")
        XCTAssertTrue(button.contains(".accessibilityAddTraits(audible ? .isSelected : [])"))
    }

    func test_incomingScreen_chipsBarAndSecondaryButtons_useTheSharedLiquidGlassRecipe() throws {
        let incoming = try callViewsSource("IncomingCallView.swift")
        let bar = try callViewsSource("IncomingPreAnswerBar.swift")
        let preview = try callViewsSource("CallPreviewViews.swift")
        let chip = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private var typeChip: some View", in: incoming))
        XCTAssertTrue(chip.contains(".adaptiveLiquidGlass(in: Capsule())"))
        XCTAssertTrue(bar.contains(".adaptiveLiquidGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus"))
        for (name, code) in [("IncomingCallView", incoming), ("IncomingPreAnswerBar", bar)] {
            XCTAssertFalse(code.contains(".adaptiveGlass(in:"), "\(name) : le matériau nu (sans reflet ni liseré) sous iOS 16 à 25 a quitté l'appel entrant")
        }
        let sound = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct CallPreviewSoundButton: View", in: preview))
        XCTAssertFalse(sound.contains(".adaptiveGlass(in:"))
    }

    func test_incomingScreen_refuseAndAnswerStayProminentGlass() throws {
        let incoming = try callViewsSource("IncomingCallView.swift")
        XCTAssertTrue(incoming.contains(".adaptiveGlassProminent(in: Circle(), tint: tint)"), "Refuser et Répondre suivent Fin (#17323)")
    }
}

