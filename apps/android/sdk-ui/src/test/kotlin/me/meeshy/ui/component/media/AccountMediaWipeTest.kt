package me.meeshy.ui.component.media

import androidx.media3.common.util.UnstableApi
import androidx.test.core.app.ApplicationProvider
import android.content.Context
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AccountMediaWipeTest {
    @get:Rule val folder = TemporaryFolder()

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun file(name: String) = File(folder.root, name).apply { writeBytes(ByteArray(4_096) { 7 }) }

    @Test
    fun `changer de compte vide l audio obtenu avec le jeton du compte quitte, et laisse la video`() {
        val cache = MeeshyMediaCache.get(context)
        val sound = "https://gate.meeshy.me/api/v1/static/private.m4a"
        val video = "https://gate.meeshy.me/api/v1/attachments/file/clip.mp4"
        cache.adoptLocalFile(MediaCacheCategory.AUDIO, sound, file("private.m4a"))
        cache.adoptLocalFile(MediaCacheCategory.VIDEO, video, file("clip.mp4"))
        assertThat(cache.isFullyCached(MediaCacheCategory.AUDIO, MeeshyMediaCacheKey.of(sound))).isTrue()

        AccountMediaWipe.wipe(context)

        assertThat(cache.isFullyCached(MediaCacheCategory.AUDIO, MeeshyMediaCacheKey.of(sound))).isFalse()
        assertThat(cache.isFullyCached(MediaCacheCategory.VIDEO, MeeshyMediaCacheKey.of(video))).isTrue()
    }
}
