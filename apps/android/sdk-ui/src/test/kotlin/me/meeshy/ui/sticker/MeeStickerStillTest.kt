package me.meeshy.ui.sticker

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.sticker.MeeCharacter
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.ui.component.game.MeeFigure
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Les cases Mee, Meo et Mee & Meo de la feuille restaient vides sur le S8 (#14388) : la figure fixe se peint désormais
 * depuis l'image fixe du film, rendue dans une image logicielle hors du fil principal (iOS `MeeStickerFilmView`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MeeStickerStillTest {

    @get:Rule
    val compose = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun painted(bitmap: Bitmap): Int =
        (0 until bitmap.width).sumOf { x -> (0 until bitmap.height).count { y -> (bitmap.getPixel(x, y) ushr 24) != 0 } }

    @Test
    fun `chaque film des trois onglets a une image fixe peinte`() {
        val films = MeeCharacter.entries.flatMap { cast -> MeeStickerCatalog.sections(cast).flatMap { it.stickers } }
        assertThat(films).isNotEmpty()
        val blank = films.filter { film ->
            val still = runBlocking { MeeStickerStill.bitmap(context, film.id, 24) }
            still == null || painted(still) == 0
        }
        assertThat(blank.map { it.id }).isEmpty()
    }

    @Test
    fun `une image fixe rendue est servie depuis la memoire`() {
        val first = runBlocking { MeeStickerStill.bitmap(context, "mee-bonjour", 40) }
        assertThat(first).isNotNull()
        assertThat(MeeStickerStill.cached("mee-bonjour", 40)).isSameInstanceAs(first)
        assertThat(runBlocking { MeeStickerStill.bitmap(context, "mee-bonjour", 40) }).isSameInstanceAs(first)
    }

    @Test
    fun `un film inconnu n'a pas d'image`() {
        assertThat(runBlocking { MeeStickerStill.bitmap(context, "inconnu", 40) }).isNull()
    }

    @Test
    fun `une figure fixe de la feuille se peint depuis l'image fixe du film`() {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(1f)) {
                MeeFigure(filmId = "meo-salut", side = 52.dp, animates = false)
            }
        }
        compose.waitUntil(timeoutMillis = 10_000) { MeeStickerStill.cached("meo-salut", 52) != null }
    }

    @Test
    fun `le PNG d'un sticker Mee est l'image fixe du film`() {
        val png = runBlocking { MeeStickerStill.png(context, "mee-coucou", 64) }
        assertThat(png).isNotNull()
        val decoded = android.graphics.BitmapFactory.decodeByteArray(png, 0, png!!.size)
        assertThat(decoded.width).isEqualTo(64)
        assertThat(painted(decoded)).isGreaterThan(0)
    }
}
