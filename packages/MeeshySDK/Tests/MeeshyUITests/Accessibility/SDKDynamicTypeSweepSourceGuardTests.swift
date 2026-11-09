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
        "Media/MeeshyAudioEditorView.swift"
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
            marker: ".font(.system(size: 11, weight: .medium, design: .monospaced))")
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

    private static let fixedFontCeiling = 252

    func test_scaledPointSize_atDefaultDynamicType_returnsTheExactBaseSize() {
        for size in [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 34] as [CGFloat] {
            XCTAssertEqual(MeeshyFont.scaledPointSize(size, at: .large), size, accuracy: 0.01)
        }
    }

    func test_scaledPointSize_growsWithAccessibilitySizes_andShrinksAtXSmall() {
        XCTAssertGreaterThan(MeeshyFont.scaledPointSize(14, at: .accessibility3), 14)
        XCTAssertLessThan(MeeshyFont.scaledPointSize(14, at: .xSmall), 14)
        let sizes = DynamicTypeSize.allCases.map { MeeshyFont.scaledPointSize(14, at: $0) }
        XCTAssertEqual(sizes, sizes.sorted())
    }

    func test_dynamicTypeSize_mapsEveryCaseToItsContentSizeCategory() {
        let expected: [DynamicTypeSize: UIContentSizeCategory] = [
            .xSmall: .extraSmall, .small: .small, .medium: .medium, .large: .large,
            .xLarge: .extraLarge, .xxLarge: .extraExtraLarge, .xxxLarge: .extraExtraExtraLarge,
            .accessibility1: .accessibilityMedium, .accessibility2: .accessibilityLarge,
            .accessibility3: .accessibilityExtraLarge, .accessibility4: .accessibilityExtraExtraLarge,
            .accessibility5: .accessibilityExtraExtraExtraLarge
        ]
        XCTAssertEqual(expected.count, DynamicTypeSize.allCases.count)
        for (size, category) in expected {
            XCTAssertEqual(MeeshyFont.contentSizeCategory(size), category)
        }
    }

    func test_meeshyUI_fixedFontCount_staysUnderCeiling() throws {
        let regex = try NSRegularExpression(pattern: #"\.font\(\.system\(size:"#)
        let total = try MeeshyUISourceScan.allSources().reduce(0) { sum, source in
            sum + regex.numberOfMatches(in: source.text, range: NSRange(source.text.startIndex..., in: source.text))
        }
        XCTAssertLessThanOrEqual(total, Self.fixedFontCeiling, "Police figée : \(total) sites, plafond \(Self.fixedFontCeiling)")
    }

    func test_meeshyUI_textFixedFont_staysWithinPerFileCeilings() throws {
        var offenders: [String] = []
        for source in try MeeshyUISourceScan.allSources() {
            let lines = source.text.components(separatedBy: "\n")
            let count = lines.indices.reduce(0) { sum, index in
                sum + Self.fontSites(in: lines[index]).filter { site in
                    let receiver = Self.receiver(lines: lines, index: index, prefix: site.prefix)
                    return Self.textReceiverPrefixes.contains { receiver.hasPrefix($0) }
                }.count
            }
            if count > (Self.textCeilings[source.path] ?? 0) {
                offenders.append("\(source.path) : \(count)")
            }
        }
        XCTAssertEqual(offenders, [], "Texte en police figée : utiliser MeeshyFont.relative ou meeshyScaledFont")
    }

    private static let textCeilings: [String: Int] = [
        "Community/CommunityCreateScreen.swift": 1,
        "Community/CommunityEmojiMark.swift": 1,
        "Community/CommunitySettingsScreen.swift": 1,
        "Game/GameBadgeView.swift": 1,
        "Game/GameLeagueBricks.swift": 1,
        "Game/GameMedalView.swift": 2,
        "Game/GameReferralBannerView.swift": 2,
        "Game/LevelRingView.swift": 1,
        "Game/MeeshCoinFaces.swift": 2,
        "Game/RankBlasonView.swift": 1,
        "Game/TrophyView.swift": 1,
        "Media/AudioPlayerChips.swift": 2,
        "Media/MediaTranscriptionView.swift": 1,
        "Media/MeeshyVideoPlayer+InlineRenderer.swift": 2,
        "Navigation/CollapsibleHeader.swift": 2,
        "Primitives/AvatarInitialsFace.swift": 1,
        "Primitives/CachedAsyncImage.swift": 1,
        "Primitives/EmojiReactionPicker.swift": 6,
        "Primitives/LanguagePickerSheet.swift": 2,
        "Primitives/ProfileCompletionRing.swift": 1,
        "Primitives/UserIdentityBar.swift": 1,
        "Profile/UserProfileSheet.swift": 1,
        "Story/SlideMiniPreview.swift": 3,
        "Story/StickerPickerView+Emoji.swift": 1,
        "Story/StickerPickerView+Packs.swift": 1,
        "Story/StickerPickerView+Vertical.swift": 1,
        "Story/StickerSheetTabBar.swift": 1,
        "Story/StoryCanvasGuides.swift": 2,
        "Story/StoryFilterGridView.swift": 1,
        "Story/TextEditToolOptionsGrid.swift": 1,
        "Story/Timeline/Views/Overlay/RulerView.swift": 1,
        "Story/Timeline/Views/Overlay/SnapGuideView.swift": 1
    ]

    private static let featuresMainFixedFontCeiling = 88

    private struct MainSite {
        let file: String
        let receiver: String
        let scaled: String
    }

    private static let featuresMainMigratedSites: [MainSite] = [
        MainSite(file: "Components/MemberManagementSection.swift", receiver: "Image(systemName: \"person.slash\")", scaled: ".meeshyScaledFont(MeeshyIconSize.xxxl, weight: .light)"),
        MainSite(file: "Components/MessageDetail/MessageDetailChrome.swift", receiver: "Image(systemName: icon)", scaled: ".meeshyScaledFont(MeeshyIconSize.xxxl, weight: .light)"),
        MainSite(file: "Components/MessageDetail/MessageReactionsDetailView.swift", receiver: "Image(systemName: \"face.smiling\")", scaled: ".meeshyScaledFont(MeeshyIconSize.xxxl, weight: .light)"),
        MainSite(file: "Components/MessageDetail/MessageTranscriptionDetailView.swift", receiver: "Image(systemName: \"text.word.spacing\")", scaled: ".meeshyScaledFont(MeeshyIconSize.xxxl, weight: .light)"),
        MainSite(file: "Views/ConversationMediaGalleryView+Pages.swift", receiver: "Image(systemName: \"photo\")", scaled: ".meeshyScaledFont(MeeshyIconSize.hero)"),
        MainSite(file: "Components/ConversationLockSheet.swift", receiver: "Image(systemName: iconName)", scaled: ".meeshyScaledFont(44)")
    ]

    private static let featuresMainFixedSentinels: [FixedGlyph] = [
        FixedGlyph(file: "Components/ConversationLockSheet.swift", receiver: "Text(\"\\(digit)\")", marker: ".font(.system(size: 26"),
        FixedGlyph(file: "Components/MemberManagementSection.swift", receiver: "Image(", marker: ".font(.system(size: 13, weight: .semibold))")
    ]

    private static func mainSources() throws -> [MeeshyUISourceScan.Source] {
        try MeeshyUISourceScan.sources(under: MeeshyUISourceScan.appFeaturesMainRoot)
    }

    func test_featuresMain_fixedFont_staysUnderCeiling() throws {
        let regex = try NSRegularExpression(pattern: #"\.font\(\.system\(size:"#)
        let sources = try Self.mainSources()
        XCTAssertGreaterThan(sources.count, 900)
        let total = sources.reduce(0) { sum, source in
            sum + regex.numberOfMatches(in: source.text, range: NSRange(source.text.startIndex..., in: source.text))
        }
        XCTAssertLessThanOrEqual(total, Self.featuresMainFixedFontCeiling, "Police figée dans Features/Main : \(total) sites")
    }

    func test_featuresMain_migratedSites_scaleWithDynamicType() throws {
        let sources = try Self.mainSources()
        for site in Self.featuresMainMigratedSites {
            let text = try XCTUnwrap(sources.first { $0.path == site.file }?.text, "\(site.file) introuvable")
            let tails = Self.ranges(of: site.receiver, in: text).map { String(text[$0.upperBound...].prefix(160)) }
            XCTAssertFalse(tails.isEmpty, "\(site.file) : \(site.receiver) introuvable")
            XCTAssertTrue(tails.contains { $0.contains(site.scaled) }, "\(site.file) : \(site.receiver) ne suit plus Dynamic Type")
            XCTAssertFalse(
                tails.contains { $0.prefix(80).contains(".font(.system(size:") },
                "\(site.file) : \(site.receiver) a retrouvé une police figée")
        }
    }

    func test_featuresMain_fixedGlyphsStayFixed() throws {
        let sources = try Self.mainSources()
        for glyph in Self.featuresMainFixedSentinels {
            let text = try XCTUnwrap(sources.first { $0.path == glyph.file }?.text, "\(glyph.file) introuvable")
            XCTAssertTrue(text.contains(glyph.marker), "\(glyph.file) : le marqueur figé \(glyph.marker) a disparu")
        }
    }
}
