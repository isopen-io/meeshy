package me.meeshy.sdk.pack

import me.meeshy.sdk.model.BUILTIN_STICKER_PACK_SLUGS
import me.meeshy.sdk.model.pack.PackDomain
import me.meeshy.sdk.model.sticker.StickerPackSummary

/**
 * Le magasin des stickers EST le magasin générique, au domaine `sticker` (façade de `StickerPackStore` d'iOS) : cache par
 * compte, revalidation à chaque apparition, bascule optimiste. Ses routes restent `/sticker-packs`, inchangées à l'octet.
 */
typealias StickerPackShelfStore = PackStore<StickerPackSummary>

/** Les trois packs que le client dessine lui-même (Mee, Meo et leurs duos) : servis tant que les installés sont inconnus. */
object StickerPackDefaults {
    val builtins: List<StickerPackSummary> = BUILTIN_STICKER_PACK_SLUGS.map { slug ->
        StickerPackSummary(slug = slug, name = slug, installed = true, builtin = true, removable = false)
    }

    val domain: PackDomain = PackDomain.STICKER
}
