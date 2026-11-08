package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.BackgroundResumeRoute.EnterForegroundThenFocus
import me.meeshy.sdk.model.playback.BackgroundResumeRoute.Focus
import org.junit.Test

/**
 * « Lecture » depuis la notification ou l'écran verrouillé, après une pause qui a rendu le focus :
 * sous Android 15, une application qui cible l'API 35 doit être au premier plan ou tenir un service
 * de premier plan pour DEMANDER le focus, sinon `requestAudioFocus` rend AUDIOFOCUS_REQUEST_FAILED et
 * la lecture échoue en silence. Le service prend donc le premier plan d'abord, le focus ensuite.
 */
class BackgroundResumeRouteTest {

    private fun route(
        appForeground: Boolean = false,
        serviceForeground: Boolean = false,
        targetSdk: Int = 36,
        sdkInt: Int = 35,
    ) = BackgroundResumeRoute.of(
        appForeground = appForeground,
        serviceForeground = serviceForeground,
        targetSdk = targetSdk,
        sdkInt = sdkInt,
    )

    @Test
    fun `une reprise sans ecran ni service au premier plan sous Android 15 prend le premier plan avant le focus`() {
        assertThat(route()).isEqualTo(EnterForegroundThenFocus)
    }

    @Test
    fun `une reprise sous Android 16 suit la meme route`() {
        assertThat(route(sdkInt = 36)).isEqualTo(EnterForegroundThenFocus)
    }

    @Test
    fun `avant Android 15 le focus se demande directement`() {
        assertThat(route(sdkInt = 28)).isEqualTo(Focus)
        assertThat(route(sdkInt = 34)).isEqualTo(Focus)
    }

    @Test
    fun `une application qui cible avant l'API 35 n'est pas soumise a la restriction`() {
        assertThat(route(targetSdk = 34)).isEqualTo(Focus)
    }

    @Test
    fun `l'application au premier plan demande le focus directement`() {
        assertThat(route(appForeground = true)).isEqualTo(Focus)
    }

    @Test
    fun `un service deja au premier plan demande le focus directement`() {
        assertThat(route(serviceForeground = true)).isEqualTo(Focus)
    }

    @Test
    fun `l'application et le service au premier plan demandent le focus directement`() {
        assertThat(route(appForeground = true, serviceForeground = true)).isEqualTo(Focus)
    }

    @Test
    fun `la restriction commence exactement a l'API 35`() {
        assertThat(route(sdkInt = 34, targetSdk = 35)).isEqualTo(Focus)
        assertThat(route(sdkInt = 35, targetSdk = 35)).isEqualTo(EnterForegroundThenFocus)
        assertThat(route(sdkInt = 35, targetSdk = 34)).isEqualTo(Focus)
    }
}
