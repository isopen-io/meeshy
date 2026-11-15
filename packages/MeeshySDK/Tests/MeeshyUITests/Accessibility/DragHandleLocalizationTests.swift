import XCTest

final class DragHandleLocalizationTests: XCTestCase {

    private static let requiredLanguages = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    private static let newKeys = [
        "story.audio.track.mute", "story.audio.track.unmute",
        "story.timeline.a11y.action.startLater", "story.timeline.a11y.action.startEarlier",
        "story.timeline.a11y.action.endLater", "story.timeline.a11y.action.endEarlier",
        "story.timeline.a11y.action.inspect", "story.timeline.a11y.action.moveUp",
        "story.timeline.a11y.action.moveDown", "story.timeline.a11y.keyframe.edit",
        "story.timeline.trim.handle.start", "story.timeline.trim.handle.end",
        "media.crop.a11y.handle.topLeft", "media.crop.a11y.handle.topRight",
        "media.crop.a11y.handle.bottomLeft", "media.crop.a11y.handle.bottomRight",
        "media.crop.a11y.handle.top", "media.crop.a11y.handle.bottom",
        "media.crop.a11y.handle.left", "media.crop.a11y.handle.right",
        "media.crop.a11y.handle.frame", "media.crop.a11y.size", "media.crop.a11y.position",
        "media.crop.a11y.move.left", "media.crop.a11y.move.right",
        "media.crop.a11y.move.up", "media.crop.a11y.move.down",
        "audio.editor.a11y.playhead", "audio.split.handle.start", "audio.split.handle.end",
    ]

    func test_newKeys_existInCatalog_withAllSevenLanguages_nonEmpty() throws {
        let strings = try Self.catalogStrings()
        for key in Self.newKeys {
            let localizations = (strings[key] as? [String: Any])?["localizations"] as? [String: Any]
            XCTAssertNotNil(localizations, "clé absente du catalogue : \(key)")
            for language in Self.requiredLanguages {
                let unit = (localizations?[language] as? [String: Any])?["stringUnit"] as? [String: Any]
                XCTAssertEqual(unit?["state"] as? String, "translated", "\(key) / \(language)")
                XCTAssertFalse((unit?["value"] as? String ?? "").isEmpty, "\(key) / \(language) vide")
            }
        }
    }

    func test_formatKeys_keepTheirPositionalArguments_inEveryLanguage() throws {
        let strings = try Self.catalogStrings()
        for key in ["media.crop.a11y.size", "media.crop.a11y.position"] {
            let localizations = (strings[key] as? [String: Any])?["localizations"] as? [String: Any]
            for language in Self.requiredLanguages {
                let unit = (localizations?[language] as? [String: Any])?["stringUnit"] as? [String: Any]
                let value = unit?["value"] as? String ?? ""
                XCTAssertTrue(value.contains("%1$@") && value.contains("%2$@"), "\(key) / \(language)")
            }
        }
    }

    private static func catalogStrings(file: StaticString = #filePath) throws -> [String: Any] {
        let root = URL(fileURLWithPath: "\(file)")
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let url = root.appendingPathComponent("Sources/MeeshyUI/Resources/Localizable.xcstrings")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        let catalog = try XCTUnwrap(object as? [String: Any])
        return try XCTUnwrap(catalog["strings"] as? [String: Any])
    }
}
