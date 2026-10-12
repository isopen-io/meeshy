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
    case gloryFrame
    case gloryFrameBySlug(slug: String)
    case gloryFrameBySlugInstall(slug: String)
    case gloryFrameInstalled

    public var path: String {
        switch self {
        case .gloryFrame: return "/api/v1/packs/glory-frame"
        case .gloryFrameBySlug(let slug): return "/api/v1/packs/glory-frame/\(slug)"
        case .gloryFrameBySlugInstall(let slug): return "/api/v1/packs/glory-frame/\(slug)/install"
        case .gloryFrameInstalled: return "/api/v1/packs/glory-frame/installed"
        }
    }
}
