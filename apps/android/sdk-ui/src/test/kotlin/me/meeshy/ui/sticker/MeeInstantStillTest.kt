package me.meeshy.ui.sticker

import android.content.Context
import android.graphics.BitmapFactory
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.sticker.MeeInstantCatalog
import me.meeshy.sdk.model.sticker.MeeSlot
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #14345 — l'image fixe d'un Instant est son film ET ses mots (iOS `MeeInstant.stillImage(slots:)`) : le bandeau se
 * peint à la place que l'index mesure, et l'image en cache du film n'est jamais réécrite.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MeeInstantStillTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val bonjour = MeeInstantCatalog.byId("instant-bonjour")!!
    private val side = 216

    @Test
    fun `chaque Instant a une image fixe peinte`() {
        val blank = MeeInstantCatalog.all.filter { runBlocking { MeeInstantStill.bitmap(context, it, emptyMap(), 24) } == null }
        assertThat(blank.map { it.id }).isEmpty()
    }

    @Test
    fun `le bandeau d'un Instant se peint de sa couleur, sur l'image fixe du film laissee intacte`() {
        val still = runBlocking { MeeInstantStill.bitmap(context, bonjour, mapOf(MeeSlot.MESSAGE to "Coucou"), side) }!!
        val band = bonjour.band!!
        val inBand = still.getPixel(30 + 8, 160 + 8) and 0xFFFFFF
        assertThat(inBand).isEqualTo(band.fill)
        val film = MeeStickerStill.cached(bonjour.id, side)!!
        assertThat(film.getPixel(30 + 8, 160 + 8) and 0xFFFFFF).isNotEqualTo(band.fill)
    }

    @Test
    fun `le PNG d'un Instant se decode a la taille demandee`() {
        val png = runBlocking { MeeInstantStill.png(context, bonjour, emptyMap(), 64) }!!
        assertThat(BitmapFactory.decodeByteArray(png, 0, png.size).width).isEqualTo(64)
    }
}
