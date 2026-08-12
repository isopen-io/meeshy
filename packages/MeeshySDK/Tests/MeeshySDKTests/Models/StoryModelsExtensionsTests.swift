import XCTest
@testable import MeeshySDK

final class StoryModelsExtensionsTests: XCTestCase {
    // MARK: - StoryEasing

    func test_storyEasing_linear_returnsInputUnchanged() {
        XCTAssertEqual(StoryEasing.linear.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.25), 0.25, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.5), 0.5, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.75), 0.75, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeIn_isQuadratic() {
        XCTAssertEqual(StoryEasing.easeIn.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeIn.apply(0.5), 0.25, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeIn.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeOut_invertsEaseIn() {
        XCTAssertEqual(StoryEasing.easeOut.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeOut.apply(0.5), 0.75, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeOut.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeInOut_isSCurve() {
        XCTAssertEqual(StoryEasing.easeInOut.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeInOut.apply(0.5), 0.5, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeInOut.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_allEasings_areMonotonicOnUnitInterval() {
        for easing in [StoryEasing.linear, .easeIn, .easeOut, .easeInOut] {
            var previous: Float = -.infinity
            for step in stride(from: Float(0), through: Float(1), by: 0.05) {
                let current = easing.apply(step)
                XCTAssertGreaterThanOrEqual(current, previous,
                    "\(easing) is not monotonic at t=\(step)")
                previous = current
            }
        }
    }

    func test_storyEasing_codableRoundTrip_allCases() throws {
        for easing in [StoryEasing.linear, .easeIn, .easeOut, .easeInOut] {
            let data = try JSONEncoder().encode(easing)
            let decoded = try JSONDecoder().decode(StoryEasing.self, from: data)
            XCTAssertEqual(decoded, easing)
        }
    }

    // MARK: - StoryTransitionKind

    func test_storyTransitionKind_rawValues_matchSpec() {
        XCTAssertEqual(StoryTransitionKind.crossfade.rawValue, "crossfade")
        XCTAssertEqual(StoryTransitionKind.dissolve.rawValue, "dissolve")
    }

    func test_storyTransitionKind_codableRoundTrip_allCases() throws {
        for kind in StoryTransitionKind.allCases {
            let data = try JSONEncoder().encode(kind)
            let decoded = try JSONDecoder().decode(StoryTransitionKind.self, from: data)
            XCTAssertEqual(decoded, kind)
        }
    }

    // MARK: - StoryClipTransition

    func test_storyClipTransition_init_assignsProperties() {
        let t = StoryClipTransition(
            id: "tr-1",
            fromClipId: "clip-a",
            toClipId: "clip-b",
            kind: .crossfade,
            duration: 0.5,
            easing: .easeInOut
        )
        XCTAssertEqual(t.id, "tr-1")
        XCTAssertEqual(t.fromClipId, "clip-a")
        XCTAssertEqual(t.toClipId, "clip-b")
        XCTAssertEqual(t.kind, .crossfade)
        XCTAssertEqual(t.duration, 0.5)
        XCTAssertEqual(t.easing, .easeInOut)
    }

    func test_storyClipTransition_init_defaultsEasingToNil_andGeneratesUUID() {
        let t = StoryClipTransition(
            fromClipId: "a",
            toClipId: "b",
            kind: .dissolve,
            duration: 1.0
        )
        XCTAssertFalse(t.id.isEmpty)
        XCTAssertNil(t.easing)
    }

    func test_storyClipTransition_codableRoundTrip_full() throws {
        let original = StoryClipTransition(
            id: "tr-42",
            fromClipId: "intro.mp4",
            toClipId: "photo1",
            kind: .dissolve,
            duration: 0.8,
            easing: .easeOut
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryClipTransition.self, from: data)
        XCTAssertEqual(decoded.id, original.id)
        XCTAssertEqual(decoded.fromClipId, original.fromClipId)
        XCTAssertEqual(decoded.toClipId, original.toClipId)
        XCTAssertEqual(decoded.kind, original.kind)
        XCTAssertEqual(decoded.duration, original.duration, accuracy: 0.0001)
        XCTAssertEqual(decoded.easing, original.easing)
    }

    func test_storyClipTransition_codableRoundTrip_omittingEasing() throws {
        let original = StoryClipTransition(
            fromClipId: "a", toClipId: "b",
            kind: .crossfade, duration: 0.4
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryClipTransition.self, from: data)
        XCTAssertNil(decoded.easing)
        XCTAssertEqual(decoded.kind, .crossfade)
    }

    // MARK: - StoryKeyframe

    func test_storyKeyframe_init_assignsAllProperties() {
        let kf = StoryKeyframe(
            id: "kf-1",
            time: 1.5,
            x: 0.3,
            y: 0.7,
            scale: 1.25,
            opacity: 0.9,
            easing: .easeIn
        )
        XCTAssertEqual(kf.id, "kf-1")
        XCTAssertEqual(kf.time, 1.5)
        XCTAssertEqual(kf.x, 0.3)
        XCTAssertEqual(kf.y, 0.7)
        XCTAssertEqual(kf.scale, 1.25)
        XCTAssertEqual(kf.opacity, 0.9)
        XCTAssertEqual(kf.easing, .easeIn)
    }

    func test_storyKeyframe_init_defaultsAllPropertiesToNil() {
        let kf = StoryKeyframe(time: 2.0)
        XCTAssertFalse(kf.id.isEmpty)
        XCTAssertEqual(kf.time, 2.0)
        XCTAssertNil(kf.x)
        XCTAssertNil(kf.y)
        XCTAssertNil(kf.scale)
        XCTAssertNil(kf.opacity)
        XCTAssertNil(kf.easing)
    }

    func test_storyKeyframe_codableRoundTrip_full() throws {
        let original = StoryKeyframe(
            id: "kf-99",
            time: 3.25,
            x: 0.5, y: 0.5,
            scale: 1.0, opacity: 1.0,
            easing: .easeInOut
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: data)
        XCTAssertEqual(decoded.id, original.id)
        XCTAssertEqual(decoded.time, original.time, accuracy: 0.0001)
        XCTAssertEqual(decoded.x, original.x)
        XCTAssertEqual(decoded.y, original.y)
        XCTAssertEqual(decoded.scale, original.scale)
        XCTAssertEqual(decoded.opacity, original.opacity)
        XCTAssertEqual(decoded.easing, original.easing)
    }

    func test_storyKeyframe_codableRoundTrip_partial_onlyTimeAndX() throws {
        let original = StoryKeyframe(time: 0.5, x: 0.42)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: data)
        XCTAssertEqual(decoded.x, 0.42)
        XCTAssertNil(decoded.y)
        XCTAssertNil(decoded.scale)
        XCTAssertNil(decoded.opacity)
        XCTAssertNil(decoded.easing)
    }

    func test_storyKeyframe_decodeJSON_withoutOptionalFields() throws {
        let json = #"{"id":"kf-bare","time":1.0}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: json)
        XCTAssertEqual(decoded.id, "kf-bare")
        XCTAssertEqual(decoded.time, 1.0)
        XCTAssertNil(decoded.x)
        XCTAssertNil(decoded.y)
        XCTAssertNil(decoded.scale)
        XCTAssertNil(decoded.opacity)
        XCTAssertNil(decoded.easing)
    }

    // MARK: - StoryEffects.clipTransitions extension

    func test_storyEffects_clipTransitions_defaultsToNil() {
        let effects = StoryEffects()
        XCTAssertNil(effects.clipTransitions)
    }

    func test_storyEffects_clipTransitions_canBeAssignedAndPersisted() throws {
        var effects = StoryEffects()
        effects.clipTransitions = [
            StoryClipTransition(fromClipId: "a", toClipId: "b",
                                kind: .crossfade, duration: 0.5)
        ]
        let data = try JSONEncoder().encode(effects)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: data)
        XCTAssertEqual(decoded.clipTransitions?.count, 1)
        XCTAssertEqual(decoded.clipTransitions?.first?.kind, .crossfade)
    }

    func test_storyEffects_decodeOldJSON_withoutClipTransitions_succeeds() throws {
        let json = #"{"background":"FFFFFF","mediaObjects":[]}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: json)
        XCTAssertNil(decoded.clipTransitions)
        XCTAssertEqual(decoded.background, "FFFFFF")
    }

    // MARK: - StoryMediaObject.keyframes extension

    func test_storyMediaObject_keyframes_defaultsToNil() {
        let media = StoryMediaObject(aspectRatio: 1.0)
        XCTAssertNil(media.keyframes)
    }

    func test_storyMediaObject_keyframes_canBeAssignedAndPersisted() throws {
        var media = StoryMediaObject(postMediaId: "pm-1", mediaType: "video", aspectRatio: 1.0)
        media.keyframes = [
            StoryKeyframe(time: 0.0, x: 0.0, y: 0.0, scale: 1.0, opacity: 0.0),
            StoryKeyframe(time: 1.0, x: 0.5, y: 0.5, scale: 1.5, opacity: 1.0,
                          easing: .easeOut)
        ]
        let data = try JSONEncoder().encode(media)
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: data)
        XCTAssertEqual(decoded.keyframes?.count, 2)
        XCTAssertEqual(decoded.keyframes?[1].easing, .easeOut)
    }

    func test_storyMediaObject_decodeOldJSON_withoutKeyframes_succeeds() throws {
        let json = #"{"id":"m1","postMediaId":"pm","mediaType":"image","placement":"media","x":0.5,"y":0.5,"scale":1.0,"rotation":0,"volume":1.0}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: json)
        XCTAssertNil(decoded.keyframes)
        XCTAssertEqual(decoded.id, "m1")
    }

    // MARK: - StoryTextObject.keyframes extension

    func test_storyTextObject_keyframes_defaultsToNil() {
        let text = StoryTextObject(text: "hello")
        XCTAssertNil(text.keyframes)
    }

    func test_storyTextObject_keyframes_canBeAssignedAndPersisted() throws {
        var text = StoryTextObject(text: "hi")
        text.keyframes = [
            StoryKeyframe(time: 0.5, opacity: 0.0),
            StoryKeyframe(time: 1.5, opacity: 1.0, easing: .easeIn)
        ]
        let data = try JSONEncoder().encode(text)
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: data)
        XCTAssertEqual(decoded.keyframes?.count, 2)
        XCTAssertEqual(decoded.keyframes?[0].opacity, 0.0)
        XCTAssertEqual(decoded.keyframes?[1].easing, .easeIn)
    }

    func test_storyTextObject_decodeOldJSON_withoutKeyframes_succeeds() throws {
        let json = #"{"id":"t1","content":"hello","x":0.5,"y":0.5,"scale":1.0,"rotation":0}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: json)
        XCTAssertNil(decoded.keyframes)
        XCTAssertEqual(decoded.text, "hello")
    }

    // MARK: - Retro-compat: V1 slide JSON decodes into V2

    func test_storySlide_decodeV1JSON_withoutTimelineV2Fields_succeeds() throws {
        let json = #"""
        {
          "id": "s1",
          "mediaURL": "https://x.test/img.jpg",
          "content": "Hi",
          "effects": {
            "background": "FFFFFF",
            "mediaObjects": [
              {"id":"m1","postMediaId":"pm","mediaType":"image","placement":"media","x":0.5,"y":0.5,"scale":1.0,"rotation":0,"volume":1.0}
            ],
            "textObjects": [
              {"id":"t1","content":"hello","x":0.5,"y":0.5,"scale":1.0,"rotation":0}
            ]
          },
          "duration": 5,
          "order": 0
        }
        """#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StorySlide.self, from: json)
        XCTAssertEqual(decoded.id, "s1")
        XCTAssertNil(decoded.effects.clipTransitions)
        XCTAssertNil(decoded.effects.mediaObjects?.first?.keyframes)
        XCTAssertNil(decoded.effects.textObjects.first?.keyframes)
    }

    func test_storySlide_encodeV2_thenDecode_preservesTimelineFields() throws {
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(id: "m1", postMediaId: "pm",
                             mediaType: "image", placement: "media",
                             aspectRatio: 1.0)
        ]
        effects.mediaObjects?[0].keyframes = [
            StoryKeyframe(time: 0.0, x: 0.0, y: 0.0),
            StoryKeyframe(time: 2.0, x: 1.0, y: 1.0)
        ]
        effects.clipTransitions = [
            StoryClipTransition(fromClipId: "m1", toClipId: "m2",
                                kind: .dissolve, duration: 0.4,
                                easing: .easeInOut)
        ]
        let slide = StorySlide(id: "s2", effects: effects, duration: 10, order: 0)
        let data = try JSONEncoder().encode(slide)
        let decoded = try JSONDecoder().decode(StorySlide.self, from: data)
        XCTAssertEqual(decoded.effects.clipTransitions?.first?.kind, .dissolve)
        XCTAssertEqual(decoded.effects.mediaObjects?.first?.keyframes?.count, 2)
    }

    // MARK: - TimelineProject

    private func makeSlideForProject() -> StorySlide {
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(id: "m1", postMediaId: "pm-1",
                             mediaType: "video", placement: "media",
                             aspectRatio: 1.0,
                             startTime: 0, duration: 3.0)
        ]
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm-2",
                                   placement: "overlay",
                                   volume: 0.8, waveformSamples: [0.1, 0.2])
        ]
        effects.textObjects = [
            StoryTextObject(id: "t1", text: "Hello",
                            startTime: 0, duration: 2.0)
        ]
        effects.clipTransitions = [
            StoryClipTransition(id: "tr1",
                                fromClipId: "m1", toClipId: "m2",
                                kind: .crossfade, duration: 0.4)
        ]
        // Durée AUTORITAIRE via le timeline (« la timeline EST la story ») : le timeline
        // editor configure la durée du slide, persistée sur `timelineDuration` et lue en
        // priorité par `computedTotalDuration()`. `TimelineProject.init(from:)` la recharge
        // donc à 8 s (et non la durée auto du contenu, qui serait 6 s).
        effects.timelineDuration = 8.0
        return StorySlide(id: "slide-1", effects: effects, duration: 8.0, order: 0)
    }

    func test_timelineProject_initFromSlide_capturesAllArrays() {
        let slide = makeSlideForProject()
        let project = TimelineProject(from: slide)
        XCTAssertEqual(project.slideId, "slide-1")
        XCTAssertEqual(project.slideDuration, 8.0)
        XCTAssertEqual(project.mediaObjects.count, 1)
        XCTAssertEqual(project.audioPlayerObjects.count, 1)
        XCTAssertEqual(project.textObjects.count, 1)
        XCTAssertEqual(project.clipTransitions.count, 1)
    }

    func test_timelineProject_initFromSlide_handlesNilArraysAsEmpty() {
        let slide = StorySlide(id: "empty", effects: StoryEffects(),
                               duration: 5, order: 0)
        let project = TimelineProject(from: slide)
        XCTAssertTrue(project.mediaObjects.isEmpty)
        XCTAssertTrue(project.audioPlayerObjects.isEmpty)
        XCTAssertTrue(project.textObjects.isEmpty)
        XCTAssertTrue(project.clipTransitions.isEmpty)
    }

    func test_timelineProject_apply_writesArraysBackToSlide() {
        let original = makeSlideForProject()
        let project = TimelineProject(from: original)
        var blank = StorySlide(id: "slide-1", effects: StoryEffects(),
                               duration: 0, order: 0)
        project.apply(to: &blank)
        XCTAssertEqual(blank.duration, 8.0)
        XCTAssertEqual(blank.effects.mediaObjects?.count, 1)
        XCTAssertEqual(blank.effects.audioPlayerObjects?.count, 1)
        XCTAssertEqual(blank.effects.textObjects.count, 1)
        XCTAssertEqual(blank.effects.clipTransitions?.count, 1)
    }

    func test_timelineProject_roundTrip_initThenApply_isIdempotent() throws {
        var slide = makeSlideForProject()
        let project = TimelineProject(from: slide)
        project.apply(to: &slide)
        // Use .sortedKeys: JSONEncoder in iOS 26 SDK does NOT preserve
        // insertion order across calls, so byte-equality requires sorted keys.
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let json1 = try encoder.encode(slide.effects.mediaObjects)
        let json2 = try encoder.encode(project.mediaObjects)
        XCTAssertEqual(json1, json2)
        XCTAssertEqual(slide.effects.clipTransitions?.count, 1)
    }

    func test_timelineProject_codableRoundTrip() throws {
        let slide = makeSlideForProject()
        let project = TimelineProject(from: slide)
        let data = try JSONEncoder().encode(project)
        let decoded = try JSONDecoder().decode(TimelineProject.self, from: data)
        XCTAssertEqual(decoded.slideId, project.slideId)
        XCTAssertEqual(decoded.slideDuration, project.slideDuration, accuracy: 0.0001)
        XCTAssertEqual(decoded.mediaObjects.count, project.mediaObjects.count)
        XCTAssertEqual(decoded.clipTransitions.first?.kind, .crossfade)
    }

    // MARK: - EditCommand protocol

    func test_editCommand_protocol_existsAndComposesCodableSendable() {
        // Compile-only: verifies protocol composition. A concrete conformer is
        // added in Task 12 (AddClipCommand) and will be exercised there.
        func acceptsAny<T: EditCommand>(_ value: T) -> String { value.id }
        // Defining a private one-off conforming type to close compilation.
        struct LocalNoop: EditCommand {
            let id: String = "noop"
            let timestamp: Date = Date()
            func apply(to project: inout TimelineProject) throws {}
            func revert(from project: inout TimelineProject) throws {}
        }
        XCTAssertEqual(acceptsAny(LocalNoop()), "noop")
    }

    // MARK: - TimelineClipKind

    func test_timelineClipKind_rawValues_matchSpec() {
        XCTAssertEqual(TimelineClipKind.video.rawValue, "video")
        XCTAssertEqual(TimelineClipKind.image.rawValue, "image")
        XCTAssertEqual(TimelineClipKind.audio.rawValue, "audio")
        XCTAssertEqual(TimelineClipKind.text.rawValue, "text")
    }

    func test_timelineClipKind_codableRoundTrip_allCases() throws {
        for kind in TimelineClipKind.allCases {
            let data = try JSONEncoder().encode(kind)
            let decoded = try JSONDecoder().decode(TimelineClipKind.self, from: data)
            XCTAssertEqual(decoded, kind)
        }
    }

    // MARK: - AddClipCommand

    private func makeEmptyProject() -> TimelineProject {
        TimelineProject(slideId: "s1", slideDuration: 10.0)
    }

    func test_addClipCommand_apply_addsToCorrectCollection_video() throws {
        var project = makeEmptyProject()
        let cmd = AddClipCommand(
            clipId: "v1", postMediaId: "pm-v1",
            kind: .video, startTime: 0.5, duration: 3.0
        )
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects.count, 1)
        XCTAssertEqual(project.mediaObjects.first?.id, "v1")
        XCTAssertEqual(project.mediaObjects.first?.mediaType, "video")
        XCTAssertEqual(project.mediaObjects.first?.startTime, 0.5)
        XCTAssertEqual(project.mediaObjects.first?.duration, 3.0)
    }

    func test_addClipCommand_apply_video_preservesAspectRatio() throws {
        var project = makeEmptyProject()
        let cmd = AddClipCommand(
            clipId: "v1", postMediaId: "pm-v1",
            kind: .video, startTime: 0, duration: 3.0,
            aspectRatio: 16.0 / 9.0
        )
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects.first?.aspectRatio ?? 0, 16.0 / 9.0, accuracy: 0.0001)
    }

    func test_addClipCommand_decode_legacyWithoutAspectRatio_defaultsTo1() throws {
        let json = #"{"id":"c1","timestamp":0,"clipId":"v1","postMediaId":"pm","kind":"video","startTime":0,"duration":1}"#
        let decoded = try JSONDecoder().decode(AddClipCommand.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.aspectRatio, 1.0)
    }

    func test_addClipCommand_apply_addsToCorrectCollection_audio() throws {
        var project = makeEmptyProject()
        let cmd = AddClipCommand(
            clipId: "a1", postMediaId: "pm-a1",
            kind: .audio, startTime: 1.0, duration: 5.0
        )
        try cmd.apply(to: &project)
        XCTAssertEqual(project.audioPlayerObjects.count, 1)
        XCTAssertEqual(project.audioPlayerObjects.first?.id, "a1")
    }

    func test_addClipCommand_apply_addsToCorrectCollection_text() throws {
        var project = makeEmptyProject()
        let cmd = AddClipCommand(
            clipId: "t1", postMediaId: "",
            kind: .text, startTime: 0, duration: 2.0,
            content: "Hi"
        )
        try cmd.apply(to: &project)
        XCTAssertEqual(project.textObjects.count, 1)
        XCTAssertEqual(project.textObjects.first?.text, "Hi")
        XCTAssertEqual(project.textObjects.first?.duration, 2.0)
    }

    func test_addClipCommand_revert_isInverseOfApply_idempotentRoundTrip() throws {
        var project = makeEmptyProject()
        let cmd = AddClipCommand(
            clipId: "v1", postMediaId: "pm-v1",
            kind: .video, startTime: 0, duration: 2.0
        )
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertTrue(project.mediaObjects.isEmpty)
    }

    func test_addClipCommand_codableRoundTrip() throws {
        let cmd = AddClipCommand(
            clipId: "v1", postMediaId: "pm",
            kind: .video, startTime: 0, duration: 1.0
        )
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(AddClipCommand.self, from: data)
        XCTAssertEqual(decoded.id, cmd.id)
        XCTAssertEqual(decoded.clipId, "v1")
        XCTAssertEqual(decoded.kind, .video)
    }

    // MARK: - DeleteClipCommand

    func test_deleteClipCommand_apply_removesVideo() throws {
        var project = makeEmptyProject()
        let media = StoryMediaObject(id: "v1", postMediaId: "pm",
                                     mediaType: "video", placement: "media",
                                     aspectRatio: 1.0,
                                     startTime: 0, duration: 2)
        project.mediaObjects = [media]
        let cmd = DeleteClipCommand(clipId: "v1", kind: .video,
                                    snapshotMedia: media,
                                    snapshotAudio: nil,
                                    snapshotText: nil,
                                    insertionIndex: 0)
        try cmd.apply(to: &project)
        XCTAssertTrue(project.mediaObjects.isEmpty)
    }

    func test_deleteClipCommand_revert_restoresClipAtOriginalIndex() throws {
        var project = makeEmptyProject()
        let m1 = StoryMediaObject(id: "v1", postMediaId: "pm1",
                                  mediaType: "video", placement: "media", aspectRatio: 1.0)
        let m2 = StoryMediaObject(id: "v2", postMediaId: "pm2",
                                  mediaType: "video", placement: "media", aspectRatio: 1.0)
        let m3 = StoryMediaObject(id: "v3", postMediaId: "pm3",
                                  mediaType: "video", placement: "media", aspectRatio: 1.0)
        project.mediaObjects = [m1, m2, m3]
        let cmd = DeleteClipCommand(clipId: "v2", kind: .video,
                                    snapshotMedia: m2, snapshotAudio: nil,
                                    snapshotText: nil, insertionIndex: 1)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects.map(\.id), ["v1", "v3"])
        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects.map(\.id), ["v1", "v2", "v3"])
    }

    func test_deleteClipCommand_apply_throwsWhenClipMissing() {
        var project = makeEmptyProject()
        let cmd = DeleteClipCommand(clipId: "ghost", kind: .video,
                                    snapshotMedia: nil, snapshotAudio: nil,
                                    snapshotText: nil, insertionIndex: 0)
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .clipNotFound(id: "ghost"))
        }
    }

    func test_deleteClipCommand_codableRoundTrip() throws {
        let media = StoryMediaObject(id: "v1", postMediaId: "pm",
                                     mediaType: "video", placement: "media", aspectRatio: 1.0)
        let cmd = DeleteClipCommand(clipId: "v1", kind: .video,
                                    snapshotMedia: media, snapshotAudio: nil,
                                    snapshotText: nil, insertionIndex: 0)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(DeleteClipCommand.self, from: data)
        XCTAssertEqual(decoded.clipId, "v1")
        XCTAssertEqual(decoded.snapshotMedia?.id, "v1")
    }

    // MARK: - MoveClipCommand

    func test_moveClipCommand_apply_changesStartTimeOfMedia() throws {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media",
                             aspectRatio: 1.0,
                             startTime: 1.0, duration: 2.0)
        ]
        let cmd = MoveClipCommand(clipId: "v1", kind: .video,
                                  oldStartTime: 1.0, newStartTime: 3.0)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].startTime, 3.0)
    }

    func test_moveClipCommand_revert_restoresOldStartTime() throws {
        var project = makeEmptyProject()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                   placement: "overlay",
                                   waveformSamples: [],
                                   startTime: 0.5, duration: 1.0)
        ]
        let cmd = MoveClipCommand(clipId: "a1", kind: .audio,
                                  oldStartTime: 0.5, newStartTime: 2.0)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].startTime, 0.5)
    }

    func test_moveClipCommand_apply_throwsWhenClipMissing() {
        var project = makeEmptyProject()
        let cmd = MoveClipCommand(clipId: "ghost", kind: .text,
                                  oldStartTime: 0, newStartTime: 1)
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .clipNotFound(id: "ghost"))
        }
    }

    func test_moveClipCommand_codableRoundTrip() throws {
        let cmd = MoveClipCommand(clipId: "v1", kind: .video,
                                  oldStartTime: 0, newStartTime: 1)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(MoveClipCommand.self, from: data)
        XCTAssertEqual(decoded.clipId, "v1")
        XCTAssertEqual(decoded.newStartTime, 1)
    }

    // MARK: - TrimClipCommand

    func test_trimClipCommand_apply_changesStartAndDuration() throws {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media",
                             aspectRatio: 1.0,
                             startTime: 0, duration: 5.0)
        ]
        let cmd = TrimClipCommand(clipId: "v1", kind: .video,
                                  oldStartTime: 0, oldDuration: 5.0,
                                  newStartTime: 1.0, newDuration: 3.0)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].startTime, 1.0)
        XCTAssertEqual(project.mediaObjects[0].duration, 3.0)
    }

    func test_trimClipCommand_apply_textUsesDisplayDuration() throws {
        var project = makeEmptyProject()
        project.textObjects = [
            StoryTextObject(id: "t1", text: "hi",
                            startTime: 0, duration: 5.0)
        ]
        let cmd = TrimClipCommand(clipId: "t1", kind: .text,
                                  oldStartTime: 0, oldDuration: 5.0,
                                  newStartTime: 0.5, newDuration: 4.0)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.textObjects[0].startTime, 0.5)
        XCTAssertEqual(project.textObjects[0].duration, 4.0)
    }

    func test_trimClipCommand_revert_restoresOldValues() throws {
        var project = makeEmptyProject()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                   placement: "overlay",
                                   waveformSamples: [],
                                   startTime: 0, duration: 4.0)
        ]
        let cmd = TrimClipCommand(clipId: "a1", kind: .audio,
                                  oldStartTime: 0, oldDuration: 4.0,
                                  newStartTime: 1.0, newDuration: 2.0)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].startTime, 0)
        XCTAssertEqual(project.audioPlayerObjects[0].duration, 4.0)
    }

    func test_trimClipCommand_codableRoundTrip() throws {
        let cmd = TrimClipCommand(clipId: "v1", kind: .video,
                                  oldStartTime: 0, oldDuration: 5,
                                  newStartTime: 1, newDuration: 3)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(TrimClipCommand.self, from: data)
        XCTAssertEqual(decoded.newDuration, 3)
    }

    // MARK: - SplitClipCommand

    func test_splitClipCommand_apply_replacesOneVideoWithTwo() throws {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media",
                             aspectRatio: 1.0,
                             startTime: 0, duration: 5.0)
        ]
        let cmd = SplitClipCommand(clipId: "v1", kind: .video,
                                   splitAtRelativeTime: 2.0,
                                   leftId: "v1L", rightId: "v1R")
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects.count, 2)
        XCTAssertEqual(project.mediaObjects[0].id, "v1L")
        XCTAssertEqual(project.mediaObjects[0].duration, 2.0)
        XCTAssertEqual(project.mediaObjects[1].id, "v1R")
        XCTAssertEqual(project.mediaObjects[1].startTime, 2.0)
        XCTAssertEqual(project.mediaObjects[1].duration, 3.0)
    }

    func test_splitClipCommand_revert_restoresOriginalSingleClip() throws {
        var project = makeEmptyProject()
        let original = StoryMediaObject(id: "v1", postMediaId: "pm",
                                        mediaType: "video", placement: "media",
                                        aspectRatio: 1.0,
                                        startTime: 0, duration: 5.0)
        project.mediaObjects = [original]
        let cmd = SplitClipCommand(clipId: "v1", kind: .video,
                                   splitAtRelativeTime: 2.0,
                                   leftId: "v1L", rightId: "v1R")
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects.count, 1)
        XCTAssertEqual(project.mediaObjects[0].id, "v1")
        XCTAssertEqual(project.mediaObjects[0].duration, 5.0)
    }

    func test_splitClipCommand_apply_throwsWhenClipMissing() {
        var project = makeEmptyProject()
        let cmd = SplitClipCommand(clipId: "ghost", kind: .video,
                                   splitAtRelativeTime: 1.0,
                                   leftId: "L", rightId: "R")
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .clipNotFound(id: "ghost"))
        }
    }

    func test_splitClipCommand_codableRoundTrip() throws {
        let cmd = SplitClipCommand(clipId: "v1", kind: .video,
                                   splitAtRelativeTime: 1.5,
                                   leftId: "L", rightId: "R")
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(SplitClipCommand.self, from: data)
        XCTAssertEqual(decoded.splitAtRelativeTime, 1.5)
    }

    // MARK: - AddTransitionCommand & RemoveTransitionCommand

    private func makeTransitionFixture() -> StoryClipTransition {
        StoryClipTransition(id: "tr1", fromClipId: "v1", toClipId: "v2",
                            kind: .crossfade, duration: 0.5)
    }

    func test_addTransitionCommand_apply_appendsToArray() throws {
        var project = makeEmptyProject()
        let cmd = AddTransitionCommand(transition: makeTransitionFixture())
        try cmd.apply(to: &project)
        XCTAssertEqual(project.clipTransitions.count, 1)
        XCTAssertEqual(project.clipTransitions.first?.id, "tr1")
    }

    func test_addTransitionCommand_revert_removesIt() throws {
        var project = makeEmptyProject()
        let cmd = AddTransitionCommand(transition: makeTransitionFixture())
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertTrue(project.clipTransitions.isEmpty)
    }

    func test_addTransitionCommand_codableRoundTrip() throws {
        let cmd = AddTransitionCommand(transition: makeTransitionFixture())
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(AddTransitionCommand.self, from: data)
        XCTAssertEqual(decoded.transition.id, "tr1")
    }

    func test_removeTransitionCommand_apply_removesByIdAndStoresSnapshot() throws {
        var project = makeEmptyProject()
        let snap = makeTransitionFixture()
        project.clipTransitions = [snap]
        let cmd = RemoveTransitionCommand(transitionId: "tr1", snapshot: snap, insertionIndex: 0)
        try cmd.apply(to: &project)
        XCTAssertTrue(project.clipTransitions.isEmpty)
    }

    func test_removeTransitionCommand_revert_restoresAtIndex() throws {
        var project = makeEmptyProject()
        let snap = makeTransitionFixture()
        project.clipTransitions = [snap]
        let cmd = RemoveTransitionCommand(transitionId: "tr1", snapshot: snap, insertionIndex: 0)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.clipTransitions.first?.id, "tr1")
    }

    func test_removeTransitionCommand_apply_throwsWhenMissing() {
        var project = makeEmptyProject()
        let cmd = RemoveTransitionCommand(transitionId: "ghost",
                                          snapshot: makeTransitionFixture(),
                                          insertionIndex: 0)
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .transitionNotFound(id: "ghost"))
        }
    }

    func test_removeTransitionCommand_codableRoundTrip() throws {
        let cmd = RemoveTransitionCommand(transitionId: "tr1",
                                          snapshot: makeTransitionFixture(),
                                          insertionIndex: 0)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(RemoveTransitionCommand.self, from: data)
        XCTAssertEqual(decoded.transitionId, "tr1")
    }

    // MARK: - ChangeTransitionCommand

    func test_changeTransitionCommand_apply_replacesTransitionAtSameIndex() throws {
        var project = makeEmptyProject()
        let original = StoryClipTransition(id: "tr1", fromClipId: "a",
                                           toClipId: "b", kind: .crossfade,
                                           duration: 0.5)
        project.clipTransitions = [original]
        let updated = StoryClipTransition(id: "tr1", fromClipId: "a",
                                          toClipId: "b", kind: .dissolve,
                                          duration: 1.2,
                                          easing: .easeInOut)
        let cmd = ChangeTransitionCommand(transitionId: "tr1",
                                          previous: original,
                                          updated: updated)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.clipTransitions.first?.kind, .dissolve)
        XCTAssertEqual(project.clipTransitions.first?.duration, 1.2)
    }

    func test_changeTransitionCommand_revert_restoresPrevious() throws {
        var project = makeEmptyProject()
        let original = StoryClipTransition(id: "tr1", fromClipId: "a",
                                           toClipId: "b", kind: .crossfade,
                                           duration: 0.5)
        project.clipTransitions = [original]
        let updated = StoryClipTransition(id: "tr1", fromClipId: "a",
                                          toClipId: "b", kind: .dissolve,
                                          duration: 1.0)
        let cmd = ChangeTransitionCommand(transitionId: "tr1",
                                          previous: original,
                                          updated: updated)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.clipTransitions.first?.kind, .crossfade)
    }

    func test_changeTransitionCommand_apply_throwsWhenMissing() {
        var project = makeEmptyProject()
        let prev = StoryClipTransition(id: "tr1", fromClipId: "a",
                                       toClipId: "b", kind: .crossfade,
                                       duration: 0.5)
        let cmd = ChangeTransitionCommand(transitionId: "tr1",
                                          previous: prev, updated: prev)
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .transitionNotFound(id: "tr1"))
        }
    }

    func test_changeTransitionCommand_codableRoundTrip() throws {
        let prev = StoryClipTransition(id: "tr1", fromClipId: "a",
                                       toClipId: "b", kind: .crossfade,
                                       duration: 0.5)
        let updated = StoryClipTransition(id: "tr1", fromClipId: "a",
                                          toClipId: "b", kind: .dissolve,
                                          duration: 1.0)
        let cmd = ChangeTransitionCommand(transitionId: "tr1",
                                          previous: prev, updated: updated)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(ChangeTransitionCommand.self, from: data)
        XCTAssertEqual(decoded.updated.kind, .dissolve)
    }

    // MARK: - Keyframe Commands (Add / Move / Delete)

    private func makeProjectWithMedia() -> TimelineProject {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media",
                             aspectRatio: 1.0,
                             startTime: 0, duration: 5)
        ]
        return project
    }

    func test_addKeyframeCommand_apply_appendsToObject() throws {
        var project = makeProjectWithMedia()
        let kf = StoryKeyframe(id: "kf1", time: 1.0, x: 0.5)
        let cmd = AddKeyframeCommand(clipId: "v1", kind: .video, keyframe: kf)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.count, 1)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.id, "kf1")
    }

    func test_addKeyframeCommand_revert_removesKeyframe() throws {
        var project = makeProjectWithMedia()
        let kf = StoryKeyframe(id: "kf1", time: 1.0)
        let cmd = AddKeyframeCommand(clipId: "v1", kind: .video, keyframe: kf)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertTrue(project.mediaObjects[0].keyframes?.isEmpty ?? true)
    }

    func test_addKeyframeCommand_apply_throwsWhenClipMissing() {
        var project = makeEmptyProject()
        let cmd = AddKeyframeCommand(clipId: "ghost", kind: .video,
                                     keyframe: StoryKeyframe(time: 0))
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .clipNotFound(id: "ghost"))
        }
    }

    func test_moveKeyframeCommand_apply_changesKeyframeTime() throws {
        var project = makeProjectWithMedia()
        project.mediaObjects[0].keyframes = [StoryKeyframe(id: "kf1", time: 1.0)]
        let cmd = MoveKeyframeCommand(clipId: "v1", kind: .video,
                                      keyframeId: "kf1",
                                      oldTime: 1.0, newTime: 3.0)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.time, 3.0)
    }

    func test_moveKeyframeCommand_revert_restoresOldTime() throws {
        var project = makeProjectWithMedia()
        project.mediaObjects[0].keyframes = [StoryKeyframe(id: "kf1", time: 1.0)]
        let cmd = MoveKeyframeCommand(clipId: "v1", kind: .video,
                                      keyframeId: "kf1",
                                      oldTime: 1.0, newTime: 3.0)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.time, 1.0)
    }

    func test_moveKeyframeCommand_apply_throwsWhenKeyframeMissing() {
        var project = makeProjectWithMedia()
        project.mediaObjects[0].keyframes = []
        let cmd = MoveKeyframeCommand(clipId: "v1", kind: .video,
                                      keyframeId: "ghost",
                                      oldTime: 0, newTime: 1)
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .keyframeNotFound(id: "ghost"))
        }
    }

    func test_deleteKeyframeCommand_apply_removesAndStoresSnapshot() throws {
        var project = makeProjectWithMedia()
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)
        project.mediaObjects[0].keyframes = [kf]
        let cmd = DeleteKeyframeCommand(clipId: "v1", kind: .video,
                                        keyframeId: "kf1",
                                        snapshot: kf, insertionIndex: 0)
        try cmd.apply(to: &project)
        XCTAssertTrue(project.mediaObjects[0].keyframes?.isEmpty ?? true)
    }

    func test_deleteKeyframeCommand_revert_restoresAtIndex() throws {
        var project = makeProjectWithMedia()
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)
        project.mediaObjects[0].keyframes = [kf]
        let cmd = DeleteKeyframeCommand(clipId: "v1", kind: .video,
                                        keyframeId: "kf1",
                                        snapshot: kf, insertionIndex: 0)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.opacity, 0.5)
    }

    func test_addKeyframeCommand_codableRoundTrip() throws {
        let cmd = AddKeyframeCommand(clipId: "v1", kind: .video,
                                     keyframe: StoryKeyframe(id: "kf1", time: 1))
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(AddKeyframeCommand.self, from: data)
        XCTAssertEqual(decoded.keyframe.id, "kf1")
    }

    func test_moveKeyframeCommand_codableRoundTrip() throws {
        let cmd = MoveKeyframeCommand(clipId: "v1", kind: .video,
                                      keyframeId: "kf1",
                                      oldTime: 0, newTime: 1)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(MoveKeyframeCommand.self, from: data)
        XCTAssertEqual(decoded.newTime, 1)
    }

    func test_deleteKeyframeCommand_codableRoundTrip() throws {
        let cmd = DeleteKeyframeCommand(clipId: "v1", kind: .video,
                                        keyframeId: "kf1",
                                        snapshot: StoryKeyframe(id: "kf1", time: 1),
                                        insertionIndex: 0)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(DeleteKeyframeCommand.self, from: data)
        XCTAssertEqual(decoded.keyframeId, "kf1")
    }

    // MARK: - SetClipPropertyCommand

    func test_setClipPropertyCommand_apply_setsVolumeOnAudio() throws {
        var project = makeEmptyProject()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                   placement: "overlay", volume: 1.0,
                                   waveformSamples: [])
        ]
        let cmd = SetClipPropertyCommand(clipId: "a1", kind: .audio,
                                         property: .volume(old: 1.0, new: 0.4))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].volume, 0.4)
    }

    func test_setClipPropertyCommand_revert_restoresOldVolume() throws {
        var project = makeEmptyProject()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                   placement: "overlay", volume: 1.0,
                                   waveformSamples: [])
        ]
        let cmd = SetClipPropertyCommand(clipId: "a1", kind: .audio,
                                         property: .volume(old: 1.0, new: 0.4))
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].volume, 1.0)
    }

    func test_setClipPropertyCommand_apply_setsFadeInOnVideo() throws {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media", aspectRatio: 1.0)
        ]
        let cmd = SetClipPropertyCommand(clipId: "v1", kind: .video,
                                         property: .fadeIn(old: nil, new: 0.5))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].fadeIn, 0.5)
    }

    func test_setClipPropertyCommand_apply_setsLoopOnVideo() throws {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media", aspectRatio: 1.0)
        ]
        let cmd = SetClipPropertyCommand(clipId: "v1", kind: .video,
                                         property: .loop(old: nil, new: true))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].loop, true)
    }

    func test_setClipPropertyCommand_apply_setsIsBackgroundOnAudio() throws {
        var project = makeEmptyProject()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                   placement: "overlay",
                                   waveformSamples: [])
        ]
        let cmd = SetClipPropertyCommand(clipId: "a1", kind: .audio,
                                         property: .isBackground(old: nil, new: true))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].isBackground, true)
    }

    func test_setClipPropertyCommand_apply_setsIsLockedOnText() throws {
        var project = makeEmptyProject()
        project.textObjects = [StoryTextObject(id: "t1", text: "x")]
        let cmd = SetClipPropertyCommand(clipId: "t1", kind: .text,
                                         property: .isLocked(old: nil, new: true))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.textObjects[0].isLocked, true)
    }

    func test_setClipPropertyCommand_apply_throwsWhenClipMissing() {
        var project = makeEmptyProject()
        let cmd = SetClipPropertyCommand(clipId: "ghost", kind: .video,
                                         property: .volume(old: 1.0, new: 0.5))
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .clipNotFound(id: "ghost"))
        }
    }

    func test_setClipPropertyCommand_codableRoundTrip_eachVariant() throws {
        let variants: [SetClipPropertyCommand.ClipProperty] = [
            .volume(old: 1.0, new: 0.5),
            .fadeIn(old: nil, new: 0.3),
            .fadeOut(old: 0.2, new: nil),
            .loop(old: false, new: true),
            .isBackground(old: nil, new: true),
            .isLocked(old: nil, new: true),
        ]
        for property in variants {
            let cmd = SetClipPropertyCommand(clipId: "c", kind: .video, property: property)
            let data = try JSONEncoder().encode(cmd)
            let decoded = try JSONDecoder().decode(SetClipPropertyCommand.self, from: data)
            XCTAssertEqual(decoded.clipId, "c")
            XCTAssertEqual(decoded.property, property)
        }
    }

    // MARK: - AnyEditCommand

    private func makeAllCommandCases() -> [AnyEditCommand] {
        let media = StoryMediaObject(id: "v1", postMediaId: "pm",
                                     mediaType: "video", placement: "media", aspectRatio: 1.0)
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                           placement: "overlay",
                                           waveformSamples: [])
        let text = StoryTextObject(id: "t1", text: "hi")
        let transition = StoryClipTransition(id: "tr1", fromClipId: "v1",
                                             toClipId: "v2", kind: .crossfade,
                                             duration: 0.4)
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)

        return [
            .addClip(AddClipCommand(clipId: "v1", postMediaId: "pm",
                                    kind: .video, startTime: 0, duration: 1)),
            .deleteClip(DeleteClipCommand(clipId: "v1", kind: .video,
                                          snapshotMedia: media,
                                          snapshotAudio: nil,
                                          snapshotText: nil,
                                          insertionIndex: 0)),
            .moveClip(MoveClipCommand(clipId: "v1", kind: .video,
                                      oldStartTime: 0, newStartTime: 1)),
            .trimClip(TrimClipCommand(clipId: "v1", kind: .video,
                                      oldStartTime: 0, oldDuration: 5,
                                      newStartTime: 1, newDuration: 3)),
            .splitClip(SplitClipCommand(clipId: "v1", kind: .video,
                                        splitAtRelativeTime: 1,
                                        leftId: "L", rightId: "R")),
            .addTransition(AddTransitionCommand(transition: transition)),
            .removeTransition(RemoveTransitionCommand(transitionId: "tr1",
                                                     snapshot: transition,
                                                     insertionIndex: 0)),
            .changeTransition(ChangeTransitionCommand(transitionId: "tr1",
                                                     previous: transition,
                                                     updated: transition)),
            .addKeyframe(AddKeyframeCommand(clipId: "v1", kind: .video,
                                            keyframe: kf)),
            .moveKeyframe(MoveKeyframeCommand(clipId: "v1", kind: .video,
                                              keyframeId: "kf1",
                                              oldTime: 0, newTime: 1)),
            .deleteKeyframe(DeleteKeyframeCommand(clipId: "v1", kind: .video,
                                                  keyframeId: "kf1",
                                                  snapshot: kf,
                                                  insertionIndex: 0)),
            .setClipProperty(SetClipPropertyCommand(clipId: "v1", kind: .video,
                                                    property: .volume(old: 1, new: 0.5))),
        ]
    }

    func test_anyEditCommand_hasExactlyTwelveCases() {
        XCTAssertEqual(makeAllCommandCases().count, 12)
    }

    func test_anyEditCommand_underlying_returnsConcreteCommand() {
        for any in makeAllCommandCases() {
            let underlying = any.underlying
            XCTAssertFalse(underlying.id.isEmpty)
        }
    }

    func test_anyEditCommand_codableRoundTrip_allCases() throws {
        for any in makeAllCommandCases() {
            let data = try JSONEncoder().encode(any)
            let decoded = try JSONDecoder().decode(AnyEditCommand.self, from: data)
            XCTAssertEqual(decoded.typeTag, any.typeTag,
                           "Tag mismatch for case \(any.typeTag)")
        }
    }

    func test_anyEditCommand_apply_dispatchesToUnderlying() throws {
        var project = makeEmptyProject()
        let any = AnyEditCommand.addClip(
            AddClipCommand(clipId: "v1", postMediaId: "pm",
                           kind: .video, startTime: 0, duration: 1)
        )
        try any.apply(to: &project)
        XCTAssertEqual(project.mediaObjects.count, 1)
    }

    func test_anyEditCommand_revert_dispatchesToUnderlying() throws {
        var project = makeEmptyProject()
        let any = AnyEditCommand.addClip(
            AddClipCommand(clipId: "v1", postMediaId: "pm",
                           kind: .video, startTime: 0, duration: 1)
        )
        try any.apply(to: &project)
        try any.revert(from: &project)
        XCTAssertTrue(project.mediaObjects.isEmpty)
    }

    func test_anyEditCommand_decode_unknownType_throws() {
        let json = #"{"type":"alienCommand","payload":{}}"#.data(using: .utf8)!
        XCTAssertThrowsError(try JSONDecoder().decode(AnyEditCommand.self, from: json))
    }

    // MARK: - Apply/Revert idempotence sweep

    private func makeRichProject() -> TimelineProject {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm1",
                             mediaType: "video", placement: "media",
                             aspectRatio: 1.0,
                             startTime: 0, duration: 5),
            StoryMediaObject(id: "v2", postMediaId: "pm2",
                             mediaType: "video", placement: "media",
                             aspectRatio: 1.0,
                             startTime: 5, duration: 3),
        ]
        project.mediaObjects[0].keyframes = [
            StoryKeyframe(id: "kf-existing", time: 1, opacity: 0.5)
        ]
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pmA",
                                   placement: "overlay", volume: 1.0,
                                   waveformSamples: [], startTime: 0, duration: 8)
        ]
        project.textObjects = [
            StoryTextObject(id: "t1", text: "Title",
                            startTime: 0, duration: 4)
        ]
        project.clipTransitions = [
            StoryClipTransition(id: "tr-existing", fromClipId: "v1",
                                toClipId: "v2", kind: .crossfade, duration: 0.5)
        ]
        return project
    }

    private func encodedJSON(_ project: TimelineProject) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return try encoder.encode(project)
    }

    func test_allEditCommands_applyThenRevert_isIdempotentOnRichProject() throws {
        let media = StoryMediaObject(id: "v1", postMediaId: "pm1",
                                     mediaType: "video", placement: "media",
                                     aspectRatio: 1.0,
                                     startTime: 0, duration: 5,
                                     keyframes: [StoryKeyframe(id: "kf-existing", time: 1, opacity: 0.5)])
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pmA",
                                           placement: "overlay", volume: 1.0,
                                           waveformSamples: [],
                                           startTime: 0, duration: 8)
        let text = StoryTextObject(id: "t1", text: "Title",
                                   startTime: 0, duration: 4)
        let existingTransition = StoryClipTransition(
            id: "tr-existing", fromClipId: "v1", toClipId: "v2",
            kind: .crossfade, duration: 0.5
        )
        let existingKf = StoryKeyframe(id: "kf-existing", time: 1, opacity: 0.5)

        let cases: [AnyEditCommand] = [
            // Add* uses NEW ids not in the baseline:
            .addClip(AddClipCommand(clipId: "vNEW", postMediaId: "pmN",
                                    kind: .video, startTime: 6, duration: 1)),
            .addTransition(AddTransitionCommand(
                transition: StoryClipTransition(id: "tr-NEW", fromClipId: "v1",
                                                toClipId: "v2",
                                                kind: .dissolve, duration: 0.4))),
            .addKeyframe(AddKeyframeCommand(clipId: "v1", kind: .video,
                                            keyframe: StoryKeyframe(id: "kf-NEW",
                                                                    time: 2,
                                                                    scale: 1.2))),
            // Mutating commands (target existing ids):
            .moveClip(MoveClipCommand(clipId: "v1", kind: .video,
                                      oldStartTime: 0, newStartTime: 2)),
            .trimClip(TrimClipCommand(clipId: "v1", kind: .video,
                                      oldStartTime: 0, oldDuration: 5,
                                      newStartTime: 1, newDuration: 3)),
            .splitClip(SplitClipCommand(clipId: "v1", kind: .video,
                                        splitAtRelativeTime: 2,
                                        leftId: "v1L", rightId: "v1R")),
            .changeTransition(ChangeTransitionCommand(
                transitionId: "tr-existing",
                previous: existingTransition,
                updated: StoryClipTransition(id: "tr-existing",
                                             fromClipId: "v1", toClipId: "v2",
                                             kind: .dissolve, duration: 1.0))),
            .moveKeyframe(MoveKeyframeCommand(clipId: "v1", kind: .video,
                                              keyframeId: "kf-existing",
                                              oldTime: 1, newTime: 3)),
            .setClipProperty(SetClipPropertyCommand(
                clipId: "a1", kind: .audio,
                property: .volume(old: 1.0, new: 0.4))),
            // Delete* commands carry snapshots equal to the existing entries:
            .deleteClip(DeleteClipCommand(clipId: "v1", kind: .video,
                                          snapshotMedia: media,
                                          snapshotAudio: nil,
                                          snapshotText: nil,
                                          insertionIndex: 0)),
            .removeTransition(RemoveTransitionCommand(
                transitionId: "tr-existing",
                snapshot: existingTransition, insertionIndex: 0)),
            .deleteKeyframe(DeleteKeyframeCommand(
                clipId: "v1", kind: .video,
                keyframeId: "kf-existing",
                snapshot: existingKf, insertionIndex: 0)),
        ]
        XCTAssertEqual(cases.count, 12, "Idempotence sweep must cover all 12 commands")

        let baselineJSON = try encodedJSON(makeRichProject())
        for any in cases {
            var project = makeRichProject()
            try any.apply(to: &project)
            try any.revert(from: &project)
            let after = try encodedJSON(project)
            XCTAssertEqual(after, baselineJSON,
                "Command \(any.typeTag) is not apply-revert idempotent")
        }
    }

    // MARK: - Clip name (persisted optional field)

    func test_storyMediaObject_name_roundtrips() throws {
        var m = StoryMediaObject(aspectRatio: 1.0)
        m.name = "Intro"
        let data = try JSONEncoder().encode(m)
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: data)
        XCTAssertEqual(decoded.name, "Intro")
    }

    func test_storyMediaObject_legacyWithoutName_decodesToNil() throws {
        let json = #"{"id":"m1","postMediaId":"p","mediaType":"image","aspectRatio":1.0}"#
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: Data(json.utf8))
        XCTAssertNil(decoded.name)
    }

    func test_storyAudioPlayerObject_name_roundtrips() throws {
        var a = StoryAudioPlayerObject()
        a.name = "Musique"
        let data = try JSONEncoder().encode(a)
        let decoded = try JSONDecoder().decode(StoryAudioPlayerObject.self, from: data)
        XCTAssertEqual(decoded.name, "Musique")
    }

    func test_storyTextObject_name_roundtrips() throws {
        var t = StoryTextObject(text: "Hello")
        t.name = "Titre"
        let data = try JSONEncoder().encode(t)
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: data)
        XCTAssertEqual(decoded.name, "Titre")
    }
}
