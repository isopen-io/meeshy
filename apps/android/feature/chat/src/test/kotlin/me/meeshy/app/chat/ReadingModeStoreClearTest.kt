package me.meeshy.app.chat

import me.meeshy.sdk.reading.ReadingModeFlags
import me.meeshy.sdk.reading.ReadingModePreferenceStoring
import me.meeshy.sdk.reading.SharedPreferencesReadingModeStore
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.ReadingModePreferenceScope
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ReadingModeStoreClearTest {
    private val me = ReadingModePreferenceScope.Registered("u1")

    private fun store() = SharedPreferencesReadingModeStore(ApplicationProvider.getApplicationContext<Context>())

    @Test
    fun `clearAll efface modes et ouvertures mais garde les drapeaux`() {
        val s = store()
        s.setMode(ConversationReadingMode.FOCAL, "c1", me)
        s.noteOpened("c1", me, 5L)
        ApplicationProvider.getApplicationContext<Context>()
            .getSharedPreferences("meeshy.readingModes", Context.MODE_PRIVATE)
            .edit().putBoolean("meeshy.flag.reading_modes", false).commit()

        s.clearAll()

        assertThat(s.mode("c1", me)).isNull()
        assertThat(s.lastOpenedAtMs("c1", me)).isNull()
        assertThat(store().isReadingModesEnabled).isFalse()
    }

    @Test
    fun `la préférence est par conversation et par portée`() {
        val s = store()
        val guest = ReadingModePreferenceScope.Anonymous("p1")
        s.setMode(ConversationReadingMode.BUBBLES, "c1", me)
        assertThat(s.mode("c1", me)).isEqualTo(ConversationReadingMode.BUBBLES)
        assertThat(s.mode("c2", me)).isNull()
        assertThat(s.mode("c1", guest)).isNull()
    }
}
