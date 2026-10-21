import Foundation
import ImageIO
import UniformTypeIdentifiers

/// **Des images d'une boucle, encodées en PNG animé (APNG)** (#10639).
///
/// Le seul conteneur animé AVEC canal alpha qu'ImageIO sait ÉCRIRE et que les
/// trois clients savent LIRE (`AnimatedImageEligibility.Container.apng`,
/// publié en `image/png`) : le GIF n'a qu'un bit d'alpha et ImageIO n'écrit pas
/// le WebP. C'est la forme sous laquelle un sticker Lottie part dans une story.
nonisolated public enum AnimatedImageEncoder {

    public static func apng(_ decoded: AnimatedImageDecoder.Decoded) -> Data? {
        guard !decoded.frames.isEmpty else { return nil }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, decoded.frames.count, nil) else {
            return nil
        }
        let png = kCGImagePropertyPNGDictionary as String
        CGImageDestinationSetProperties(destination, [png: [kCGImagePropertyAPNGLoopCount as String: decoded.loopCount]] as CFDictionary)
        let delay = decoded.duration / Double(decoded.frames.count)
        for frame in decoded.frames {
            CGImageDestinationAddImage(destination, frame, [png: [kCGImagePropertyAPNGDelayTime as String: delay]] as CFDictionary)
        }
        guard CGImageDestinationFinalize(destination) else { return nil }
        return data as Data
    }
}
