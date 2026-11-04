package me.meeshy.sdk.model.pack

/**
 * **Ce que la barre d'une Boutique propose** — miroir de `PackShopPage` d'iOS : la Boutique d'abord, puis un onglet par
 * pack INSTALLÉ, dans l'ordre du serveur. Installer ajoute l'onglet ; retirer l'enlève.
 */
sealed interface PackShopPage {
    val id: String

    data object Shop : PackShopPage {
        override val id: String = "shop"
    }

    data class Pack(val slug: String) : PackShopPage {
        override val id: String get() = "pack.$slug"
    }

    companion object {
        fun offered(installed: List<String>): List<PackShopPage> = listOf(Shop) + installed.distinct().map(::Pack)

        /** La page choisie si elle est encore servie, sinon la Boutique : un pack retiré ne laisse pas d'onglet fantôme. */
        fun resolved(chosen: PackShopPage, offered: List<PackShopPage>): PackShopPage =
            if (chosen in offered) chosen else Shop
    }
}
