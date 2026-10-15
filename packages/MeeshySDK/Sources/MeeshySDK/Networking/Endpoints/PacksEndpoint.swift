// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run ios-endpoints:generate
//
// Les politiques d'authentification et de réessai ne sont PAS ici : ce sont des
// décisions client, écrites à la main en redéfinition de `MeeshyEndpoint`.

import Foundation

public enum PacksEndpoint: MeeshyEndpoint, Sendable {
    case avatarRing
    case avatarRingBySlug(slug: String)
    case avatarRingBySlugInstall(slug: String)
    case avatarRingBySlugPurchase(slug: String)
    case avatarRingInstalled
    case banner
    case bannerBySlug(slug: String)
    case bannerBySlugInstall(slug: String)
    case bannerBySlugPurchase(slug: String)
    case bannerInstalled
    case gloryFrame
    case gloryFrameBySlug(slug: String)
    case gloryFrameBySlugInstall(slug: String)
    case gloryFrameInstalled
    case shop
    case wallpaper
    case wallpaperBySlug(slug: String)
    case wallpaperBySlugInstall(slug: String)
    case wallpaperBySlugPurchase(slug: String)
    case wallpaperInstalled

    public var path: String {
        switch self {
        case .avatarRing: return "/api/v1/packs/avatar-ring"
        case .avatarRingBySlug(let slug): return "/api/v1/packs/avatar-ring/\(slug)"
        case .avatarRingBySlugInstall(let slug): return "/api/v1/packs/avatar-ring/\(slug)/install"
        case .avatarRingBySlugPurchase(let slug): return "/api/v1/packs/avatar-ring/\(slug)/purchase"
        case .avatarRingInstalled: return "/api/v1/packs/avatar-ring/installed"
        case .banner: return "/api/v1/packs/banner"
        case .bannerBySlug(let slug): return "/api/v1/packs/banner/\(slug)"
        case .bannerBySlugInstall(let slug): return "/api/v1/packs/banner/\(slug)/install"
        case .bannerBySlugPurchase(let slug): return "/api/v1/packs/banner/\(slug)/purchase"
        case .bannerInstalled: return "/api/v1/packs/banner/installed"
        case .gloryFrame: return "/api/v1/packs/glory-frame"
        case .gloryFrameBySlug(let slug): return "/api/v1/packs/glory-frame/\(slug)"
        case .gloryFrameBySlugInstall(let slug): return "/api/v1/packs/glory-frame/\(slug)/install"
        case .gloryFrameInstalled: return "/api/v1/packs/glory-frame/installed"
        case .shop: return "/api/v1/packs/shop"
        case .wallpaper: return "/api/v1/packs/wallpaper"
        case .wallpaperBySlug(let slug): return "/api/v1/packs/wallpaper/\(slug)"
        case .wallpaperBySlugInstall(let slug): return "/api/v1/packs/wallpaper/\(slug)/install"
        case .wallpaperBySlugPurchase(let slug): return "/api/v1/packs/wallpaper/\(slug)/purchase"
        case .wallpaperInstalled: return "/api/v1/packs/wallpaper/installed"
        }
    }
}
