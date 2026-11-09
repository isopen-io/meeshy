import XCTest

final class MeeshyUICompletionSweepSourceGuardTests: XCTestCase {

    private static let lockFree: [String] = [
        "Story/MeeStickerCatalog.swift",
        "Story/Timeline/Util/ImageStill.swift",
        "Story/Canvas/StoryStickerRasterizer.swift",
        "Story/StoryFilterProcessor.swift",
        "Story/StoryFilterThumbnails.swift",
        "Lottie/LottieLayerSource.swift",
        "Media/ImageAdjustmentStage.swift",
        "Story/StoryComposerViewModel.swift",
        "Story/Timeline/Engine/StoryTimelineEngine.swift",
        "Story/Canvas/StoryReaderTimerController.swift",
        "Story/Canvas/Layers/StoryTextLayer.swift",
        "Story/Canvas/Layers/StoryLocationLayer.swift",
        "Media/AttachmentStatusReporter.swift",
        "Navigation/ScrollOffsetPreferenceKey.swift",
    ]

    private static let sinkFree: [String] = [
        "Story/Controls/SoundLibraryPickerModel.swift",
        "Settings/SelectiveCachePurgeView.swift",
    ]

    private static let afterFree: [String] = [
        "Story/StoryMediaLoader.swift",
        "Community/CommunityListScreen.swift",
        "Primitives/MeeshyAvatar.swift",
        "Primitives/ErrorBannerView.swift",
        "Primitives/EmojiReactionPicker.swift",
    ]

    private static var sources: URL {
        ComposerSourceGuard.packageRoot.appendingPathComponent("Sources/MeeshyUI")
    }

    private func code(_ relativePath: String) throws -> String {
        let url = Self.sources.appendingPathComponent(relativePath)
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func sinkBodies(in code: String) -> [String] {
        var bodies: [String] = []
        var cursor = code.startIndex
        while let hit = code.range(of: ".sink", range: cursor..<code.endIndex),
              let open = code[hit.upperBound...].firstIndex(of: "{") {
            var depth = 0
            var end = open
            for index in code[open...].indices {
                if code[index] == "{" { depth += 1 }
                if code[index] == "}" { depth -= 1 }
                if depth == 0 { end = index; break }
            }
            bodies.append(String(code[open...end]))
            cursor = end
        }
        return bodies
    }

    func test_migratedFiles_holdNoNSLockNorNonisolatedUnsafe() throws {
        for path in Self.lockFree {
            let text = try code(path)
            XCTAssertFalse(text.contains("NSLock()"), path)
            XCTAssertFalse(text.contains("nonisolated(unsafe)"), path)
        }
    }

    func test_stickerRasterizer_carriesNoUncheckedBox() throws {
        XCTAssertFalse(try code("Story/Canvas/StoryStickerRasterizer.swift").contains("SendableGlyphCacheRef"))
    }

    func test_sinkConsumers_launchNoTaskFromASink() throws {
        for path in Self.sinkFree {
            let offenders = sinkBodies(in: try code(path)).filter { $0.contains("Task {") || $0.contains("Task(") }
            XCTAssertTrue(offenders.isEmpty, "\(path) : \(offenders.map { $0.prefix(60) })")
        }
    }

    func test_viewsAndLoader_scheduleNoDispatchAfter() throws {
        for path in Self.afterFree {
            XCTAssertFalse(try code(path).contains("asyncAfter("), path)
        }
    }

    func test_languagePickerSheet_dismissSchedulesNoDispatchAfter() throws {
        let text = try code("Primitives/LanguagePickerSheet.swift")
        XCTAssertEqual(text.components(separatedBy: "asyncAfter(").count - 1, 1)
    }
}
