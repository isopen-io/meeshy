// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/BackgroundTransformTests.swift
import XCTest
@testable import MeeshyUI

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
}
