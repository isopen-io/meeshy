import CoreGraphics
import UIKit
import MeeshySDK

/// **Ce qui ne varie pas d'une image à l'autre** dans la puce d'un son
/// (#8611) : la teinte du verre, le liseré, l'icône, et le crédit rasterisé
/// en une seule bande. Construit une fois par forme de puce et par
/// résolution, puis posé tel quel à chaque image exportée.
struct StoryAudioChipTemplate {

    struct Key: Hashable {
        let content: String?
        let muted: Bool
        let unitMilli: Int
        let scaleCenti: Int

        init(placement: StoryAudioChipPlacement, deviceScale: CGFloat) {
            switch placement.display {
            case .waveform: content = nil
            case .marquee(let text): content = text
            }
            muted = placement.muted
            unitMilli = Int((placement.unit * 1000).rounded())
            scaleCenti = Int((deviceScale * 100).rounded())
        }
    }

    /// Teinte posée sur le fond flouté — le voile sombre du matériau
    /// `.ultraThinMaterial` au-dessus d'un média.
    static let glassTint = UIColor(white: 0, alpha: 0.28)
    /// Liseré de la vue en thème sombre (`strokeColor` non sélectionné).
    static let hairline = UIColor.white.withAlphaComponent(0.25)
    /// Surface pleine quand le fond ne peut pas être lu sous la puce.
    static let opaqueSurface: UIColor =
        (StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo900Hex) ?? .black)
            .withAlphaComponent(0.72)
    static let mutedIcon = UIColor.white.withAlphaComponent(0.55)
    static let creditColor = UIColor.white.withAlphaComponent(0.92)

    /// Capsule teintée + liseré + icône, à la taille de la puce.
    let chrome: CGImage
    /// Le crédit en une bande, `nil` pour une onde.
    let credit: CGImage?
    /// Largeur du crédit en points du contexte.
    let creditWidth: CGFloat

    @MainActor
    init(placement: StoryAudioChipPlacement, deviceScale: CGFloat) {
        let format = UIGraphicsImageRendererFormat()
        format.scale = deviceScale
        format.opaque = false
        chrome = Self.chrome(placement: placement, format: format)
        switch placement.display {
        case .waveform:
            credit = nil
            creditWidth = 0
        case .marquee(let text):
            let rendered = Self.credit(text, unit: placement.unit, format: format)
            credit = rendered.image
            creditWidth = rendered.width
        }
    }

    @MainActor
    private static func chrome(placement: StoryAudioChipPlacement,
                               format: UIGraphicsImageRendererFormat) -> CGImage {
        let size = placement.size
        let unit = placement.unit
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            let bounds = CGRect(origin: .zero, size: size)
            let capsule = UIBezierPath(roundedRect: bounds, cornerRadius: size.height / 2)
            glassTint.setFill()
            capsule.fill()
            let edge = UIBezierPath(roundedRect: bounds.insetBy(dx: unit / 2, dy: unit / 2),
                                    cornerRadius: (size.height - unit) / 2)
            hairline.setStroke()
            edge.lineWidth = unit
            edge.stroke()
            let icon = CGRect(x: StoryAudioChipPlacement.padding.width * unit,
                              y: StoryAudioChipPlacement.padding.height * unit,
                              width: StoryAudioChipPlacement.iconSide * unit,
                              height: StoryAudioChipPlacement.iconSide * unit)
            drawIcon(muted: placement.muted, in: icon, unit: unit, context: context.cgContext)
        }
        return image.cgImage!
    }

    /// L'icône de la vue : `waveform` au dégradé de marque (#6366F1 → #4338CA,
    /// haut-gauche → bas-droite), `waveform.slash` en blanc atténué quand la
    /// piste est coupée.
    @MainActor
    private static func drawIcon(muted: Bool, in rect: CGRect, unit: CGFloat, context: CGContext) {
        let configuration = UIImage.SymbolConfiguration(pointSize: 14 * unit, weight: .bold)
        guard let symbol = UIImage(systemName: muted ? "waveform.slash" : "waveform",
                                   withConfiguration: configuration) else { return }
        let origin = CGPoint(x: rect.midX - symbol.size.width / 2, y: rect.midY - symbol.size.height / 2)
        guard !muted else {
            symbol.withTintColor(mutedIcon, renderingMode: .alwaysOriginal).draw(at: origin)
            return
        }
        let glyph = CGRect(origin: origin, size: symbol.size)
        context.saveGState()
        context.beginTransparencyLayer(auxiliaryInfo: nil)
        symbol.withTintColor(.white, renderingMode: .alwaysOriginal).draw(at: origin)
        context.setBlendMode(.sourceIn)
        let colors = [MeeshyColors.brandPrimaryHex, MeeshyColors.brandDeepHex]
            .compactMap { StoryTextLayer.parseHexColorNonisolated($0)?.cgColor } as CFArray
        if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: nil) {
            context.drawLinearGradient(gradient,
                                       start: CGPoint(x: glyph.minX, y: glyph.minY),
                                       end: CGPoint(x: glyph.maxX, y: glyph.maxY),
                                       options: [])
        }
        context.endTransparencyLayer()
        context.restoreGState()
    }

    /// Le crédit en une bande à sa largeur NATURELLE : la vue le fait défiler
    /// quand il déborde, l'export aussi — il ne se tronque donc jamais.
    @MainActor
    private static func credit(_ text: String, unit: CGFloat,
                               format: UIGraphicsImageRendererFormat) -> (image: CGImage?, width: CGFloat) {
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 12 * unit, weight: .semibold),
            .foregroundColor: creditColor
        ]
        let measured = (text as NSString).size(withAttributes: attributes)
        let size = CGSize(width: ceil(measured.width), height: ceil(measured.height))
        guard size.width > 0, size.height > 0 else { return (nil, 0) }
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            (text as NSString).draw(at: .zero, withAttributes: attributes)
        }
        return (image.cgImage, size.width)
    }
}

/// **Le verre de la puce** (#8609) : ce qui est déjà peint sous elle, flouté.
///
/// `.ultraThinMaterial` n'a pas d'équivalent dans un rendu Core Graphics ; son
/// effet visible — les couleurs de derrière, adoucies — s'approche en lisant
/// les pixels sous la puce, en les moyennant par blocs d'environ
/// `blockPoints` points (réduction), puis en les agrandissant avec
/// interpolation. Aucune copie de l'image entière : la zone est lue EN PLACE
/// dans la mémoire du contexte, puis réduite dans un petit tampon.
enum StoryAudioChipGlass {

    struct Frosted {
        let image: CGImage
        /// Zone (repère du contexte) que l'image recouvre — la puce élargie
        /// d'une marge, pour que le flou prenne ses couleurs AUTOUR des bords.
        let rect: CGRect
    }

    /// Côté du bloc moyenné, en points de la vue de référence.
    static let blockPoints: CGFloat = 6

    @MainActor
    static func frostedBackdrop(under rect: CGRect, unit: CGFloat, in context: CGContext) -> Frosted? {
        // `data == nil` : contexte sans mémoire adressable (celui de
        // `UIGraphicsImageRenderer`) — la capsule prend sa teinte pleine.
        guard let data = context.data,
              context.bitsPerPixel == 32, context.bitsPerComponent == 8,
              let space = context.colorSpace else { return nil }
        let margin = blockPoints * unit
        let wanted = rect.insetBy(dx: -margin, dy: -margin)
        let bounds = CGRect(x: 0, y: 0, width: context.width, height: context.height)
        let device = context.convertToDeviceSpace(wanted).standardized.intersection(bounds).integral
        guard !device.isNull, device.width >= 1, device.height >= 1 else { return nil }

        let width = Int(device.width)
        let height = Int(device.height)
        let column = Int(device.minX)
        // L'espace périphérique d'un contexte bitmap iOS descend comme la
        // mémoire : y = rangée depuis le HAUT (mesuré, témoin
        // `test_chip_glassSamplesWhatIsDirectlyBehindIt`).
        let row = Int(device.minY)
        guard column >= 0, row >= 0, column + width <= context.width, row + height <= context.height else {
            return nil
        }
        let bytesPerRow = context.bytesPerRow
        let start = data.advanced(by: row * bytesPerRow + column * 4)
        let length = (height - 1) * bytesPerRow + width * 4
        guard let provider = CGDataProvider(dataInfo: nil, data: start, size: length,
                                            releaseData: { _, _, _ in }),
              let region = CGImage(width: width, height: height,
                                   bitsPerComponent: 8, bitsPerPixel: 32,
                                   bytesPerRow: bytesPerRow, space: space,
                                   bitmapInfo: context.bitmapInfo, provider: provider,
                                   decode: nil, shouldInterpolate: false,
                                   intent: .defaultIntent) else { return nil }

        let block = max(2, blockPoints * unit * StoryAudioChipPainter.deviceScale(of: context))
        let smallWidth = max(1, Int((CGFloat(width) / block).rounded(.up)))
        let smallHeight = max(1, Int((CGFloat(height) / block).rounded(.up)))
        guard let small = CGContext(data: nil, width: smallWidth, height: smallHeight,
                                    bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        small.interpolationQuality = .high
        small.draw(region, in: CGRect(x: 0, y: 0, width: smallWidth, height: smallHeight))
        guard let frosted = small.makeImage() else { return nil }
        return Frosted(image: frosted, rect: context.convertToUserSpace(device).standardized)
    }
}
