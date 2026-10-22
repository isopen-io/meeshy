// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run android-endpoints:generate
//
// Les chemins sont relatifs au préfixe d'API (/api/v1/) ; les emplacements {nom}
// sont résolus par @Path. Les routes hors /api/v1 gardent leur chemin complet.

package me.meeshy.sdk.net.routes

public object ApiRoutesStickerPacks {
    public const val BY_SLUG: String = "sticker-packs/{slug}"
    public const val BY_SLUG_INSTALL: String = "sticker-packs/{slug}/install"
    public const val BY_SLUG_REVIEW: String = "sticker-packs/{slug}/review"
    public const val INSTALLED: String = "sticker-packs/installed"
    public const val PENDING: String = "sticker-packs/pending"
    public const val ROOT: String = "sticker-packs"
    public const val SUBMISSIONS: String = "sticker-packs/submissions"
}
