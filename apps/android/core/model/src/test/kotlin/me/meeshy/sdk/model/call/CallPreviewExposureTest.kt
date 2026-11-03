package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallPreviewExposureTest {
    private val both = CallPreviewConsent(sendsAudio = true, sendsVideo = true)

    private fun exposure(
        reaches: Boolean = true,
        heard: Boolean = true,
        consent: CallPreviewConsent = both,
        micMuted: Boolean = false,
        video: Boolean = true,
    ) = CallPreviewExposure.of(reaches, heard, consent, micMuted, video)

    @Test
    fun `rien n'atteint l'appele tant que le lien d'apercu n'est pas connecte`() {
        assertThat(exposure(reaches = false)).isEqualTo(CallPreviewExposure.Nothing)
    }

    @Test
    fun `l'appele voit sans entendre tant qu'il n'a pas active le son`() {
        assertThat(exposure(heard = false)).isEqualTo(CallPreviewExposure.Seen)
    }

    @Test
    fun `l'appele entend sans voir quand la camera de l'appel est eteinte`() {
        assertThat(exposure(video = false)).isEqualTo(CallPreviewExposure.Heard)
    }

    @Test
    fun `l'appele voit et entend quand le son est active et que micro et camera partent`() {
        assertThat(exposure()).isEqualTo(CallPreviewExposure.SeenAndHeard)
    }

    @Test
    fun `un micro coupe pour l'appel ou refuse pour ce correspondant n'est jamais entendu`() {
        assertThat(exposure(micMuted = true)).isEqualTo(CallPreviewExposure.Seen)
        assertThat(exposure(consent = CallPreviewConsent.INITIAL)).isEqualTo(CallPreviewExposure.Seen)
    }

    @Test
    fun `un correspondant sans micro ni camera consentis n'expose rien`() {
        val none = CallPreviewConsent(sendsAudio = false, sendsVideo = false)
        assertThat(exposure(consent = none)).isEqualTo(CallPreviewExposure.Nothing)
    }
}
