import Testing
import SwiftUI
import CoreGraphics
import CoreImage
import MeeshySDK
@testable import MeeshyUI

/// LE CARRÉ QR DU BANDEAU DE PARRAINAGE (#9554) — « juste un carré QR code pour pouvoir capturer et
/// y aller ». Les témoins lisent ce qui est PEINT : les pixels du bandeau rendu à l'échelle de
/// l'image exportée (972 × 216, un point par pixel) redonnent la matrice du lien, module pour module.
@MainActor
@Suite("Jeu Meeshy — carré QR du lien de parrainage")
struct GameReferralQRTests {

    private static let link = "https://meeshy.me/signup/affiliate/AMANI7"
    private static let otherLink = "https://meeshy.me/signup/affiliate/ZOLA42"
    private static let bannerSize = CGSize(width: 972, height: 216)

    private func banner(link: String?, flame: Bool = true, rightToLeft: Bool = false) -> GameReferralBannerView {
        GameReferralBannerView(
            title: "Rejoins-moi sur Meeshy", link: link, qrLabel: "QR code de ton lien d'invitation",
            flameForm: flame ? .braise : nil, flameLabel: flame ? "23 j" : nil, rightToLeft: rightToLeft
        )
    }

    private func pixels(_ view: GameReferralBannerView) throws -> GameRenderProbe {
        try #require(GameRenderProbe.renderPixels(view, size: Self.bannerSize))
    }

    private func cells(_ square: GameReferralQRSquare) -> [[Bool]] {
        var grid = [[Bool]](repeating: [Bool](repeating: false, count: square.size), count: square.size)
        for run in square.runs {
            let y = (run.y - square.origin) / square.module
            for step in 0..<(run.width / square.module) {
                grid[y][(run.x - square.origin) / square.module + step] = true
            }
        }
        return grid
    }

    // MARK: - Le carré

    @Test("le carré encode le lien ENTIER : ses rectangles redonnent la matrice de l'encodeur")
    func squareCarriesTheMatrixOfTheLink() throws {
        let square = try #require(GameReferralQRSquare.make(link: Self.link, side: 181))
        let matrix = try #require(GameQRCode.encode(Self.link))
        #expect(square.size == matrix.size)
        #expect(cells(square) == matrix.modules)
    }

    @Test("181 pixels pour un lien d'affiliation : version 3, quatre pixels par module, centré")
    func squareGeometryOnTheExportedImage() throws {
        let square = try #require(GameReferralQRSquare.make(link: Self.link, side: 181))
        #expect(square.size == 29)
        #expect(square.module == 4)
        #expect(square.origin == 32)
        #expect(square.side == 181)
    }

    @Test("des modules en pixels entiers, deux au moins, et quatre modules de silence, pour des jetons de 6 à 64 caractères")
    func readableForEveryTokenLength() throws {
        for length in [6, 12, 24, 32, 48, 64] {
            let link = "https://meeshy.me/r/" + String(repeating: "A", count: length)
            let square = try #require(GameReferralQRSquare.make(link: link, side: 181))
            #expect(square.module >= GameReferralQRSquare.minModulePixels)
            #expect(square.origin >= GameReferralQRSquare.quietModules * square.module)
            #expect(square.origin + square.size * square.module <= square.side - GameReferralQRSquare.quietModules * square.module)
            #expect(square.runs.allSatisfy { ($0.x - square.origin) % square.module == 0 && $0.width % square.module == 0 && $0.height == square.module })
        }
    }

    @Test("sans lien, pas de carré ; et un lien que la place ne rendrait pas à deux pixels par module non plus")
    func noSquareWithoutALinkOrWithoutRoom() {
        #expect(GameReferralQRSquare.make(link: nil, side: 181) == nil)
        #expect(GameReferralQRSquare.make(link: "", side: 181) == nil)
        #expect(GameReferralQRSquare.make(link: Self.link, side: 0) == nil)
        #expect(GameReferralQRSquare.make(link: Self.link, side: 40) == nil)
        #expect(GameReferralQRSquare.make(link: String(repeating: "x", count: GameQRCode.byteCapacity(version: 16)), side: 181)?.module == 2)
        #expect(GameReferralQRSquare.make(link: String(repeating: "x", count: GameQRCode.byteCapacity(version: 16) + 1), side: 181) == nil)
    }

    // MARK: - La géométrie du bandeau

    @Test("le carré fait 181 pixels sur le bandeau de 216, posé au pixel entier en FIN de ligne")
    func qrSitsAtTheEndOfTheLine() {
        let metrics = GameReferralBannerMetrics(size: Self.bannerSize)
        #expect(metrics.qr == CGRect(x: 773, y: 18, width: 181, height: 181))
        #expect(metrics.signature.maxX < metrics.title.minX)
        #expect(metrics.title.maxX < metrics.flame.minX)
        #expect(metrics.flame.maxX < metrics.qr.minX)
        #expect(abs(metrics.flameLabel.midX - metrics.flame.midX) < 0.001)
        #expect(metrics.flameLabel.maxX < metrics.qr.minX)
    }

    @Test("en arabe le bandeau se retourne en entier : le carré passe à gauche, la Signature à droite")
    func theBannerMirrorsRightToLeft() {
        let ltr = GameReferralBannerMetrics(size: Self.bannerSize)
        let rtl = GameReferralBannerMetrics(size: Self.bannerSize, rightToLeft: true)
        #expect(rtl.qr == CGRect(x: 18, y: 18, width: 181, height: 181))
        #expect(abs(rtl.signature.maxX - (Self.bannerSize.width - ltr.signature.minX)) < 0.001)
        #expect(rtl.qr.maxX < rtl.flame.minX)
        #expect(rtl.flame.maxX < rtl.title.minX)
        #expect(rtl.title.maxX < rtl.signature.minX)
    }

    @Test("sans Flamme, la phrase prend la place jusqu'au carré")
    func withoutAFlameTheTitleReachesTheSquare() {
        let with = GameReferralBannerMetrics(size: Self.bannerSize)
        let without = GameReferralBannerMetrics(size: Self.bannerSize, hasFlame: false)
        #expect(without.title.width > with.title.width)
        #expect(without.title.maxX < without.qr.minX)
    }

    // MARK: - Ce qui est peint

    private func assertPaints(_ probe: GameRenderProbe, link: String, at slot: CGRect) throws {
        let square = try #require(GameReferralQRSquare.make(link: link, side: Int(slot.width)))
        let matrix = try #require(GameQRCode.encode(link))
        let left = Int(slot.minX)
        let top = Int(slot.minY)
        let painted = (0..<square.size).map { y in
            (0..<square.size).map { x in
                probe.isDark(x: left + square.origin + x * square.module + square.module / 2,
                             y: top + square.origin + y * square.module + square.module / 2)
            }
        }
        #expect(painted == matrix.modules)
        for offset in [0, square.origin - 1, Int(slot.width) - square.origin, Int(slot.width) - 1] {
            #expect(probe.isWhite(x: left + offset, y: top + Int(slot.height) / 2))
            #expect(probe.isWhite(x: left + Int(slot.width) / 2, y: top + offset))
        }
    }

    @Test("le bandeau peint le carré du lien : chaque module relu en son centre est celui de la matrice, sur fond clair")
    func bannerPaintsTheMatrix() throws {
        let probe = try pixels(banner(link: Self.link))
        try assertPaints(probe, link: Self.link, at: GameReferralBannerMetrics(size: Self.bannerSize).qr)
    }

    @Test("retourné, le bandeau peint le MÊME carré, à gauche")
    func mirroredBannerPaintsTheSameMatrix() throws {
        let probe = try pixels(banner(link: Self.link, rightToLeft: true))
        try assertPaints(probe, link: Self.link, at: GameReferralBannerMetrics(size: Self.bannerSize, rightToLeft: true).qr)
    }

    @Test("le lien n'est plus écrit : deux liens ne changent le bandeau que DANS le carré")
    func theLinkIsNoLongerWritten() throws {
        let first = try pixels(banner(link: Self.link, flame: false))
        let second = try pixels(banner(link: Self.otherLink, flame: false))
        let slot = GameReferralBannerMetrics(size: Self.bannerSize).qr
        #expect(first.differingPixels(from: second, outside: slot) == 0)
        #expect(first.differingPixels(from: second, outside: .null) > 0)
    }

    @Test("sans jeton : un emplacement en pointillé VIDE — aucun fond clair, aucun module")
    func placeholderIsAnEmptyDashedSlot() throws {
        let probe = try pixels(banner(link: nil))
        let slot = GameReferralBannerMetrics(size: Self.bannerSize).qr
        let inside = slot.insetBy(dx: 12, dy: 12)
        let ground = probe.pixel(x: Int(slot.minX) - 6, y: Int(slot.midY))
        var white = 0
        var foreign = 0
        var dashed = 0
        for y in Int(slot.minY)..<Int(slot.maxY) {
            for x in Int(slot.minX)..<Int(slot.maxX) {
                if probe.isWhite(x: x, y: y) { white += 1 }
                let isInside = inside.contains(CGPoint(x: x, y: y))
                if isInside, probe.pixel(x: x, y: y) != ground { foreign += 1 }
                if !isInside, probe.pixel(x: x, y: y) != ground { dashed += 1 }
            }
        }
        #expect(white == 0)
        #expect(foreign == 0)
        #expect(dashed > 0)
    }

    // MARK: - Le carré se lit

    @Test("le carré peint se DÉCODE : un lecteur indépendant (CoreImage) y relit le lien d'entrée")
    func thePaintedSquareDecodesToTheLink() throws {
        let renderer = ImageRenderer(content: banner(link: Self.link).frame(width: Self.bannerSize.width, height: Self.bannerSize.height))
        renderer.scale = 1
        let image = try #require(renderer.cgImage)
        let slot = GameReferralBannerMetrics(size: Self.bannerSize).qr
        let cropped = try #require(image.cropping(to: slot))
        let detector = try #require(CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]))
        let enlarged = CIImage(cgImage: cropped).samplingNearest().transformed(by: CGAffineTransform(scaleX: 4, y: 4))
        let messages = detector.features(in: enlarged).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
        #expect(messages == [Self.link])
    }
}

extension GameRenderProbe {

    /// Rend la vue à UN point par pixel — l'échelle de l'image exportée.
    static func renderPixels<V: View>(_ view: V, size: CGSize) -> GameRenderProbe? {
        let renderer = ImageRenderer(content: view.frame(width: size.width, height: size.height))
        renderer.scale = 1
        guard let image = renderer.cgImage else { return nil }
        let w = image.width
        let h = image.height
        var buffer = [UInt8](repeating: 0, count: w * h * 4)
        let drawn = buffer.withUnsafeMutableBytes { raw -> Bool in
            guard let context = CGContext(
                data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return drawn ? GameRenderProbe(width: w, height: h, rgba: buffer) : nil
    }

    func pixel(x: Int, y: Int) -> [UInt8] {
        let index = (y * width + x) * 4
        return Array(rgba[index..<(index + 4)])
    }

    func isWhite(x: Int, y: Int) -> Bool {
        pixel(x: x, y: y).allSatisfy { $0 > 245 }
    }

    func isDark(x: Int, y: Int) -> Bool {
        let value = pixel(x: x, y: y)
        return value[3] > 245 && value[0] < 40 && value[1] < 40 && value[2] < 40
    }

    /// Le nombre de pixels qui diffèrent de `other`, hors du rectangle `excluded`.
    func differingPixels(from other: GameRenderProbe, outside excluded: CGRect) -> Int {
        guard width == other.width, height == other.height else { return .max }
        return (0..<(width * height)).filter { index in
            let point = CGPoint(x: index % width, y: index / width)
            guard !excluded.contains(point) else { return false }
            return rgba[(index * 4)..<(index * 4 + 4)] != other.rgba[(index * 4)..<(index * 4 + 4)]
        }.count
    }
}
