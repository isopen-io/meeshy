import MeeshySDK

/// Le symbole d'un glyphe d'adresse (#18871, planche `Sys-Icones`) : le même sur ma face Liens, dans « Mes adresses »
/// et sur la fiche d'un autre — une seule table.
public extension ProfileAddressGlyph {
    nonisolated var systemImage: String {
        switch self {
        case .site: return "globe.europe.africa"
        case .music: return "music.note"
        case .photos: return "camera"
        case .videos: return "film"
        case .shop: return "storefront"
        case .contact: return "envelope"
        case .agenda: return "calendar"
        case .favorite: return "heart"
        }
    }
}
