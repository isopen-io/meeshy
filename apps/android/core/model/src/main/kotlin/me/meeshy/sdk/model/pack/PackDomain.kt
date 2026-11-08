package me.meeshy.sdk.model.pack

/**
 * Le moteur des packs, à domaines — miroir de `PackDomain` de `packages/shared/types/content-pack.ts` et de
 * `PackDomain.swift`. Les stickers, les cadres de gloire et les packs d'apparence s'installent, se retirent et se
 * montrent par le MÊME code : le domaine choisit l'adresse, le reste est commun.
 *
 * [UNKNOWN] est un domaine qu'une passerelle plus récente ajouterait (`capture-frame`, `lens`…) : il se lit, il ne fait
 * pas tomber la liste qui le porte, et il ne route JAMAIS une requête.
 */
enum class PackDomain(val wire: String?) {
    STICKER("sticker"),
    GLORY_FRAME("glory-frame"),
    WALLPAPER("wallpaper"),
    AVATAR_RING("avatar-ring"),
    BANNER("banner"),
    BANNER_FRAME("banner-frame"),
    UNKNOWN(null),
    ;

    /** Un domaine dont le registre peut porter un prix : seul lui offre l'achat. */
    val isPurchasable: Boolean
        get() = when (this) {
            WALLPAPER, AVATAR_RING, BANNER, BANNER_FRAME -> true
            STICKER, GLORY_FRAME, UNKNOWN -> false
        }

    /** Ce client sait router ce domaine (tout sauf [UNKNOWN]). */
    val isRoutable: Boolean get() = this != UNKNOWN

    companion object {
        /** Les domaines que ce client sait router, dans l'ordre du moteur. */
        val routable: List<PackDomain> = entries.filter { it.isRoutable }

        /** Lecture tolérante : un domaine futur, blanc ou absent se lit [UNKNOWN], jamais une erreur. */
        fun fromWire(raw: String?): PackDomain {
            val key = raw?.trim()?.lowercase().orEmpty()
            return routable.firstOrNull { it.wire == key } ?: UNKNOWN
        }

        /** La valeur de `?domaine=` d'un lien : `null` pour l'absent, le blanc et l'inconnu. */
        fun ofQuery(raw: String?): PackDomain? = fromWire(raw).takeIf { it.isRoutable }
    }
}
