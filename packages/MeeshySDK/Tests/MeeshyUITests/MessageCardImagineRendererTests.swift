import Testing
import Foundation
import UIKit
import MeeshySDK
@testable import MeeshyUI

/// « Imagine » (#8692) — la vignette montre le séparateur comme l'image
/// exportée, un média se peint dans son cadre, et une carte animée se peint
/// image par image par le MÊME moteur.
struct MessageCardImagineRendererTests {

    private static let orbite = MessageCardTemplateID(palette: .aurore, typeface: .rond, link: .orbite)

    private static func input(media: [MessageCardMedia] = [], disposition: MessageCardDisposition = .standard, time: Double? = nil) -> MessageCardInput {
        MessageCardInput(
            quoted: MessageCardPart(author: "Awa", text: "On se retrouve où ce soir ?"),
            reply: MessageCardPart(author: "Jacques", text: "Chez Lina, à 20 h !"),
            template: orbite,
            handle: "jacques",
            media: media,
            disposition: disposition,
            time: time
        )
    }

    /// Les pixels RGBA d'une image, lus dans un contexte connu.
    private static func pixels(_ image: CGImage) -> (bytes: [UInt8], width: Int, height: Int) {
        let width = image.width
        let height = image.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        bytes.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(
                data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        return (bytes, width, height)
    }

    /// Combien de pixels d'une bande horizontale ont la couleur de l'accent.
    private static func accentPixels(in image: CGImage, top: Int, bottom: Int, accent: MessageCardColor) -> Int {
        let (bytes, width, height) = pixels(image)
        let target = [accent.red, accent.green, accent.blue].map { Int(($0 * 255).rounded()) }
        var count = 0
        for y in max(0, top)..<min(height, bottom) {
            for x in 0..<width {
                let index = (y * width + x) * 4
                let distance = abs(Int(bytes[index]) - target[0]) + abs(Int(bytes[index + 1]) - target[1]) + abs(Int(bytes[index + 2]) - target[2])
                if distance < 90 { count += 1 }
            }
        }
        return count
    }

    @Test func thumbnail_showsTheSeparatorLikeTheExportedImage() throws {
        let input = Self.input()
        let card = try #require(MessageCardRenderer.render(input))
        let link = try #require(card.regions.first { $0.part == .link })
        let accent = Self.orbite.palette.palette.accent
        let full = try #require(UIImage(data: card.png)?.cgImage)
        #expect(Self.accentPixels(in: full, top: Int(link.y), bottom: Int(link.y + link.height), accent: accent) > 50)

        let width = 72.0
        let scale = 2.0
        let thumb = try #require(MessageCardRenderer.thumbnail(input, width: width, displayScale: scale)?.cgImage)
        let factor = width / Double(card.width) * scale
        let visible = Self.accentPixels(in: thumb, top: Int(link.y * factor), bottom: Int(((link.y + link.height) * factor).rounded(.up)), accent: accent)
        #expect(visible >= 12, "le séparateur doit rester visible dans la vignette (\(visible) px d'accent)")
    }

    @Test func render_paintsTheMediaInItsFrame() throws {
        let red = try #require(Self.solid(UIColor(red: 1, green: 0, blue: 0, alpha: 1)))
        let photo = MessageCardMedia(id: "p1", kind: .image, aspect: 1)
        let input = Self.input(media: [photo])
        let card = try #require(MessageCardRenderer.render(input, pictures: MessageCardPictures(["p1": red])))
        let zone = try #require(card.regions.first { $0.part == .media })
        let image = try #require(UIImage(data: card.png)?.cgImage)
        let red1 = MessageCardColor(red: 1, green: 0, blue: 0)
        let middle = Int(zone.y + zone.height / 2)
        #expect(Self.accentPixels(in: image, top: middle - 2, bottom: middle + 2, accent: red1) > Int(zone.width) * 3)
        let bare = try #require(MessageCardRenderer.render(input))
        let empty = try #require(UIImage(data: bare.png)?.cgImage)
        #expect(Self.accentPixels(in: empty, top: middle - 2, bottom: middle + 2, accent: red1) == 0)
    }

    @Test func frame_paintsAnAnimatedCardAtThePlanSize() throws {
        let voice = MessageCardMedia(id: "a1", kind: .audio, duration: 20)
        let input = Self.input(media: [voice], disposition: MessageCardDisposition(aspect: .portrait))
        let plan = try #require(MessageCardMotionPlan.of(.video, media: [voice]))
        let size = MessageCardRenderer.size(of: input)
        #expect(size.width == 1080 && size.height == 1350)
        let pixels = plan.pixelSize(width: Double(size.width), height: Double(size.height))
        let frame = try #require(MessageCardRenderer.frame(input.clipped(to: plan.clip).at(time: plan.time(ofFrame: 3)), pictures: .none, pixelWidth: pixels.width, pixelHeight: pixels.height))
        #expect(frame.width == pixels.width && frame.height == pixels.height)
    }

    @Test func render_everyDispositionProducesAnImage() {
        let media = [MessageCardMedia(id: "p1", kind: .image), MessageCardMedia(id: "v1", kind: .video), MessageCardMedia(id: "a1", kind: .audio, duration: 5)]
        for aspect in MessageCardAspect.allCases {
            for layout in MessageCardMediaLayout.allCases {
                for header in MessageCardHeaderOrientation.allCases {
                    let disposition = MessageCardDisposition(aspect: aspect, headerOrientation: header, authorPlacement: .after, tilt: .right, mediaLayout: layout)
                    let input = MessageCardInput(
                        quoted: nil, reply: MessageCardPart(author: "J", text: "Réponse"), template: Self.orbite, handle: nil,
                        title: "Soirée", date: "28 sept.", media: media, disposition: disposition, replyTime: "14:32"
                    )
                    #expect(MessageCardRenderer.render(input) != nil, "\(aspect) \(layout) \(header)")
                }
            }
        }
    }

    private static func solid(_ color: UIColor) -> CGImage? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 40, height: 40), format: format).image { context in
            color.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 40, height: 40))
        }.cgImage
    }
}
