package me.meeshy.app.chat.export

import android.graphics.Bitmap
import android.os.Looper
import com.google.common.truth.Truth.assertThat
import java.text.DateFormat
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** #14330 — les vignettes des styles peignent la photo du message comme l'aperçu, et se renouvellent quand elle arrive. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CardThumbnailPicturesTest {

    /**
     * L'état de l'export écrit un état Compose hors composition, et `GlobalSnapshotManager` en poste l'application
     * sur la boucle principale. Elle est vidée ici, avant que Robolectric n'efface le message au démontage : sinon
     * `AndroidUiDispatcher.Main` reste programmé pour toute la JVM, et chaque témoin Compose suivant tombe en
     * AppNotIdleException (#15815).
     */
    @After
    fun settleMainLooper() {
        shadowOf(Looper.getMainLooper()).idle()
    }

    private class MemoryStore : CardPreferenceStore {
        private val values = mutableMapOf<String, String>()
        override fun string(key: String): String? = values[key]
        override fun putString(key: String, value: String) { values[key] = value }
    }

    private val photo = CardMedia("p1", CardMediaKind.IMAGE, "https://cdn.test/p1.jpg", aspect = 1.0)
    private val subject = CardSubject(quoted = null, reply = CardPart(author = "Awa", text = ""), sentAtMillis = 0L, media = listOf(photo))

    private fun state() = CardExportState(
        ComposedCardSource("m1", subject), CardViewer("me", "Moi", "moi"), conversationTitle = null, store = MemoryStore(),
        dateFormat = DateFormat.getDateInstance(), timeFormat = DateFormat.getTimeInstance(), initialFormat = CardFormat.initial,
    )

    @Test
    fun `a thumbnail receives the loaded pictures and its key changes when they arrive`() {
        val state = state()
        val before = state.thumbSource(CardThumbnailStore(), subject)
        val bitmap = Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888)

        state.pictures = mapOf("p1" to bitmap)
        val after = state.thumbSource(CardThumbnailStore(), subject)

        assertThat(before.pictures).isEmpty()
        assertThat(after.pictures).containsExactly("p1", bitmap)
        val id = CardTemplates.defaultId
        assertThat(after.keyOf(id)).isNotEqualTo(before.keyOf(id))
    }
}
