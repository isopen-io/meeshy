import Foundation
import ImageIO

/// **Ce qui dit OÙ une photo a été prise, et son retrait sans ré-encodage** (#12905).
///
/// Le lieu, ce sont les coordonnées GPS ET les noms de lieu IPTC (ville,
/// sous-lieu, région, pays), que l'XMP double. `kCGImageMetadataShouldExcludeGPS`
/// seul ne suffit pas : sur un HEIC, ImageIO l'ignore et recopie le GPS
/// (mesuré sur le simulateur iOS et sur macOS). La copie réécrit donc l'arbre de
/// métadonnées sans ces champs, les données compressées des pixels intactes,
/// puis le retrait se VÉRIFIE sur les octets écrits : un lieu qui survit est un
/// échec, jamais un envoi.
enum OutgoingImageLocation {
    static func isCarried(by properties: [CFString: Any]) -> Bool {
        properties[kCGImagePropertyGPSDictionary] != nil
            || (properties[kCGImagePropertyIPTCDictionary] as? [CFString: Any])
                .map { iptc in iptcPlaceKeys.contains { iptc[$0] != nil } } ?? false
    }

    static func isCarried(by source: CGImageSource) -> Bool {
        (0..<CGImageSourceGetCount(source)).contains { index in
            (CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]).map(isCarried(by:)) ?? false
        }
    }

    /// Les propriétés qu'un encodage écrit, sans le lieu.
    static func removed(from properties: [CFString: Any]) -> [CFString: Any] {
        properties
            .filter { $0.key != kCGImagePropertyGPSDictionary }
            .merging(placelessIPTC(properties)) { _, placeless in placeless }
    }

    /// La copie sans lieu de `source` dans `destination` ; `false` si ImageIO refuse.
    /// Elle ne se croit pas sur parole : l'appelant relit les octets écrits.
    static func copyWithoutLocation(_ source: CGImageSource, to destination: CGImageDestination) -> Bool {
        CGImageDestinationCopyImageSource(destination, source, copyOptions(source), nil)
    }

    private static func copyOptions(_ source: CGImageSource) -> CFDictionary {
        let excludeGPS: [CFString: Any] = [kCGImageMetadataShouldExcludeGPS: true]
        guard let metadata = CGImageSourceCopyMetadataAtIndex(source, 0, nil),
              let placeless = CGImageMetadataCreateMutableCopy(metadata) else { return excludeGPS as CFDictionary }
        placeTagPaths(in: metadata).forEach { CGImageMetadataRemoveTagWithPath(placeless, nil, $0 as CFString) }
        return excludeGPS
            .merging([kCGImageDestinationMetadata: placeless, kCGImageDestinationMergeMetadata: false]) { _, set in set }
            as CFDictionary
    }

    private static func placeTagPaths(in metadata: CGImageMetadata) -> [String] {
        let tags = CGImageMetadataCopyTags(metadata) as? [CGImageMetadataTag] ?? []
        return tags.compactMap { tag in
            guard let prefix = CGImageMetadataTagCopyPrefix(tag) as String?,
                  let name = CGImageMetadataTagCopyName(tag) as String? else { return nil }
            let path = "\(prefix):\(name)"
            return (prefix == "exif" && name.hasPrefix("GPS")) || xmpPlacePaths.contains(path) ? path : nil
        }
    }

    private static func placelessIPTC(_ properties: [CFString: Any]) -> [CFString: Any] {
        guard let iptc = properties[kCGImagePropertyIPTCDictionary] as? [CFString: Any] else { return [:] }
        return [kCGImagePropertyIPTCDictionary: iptc.filter { !iptcPlaceKeys.contains($0.key) }]
    }

    private static var iptcPlaceKeys: [CFString] {
        [
            kCGImagePropertyIPTCCity,
            kCGImagePropertyIPTCSubLocation,
            kCGImagePropertyIPTCProvinceState,
            kCGImagePropertyIPTCCountryPrimaryLocationName,
            kCGImagePropertyIPTCCountryPrimaryLocationCode,
        ]
    }

    private static let xmpPlacePaths: Set<String> = [
        "photoshop:City",
        "photoshop:State",
        "photoshop:Country",
        "Iptc4xmpCore:Location",
        "Iptc4xmpCore:CountryCode",
        "Iptc4xmpExt:LocationCreated",
        "Iptc4xmpExt:LocationShown",
    ]
}
