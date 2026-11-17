package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K38 — l'atome squelette : cinq silhouettes, un reflet retardé, et seulement sur cache vide. */
class MeeshySkeletonTest {

    @Test
    fun `le squelette n'existe qu'au premier chargement - un cache, meme perime, se peint tout de suite`() {
        assertThat(MeeshySkeletonLaw.shows(isLoading = true, hasCachedData = false)).isTrue()
        assertThat(MeeshySkeletonLaw.shows(isLoading = true, hasCachedData = true)).isFalse()
        assertThat(MeeshySkeletonLaw.shows(isLoading = false, hasCachedData = false)).isFalse()
    }

    @Test
    fun `une ligne prend une part de la largeur sur 14 de haut`() {
        val size = MeeshySkeletonRecipe.size(MeeshySkeletonShape.Line(widthRatio = 0.5f), availableWidthDp = 200f)
        assertThat(size).isEqualTo(MeeshySkeletonSize(widthDp = 100f, heightDp = 14f, cornerRadiusDp = 6f))
    }

    @Test
    fun `un ratio hors bornes est ramene`() {
        assertThat(MeeshySkeletonRecipe.size(MeeshySkeletonShape.Line(3f), 200f).widthDp).isEqualTo(200f)
        assertThat(MeeshySkeletonRecipe.size(MeeshySkeletonShape.Line(-1f), 200f).widthDp).isEqualTo(0f)
        assertThat(MeeshySkeletonRecipe.size(MeeshySkeletonShape.Line(Float.NaN), 200f).widthDp).isEqualTo(200f)
    }

    @Test
    fun `une pilule a sa largeur, 34 de haut et le rayon plein`() {
        val size = MeeshySkeletonRecipe.size(MeeshySkeletonShape.Pill(widthDp = 90f), availableWidthDp = 200f)
        assertThat(size).isEqualTo(MeeshySkeletonSize(90f, 34f, 17f))
    }

    @Test
    fun `un billet prend toute la largeur sur 96 de haut`() {
        val size = MeeshySkeletonRecipe.size(MeeshySkeletonShape.Ticket(cutDp = 12f), availableWidthDp = 300f)
        assertThat(size).isEqualTo(MeeshySkeletonSize(300f, 96f, 12f))
    }

    @Test
    fun `un cercle a son diametre`() {
        assertThat(MeeshySkeletonRecipe.size(MeeshySkeletonShape.Circle(40f), 200f)).isEqualTo(MeeshySkeletonSize(40f, 40f, 20f))
        assertThat(MeeshySkeletonRecipe.size(MeeshySkeletonShape.Circle(-5f), 200f)).isEqualTo(MeeshySkeletonSize(0f, 0f, 0f))
    }

    @Test
    fun `une carte garde son aspect dans la largeur offerte`() {
        val size = MeeshySkeletonRecipe.size(MeeshySkeletonShape.Card(aspect = 2f, radiusDp = 14f), availableWidthDp = 300f)
        assertThat(size).isEqualTo(MeeshySkeletonSize(300f, 150f, 14f))
        assertThat(MeeshySkeletonRecipe.size(MeeshySkeletonShape.Card(0f, 14f), 300f).heightDp).isEqualTo(300f)
    }

    @Test
    fun `une largeur offerte non finie ou negative ne rend rien d'absurde`() {
        assertThat(MeeshySkeletonRecipe.size(MeeshySkeletonShape.Ticket(12f), Float.NaN).widthDp).isEqualTo(0f)
        assertThat(MeeshySkeletonRecipe.size(MeeshySkeletonShape.Ticket(12f), -30f).widthDp).isEqualTo(0f)
    }

    @Test
    fun `le reflet attend 150 ms pour qu'une reponse rapide ne clignote pas et s'arrete en mouvement reduit`() {
        assertThat(MeeshySkeletonRecipe.SHEEN_DELAY_MILLIS).isEqualTo(150)
        assertThat(MeeshySkeletonRecipe.sheenAnimates(reduceMotion = false, hasWaitedDelay = true)).isTrue()
        assertThat(MeeshySkeletonRecipe.sheenAnimates(reduceMotion = false, hasWaitedDelay = false)).isFalse()
        assertThat(MeeshySkeletonRecipe.sheenAnimates(reduceMotion = true, hasWaitedDelay = true)).isFalse()
    }
}
