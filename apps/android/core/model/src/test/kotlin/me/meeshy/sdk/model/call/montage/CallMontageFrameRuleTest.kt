package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallFrameBucket
import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameMood
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Portage de `CallMontageFrameRuleTests.swift` (#8742) : « Classiques » d'abord, puis les seules
 * ambiances qui servent `n` ; le carrousel d'une puce ; et, quand `n` change, le même motif dans
 * la nouvelle tranche, sinon l'ambiance, sinon le premier classique.
 */
class CallMontageFrameRuleTest {

    private val all = CallFrameCatalogue.all
    private val duoOnly = all.filter { it.bucket == CallFrameBucket.DUO }

    private fun motifServingDuoAndComite(): Pair<CallFrameDesign, CallFrameDesign> {
        val pair = all.filter { it.bucket == CallFrameBucket.DUO }.firstNotNullOfOrNull { duo ->
            all.firstOrNull { it.motif == duo.motif && it.bucket == CallFrameBucket.COMITE }?.let { duo to it }
        }
        assumeTrue("aucun motif ne sert à la fois le duo et le petit comité", pair != null)
        return pair!!
    }

    @Test
    fun `a deux, les Classiques puis chaque ambiance qui sert deux personnes`() {
        val chips = CallMontageFrameRule.chips(forPeople = 2)
        assertThat(chips.first()).isEqualTo(CallMontageMoodChip.Classics)
        assertThat(chips.drop(1)).isEqualTo(CallFrameCatalogue.moods(forPeople = 2).map { CallMontageMoodChip.Mood(it) })
    }

    @Test
    fun `une ambiance sans cadre pour n est cachee, et seul il ne reste que les Classiques`() {
        assertThat(CallMontageFrameRule.chips(forPeople = 3, among = duoOnly)).containsExactly(CallMontageMoodChip.Classics)
        assertThat(CallMontageFrameRule.chips(forPeople = 1)).containsExactly(CallMontageMoodChip.Classics)
    }

    @Test
    fun `les puces suivent l ordre canonique des ambiances`() {
        val moods = CallMontageFrameRule.chips(forPeople = 4).mapNotNull { (it as? CallMontageMoodChip.Mood)?.mood }
        assertThat(moods).isEqualTo(CallFrameMood.entries.filter { it in moods })
    }

    @Test
    fun `le carrousel des Classiques porte les treize montages`() {
        assertThat(CallMontageFrameRule.items(CallMontageMoodChip.Classics, people = 4))
            .isEqualTo(CallMontageStyle.entries.map { CallMontageChoice.Classic(it) })
    }

    @Test
    fun `le carrousel d une ambiance ne porte que ses cadres qui servent n`() {
        val mood = CallFrameCatalogue.moods(forPeople = 5).first()
        val items = CallMontageFrameRule.items(CallMontageMoodChip.Mood(mood), people = 5)
        assertThat(items).isNotEmpty()
        items.forEach { item ->
            val id = (item as CallMontageChoice.Frame).id
            val design = CallMontageFrameRule.design(id)!!
            assertThat(design.mood).isEqualTo(mood)
            assertThat(design.serves(5)).isTrue()
        }
    }

    @Test
    fun `la puce d un cadre est son ambiance, celle d un cadre inconnu ou d un classique les Classiques`() {
        val frame = all.first()
        assertThat(CallMontageFrameRule.chip(CallMontageChoice.Frame(frame.id))).isEqualTo(CallMontageMoodChip.Mood(frame.mood))
        assertThat(CallMontageFrameRule.chip(CallMontageChoice.Frame("inconnu.motif.duo"))).isEqualTo(CallMontageMoodChip.Classics)
        assertThat(CallMontageFrameRule.chip(CallMontageChoice.Classic(CallMontageStyle.HEART))).isEqualTo(CallMontageMoodChip.Classics)
    }

    @Test
    fun `un classique ne bouge pas, un cadre qui sert encore non plus`() {
        val polaroid = CallMontageChoice.Classic(CallMontageStyle.POLAROID)
        assertThat(CallMontageFrameRule.reconcile(polaroid, people = 6)).isEqualTo(polaroid)
        val frame = all.first { it.serves(4) }
        assertThat(CallMontageFrameRule.reconcile(CallMontageChoice.Frame(frame.id), people = 4)).isEqualTo(CallMontageChoice.Frame(frame.id))
    }

    @Test
    fun `n change - le meme motif dans la nouvelle tranche`() {
        val (duo, comite) = motifServingDuoAndComite()
        assertThat(CallMontageFrameRule.reconcile(CallMontageChoice.Frame(duo.id), people = 3)).isEqualTo(CallMontageChoice.Frame(comite.id))
    }

    @Test
    fun `n change - sans variante du motif, le premier cadre de la meme ambiance`() {
        val duo = all.first { it.bucket == CallFrameBucket.DUO }
        val sibling = all.firstOrNull { it.mood == duo.mood && it.bucket == CallFrameBucket.COMITE && it.motif != duo.motif }
        assumeTrue(sibling != null)
        val frames = listOf(duo, sibling!!)
        assertThat(CallMontageFrameRule.reconcile(CallMontageChoice.Frame(duo.id), people = 3, among = frames))
            .isEqualTo(CallMontageChoice.Frame(sibling.id))
    }

    @Test
    fun `n change - sans cadre pour n, ou seul, le premier classique`() {
        val duo = duoOnly.first()
        val screen = CallMontageChoice.Classic(CallMontageStyle.SCREEN)
        assertThat(CallMontageFrameRule.reconcile(CallMontageChoice.Frame(duo.id), people = 3, among = duoOnly)).isEqualTo(screen)
        assertThat(CallMontageFrameRule.FALLBACK).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.entries[0]))
        assertThat(CallMontageFrameRule.reconcile(CallMontageChoice.Frame(duo.id), people = 1)).isEqualTo(screen)
    }

    @Test
    fun `toucher une ambiance sans memoire choisit son premier cadre, avec memoire le dernier choix qui sert encore`() {
        val mood = CallFrameCatalogue.moods(forPeople = 2).first()
        val chip = CallMontageMoodChip.Mood(mood)
        val offered = CallMontageFrameRule.items(chip, people = 2)
        assertThat(CallMontageFrameRule.entering(chip, people = 2, remembered = null)).isEqualTo(offered.first())
        assertThat(CallMontageFrameRule.entering(chip, people = 2, remembered = offered.last())).isEqualTo(offered.last())
    }

    @Test
    fun `toucher une ambiance dont le dernier choix ne sert plus choisit son premier cadre`() {
        val (duo, _) = motifServingDuoAndComite()
        val chip = CallMontageMoodChip.Mood(duo.mood)
        val first = CallMontageFrameRule.items(chip, people = 3).first()
        assertThat(CallMontageFrameRule.entering(chip, people = 3, remembered = CallMontageChoice.Frame(duo.id))).isEqualTo(first)
    }

    @Test
    fun `toucher les Classiques rend le classique memorise, sinon l Ecran`() {
        val film = CallMontageChoice.Classic(CallMontageStyle.FILM)
        assertThat(CallMontageFrameRule.entering(CallMontageMoodChip.Classics, people = 3, remembered = film)).isEqualTo(film)
        assertThat(CallMontageFrameRule.entering(CallMontageMoodChip.Classics, people = 3, remembered = null))
            .isEqualTo(CallMontageChoice.Classic(CallMontageStyle.SCREEN))
    }
}
