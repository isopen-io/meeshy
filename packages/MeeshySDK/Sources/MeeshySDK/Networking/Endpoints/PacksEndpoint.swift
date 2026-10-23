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
    case avatarRingBySlugContract(slug: String)
    case avatarRingBySlugInstall(slug: String)
    case avatarRingBySlugPurchase(slug: String)
    case avatarRingBySlugReview(slug: String)
    case avatarRingInstalled
    case avatarRingPending
    case avatarRingSubmissions
    case banner
    case bannerBySlug(slug: String)
    case bannerBySlugContract(slug: String)
    case bannerBySlugInstall(slug: String)
    case bannerBySlugPurchase(slug: String)
    case bannerBySlugReview(slug: String)
    case bannerFrame
    case bannerFrameBySlug(slug: String)
    case bannerFrameBySlugInstall(slug: String)
    case bannerFrameBySlugPurchase(slug: String)
    case bannerFrameInstalled
    case bannerInstalled
    case bannerPending
    case bannerSubmissions
    case gloryFrame
    case gloryFrameBySlug(slug: String)
    case gloryFrameBySlugInstall(slug: String)
    case gloryFrameInstalled
    case lens
    case lensBySlug(slug: String)
    case lensBySlugDocument(slug: String)
    case lensBySlugInstall(slug: String)
    case lensBySlugReview(slug: String)
    case lensInstalled
    case lensPending
    case lensSubmissions
    case shop
    case wallpaper
    case wallpaperBySlug(slug: String)
    case wallpaperBySlugContract(slug: String)
    case wallpaperBySlugInstall(slug: String)
    case wallpaperBySlugPurchase(slug: String)
    case wallpaperBySlugReview(slug: String)
    case wallpaperInstalled
    case wallpaperPending
    case wallpaperSubmissions

    public var path: String {
        switch self {
        case .avatarRing: return "/api/v1/packs/avatar-ring"
        case .avatarRingBySlug(let slug): return "/api/v1/packs/avatar-ring/\(slug)"
        case .avatarRingBySlugContract(let slug): return "/api/v1/packs/avatar-ring/\(slug)/contract"
        case .avatarRingBySlugInstall(let slug): return "/api/v1/packs/avatar-ring/\(slug)/install"
        case .avatarRingBySlugPurchase(let slug): return "/api/v1/packs/avatar-ring/\(slug)/purchase"
        case .avatarRingBySlugReview(let slug): return "/api/v1/packs/avatar-ring/\(slug)/review"
        case .avatarRingInstalled: return "/api/v1/packs/avatar-ring/installed"
        case .avatarRingPending: return "/api/v1/packs/avatar-ring/pending"
        case .avatarRingSubmissions: return "/api/v1/packs/avatar-ring/submissions"
        case .banner: return "/api/v1/packs/banner"
        case .bannerBySlug(let slug): return "/api/v1/packs/banner/\(slug)"
        case .bannerBySlugContract(let slug): return "/api/v1/packs/banner/\(slug)/contract"
        case .bannerBySlugInstall(let slug): return "/api/v1/packs/banner/\(slug)/install"
        case .bannerBySlugPurchase(let slug): return "/api/v1/packs/banner/\(slug)/purchase"
        case .bannerBySlugReview(let slug): return "/api/v1/packs/banner/\(slug)/review"
        case .bannerFrame: return "/api/v1/packs/banner-frame"
        case .bannerFrameBySlug(let slug): return "/api/v1/packs/banner-frame/\(slug)"
        case .bannerFrameBySlugInstall(let slug): return "/api/v1/packs/banner-frame/\(slug)/install"
        case .bannerFrameBySlugPurchase(let slug): return "/api/v1/packs/banner-frame/\(slug)/purchase"
        case .bannerFrameInstalled: return "/api/v1/packs/banner-frame/installed"
        case .bannerInstalled: return "/api/v1/packs/banner/installed"
        case .bannerPending: return "/api/v1/packs/banner/pending"
        case .bannerSubmissions: return "/api/v1/packs/banner/submissions"
        case .gloryFrame: return "/api/v1/packs/glory-frame"
        case .gloryFrameBySlug(let slug): return "/api/v1/packs/glory-frame/\(slug)"
        case .gloryFrameBySlugInstall(let slug): return "/api/v1/packs/glory-frame/\(slug)/install"
        case .gloryFrameInstalled: return "/api/v1/packs/glory-frame/installed"
        case .lens: return "/api/v1/packs/lens"
        case .lensBySlug(let slug): return "/api/v1/packs/lens/\(slug)"
        case .lensBySlugDocument(let slug): return "/api/v1/packs/lens/\(slug)/document"
        case .lensBySlugInstall(let slug): return "/api/v1/packs/lens/\(slug)/install"
        case .lensBySlugReview(let slug): return "/api/v1/packs/lens/\(slug)/review"
        case .lensInstalled: return "/api/v1/packs/lens/installed"
        case .lensPending: return "/api/v1/packs/lens/pending"
        case .lensSubmissions: return "/api/v1/packs/lens/submissions"
        case .shop: return "/api/v1/packs/shop"
        case .wallpaper: return "/api/v1/packs/wallpaper"
        case .wallpaperBySlug(let slug): return "/api/v1/packs/wallpaper/\(slug)"
        case .wallpaperBySlugContract(let slug): return "/api/v1/packs/wallpaper/\(slug)/contract"
        case .wallpaperBySlugInstall(let slug): return "/api/v1/packs/wallpaper/\(slug)/install"
        case .wallpaperBySlugPurchase(let slug): return "/api/v1/packs/wallpaper/\(slug)/purchase"
        case .wallpaperBySlugReview(let slug): return "/api/v1/packs/wallpaper/\(slug)/review"
        case .wallpaperInstalled: return "/api/v1/packs/wallpaper/installed"
        case .wallpaperPending: return "/api/v1/packs/wallpaper/pending"
        case .wallpaperSubmissions: return "/api/v1/packs/wallpaper/submissions"
        }
    }
}
