// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/BackgroundTransformTests.swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class BackgroundTransformTests: XCTestCase {
    func test_identity_hasNeutralValues() {
        let t = BackgroundTransform.identity
        XCTAssertEqual(t.scale, 1.0)
        XCTAssertEqual(t.offsetX, 0.0)
        XCTAssertEqual(t.offsetY, 0.0)
        XCTAssertEqual(t.rotation, 0.0)
    }

    func test_caTransform_appliesScaleRotationTranslation() {
        let t = BackgroundTransform(scale: 2.0, offsetX: 10, offsetY: 20, rotation: 0)
        let tx = t.caTransform()
        // 2x scale → m11 = 2.0
        XCTAssertEqual(tx.m11, 2.0, accuracy: 1e-9)
        XCTAssertEqual(tx.m22, 2.0, accuracy: 1e-9)
    }

    func test_storyBackgroundTransform_codable_roundTrip_withVideoFitMode() throws {
        let original = StoryBackgroundTransform(scale: 1.5, offsetX: 10, offsetY: 20,
                                                rotation: 5, videoFitMode: "fit")
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryBackgroundTransform.self, from: data)
        XCTAssertEqual(decoded.scale, 1.5)
        XCTAssertEqual(decoded.offsetX, 10)
        XCTAssertEqual(decoded.offsetY, 20)
        XCTAssertEqual(decoded.rotation, 5)
        XCTAssertEqual(decoded.videoFitMode, "fit")
    }

    func test_storyBackgroundTransform_codable_roundTrip_withNilVideoFitMode() throws {
        let original = StoryBackgroundTransform()
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryBackgroundTransform.self, from: data)
        XCTAssertNil(decoded.videoFitMode)
    }

    func test_storyBackgroundTransform_isIdentity_falseWhenVideoFitModeSet() {
        let t = StoryBackgroundTransform(videoFitMode: "fill")
        XCTAssertFalse(t.isIdentity)
    }

    func test_storyBackgroundTransform_isIdentity_trueWhenAllNil() {
        let t = StoryBackgroundTransform()
        XCTAssertTrue(t.isIdentity)
    }
}
