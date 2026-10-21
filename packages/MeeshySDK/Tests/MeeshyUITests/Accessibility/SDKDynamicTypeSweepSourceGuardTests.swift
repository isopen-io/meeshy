import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

final class SDKDynamicTypeSweepSourceGuardTests: XCTestCase {

    private struct FontSite {
        let prefix: String
        let size: Double?
    }

    private struct FixedGlyph {
        let file: String
        let receiver: String
        let marker: String
    }

    private static let migratedFiles: [String] = [
        "Community/CommunityCreateScreen.swift",
        "Community/CommunitySettingsScreen.swift",
        "Community/CommunityDetailScreen.swift",
        "Community/CommunityInviteScreen.swift",
        "Community/CommunityAddChannelScreen.swift",
        "Community/CommunityMembersScreen.swift",
        "Community/CommunityListScreen.swift",
        "Conversation/ConversationSettingsView.swift",
        "VoiceProfile/VoiceProfileWizardView.swift",
        "VoiceProfile/VoiceProfileManageView.swift",
        "VoiceProfile/VoiceRecordingView.swift",
        "Profile/ConnectionActionView.swift",
        "Profile/UserProfileSheet.swift",
        "Profile/UserProfileSheet+DetailsTab.swift",
        "Profile/UserProfileSheet+PostsTab.swift",
        "Notifications/NotificationListScreen.swift",
        "Primitives/LanguagePickerSheet.swift",
        "Primitives/TagInputView.swift",
        "Primitives/StatsCard.swift",
        "Primitives/ErrorBannerView.swift",
        "Primitives/FeedbackToastView.swift",
        "Packs/PackShopView.swift",
        "Packs/FramePackShelfView.swift",
        "Location/LocationFullscreenView.swift",
        "Media/DocumentViewerView.swift",
        "Media/CodeViewerView.swift",
        "Media/AudioRecorderSheet.swift",
        "Media/UniversalAudioRecorderView.swift",
        "Media/AudioEditorToolPanel.swift",
        "Media/MeeshyAudioEditorView.swift",
        "Media/MeeshyImageEditorView.swift",
        "Media/ImageEditorHistoryOverlay.swift"
    ]

    private static let fixedGlyphs: [FixedGlyph] = [
        FixedGlyph(
            file: "Community/CommunityCreateScreen.swift",
            receiver: "Text(emoji)",
            marker: ".font(.system(size: MeeshyFont.displaySize))"),
        FixedGlyph(
            file: "Community/CommunitySettingsScreen.swift",
            receiver: "TextField(\"🏘️\"",
            marker: ".font(.system(size: 22))"),
        FixedGlyph(
            file: "Primitives/LanguagePickerSheet.swift",
            receiver: "Text(lang.flag)",
            marker: ".font(.system(size: MeeshyFont.displaySize))"),
        FixedGlyph(
            file: "Media/CodeViewerView.swift",
            receiver: "Text(\"\\(index + 1)\")",
            marker: ".font(.system(size: 11, weight: .medium, design: .monospaced))"),
        FixedGlyph(
            file: "Media/ImageEditorHistoryOverlay.swift",
            receiver: "Text(\"\\(index)\")",
            marker: ".font(.system(size: MeeshyFont.smallSize, weight: .bold))")
    ]

    private static let exactSizes: Set<Double> = [11, 12, 13, 15, 16, 17, 20, 22, 28, 34]

    private static let tokenSizes: [String: Double] = [
        "microSize": 9, "captionSize": 10, "footnoteSize": 11, "smallSize": 12,
        "subheadSize": 13, "labelSize": 14, "bodySize": 15, "calloutSize": 16,
        "headlineSize": 17, "subtitleSize": 18, "title3Size": 20, "titleSize": 22,
        "displaySize": 28, "largeTitleSize": 34
    ]

    private static let textReceiverPrefixes = ["Text(", "TextField(", "SecureField(", "Label("]

    func test_migratedFiles_haveNoFixedFontOnExactSizeText() throws {
        var offenders: [String] = []
        for file in Self.migratedFiles {
            let lines = try Self.source(file).components(separatedBy: "\n")
            for (index, line) in lines.enumerated() {
                for site in Self.fontSites(in: line) {
                    let receiver = Self.receiver(lines: lines, index: index, prefix: site.prefix)
                    guard Self.textReceiverPrefixes.contains(where: { receiver.hasPrefix($0) }),
                          let size = site.size,
                          Self.exactSizes.contains(size),
                          !Self.isFixedGlyph(file: file, receiver: receiver) else { continue }
                    offenders.append("\(file):\(index + 1)")
                }
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            "Texte de taille exacte encore figé (utiliser MeeshyFont.relative) : \(offenders.joined(separator: ", "))")
    }

    func test_fixedGlyphSites_stayFixed() throws {
        for glyph in Self.fixedGlyphs {
            let code = try Self.source(glyph.file)
            XCTAssertEqual(
                code.components(separatedBy: glyph.marker).count - 1, 1,
                "\(glyph.file) doit garder \(glyph.marker) exactement une fois")
            let tails = Self.ranges(of: glyph.receiver, in: code).map { String(code[$0.upperBound...].prefix(160)) }
            XCTAssertFalse(tails.isEmpty, "\(glyph.file) : \(glyph.receiver) introuvable")
            XCTAssertTrue(
                tails.contains { $0.contains(glyph.marker) },
                "\(glyph.file) : la police figée ne suit plus \(glyph.receiver)")
        }
    }

    func test_exactSizes_mapToTextStyleOfSamePointSizeAtDefaultDynamicType() {
        let traits = UITraitCollection(preferredContentSizeCategory: .large)
        for size in Self.exactSizes {
            let style = Self.uiTextStyle(MeeshyFont.textStyle(for: CGFloat(size)))
            let resolved = UIFont.preferredFont(forTextStyle: style, compatibleWith: traits).pointSize
            XCTAssertEqual(Double(resolved), size, accuracy: 0.01, "\(size) pt ne tombe pas sur son style de texte")
        }
    }

    private static func ranges(of needle: String, in text: String) -> [Range<String.Index>] {
        var found: [Range<String.Index>] = []
        var start = text.startIndex
        while let range = text.range(of: needle, range: start..<text.endIndex) {
            found.append(range)
            start = range.upperBound
        }
        return found
    }

    private static func uiTextStyle(_ style: Font.TextStyle) -> UIFont.TextStyle {
        switch style {
        case .largeTitle: return .largeTitle
        case .title: return .title1
        case .title2: return .title2
        case .title3: return .title3
        case .headline: return .headline
        case .subheadline: return .subheadline
        case .callout: return .callout
        case .footnote: return .footnote
        case .caption: return .caption1
        case .caption2: return .caption2
        default: return .body
        }
    }

    private static func source(_ relativePath: String) throws -> String {
        let url = ComposerSourceGuard.packageRoot
            .appendingPathComponent("Sources/MeeshyUI")
            .appendingPathComponent(relativePath)
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private static func fontSites(in line: String) -> [FontSite] {
        guard let regex = try? NSRegularExpression(pattern: #"\.font\(\.system\(size:\s*([^,)]+)"#) else { return [] }
        let whole = NSRange(line.startIndex..., in: line)
        return regex.matches(in: line, range: whole).compactMap { match in
            guard let full = Range(match.range, in: line),
                  let token = Range(match.range(at: 1), in: line) else { return nil }
            return FontSite(prefix: String(line[..<full.lowerBound]), size: resolve(String(line[token])))
        }
    }

    private static func resolve(_ token: String) -> Double? {
        let trimmed = token.trimmingCharacters(in: .whitespaces)
        let name = trimmed.replacingOccurrences(of: "MeeshyFont.", with: "")
        return tokenSizes[name] ?? Double(trimmed)
    }

    private static func receiver(lines: [String], index: Int, prefix: String) -> String {
        let head = prefix.trimmingCharacters(in: .whitespaces)
        if !head.isEmpty && !head.hasPrefix(".") { return head }
        var cursor = index - 1
        while cursor >= 0 {
            let candidate = lines[cursor].trimmingCharacters(in: .whitespaces)
            if candidate.hasPrefix(".") {
                cursor -= 1
                continue
            }
            return candidate
        }
        return ""
    }

    private static func isFixedGlyph(file: String, receiver: String) -> Bool {
        fixedGlyphs.contains { $0.file == file && receiver.contains($0.receiver) }
    }
}
