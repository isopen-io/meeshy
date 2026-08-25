import XCTest
@testable import MeeshyUI

/// Sweep of the July 2026 hardcoded-string audit.
///
/// The audit found 95 bare string literals across `MeeshyUI` views — video
/// transport controls, the video editor, story audio cells, tag/category
/// pickers, the join flow — that never reached `Localizable.xcstrings`. They
/// rendered their French source text in all 7 product locales.
///
/// Every literal now routes through `String(localized:defaultValue:bundle:)`
/// against `Bundle.module`. These tests prove each key resolves to a real
/// translation — not the key echoed back — in every supported locale.
///
/// `Bundle.module` is `@MainActor`-isolated under MeeshyUI's
/// `defaultIsolation(MainActor)`, hence the class-level annotation.
@MainActor
final class HardcodedStringsSweepTests: XCTestCase {

    /// The 7 locales the app ships, per `apps/ios/Meeshy/Info.plist`
    /// (`CFBundleLocalizations`). Any key missing one of these renders its
    /// source string to that audience.
    private static let requiredLocales: [String] = [
        "fr", "en", "de", "es", "pt-BR", "it", "ar"
    ]

    /// Keys introduced by the sweep, plus the two pre-existing keys the sweep
    /// reuses rather than duplicating (`media.video.play`,
    /// `community.settings.color`).
    private static let sweptKeys: [String] = [
        "auth.forgot.sent_message",
        "avatar.menu.view_profile",
        "avatar.menu.view_story",
        "category.create",
        "category.remove",
        "category.select",
        "common.back",
        "common.clear_input",
        "common.create_quoted",
        "conversation.offline",
        "conversation.searching",
        "conversation.settings.slowmode.1min",
        "conversation.settings.slowmode.5min",
        "conversation.unread_messages",
        "joinFlow.preview.expires",
        "joinFlow.preview.invited_by",
        "joinFlow.preview.languages",
        "joinFlow.preview.uses",
        "location.a11y.hint",
        "location.a11y.label",
        "location.shared",
        "location.live.sharing",
        "media.code.more_lines",
        "media.document.pages",
        "media.embed.play_video",
        "media.transcription.a11y",
        "media.video.airplay",
        "media.video.loop",
        "media.video.more_options",
        "media.video.mute",
        "media.video.pause",
        "media.video.pip.enter",
        "media.video.pip.exit",
        "media.video.seek.backward",
        "media.video.seek.forward",
        "media.video.speed",
        "media.video.unmute",
        "notifications.mark_read",
        "story.audio.layer.background",
        "story.audio.layer.foreground",
        "story.audio.pause",
        "story.audio.play",
        "story.audio.volume",
        "story.canvas.out_of_bounds",
        "story.canvas.safe_area",
        "story.sticker.a11y",
        "story.timeline.inspector.easing.title",
        "story.timeline.ruler.a11y",
        "story.video.mute",
        "story.video.unmute",
        "tag.add",
        "tag.create",
        "tag.placeholder",
        "tag.remove",
        "userIdentity.read",
        "videoEditor.audio.sound",
        "videoEditor.captions.analyzing",
        "videoEditor.captions.clear",
        "videoEditor.captions.count",
        "videoEditor.captions.recommended",
        "videoEditor.captions.spoken_language",
        "videoEditor.export.failed",
        "videoEditor.finish",
        "videoEditor.reset",
        "videoEditor.resume.message",
        "videoEditor.resume.restart",
        "videoEditor.resume.restore",
        "videoEditor.rotation",
        "videoEditor.split.at_playhead",
        "videoEditor.split.instructions",
        "videoEditor.split.segment",
        "videoEditor.timeline.a11y",
        "videoEditor.trim.handles_hint",
        "voiceProfile.recording.min_duration",
        "voiceProfile.recording.sample",
        "audio.recorder.micDeniedSettings",
        "category.picker.new.placeholder",
        "category.picker.create.a11y",
        "category.picker.new.button",
        "story.timeline.track.section.sticker",
        "story.timeline.container",
        "story.timeline.a11y.scrollbar",
        "story.timeline.ops.extend.label",
        "story.timeline.ops.extend",
        "story.timeline.inspector.name.placeholder",
        "story.timeline.inspector.ducking",
        "story.timeline.inspector.ducking.caption",
        "story.timeline.inspector.volume.addPoint",
        "story.timeline.inspector.volume.addPoint.hint",
        "story.timeline.inspector.volume.automation.caption",
        "story.timeline.inspector.volume.removePoint",
        "voiceProfile.recording.languagePicker",
        "story.voiceRecorder.fromFiles",
        "story.voiceRecorder.fromLibrary",
        "media.video.play",
        "community.settings.color",
    ]

    // MARK: - Per-locale bundle resolution
    //
    // `String(localized:bundle:locale:)` does NOT pick a `.lproj` — `locale:`
    // only drives number/date formatting, so every call resolves against the
    // process language. Asserting "the fr value differs from the en value"
    // through that API compares English to itself and passes vacuously.
    // The only way to read a specific translation is to load that locale's
    // `.lproj` bundle explicitly, which is what `localizedBundle(_:)` does.

    private func localizedBundle(_ localeId: String) -> Bundle? {
        guard let path = Bundle.module.path(forResource: localeId, ofType: "lproj") else {
            return nil
        }
        return Bundle(path: path)
    }

    private func value(_ key: String, in localeId: String) -> String? {
        guard let bundle = localizedBundle(localeId) else { return nil }
        // A missing key makes `localizedString` echo the key back; map that to
        // nil so callers can distinguish "absent" from "translated".
        let resolved = bundle.localizedString(forKey: key, value: key, table: nil)
        return resolved == key ? nil : resolved
    }

    /// The catalog must actually ship a compiled `.lproj` per supported locale.
    /// If SPM stops processing `Localizable.xcstrings`, every other assertion
    /// here would silently pass against a single-language bundle.
    func test_bundleShipsEverySupportedLocale() {
        for localeId in Self.requiredLocales {
            XCTAssertNotNil(
                localizedBundle(localeId),
                "Bundle.module has no '\(localeId).lproj' — locale dropped from the built resources"
            )
        }
    }

    func test_allSweptKeys_resolveInEverySupportedLocale() {
        for key in Self.sweptKeys {
            for localeId in Self.requiredLocales {
                guard let resolved = value(key, in: localeId) else {
                    XCTFail("Key '\(key)' is missing from '\(localeId).lproj' — translation absent from Localizable.xcstrings")
                    continue
                }
                XCTAssertFalse(
                    resolved.isEmpty,
                    "Key '\(key)' resolved to empty for locale '\(localeId)'"
                )
            }
        }
    }

    /// French is the catalog's source language, so a key whose English value
    /// still equals the French one is almost always an untranslated entry that
    /// slipped through — the exact failure this sweep fixes. Proper nouns and
    /// bare units are legitimately identical and are exempted.
    func test_englishValues_differFromFrench_exceptProperNouns() {
        let sharedAcrossLocales: Set<String> = [
            "media.video.airplay",           // brand name
            "media.video.pip.enter",         // Apple ships this untranslated in fr
            "videoEditor.timeline.a11y",     // "Timeline" is used verbatim in fr
            "story.audio.volume",            // "Volume" identical fr/en
            "videoEditor.rotation",          // "Rotation" identical fr/en
            "media.video.pause",             // "Pause" identical fr/en
            "story.audio.pause",             // idem
            "story.timeline.container",      // "Timeline" verbatim en fr
            "story.timeline.ops.extend.label", // "%@ s" — unité seule
            "conversation.settings.slowmode.1min",
            "conversation.settings.slowmode.5min",
            "conversation.unread_messages",  // "%lld messages" identical fr/en
            "media.document.pages",          // "%lld pages" identical fr/en
            "videoEditor.split.segment",     // "Segment %lld" identical fr/en
            "voiceProfile.recording.min_duration",
        ]
        for key in Self.sweptKeys where !sharedAcrossLocales.contains(key) {
            guard let fr = value(key, in: "fr"), let en = value(key, in: "en") else {
                XCTFail("Key '\(key)' missing from fr or en bundle")
                continue
            }
            XCTAssertNotEqual(
                fr, en,
                "Key '\(key)' has identical fr/en values ('\(fr)') — likely never translated"
            )
        }
    }
}
