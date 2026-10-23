package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeInstantCatalogTest {
    private val catalog = MeeInstantCatalog

    @Test
    fun `le catalogue compte 100 Instants aux identifiants uniques`() {
        assertThat(catalog.all).hasSize(100)
        assertThat(catalog.all.map { it.id }).containsNoDuplicates()
    }

    @Test
    fun `les familles sont Messages Moments Lieux Meteo dans cet ordre`() {
        assertThat(catalog.sections.map { it.kind }).containsExactly(
            MeeInstantKind.MESSAGE, MeeInstantKind.MOMENT, MeeInstantKind.LIEU, MeeInstantKind.METEO,
        ).inOrder()
        assertThat(catalog.sections.map { it.instants.size }).containsExactly(28, 20, 28, 24).inOrder()
    }

    @Test
    fun `chaque Instant declare au moins un emplacement et un emoji de repli`() {
        catalog.all.forEach {
            assertThat(it.slots).isNotEmpty()
            assertThat(it.emoji).isNotEmpty()
        }
    }

    @Test
    fun `un bandeau ou un texte libre ne cible que des emplacements declares`() {
        catalog.all.forEach { instant ->
            instant.band?.let { assertThat(instant.slots).containsAtLeastElementsIn(listOfNotNull(it.main, it.sub)) }
            instant.texts.forEach { assertThat(instant.slots).contains(it.slot) }
            assertThat(instant.slots).containsAtLeastElementsIn(instant.defaults.keys)
        }
    }

    @Test
    fun `un Instant porte soit un bandeau soit des textes libres`() {
        catalog.all.forEach { assertThat(it.band != null || it.texts.isNotEmpty()).isTrue() }
        assertThat(catalog.all.sumOf { it.texts.size }).isEqualTo(18)
    }

    @Test
    fun `la boite de vue est celle du dessin`() {
        assertThat(catalog.viewBox).isEqualTo(MeeInstantCatalog.ViewBox(-8f, -8f, 216f, 216f))
    }

    @Test
    fun `l'aller-retour id templateId id est l'identite et un inconnu retombe`() {
        catalog.all.forEach { assertThat(catalog.instant(it.templateId)).isEqualTo(it) }
        assertThat(catalog.instant("mee.inconnu")).isNull()
        assertThat(catalog.instant(null)).isNull()
        assertThat(MeeStickerCatalog.sticker(catalog.all.first().templateId)).isNull()
    }

    @Test
    fun `les identifiants des deux catalogues ne se recouvrent pas`() {
        val films = MeeStickerCatalog.all.map { it.id }.toSet()
        assertThat(catalog.all.map { it.id }.filter { it in films }).isEmpty()
    }

    @Test
    fun `seuls les emplacements declares et non vides partent, sans espaces`() {
        val instant = catalog.instant("mee.instant-soleil")!!
        val typed = mapOf(MeeSlot.WEATHER to "  Soleil  ", MeeSlot.PLACE to "   ", MeeSlot.TIME to "12:00")
        assertThat(instant.sentSlots(typed)).containsExactly(MeeSlot.WEATHER, "Soleil")
        assertThat(instant.wireSlots(typed)).containsExactly("weather", "Soleil")
    }

    @Test
    fun `l'affichage retombe sur la valeur par defaut`() {
        val instant = catalog.instant("mee.instant-soleil")!!
        assertThat(instant.shown(MeeSlot.WEATHER, emptyMap())).isEqualTo("Grand soleil")
        assertThat(instant.shown(MeeSlot.PLACE, emptyMap())).isNull()
        assertThat(instant.shown(MeeSlot.WEATHER, mapOf(MeeSlot.WEATHER to "Averse"))).isEqualTo("Averse")
    }

    @Test
    fun `les emplacements d'un message recu ignorent une cle inconnue`() {
        assertThat(MeeSlot.slots(mapOf("place" to "Paris", "futur" to "x"))).containsExactly(MeeSlot.PLACE, "Paris")
    }

    @Test
    fun `la taille d'un texte libre suit la longueur saisie`() {
        val text = MeeInstantText(MeeSlot.MESSAGE, 0f, 0f, 0f, 1f, MeeTextAnchor.MIDDLE, 700, 0, 1f, listOf(MeeTextSize(1, 14f), MeeTextSize(10, 10f)), 20)
        assertThat(text.size(5)).isEqualTo(14f)
        assertThat(text.size(10)).isEqualTo(10f)
        assertThat(text.size(30)).isEqualTo(10f)
    }
}
