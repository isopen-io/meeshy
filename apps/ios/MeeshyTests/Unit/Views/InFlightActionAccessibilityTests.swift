import XCTest
@testable import Meeshy

/// Iteration 221i — closes the family 220i opened on a single surface.
///
/// A confirmation button written as
///
/// ```swift
/// Button { … } label: {
///     if isSaving { ProgressView() } else { Text("Publier") }
/// }
/// ```
///
/// **loses its accessible name** the moment the action starts: the `Text` that
/// supplied the name is gone, and a bare `ProgressView` contributes none. The user
/// is left with an unnamed control at precisely the moment they want to know what
/// is happening.
///
/// Note the shape this suite does *not* treat as a defect — `HStack { if flag {
/// ProgressView() }; Text(…) }`, where the text stays put and the name survives, and
/// `Text(flag ? "…en cours" : "…")`, where the visible text already states the
/// state. Seven such sites exist and are deliberately out of scope; only the four
/// sites whose name actually vanishes are converged here.
///
/// The rule now lives in one modifier rather than in N copies, and the sweep below
/// is what keeps a fifth copy from appearing.
@MainActor
final class InFlightActionAccessibilityTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private static let modifier = "Meeshy/Features/Main/Views/Modifiers/InFlightActionAccessibility.swift"
    private static let catalog = "Meeshy/Localizable.xcstrings"
    private static let sharedKey = "a11y.action.in-progress"

    /// The eight converged sites, each passing the wording of its own **visible** text
    /// — a catalogue key for seven of them, and the `title` parameter for the reusable
    /// onboarding button, whose label is supplied by its caller.
    private static let convergedSites: [(path: String, label: String, flag: String)] = [
        ("Meeshy/Features/Main/Views/MagicLinkView.swift", "auth.magiclink.send", "isLoading"),
        ("Meeshy/Features/Main/Components/EditPostSheet.swift", "feed.post.edit.publish", "isSaving"),
        ("Meeshy/Features/Main/Components/ReportMessageSheet.swift", "report.message.send", "isSubmitting"),
        ("Meeshy/Features/Main/Views/FeedView+Attachments.swift", "feed.post.composer.publish", "isUploading"),
        ("Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift", "title", "isLoading"),
        ("Meeshy/Features/Main/Components/ConversationEncryptionDetailSheet.swift", "conversation.encryption.detail.activate", "isEnabling"),
        ("Meeshy/Features/Main/Components/MessageDetail/MessageReportDetailView.swift", "message-detail.report.send", "isSubmittingReport"),
        ("Meeshy/Features/Main/Views/NewConversationView.swift", "Creer", "viewModel.isCreating"),
    ]

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.appRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    /// Source with comment-only lines dropped, so asserting the *absence* of a shape
    /// is not defeated by a comment that documents that very shape — this file's own
    /// doc-comment quotes the defective pattern verbatim, and so does the modifier's.
    private func code(_ relativePath: String) throws -> String {
        try source(relativePath)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    /// Same, but comment-only lines are **blanked rather than dropped**, so the line
    /// numbers a failure reports still point at the real source.
    private func blankedCode(_ relativePath: String) throws -> [String] {
        try source(relativePath)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespaces).hasPrefix("//") ? "" : String($0) }
    }

    // MARK: - The modifier states the rule once

    func test_modifier_pinsTheNameAndOnlySpeaksTheValueInFlight() throws {
        let src = try code(Self.modifier)

        XCTAssertTrue(
            src.contains("accessibilityLabel(label)"),
            "The accessible name must be pinned unconditionally — that is the whole point: it has to " +
            "survive the label swapping to a ProgressView."
        )
        XCTAssertTrue(
            src.contains("isInFlight") && src.contains(".accessibilityValue("),
            "Transient states must ride on the value, leaving the name stable across states."
        )
        XCTAssertTrue(
            src.contains("inFlightValue ??") && src.contains(Self.sharedKey),
            "A surface with better words must be able to override the in-flight wording, falling back " +
            "to the shared key otherwise."
        )
        XCTAssertTrue(
            src.contains("unavailableReason ??"),
            "A disabled button whose reason is not otherwise perceivable must be able to state it, and " +
            "an operable one must fall back to an empty value rather than inventing one."
        )
    }

    // MARK: - Every converged site uses its own visible wording

    func test_convergedSites_adoptTheModifierWithTheirVisibleLabel() throws {
        for site in Self.convergedSites {
            let src = try source(site.path)

            XCTAssertTrue(
                src.contains(".inFlightActionAccessibility("),
                "\(site.path) must adopt the shared modifier rather than re-stating the rule inline."
            )

            let call = try XCTUnwrap(
                src.range(of: ".inFlightActionAccessibility("),
                "\(site.path) has no modifier call to anchor against"
            )
            let window = String(src[call.lowerBound...].prefix(400))

            XCTAssertTrue(
                window.contains(site.label),
                "\(site.path) must pass the wording of its own visible text (\(site.label)) so the " +
                "accessible name contains the displayed label — WCAG 2.5.3 Label in Name."
            )
            XCTAssertTrue(
                window.contains("isInFlight: \(site.flag)"),
                "\(site.path) must drive the modifier from \(site.flag) — the same flag that swaps its " +
                "label to a ProgressView."
            )
        }
    }

    // MARK: - StatusComposerView keeps its own wording through the shared modifier

    func test_statusComposer_usesTheModifierWithoutLosingItsWording() throws {
        let src = try source("Meeshy/Features/Main/Views/StatusComposerView.swift")

        XCTAssertTrue(
            src.contains(".inFlightActionAccessibility("),
            "The surface that established the doctrine in 220i must go through the shared modifier too, " +
            "otherwise two implementations of one rule coexist."
        )
        for key in ["status.composer.publish",
                    "status.composer.a11y.publish.publishing",
                    "status.composer.a11y.publish.disabled",
                    "status.composer.a11y.publish.hint"] {
            XCTAssertTrue(
                src.contains(key),
                "Adopting the shared modifier must not cost \(key): the override parameters exist so a " +
                "surface with better words keeps them."
            )
        }
    }

    // MARK: - No fifth copy of the defect

    /// Index of the line closing the block whose `{` sits at `lines[line][column]`.
    private func closingLine(of lines: [String], line: Int, column: String.Index) -> Int {
        var depth = 0
        for index in line..<lines.count {
            let row = Array(lines[index])
            let start = index == line ? lines[index].distance(from: lines[index].startIndex, to: column) : 0
            for position in start..<row.count {
                if row[position] == "{" { depth += 1 }
                else if row[position] == "}" {
                    depth -= 1
                    if depth == 0 { return index }
                }
            }
        }
        return lines.count - 1
    }

    func test_noButtonSwapsItsTextForASpinnerWithoutAName() throws {
        let root = Self.appRoot.appendingPathComponent("Meeshy")
        let walker = try XCTUnwrap(FileManager.default.enumerator(atPath: root.path))

        var offenders: [String] = []
        for case let relativePath as String in walker where relativePath.hasSuffix(".swift") {
            let lines = try blankedCode("Meeshy/" + relativePath)

            for (index, line) in lines.enumerated() {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                guard trimmed.hasPrefix("if "), trimmed.hasSuffix("{"),
                      let ifBrace = line.lastIndex(of: "{") else { continue }

                // The defective shape, scoped to the two branches rather than to a line
                // window: a ProgressView alone on the `if` side, and the Text — hence the
                // accessible name — only on the `else` side. When the Text sits beside the
                // spinner, or after the whole if/else, the name never disappears and the
                // site is correctly not reported.
                let elseLine = closingLine(of: lines, line: index, column: ifBrace)
                let thenBody = lines[(index + 1)..<max(index + 1, elseLine)]
                guard thenBody.contains(where: { $0.contains("ProgressView(") }),
                      !thenBody.contains(where: { $0.contains("Text(") }) else { continue }

                let elseRow = lines[elseLine]
                guard elseRow.contains("else"),
                      elseRow.trimmingCharacters(in: .whitespaces).hasSuffix("{"),
                      let elseBrace = elseRow.lastIndex(of: "{") else { continue }
                let elseEnd = closingLine(of: lines, line: elseLine, column: elseBrace)
                guard lines[(elseLine + 1)..<max(elseLine + 1, elseEnd)].contains(where: { $0.contains("Text(") })
                else { continue }

                // Only button labels lose a name this way; a view-level loading state does not.
                let preceding = lines[max(0, index - 10)..<index]
                guard preceding.contains(where: {
                    $0.contains("label: {") || $0.contains("Button(action:") || $0.contains("Button {")
                }) else { continue }

                // The naming modifier lives on the Button's chain, past the label closure.
                let chain = lines[elseEnd..<min(elseEnd + 60, lines.count)].joined(separator: "\n")
                let named = chain.contains("inFlightActionAccessibility") || chain.contains(".accessibilityLabel(")
                if !named { offenders.append("Meeshy/\(relativePath):\(index + 1)") }
            }
        }

        XCTAssertEqual(
            offenders.sorted(), [],
            "These buttons swap their Text for a ProgressView and so lose their accessible name while " +
            "the action runs. Apply .inFlightActionAccessibility(_:isInFlight:) — passing the wording of " +
            "the button's own visible text — instead of leaving the control unnamed."
        )
    }

    // MARK: - The shared string is really localized

    func test_sharedInProgressKey_isTranslatedInEveryShippedLocale() throws {
        let data = try Data(contentsOf: Self.appRoot.appendingPathComponent(Self.catalog))
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        let entry = try XCTUnwrap(
            strings[Self.sharedKey] as? [String: Any],
            "\(Self.sharedKey) is missing from Localizable.xcstrings. It is the default wording for " +
            "every in-flight CTA in the app, so it must not fall back to French for six locales."
        )
        let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])

        for locale in ["ar", "de", "en", "es", "fr", "it", "pt-BR"] {
            let unit = try XCTUnwrap(
                (localizations[locale] as? [String: Any])?["stringUnit"] as? [String: Any],
                "\(Self.sharedKey) is missing the \(locale) localization"
            )
            XCTAssertEqual(unit["state"] as? String, "translated", "\(Self.sharedKey) not translated in \(locale)")
            XCTAssertFalse(((unit["value"] as? String) ?? "").isEmpty, "\(Self.sharedKey) empty in \(locale)")
        }
    }
}
