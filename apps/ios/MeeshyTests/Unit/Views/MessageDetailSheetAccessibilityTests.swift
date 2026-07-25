import XCTest
@testable import Meeshy

/// P1 a11y pass on `MessageDetailSheet` — the file had 22 buttons / 31
/// `Image(systemName:)` icons and ZERO explicit `.accessibilityLabel`.
/// Icon-only controls (deselect language, clear search, retranslate, forward)
/// were completely silent to VoiceOver; icon+text rows announced the raw SF
/// Symbol name alongside the visible label. Aligned with the `BubbleFooter` /
/// `CallView` convention: explicit `.accessibilityLabel` on every control,
/// `.accessibilityHidden(true)` on every purely decorative icon that sits
/// beside an equivalent Text.
@MainActor
final class MessageDetailSheetAccessibilityTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/MessageDetailSheet.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - languageRowAccessibilityLabel (pure, unit-tested directly)

    func test_languageRowAccessibilityLabel_translating_announcesInProgress() {
        let label = MessageDetailSheet.languageRowAccessibilityLabel(
            languageName: "Español", isSelected: false, isTranslating: true, hasTranslation: false
        )
        XCTAssertEqual(label, "Español, traduction en cours")
    }

    func test_languageRowAccessibilityLabel_hasTranslationAndSelected_announcesShown() {
        let label = MessageDetailSheet.languageRowAccessibilityLabel(
            languageName: "English", isSelected: true, isTranslating: false, hasTranslation: true
        )
        XCTAssertEqual(label, "English, traduction affichée")
    }

    func test_languageRowAccessibilityLabel_hasTranslationNotSelected_announcesAvailable() {
        let label = MessageDetailSheet.languageRowAccessibilityLabel(
            languageName: "Deutsch", isSelected: false, isTranslating: false, hasTranslation: true
        )
        XCTAssertEqual(label, "Deutsch, traduction disponible")
    }

    func test_languageRowAccessibilityLabel_noTranslation_announcesTranslateAction() {
        let label = MessageDetailSheet.languageRowAccessibilityLabel(
            languageName: "日本語", isSelected: false, isTranslating: false, hasTranslation: false
        )
        XCTAssertEqual(label, "日本語, traduire")
    }

    func test_languageRowAccessibilityLabel_translatingTakesPriorityOverSelection() {
        // A row can be selected AND mid-retranslate (tap "Retraduire" on an
        // already-shown translation) — translating must win the phrasing.
        let label = MessageDetailSheet.languageRowAccessibilityLabel(
            languageName: "Français", isSelected: true, isTranslating: true, hasTranslation: true
        )
        XCTAssertEqual(label, "Français, traduction en cours")
    }

    // MARK: - Icon-only buttons: must have an explicit accessibilityLabel

    func test_deselectLanguageButton_hasAccessibilityLabel() throws {
        let src = try source()
        guard let range = src.range(of: "Image(systemName: \"xmark.circle.fill\")") else {
            XCTFail("Expected the deselect-language xmark button")
            return
        }
        let window = String(src[range.lowerBound..<src.index(range.upperBound, offsetBy: 350, limitedBy: src.endIndex)!])
        XCTAssertTrue(
            window.contains("message-detail.a11y.language.close"),
            "The icon-only 'deselect language' button must carry an explicit accessibilityLabel — " +
            "it was completely silent to VoiceOver before this fix."
        )
    }

    func test_retranslateButton_hasAccessibilityLabel() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("message-detail.a11y.language.retranslate"),
            "The icon-only 'retranslate' (arrow.clockwise) button must carry an explicit accessibilityLabel."
        )
    }

    func test_forwardClearSearchButton_hasAccessibilityLabel() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("message-detail.a11y.forward.clearSearch"),
            "The icon-only search-clear button (the exact 'clear recherche' example from the audit) " +
            "must carry an explicit accessibilityLabel."
        )
    }

    func test_forwardSendButton_labelIncludesConversationName() throws {
        let src = try source()
        // NB: "message-detail.a11y.forward.send" is a *prefix* of the sibling
        // key "message-detail.a11y.forward.sending" — anchor on the closing
        // quote so `range(of:)` can't match the wrong (shorter) key first.
        guard let range = src.range(of: "message-detail.a11y.forward.send\"") else {
            XCTFail("Expected the forward-send accessibility key")
            return
        }
        let window = String(src[range.lowerBound..<src.index(range.upperBound, offsetBy: 120, limitedBy: src.endIndex)!])
        XCTAssertTrue(
            window.contains("conv.name"),
            "The icon-only 'forward to this conversation' button must fold the destination name " +
            "into its label — HIG requires the label carry full context, not just 'Send'."
        )
    }

    func test_forwardAlreadySentStatus_hasStandaloneAccessibilityLabel() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("message-detail.a11y.forward.sent"),
            "The 'already forwarded' checkmark has no sibling Text in that branch — it must carry " +
            "its own accessibilityLabel rather than being silently hidden."
        )
    }

    func test_pendingClockIcon_hasStandaloneAccessibilityLabel() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("message-detail.a11y.pending"),
            "userStatusRow's fallback clock icon (shown when there is no date) has no sibling Text " +
            "in that branch — it must carry its own accessibilityLabel instead of being hidden."
        )
    }

    // MARK: - Progress-state buttons must not go silent while submitting

    func test_reportSendButton_staysAnnouncedWhileSubmitting() throws {
        let src = try source()
        guard let range = src.range(of: "message-detail.report.send") else {
            XCTFail("Expected the report-send localization key")
            return
        }
        // The button's *label content* swaps to a bare ProgressView (no Text)
        // while isSubmittingReport — search a window around the SECOND
        // occurrence (the modifier, not the Text branch) for the state-aware
        // accessibilityLabel that keeps VoiceOver from going silent.
        var searchStart = range.upperBound
        var found = false
        while let next = src.range(of: "message-detail.report.send", range: searchStart..<src.endIndex) {
            let vicinity = String(src[max(src.startIndex, src.index(next.lowerBound, offsetBy: -400, limitedBy: src.startIndex) ?? src.startIndex)..<next.lowerBound])
            if vicinity.contains("accessibilityLabel(isSubmittingReport") {
                found = true
                break
            }
            searchStart = next.upperBound
        }
        XCTAssertTrue(
            found,
            "The report-submit button's label becomes a bare ProgressView (no Text) while " +
            "isSubmittingReport — without a state-aware accessibilityLabel VoiceOver announces " +
            "nothing during submission."
        )
    }

    func test_transcribeButton_staysAnnouncedWhileRequesting() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("accessibilityLabel(isRequestingTranscription"),
            "The transcribe button must expose a state-aware accessibilityLabel covering the " +
            "isRequestingTranscription branch, matching the report-send button's fix."
        )
    }

    // MARK: - Decorative icons hidden from VoiceOver (spot checks)

    func test_gridButtonIcon_isHiddenAndButtonHasExplicitLabel() throws {
        let src = try source()
        guard let range = src.range(of: "Image(systemName: item.icon)") else {
            XCTFail("Expected gridButton's icon")
            return
        }
        let window = String(src[range.lowerBound..<src.index(range.upperBound, offsetBy: 220, limitedBy: src.endIndex)!])
        XCTAssertTrue(window.contains("accessibilityHidden(true)"), "gridButton's icon must be hidden — Text(item.label) already conveys the meaning")
        XCTAssertTrue(src.contains(".accessibilityLabel(item.label)"), "gridButton must carry an explicit accessibilityLabel")
    }

    func test_metaInfoRow_iconHiddenAndRowCombined() throws {
        let src = try source()
        guard let range = src.range(of: "private func metaInfoRow") else {
            XCTFail("Expected metaInfoRow")
            return
        }
        let end = src.index(range.lowerBound, offsetBy: 900, limitedBy: src.endIndex) ?? src.endIndex
        let body = String(src[range.lowerBound..<end])
        XCTAssertTrue(body.contains("accessibilityHidden(true)"), "metaInfoRow's icon must be hidden — Text(label) already names the field")
        XCTAssertTrue(body.contains("accessibilityElement(children: .combine)"), "metaInfoRow must combine label+value into one VoiceOver stop")
    }

    func test_timelineBanner_iconHiddenAndCombined() throws {
        let src = try source()
        guard let range = src.range(of: "private func timelineBanner") else {
            XCTFail("Expected timelineBanner")
            return
        }
        let end = src.index(range.lowerBound, offsetBy: 1600, limitedBy: src.endIndex) ?? src.endIndex
        let body = String(src[range.lowerBound..<end])
        XCTAssertTrue(body.contains("accessibilityHidden(true)"))
        XCTAssertTrue(body.contains("accessibilityElement(children: .combine)"))
    }

    // MARK: - Selection state uses traits, not color alone

    func test_gridButton_usesSelectedTraitForActiveTab() throws {
        let src = try source()
        guard let range = src.range(of: ".buttonStyle(DetailActionButtonStyle())") else {
            XCTFail("Expected gridButton's buttonStyle modifier")
            return
        }
        let window = String(src[range.lowerBound..<src.index(range.upperBound, offsetBy: 450, limitedBy: src.endIndex)!])
        XCTAssertTrue(
            window.contains("accessibilityAddTraits(isActive ? [.isSelected] : [])"),
            "The active tab/action button must signal selection via the VoiceOver trait, mirroring " +
            "viewsFilterCapsule/reactionFilterCapsule/reportTypeRow in this same file."
        )
    }

    // MARK: - Global regression guard

    func test_fileHasExplicitAccessibilityLabels() throws {
        let src = try source()
        let count = src.components(separatedBy: "accessibilityLabel(").count - 1
        XCTAssertGreaterThanOrEqual(
            count, 14,
            "MessageDetailSheet had ZERO explicit accessibilityLabel calls before this fix — " +
            "regression guard against a future refactor silently dropping them."
        )
    }

    func test_fileHidesDecorativeIcons() throws {
        let src = try source()
        let count = src.components(separatedBy: "accessibilityHidden(true)").count - 1
        XCTAssertGreaterThanOrEqual(
            count, 20,
            "Regression guard: decorative Image(systemName:) icons across the file must stay hidden " +
            "from VoiceOver so they don't double-announce alongside their sibling Text."
        )
    }
}
