import XCTest

final class DragHandleAccessibilityGuardTests: XCTestCase {

    private static let dragFiles = [
        "Sources/MeeshyUI/Media/CropOverlayView.swift",
        "Sources/MeeshyUI/Media/AudioEditorWaveform.swift",
        "Sources/MeeshyUI/Story/Timeline/Views/Track/ClipTrimHandles.swift",
        "Sources/MeeshyUI/Story/Timeline/Views/Track/VideoClipBar.swift",
        "Sources/MeeshyUI/Story/Timeline/Views/Track/AudioClipBar.swift",
        "Sources/MeeshyUI/Story/Timeline/Views/Track/TextClipBar.swift",
        "Sources/MeeshyUI/Story/Timeline/Views/Plan2D/Plan2DView.swift",
        "Sources/MeeshyUI/Story/Timeline/Views/Overlay/KeyframeMarkerView.swift",
    ]

    private static let accessibilityMarkers = [
        "accessibilityAdjustableAction", "clipBarAccessibility", "cropAccessibility",
        "Plan2DTrackAccessibilityModifier", "accessibilityAction(named", "accessibilityAction {",
    ]

    func test_everyDragGestureFile_declaresAnAccessibilityAction() throws {
        for path in Self.dragFiles {
            let code = try Self.code(path)
            XCTAssertTrue(code.contains("DragGesture") || path.hasSuffix("Plan2DView.swift"),
                          "\(path) ne porte plus de DragGesture : retirer le fichier de la liste")
            XCTAssertTrue(Self.declaresAccessibilityAction(code),
                          "\(path) : un geste de glisser sans action d'accessibilité")
        }
    }

    func test_guard_detectsADragGestureWithoutAnyAction() {
        let bare = "Color.clear.gesture(DragGesture().onChanged { _ in })"
        XCTAssertFalse(Self.declaresAccessibilityAction(bare))
        XCTAssertTrue(Self.declaresAccessibilityAction(bare + ".accessibilityAdjustableAction { _ in }"))
    }

    func test_guard_ignoresMarkersWrittenInComments() {
        let commented = "// .accessibilityAdjustableAction\nColor.clear.gesture(DragGesture())"
        XCTAssertFalse(Self.declaresAccessibilityAction(Self.stripComments(commented)))
    }

    func test_cropAndWaveform_haveNoLiteral44_andReadTapTarget() throws {
        for path in ["Sources/MeeshyUI/Media/CropOverlayView.swift",
                     "Sources/MeeshyUI/Media/AudioEditorWaveform.swift"] {
            let code = try Self.code(path)
            XCTAssertNil(code.range(of: #"\b44\b"#, options: .regularExpression), "\(path) : littéral 44")
            XCTAssertTrue(code.contains("MeeshyControlSize.tapTarget"), path)
        }
    }

    private static func declaresAccessibilityAction(_ code: String) -> Bool {
        accessibilityMarkers.contains { code.contains($0) }
    }

    private static func stripComments(_ source: String) -> String {
        source.split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }

    private static func code(_ relativePath: String, file: StaticString = #filePath) throws -> String {
        let root = URL(fileURLWithPath: "\(file)")
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let url = root.appendingPathComponent(relativePath)
        let own = url
        let companion = URL(fileURLWithPath: url.deletingPathExtension().path + "+Accessibility.swift")
        let sources = [own, companion].compactMap { try? String(contentsOf: $0, encoding: .utf8) }
        return stripComments(sources.joined(separator: "\n"))
    }
}
