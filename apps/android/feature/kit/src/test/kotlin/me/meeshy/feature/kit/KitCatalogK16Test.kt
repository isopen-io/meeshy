package me.meeshy.feature.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** L'entrée K16 du catalogue : les onze états de la fiche, dans l'ordre, et ceux qui se touchent. Miroir d'iOS. */
class KitCatalogK16Test {

    private val entry get() = MeeshyKitCatalog.listedEntry("K16")

    @Test
    fun `le catalogue porte les onze etats de la fiche`() {
        assertThat(entry?.name).isEqualTo("MeeshyModeChrome")
        assertThat(entry?.states?.map { it.id }).containsExactly(
            "texte", "plaque", "coche", "trois", "accessoire", "plaque-longue", "sans-plaque",
            "occupe", "desactive", "clair", "large",
        ).inOrder()
    }

    @Test
    fun `seuls les cinq etats qui ont une vue se touchent`() {
        assertThat(entry?.states?.filter { it.isTouchable }?.map { it.id })
            .containsExactly("texte", "plaque", "coche", "trois", "large").inOrder()
    }

    @Test
    fun `chaque vue de la planche citee est celle de la fiche`() {
        assertThat(entry?.states?.mapNotNull { state -> state.boardView?.let { state.id to it } })
            .containsExactly("texte" to "A13", "plaque" to "A13", "coche" to "A8", "trois" to "C1", "large" to "I3")
    }

    @Test
    fun `les sources du catalogue de K16 n'ont ni couleur ni rayon en dur`() {
        val code = KitRepository.androidRoot
            .resolve("feature/kit/src/main/kotlin/me/meeshy/feature/kit/KitCatalogK16.kt")
            .readLines()
            .filterNot { it.trim().startsWith("//") || it.trim().startsWith("*") || it.trim().startsWith("/*") }
            .joinToString("\n")

        listOf("Color(0x", "Color.White", "Color.Black", "RoundedCornerShape(1", "RoundedCornerShape(2", "0x").forEach {
            assertThat(code.contains(it)).isFalse()
        }
    }
}
