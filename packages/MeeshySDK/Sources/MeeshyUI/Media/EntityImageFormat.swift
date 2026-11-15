import CoreGraphics
import UIKit

/// **Le format d'une image d'identité** (#17251) : l'avatar est un rond 1:1, la
/// bannière un bandeau 3:1. L'éditeur cadre à ce format, et le recadrage final
/// le garantit quel que soit ce que l'éditeur a rendu.
public nonisolated enum EntityImageFormat: Equatable, Hashable, Sendable {
    case avatar
    case banner

    public var aspect: CGFloat {
        switch self {
        case .avatar: return 1
        case .banner: return 3
        }
    }

    public var isRound: Bool { self == .avatar }

    /// Le plus grand cadre aux proportions du format, centré dans cette taille.
    public func centeredCrop(in size: CGSize) -> CGRect {
        guard size.width > 0, size.height > 0 else { return .zero }
        let width = min(size.width, size.height * aspect)
        let height = width / aspect
        return CGRect(x: (size.width - width) / 2, y: (size.height - height) / 2, width: width, height: height)
    }

    /// L'image recadrée au format, centrée ; intacte si elle y est déjà.
    public func cropped(_ image: UIImage) -> UIImage {
        let size = image.size
        guard size.width > 0, size.height > 0, abs(size.width / size.height - aspect) > 0.01 else { return image }
        let rect = centeredCrop(in: size)
        let format = UIGraphicsImageRendererFormat()
        format.scale = image.scale
        return UIGraphicsImageRenderer(size: rect.size, format: format).image { _ in
            image.draw(at: CGPoint(x: -rect.minX, y: -rect.minY))
        }
    }
}

/// Ce qu'une retouche d'image d'identité rend : une image, ou rien.
public enum EntityImageEditOutcome {
    case edited(UIImage)
    case cancelled
}

/// **Ce qui part vers l'appelant** (#17251) : une retouche annulée ne remet
/// aucun octet ; une image retouchée part recadrée à son format, puis compressée.
public nonisolated enum EntityImageDelivery {

    public enum Route: Equatable, Sendable {
        case edit
        case direct
    }

    /// Sans éditeur injecté, l'image choisie part recadrée au centre.
    public static func route(hasEditor: Bool) -> Route {
        hasEditor ? .edit : .direct
    }

    @MainActor
    public static func data(for outcome: EntityImageEditOutcome, format: EntityImageFormat, maxSizeKB: Int) async -> Data? {
        guard case .edited(let image) = outcome else { return nil }
        return await ImageCompressor.compressOffMain(format.cropped(image), maxSizeKB: maxSizeKB)
    }
}
