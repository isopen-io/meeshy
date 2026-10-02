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

public enum StickerPacksEndpoint: MeeshyEndpoint, Sendable {
    case bySlug(slug: String)
    case bySlugInstall(slug: String)
    case bySlugReview(slug: String)
    case installed
    case pending
    case root
    case submissions

    public var path: String {
        switch self {
        case .bySlug(let slug): return "/api/v1/sticker-packs/\(slug)"
        case .bySlugInstall(let slug): return "/api/v1/sticker-packs/\(slug)/install"
        case .bySlugReview(let slug): return "/api/v1/sticker-packs/\(slug)/review"
        case .installed: return "/api/v1/sticker-packs/installed"
        case .pending: return "/api/v1/sticker-packs/pending"
        case .root: return "/api/v1/sticker-packs"
        case .submissions: return "/api/v1/sticker-packs/submissions"
        }
    }
}
