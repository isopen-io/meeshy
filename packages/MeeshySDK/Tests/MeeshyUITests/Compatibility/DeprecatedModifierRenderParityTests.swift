import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

@MainActor
final class DeprecatedModifierRenderParityTests: XCTestCase {

    private func pixels<V: View>(_ view: V) -> Data? {
        let renderer = ImageRenderer(content: view.frame(width: 40, height: 40))
        renderer.scale = 1
        guard let image = renderer.cgImage, let data = image.dataProvider?.data else { return nil }
        return data as Data
    }

    func test_cornerRadius_rendersLikeClipShapeRoundedRectangle() throws {
        let legacy = pixels(Color.red.frame(width: 40, height: 40).cornerRadius(12))
        let current = pixels(Color.red.frame(width: 40, height: 40).clipShape(RoundedRectangle(cornerRadius: 12)))
        let legacyData = try XCTUnwrap(legacy)
        let currentData = try XCTUnwrap(current)
        XCTAssertEqual(legacyData, currentData)
    }

    func test_foregroundStyleColorSecondary_rendersLikeForegroundColorSecondary_underTintedParent() throws {
        let legacy = pixels(
            Rectangle().foregroundColor(.secondary).foregroundStyle(Color.red)
        )
        let current = pixels(
            Rectangle().foregroundStyle(Color.secondary).foregroundStyle(Color.red)
        )
        let legacyData = try XCTUnwrap(legacy)
        let currentData = try XCTUnwrap(current)
        XCTAssertEqual(legacyData, currentData)
    }

    func test_foregroundStyleColorPrimary_rendersLikeForegroundColorPrimary_underTintedParent() throws {
        let legacy = pixels(
            Rectangle().foregroundColor(.primary).foregroundStyle(Color.red)
        )
        let current = pixels(
            Rectangle().foregroundStyle(Color.primary).foregroundStyle(Color.red)
        )
        let legacyData = try XCTUnwrap(legacy)
        let currentData = try XCTUnwrap(current)
        XCTAssertEqual(legacyData, currentData)
    }

    func test_foregroundStyle_rendersLikeForegroundColor_onTextWithOpacity() throws {
        let legacy = pixels(
            Text("Ab").font(.system(size: 20)).foregroundColor(Color.white.opacity(0.45))
                .background(Color.black)
        )
        let current = pixels(
            Text("Ab").font(.system(size: 20)).foregroundStyle(Color.white.opacity(0.45))
                .background(Color.black)
        )
        let legacyData = try XCTUnwrap(legacy)
        let currentData = try XCTUnwrap(current)
        XCTAssertEqual(legacyData, currentData)
    }

    func test_foregroundStyle_rendersLikeForegroundColor_onSFSymbolImage() throws {
        let legacy = pixels(
            Image(systemName: "lock.fill").foregroundColor(MeeshyColors.warning)
        )
        let current = pixels(
            Image(systemName: "lock.fill").foregroundStyle(MeeshyColors.warning)
        )
        let legacyData = try XCTUnwrap(legacy)
        let currentData = try XCTUnwrap(current)
        XCTAssertEqual(legacyData, currentData)
    }

    func test_bareHierarchicalSecondary_differsUnderTintedParent() throws {
        let qualified = pixels(
            Rectangle().foregroundStyle(Color.secondary).foregroundStyle(Color.red)
        )
        let bare = pixels(
            Rectangle().foregroundStyle(.secondary).foregroundStyle(Color.red)
        )
        let qualifiedData = try XCTUnwrap(qualified)
        let bareData = try XCTUnwrap(bare)
        XCTAssertNotEqual(qualifiedData, bareData)
    }
}
