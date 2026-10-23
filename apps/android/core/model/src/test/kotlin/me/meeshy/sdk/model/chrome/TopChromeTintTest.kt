package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TopChromeTintTest {
    @Test fun `sans barre active il n y a aucune bande`() {
        assertThat(TopChromeTint.resolve(callIsActive = false, audioIsActive = false)).isNull()
    }

    @Test fun `l appel prime sur l audio et la banniere`() {
        assertThat(TopChromeTint.resolve(true, true, 0xFF112233)).isEqualTo(TopChromeTint.call)
    }

    @Test fun `l audio prime sur la banniere`() {
        assertThat(TopChromeTint.resolve(false, true, 0xFF112233)).isEqualTo(TopChromeTint.audio)
    }

    @Test fun `la banniere n a la bande que si rien d autre ne l occupe`() {
        assertThat(TopChromeTint.resolve(false, false, 0xFF112233)).isEqualTo(TopChromeTint(0xFF112233))
    }

    @Test fun `appel et audio partagent l aplat indigo 600`() {
        assertThat(TopChromeTint.call.bandColorArgb).isEqualTo(0xFF4F46E5)
        assertThat(TopChromeTint.audio.bandColorArgb).isEqualTo(TopChromeTint.call.bandColorArgb)
    }
}
