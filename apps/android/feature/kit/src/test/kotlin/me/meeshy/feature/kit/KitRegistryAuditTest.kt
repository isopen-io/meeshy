package me.meeshy.feature.kit

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import org.junit.Test

/** La règle de la garde, sur un registre fabriqué : miroir des témoins d'audit de `KitRegistryGuardTests` (iOS). */
class KitRegistryAuditTest {

    private val target = "apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit/MeeshyGlassButton.kt"
    private val witness = "apps/android/sdk-ui/src/test/kotlin/me/meeshy/ui/component/kit/MeeshyGlassButtonTest.kt"
    private val lot = KitRegistryAudit.Lot(key = "K02", name = "MeeshyGlassButton", target = target)

    private fun entry(vararg states: MeeshyKitCatalogState) = MeeshyKitCatalogEntry("K02", "MeeshyGlassButton", states.toList())

    private fun images(ids: List<String>, touchable: Boolean): List<String> {
        val variants = if (touchable) listOf("clair", "sombre", "presse") else listOf("clair", "sombre")
        return ids.flatMap { id -> variants.map { "MeeshyGlassButton/$id.$it.png" } } +
            listOf("MeeshyGlassButton/planche.grande-police.png", "MeeshyGlassButton/planche.rtl.png")
    }

    private fun problems(entries: List<MeeshyKitCatalogEntry>, existing: Set<String>, images: List<String>, views: Set<String> = setOf("R1", "R3")) =
        KitRegistryAudit.problems(listOf(lot), entries, views, KitRegistryAudit.Disk(existing, images))

    @Test
    fun `cible absente et entree vide est en regle`() {
        assertThat(problems(listOf(entry()), emptySet(), emptyList())).isEmpty()
    }

    @Test
    fun `cible absente et entree garnie est un probleme`() {
        val found = problems(listOf(entry(MeeshyKitCatalogState("repos", "R1"))), emptySet(), emptyList())

        assertThat(found).hasSize(1)
        assertThat(found.single()).contains("K02")
    }

    @Test
    fun `cible livree et entree vide est un probleme`() {
        assertThat(problems(listOf(entry()), setOf(target, witness), emptyList())).hasSize(1)
    }

    @Test
    fun `cible livree sans temoin est un probleme`() {
        val found = problems(listOf(entry(MeeshyKitCatalogState("repos", "R1"))), setOf(target), images(listOf("repos"), touchable = false))

        assertThat(found.any { it.contains("MeeshyGlassButtonTest") }).isTrue()
    }

    @Test
    fun `cible livree avec tout est en regle`() {
        val found = problems(
            listOf(entry(MeeshyKitCatalogState("repos", "R1"), MeeshyKitCatalogState("actif", "R3", isTouchable = true))),
            setOf(target, witness),
            images(listOf("repos"), touchable = false) + images(listOf("actif"), touchable = true),
        )

        assertThat(found).isEmpty()
    }

    @Test
    fun `une image manquante est nommee par etat`() {
        val found = problems(listOf(entry(MeeshyKitCatalogState("actif", "R3", isTouchable = true))), setOf(target, witness), images(listOf("actif"), touchable = false))

        assertThat(found).hasSize(1)
        assertThat(found.single()).contains("actif.presse")
    }

    @Test
    fun `les planches grande police et rtl sont exigees`() {
        val found = problems(
            listOf(entry(MeeshyKitCatalogState("repos", "R1"))),
            setOf(target, witness),
            listOf("MeeshyGlassButton/repos.clair.png", "MeeshyGlassButton/repos.sombre.png"),
        )

        assertThat(found.any { it.contains("planche.grande-police") }).isTrue()
        assertThat(found.any { it.contains("planche.rtl") }).isTrue()
    }

    @Test
    fun `une vue inconnue de la planche est un probleme`() {
        val found = problems(listOf(entry(MeeshyKitCatalogState("repos", "Z9"))), setOf(target, witness), images(listOf("repos"), touchable = false))

        assertThat(found.any { it.contains("Z9") }).isTrue()
    }

    @Test
    fun `les chemins demandes au disque sont la cible du registre et le temoin`() {
        val elsewhere = KitRegistryAudit.Lot("K02", "MeeshyGlassButton", "ailleurs/Bouton.kt")

        assertThat(KitRegistryAudit.candidatePaths(listOf(elsewhere))).containsExactly("ailleurs/Bouton.kt", witness).inOrder()
    }

    @Test
    fun `des entrees qui ne suivent pas le registre sont un probleme`() {
        assertThat(problems(emptyList(), emptySet(), emptyList())).isNotEmpty()
    }
}
