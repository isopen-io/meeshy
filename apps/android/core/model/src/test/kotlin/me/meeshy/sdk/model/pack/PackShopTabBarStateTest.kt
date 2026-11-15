package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PackShopTabBarStateTest {

    @Test
    fun `la Boutique vient d'abord puis un onglet par pack installe dans l'ordre du serveur`() {
        val offered = PackShopPage.offered(listOf("afrique", "olympe"))

        assertThat(offered).containsExactly(PackShopPage.Shop, PackShopPage.Pack("afrique"), PackShopPage.Pack("olympe")).inOrder()
    }

    @Test
    fun `sans pack installe seule la Boutique est offerte`() {
        assertThat(PackShopPage.offered(emptyList())).containsExactly(PackShopPage.Shop)
    }

    @Test
    fun `un pack retire pendant que son onglet est ouvert ramene a la Boutique`() {
        val offered = PackShopPage.offered(listOf("olympe"))

        assertThat(PackShopPage.resolved(PackShopPage.Pack("afrique"), offered)).isEqualTo(PackShopPage.Shop)
    }

    @Test
    fun `une page encore servie reste choisie`() {
        val offered = PackShopPage.offered(listOf("afrique", "olympe"))

        assertThat(PackShopPage.resolved(PackShopPage.Pack("olympe"), offered)).isEqualTo(PackShopPage.Pack("olympe"))
    }

    @Test
    fun `les identifiants de page sont stables et distincts`() {
        assertThat(PackShopPage.Shop.id).isEqualTo("shop")
        assertThat(PackShopPage.Pack("afrique").id).isEqualTo("pack.afrique")
    }

    @Test
    fun `un slug duplique n'ouvre qu'un onglet`() {
        assertThat(PackShopPage.offered(listOf("a", "a"))).containsExactly(PackShopPage.Shop, PackShopPage.Pack("a")).inOrder()
    }
}
