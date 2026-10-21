import XCTest
import SwiftUI
@testable import Meeshy

/// Mode Bulles : le liseré arc-en-ciel ÉPOUSE la bulle — même forme, mêmes
/// coins, mêmes dimensions, sans débord. La capture du porteur (2026-08-24)
/// montrait un rectangle sur toute la largeur du fil, deux fois plus haut que
/// la bulle « Le 1er » : l'effet était monté sur la RANGÉE.
final class BubbleRainbowOutlineTests: XCTestCase {

    /// Mêmes coins : une seule source pour le rayon de la bulle et celui du liseré.
    @MainActor
    func test_theOutline_hasTheBubblesCorners() {
        XCTAssertEqual(RainbowEffect(active: true, animated: false).cornerRadius,
                       BubbleStandardLayout.bubbleCornerRadius)
        let bubble = AppSourceGuard.stripComments(try! AppSourceGuard.unit(
            "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+TextBubble.swift"))
        XCTAssertTrue(bubble.contains(".clipShape(RoundedRectangle(cornerRadius: Self.bubbleCornerRadius))"))
    }

    /// Mêmes dimensions : le liseré est un `overlay`, donc il prend EXACTEMENT
    /// le cadre de ce qu'il entoure. Mesuré : contenu de taille connue, liseré
    /// rendu par-dessus, aucun pixel coloré hors du cadre.
    @MainActor
    func test_theOutline_neverPaintsOutsideWhatItSurrounds() throws {
        let size = CGSize(width: 120, height: 48)
        let margin: CGFloat = 40
        let view = ZStack {
            Color.white
            Color.clear
                .frame(width: size.width, height: size.height)
                .modifier(RainbowEffect(active: true, animated: false))
        }
        .frame(width: size.width + 2 * margin, height: size.height + 2 * margin)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        let image = try XCTUnwrap(renderer.cgImage)
        let inner = CGRect(x: margin, y: margin, width: size.width, height: size.height)
        // Le halo flouté (6 pt) déborde par construction d'un flou ; le LISERÉ, lui, ne doit
        // jamais s'étendre au-delà du flou : rien de coloré à plus de 8 pt du cadre.
        let allowed = inner.insetBy(dx: -8, dy: -8)
        XCTAssertEqual(Self.colouredPixels(in: image, outside: allowed), 0)
        XCTAssertGreaterThan(Self.colouredPixels(in: image, outside: inner.insetBy(dx: 4, dy: 4)), 0,
                             "fusible : le liseré est bien rendu, le long du cadre")
    }

    /// Mode Bulles : l'effet se pose sur la bulle, AVANT les réactions et
    /// avant l'étirement au cap — jamais sur la rangée.
    func test_theEffect_isMountedOnTheBubble_beforeReactionsAndTheCap() throws {
        let layout = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift"))
        let effect = try XCTUnwrap(layout.range(of: ".messageEffects(message.effects)"))
        let reactions = try XCTUnwrap(layout.range(of: ".overlay(alignment: isMe ? .bottomLeading : .bottomTrailing)"))
        let cap = try XCTUnwrap(layout.range(of: ".frame(maxWidth: DeviceLayout.bubbleMaxWidth(sizeClass: horizontalSizeClass, containerWidth: bubbleContainerWidth)"))
        XCTAssertLessThan(effect.lowerBound, reactions.lowerBound)
        XCTAssertLessThan(effect.lowerBound, cap.lowerBound)
    }

    private static func colouredPixels(in image: CGImage, outside allowed: CGRect) -> Int {
        let w = image.width, h = image.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        var count = 0
        for y in 0..<h {
            for x in 0..<w where !allowed.contains(CGPoint(x: x, y: y)) {
                let i = (y * w + x) * 4
                let r = Int(data[i]), g = Int(data[i + 1]), b = Int(data[i + 2])
                if max(r, g, b) - min(r, g, b) > 12 { count += 1 }
            }
        }
        return count
    }
}
