import Foundation
import ImageIO

/// **Ce qui dit OÙ une photo a été prise, et son retrait sans ré-encodage** (#12905).
///
/// Le lieu, ce sont les coordonnées GPS ET les noms de lieu IPTC — ville,
/// sous-lieu, région, pays, lieu du contenu, lieux créé et montré de l'extension
/// IPTC —, que l'XMP double ou porte seul. Une seule liste, `PlaceField`, sert
/// la détection, le retrait et la vérification, sur CHAQUE image de la source,
/// dans ses propriétés comme dans son arbre XMP.
///
/// `kCGImageMetadataShouldExcludeGPS` seul ne suffit pas : sur un HEIC, ImageIO
/// l'ignore et recopie le GPS (mesuré sur le simulateur iOS et sur macOS). La
/// copie réécrit donc l'arbre de métadonnées sans ces champs, les données
/// compressées des pixels intactes, puis le retrait se VÉRIFIE sur les octets
/// écrits : un lieu qui survit est un échec, jamais un envoi.
enum OutgoingImageLocation {
    static func isCarried(by properties: [CFString: Any]) -> Bool {
        properties[kCGImagePropertyGPSDictionary] != nil
            || (properties[kCGImagePropertyIPTCDictionary] as? [CFString: Any])
                .map { iptc in PlaceField.iptcKeys.contains { iptc[$0] != nil } } ?? false
    }

    /// Chaque image de la source, propriétés et arbre XMP.
    static func isCarried(by source: CGImageSource) -> Bool {
        (0..<CGImageSourceGetCount(source)).contains { index in
            let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any] ?? [:]
            return isCarried(by: properties)
                || CGImageSourceCopyMetadataAtIndex(source, index, nil).map { !placeTagPaths(in: $0).isEmpty } ?? false
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

    /// ImageIO n'applique qu'UN arbre à la copie, celui de l'image principale
    /// privé de ses lieux ; la relecture de chaque image tranche.
    private static func copyOptions(_ source: CGImageSource) -> CFDictionary {
        let excludeGPS: [CFString: Any] = [kCGImageMetadataShouldExcludeGPS: true]
        let primary = CGImageSourceGetPrimaryImageIndex(source)
        guard let metadata = CGImageSourceCopyMetadataAtIndex(source, primary, nil),
              let placeless = CGImageMetadataCreateMutableCopy(metadata) else { return excludeGPS as CFDictionary }
        placeTagPaths(in: metadata).forEach { CGImageMetadataRemoveTagWithPath(placeless, nil, $0 as CFString) }
        return excludeGPS
            .merging([kCGImageDestinationMetadata: placeless, kCGImageDestinationMergeMetadata: false]) { _, set in set }
            as CFDictionary
    }

    private static func placeTagPaths(in metadata: CGImageMetadata) -> [String] {
        let tags = CGImageMetadataCopyTags(metadata) as? [CGImageMetadataTag] ?? []
        return tags.compactMap { tag in
            guard let namespace = CGImageMetadataTagCopyNamespace(tag) as String?,
                  let prefix = CGImageMetadataTagCopyPrefix(tag) as String?,
                  let name = CGImageMetadataTagCopyName(tag) as String?,
                  PlaceField.isPlace(namespace: namespace, name: name) else { return nil }
            return "\(prefix):\(name)"
        }
    }

    private static func placelessIPTC(_ properties: [CFString: Any]) -> [CFString: Any] {
        guard let iptc = properties[kCGImagePropertyIPTCDictionary] as? [CFString: Any] else { return [:] }
        return [kCGImagePropertyIPTCDictionary: iptc.filter { !PlaceField.iptcKeys.contains($0.key) }]
    }
}

/// La liste UNIQUE des champs de lieu : clés IPTC des propriétés, balises XMP par
/// espace de noms. L'adresse de CONTACT du créateur (`ContactInfo`) n'est pas le
/// lieu de la photo : elle n'y figure pas.
enum PlaceField {
    static var iptcKeys: [CFString] {
        [
            kCGImagePropertyIPTCCity,
            kCGImagePropertyIPTCSubLocation,
            kCGImagePropertyIPTCProvinceState,
            kCGImagePropertyIPTCCountryPrimaryLocationName,
            kCGImagePropertyIPTCCountryPrimaryLocationCode,
            kCGImagePropertyIPTCContentLocationName,
            kCGImagePropertyIPTCContentLocationCode,
            kCGImagePropertyIPTCExtLocationCreated,
            kCGImagePropertyIPTCExtLocationShown,
        ]
    }

    static func isPlace(namespace: String, name: String) -> Bool {
        (namespace == kCGImageMetadataNamespaceExif as String && name.hasPrefix("GPS"))
            || xmpNames[namespace]?.contains(name) == true
    }

    /// Les datasets IIM sans équivalent XMP vivent dans `Iptc4xmpCore` sous leur
    /// numéro : 2:26/2:27 lieu du contenu, 2:90 ville, 2:92 sous-lieu, 2:95 région,
    /// 2:100/2:101 pays.
    private static var xmpNames: [String: Set<String>] {
        [
            kCGImageMetadataNamespacePhotoshop as String: ["City", "State", "Country"],
            kCGImageMetadataNamespaceIPTCCore as String: [
                "Location", "CountryCode",
                "IIM2-026", "IIM2-027", "IIM2-090", "IIM2-092", "IIM2-095", "IIM2-100", "IIM2-101",
            ],
            kCGImageMetadataNamespaceIPTCExtension as String: ["LocationCreated", "LocationShown"],
        ]
    }
}
