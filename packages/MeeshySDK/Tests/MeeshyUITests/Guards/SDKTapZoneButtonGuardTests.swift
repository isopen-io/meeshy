import XCTest
import Foundation

final class SDKTapZoneButtonGuardTests: XCTestCase {

    private static let sourcesRoot: URL = {
        let tests = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return tests
            .deletingLastPathComponent()
            .appendingPathComponent("Sources")
            .appendingPathComponent("MeeshyUI")
    }()

    private static let convertedSites: [(file: String, action: String)] = [
        ("Profile/UserProfileSheet+ConversationsTab.swift", "openSharedConversation(conv)"),
        ("Story/StoryTextEditTopBar.swift", "onFinish()"),
        ("Story/DrawingEditFloatingBubbles.swift", "onSelectTool(tool)"),
        ("Story/DrawingEditFloatingBubbles.swift", "action()"),
        ("Story/DrawingEditFloatingBubbles.swift", "onDismiss()"),
        ("Community/CommunitySettingsScreen.swift", "viewModel.localColor = hex"),
        ("Community/CommunityListScreen.swift", "onTap()"),
        ("Community/CommunityDetailScreen.swift", "onSelectConversation?(conversation)"),
        ("Primitives/UserIdentityBar.swift", "Button(action: action)"),
        ("Primitives/MoodBadge.swift", "onTap(CGPoint("),
        ("Media/AudioRecorderSheet.swift", "toggleRecording()")
    ]

    private static let exposedGestures: [(file: String, action: String)] = [
        ("Story/Timeline/Views/Track/TransitionBadge.swift", "onTap()"),
        ("Story/Timeline/Views/Track/TransitionCreationBadge.swift", "onCreate()"),
        ("Story/Controls/AudioForegroundChip.swift", "onTap"),
        ("Story/Controls/ComposerControlsLayer.swift", "restoreChrome()"),
        ("Story/TextEditFloatingBubbles.swift", "cycle(tool)"),
        ("Primitives/MeeshyAvatar.swift", "performTap"),
        ("Primitives/UserIdentityBar.swift", "onTap?(code)"),
        ("Location/LocationMessageView.swift", "onTapFullscreen?()"),
        ("Media/MeeshyVideoThumbnail.swift", "onTap?()"),
        ("Media/ImageViewerView.swift", "openFullscreen()")
    ]

    private static let newLabelKeys = [
        "community.settings.color.swatch.a11y",
        "media.image.open.a11y",
        "userIdentity.language.show.a11y",
        "story.timeline.transition.select.a11y"
    ]

    private static let catalogLanguages = ["fr", "en", "es", "de", "it", "ar", "pt-BR"]

    private static func lines(of relativePath: String) -> [String]? {
        let url = sourcesRoot.appendingPathComponent(relativePath)
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return text.components(separatedBy: "\n")
    }

    private static func actionLineIndices(_ action: String, in lines: [String]) -> [Int] {
        lines.indices.filter { index in
            let line = lines[index].trimmingCharacters(in: .whitespaces)
            guard !line.hasPrefix("//"), !line.contains("func ") else { return false }
            return line.contains(action)
        }
    }

    enum Invoker: Equatable {
        case button
        case gesture
        case none
    }

    static func invoker(above index: Int, in lines: [String]) -> Invoker {
        let lowest = max(0, index - 8)
        for position in stride(from: index, through: lowest, by: -1) {
            let line = lines[position]
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("//") { continue }
            if line.contains(".onTapGesture") { return .gesture }
            if line.contains("Button {") || line.contains("Button(action:") { return .button }
        }
        return .none
    }

    private static func gestureIndices(in lines: [String]) -> [Int] {
        lines.indices.filter { index in
            let line = lines[index].trimmingCharacters(in: .whitespaces)
            return !line.hasPrefix("//") && line.contains(".onTapGesture")
        }
    }

    static func isExposed(gestureAt index: Int, in lines: [String]) -> Bool {
        let nextGesture = gestureIndices(in: lines).first { $0 > index } ?? lines.count
        let upper = min(index + 20, nextGesture - 1, lines.count - 1)
        guard upper >= index else { return false }
        let window = lines[index...upper].joined(separator: "\n")
        if window.contains("CycleButtonAccessibility(") { return true }
        let hasTrait = window.contains(".accessibilityAddTraits(") && window.contains("isButton")
        return hasTrait && window.contains(".accessibilityAction")
    }

    private static func gesturesInvoking(_ action: String, in lines: [String]) -> [Int] {
        gestureIndices(in: lines).filter { gesture in
            let nextGesture = gestureIndices(in: lines).first { $0 > gesture } ?? lines.count
            let upper = min(gesture + 6, nextGesture - 1, lines.count - 1)
            guard upper >= gesture else { return false }
            return lines[gesture...upper].contains { $0.contains(action) && !$0.contains("func ") }
        }
    }

    func test_uneZoneTouchableConvertieDuSDKEstUnBoutonAuSurvolPointeur() {
        for site in Self.convertedSites {
            guard let lines = Self.lines(of: site.file) else {
                XCTFail("\(site.file) est introuvable")
                continue
            }
            let indices = Self.actionLineIndices(site.action, in: lines)
            XCTAssertFalse(indices.isEmpty, "\(site.file) n'invoque plus \(site.action)")
            let invokers = indices.map { Self.invoker(above: $0, in: lines) }
            XCTAssertFalse(invokers.contains(.gesture),
                           "\(site.file) invoque encore \(site.action) sous un .onTapGesture")
            XCTAssertTrue(invokers.contains(.button),
                          "\(site.file) n'invoque pas \(site.action) sous un Button")
            XCTAssertTrue(lines.joined(separator: "\n").contains("MeeshyPointerPlainButtonStyle("),
                          "\(site.file) ne pose pas MeeshyPointerPlainButtonStyle")
        }
    }

    func test_unGesteGardeDuSDKSeDeclareBoutonAVoiceOver() {
        for site in Self.exposedGestures {
            guard let lines = Self.lines(of: site.file) else {
                XCTFail("\(site.file) est introuvable")
                continue
            }
            let gestures = Self.gesturesInvoking(site.action, in: lines)
            XCTAssertFalse(gestures.isEmpty, "\(site.file) : aucun .onTapGesture n'invoque \(site.action)")
            for gesture in gestures {
                XCTAssertTrue(Self.isExposed(gestureAt: gesture, in: lines),
                              "\(site.file):\(gesture + 1) : le geste \(site.action) n'est ni trait bouton ni action VoiceOver")
            }
        }
    }

    func test_unCurseurDeClipSeDeclareBouton() {
        let lines = Self.lines(of: "Story/Timeline/Views/Track/ClipBarAccessibility.swift") ?? []
        let text = lines.joined(separator: "\n")
        XCTAssertTrue(text.contains(".accessibilityAddTraits(.isButton)"))
        XCTAssertTrue(text.contains(".accessibilityAction { callbacks.onTap() }"))
    }

    func test_lesCyclesDuTexteOntUneActionParDefaut() {
        let text = (Self.lines(of: "Story/StoryTextEditTopBar.swift") ?? []).joined(separator: "\n")
        XCTAssertTrue(text.contains("let onActivate: () -> Void"))
        XCTAssertTrue(text.contains(".accessibilityAction { onActivate() }"))
    }

    func test_aucuneActionDAccessibiliteNePorteLeLibellePerform() throws {
        let root = Self.sourcesRoot
        let files = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
        let offenders = files.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .filter { (try? String(contentsOf: $0, encoding: .utf8))?.contains(".accessibilityAction(perform:") == true }
            .map(\.lastPathComponent)
        XCTAssertEqual(offenders, [])
    }

    /// Xcode 27 ne résout plus `.accessibilityAction(handler)` (référence de fonction passée en position) :
    /// « missing argument for parameter 'named' ». La fermeture de queue compile sous Xcode 26.1 ET 27.
    func test_aucuneActionDAccessibiliteNePasseUneReferenceDeFonctionEnPosition() throws {
        let root = Self.sourcesRoot
        let files = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
        let positional = try NSRegularExpression(pattern: #"\.accessibilityAction\([A-Za-z_][A-Za-z0-9_.]*\)"#)
        let offenders = files.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .filter { url in
                guard let text = try? String(contentsOf: url, encoding: .utf8) else { return false }
                return positional.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
            }
            .map(\.lastPathComponent)
        XCTAssertEqual(offenders, [])
    }

    func test_leScannerDistingueUnBoutonDUnGesteNu() {
        let button = ["Button {", "    onTap()", "}"]
        let gesture = ["Text(\"x\")", ".onTapGesture {", "    onTap()", "}"]
        let exposed = [".onTapGesture { onTap() }", ".accessibilityAddTraits(.isButton)", ".accessibilityAction { onTap() }"]
        let bare = [".onTapGesture { onTap() }", ".accessibilityLabel(\"x\")"]
        XCTAssertEqual(Self.invoker(above: 1, in: button), .button)
        XCTAssertEqual(Self.invoker(above: 2, in: gesture), .gesture)
        XCTAssertTrue(Self.isExposed(gestureAt: 0, in: exposed))
        XCTAssertFalse(Self.isExposed(gestureAt: 0, in: bare))
    }

    func test_lesLibellesNeufsSontTraduitsDansLesSeptLangues() throws {
        let url = Self.sourcesRoot
            .appendingPathComponent("Resources")
            .appendingPathComponent("Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        for key in Self.newLabelKeys {
            let entry = strings[key] as? [String: Any]
            XCTAssertNotNil(entry, "clé absente : \(key)")
            let localizations = entry?["localizations"] as? [String: Any] ?? [:]
            for language in Self.catalogLanguages {
                let unit = (localizations[language] as? [String: Any])?["stringUnit"] as? [String: Any]
                let value = unit?["value"] as? String ?? ""
                XCTAssertFalse(value.isEmpty, "\(key) n'a pas de valeur en \(language)")
            }
        }
    }

    func test_leStyleSurvolNeChangePasLeRenduALaPression() {
        guard let lines = Self.lines(of: "Primitives/PointerPlainButtonStyle.swift") else {
            XCTFail("Primitives/PointerPlainButtonStyle.swift est introuvable")
            return
        }
        let text = lines.joined(separator: "\n")
        XCTAssertTrue(text.contains("meeshyPointerInteractive(shape:"))
        XCTAssertFalse(text.contains("isPressed"))
        XCTAssertFalse(text.contains("opacity"))
        XCTAssertFalse(text.contains("scaleEffect"))
    }
}
