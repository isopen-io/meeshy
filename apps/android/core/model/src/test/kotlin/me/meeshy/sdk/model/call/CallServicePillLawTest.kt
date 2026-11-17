package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import org.junit.Test

/**
 * #18227 · #18215 — la loi de déclenchement des pastilles de service (planche E3 « En attente », E4 « Vidéo réduite »),
 * écrite en vecteurs NOMMÉS que les lots iOS et web reprennent à l'identique (mêmes noms, mêmes entrées, mêmes sorties).
 */
class CallServicePillLawTest {

    private data class Vector(val name: String, val signals: CallServicePillSignals, val hold: Boolean, val notice: CallVideoNotice)

    private fun signals(
        isConnectedLayout: Boolean = true,
        isPictureInPicture: Boolean = false,
        isOnHold: Boolean = false,
        isVideoCall: Boolean = true,
        isCameraOn: Boolean = true,
        videoNotice: CallVideoNotice = CallVideoNotice.None,
    ) = CallServicePillSignals(isConnectedLayout, isPictureInPicture, isOnHold, isVideoCall, isCameraOn, videoNotice)

    private val vectors = listOf(
        Vector("repos", signals(), hold = false, notice = CallVideoNotice.None),
        Vector("attente-systeme", signals(isOnHold = true), hold = true, notice = CallVideoNotice.None),
        Vector("attente-appel-audio", signals(isOnHold = true, isVideoCall = false, isCameraOn = false), hold = true, notice = CallVideoNotice.None),
        Vector("attente-en-image-dans-l-image", signals(isOnHold = true, isPictureInPicture = true), hold = true, notice = CallVideoNotice.None),
        Vector("attente-pendant-la-reconnexion", signals(isOnHold = true, isConnectedLayout = false), hold = true, notice = CallVideoNotice.None),
        Vector("video-reduite", signals(videoNotice = CallVideoNotice.Reduced), hold = false, notice = CallVideoNotice.Reduced),
        Vector("faible-lumiere", signals(videoNotice = CallVideoNotice.LowLight), hold = false, notice = CallVideoNotice.LowLight),
        Vector("video-reduite-camera-coupee", signals(isCameraOn = false, videoNotice = CallVideoNotice.Reduced), hold = false, notice = CallVideoNotice.None),
        Vector("video-reduite-appel-audio", signals(isVideoCall = false, videoNotice = CallVideoNotice.Reduced), hold = false, notice = CallVideoNotice.None),
        Vector("video-reduite-en-image-dans-l-image", signals(isPictureInPicture = true, videoNotice = CallVideoNotice.Reduced), hold = false, notice = CallVideoNotice.None),
        Vector("video-reduite-avant-la-connexion", signals(isConnectedLayout = false, videoNotice = CallVideoNotice.Reduced), hold = false, notice = CallVideoNotice.None),
        Vector("attente-et-video-reduite", signals(isOnHold = true, videoNotice = CallVideoNotice.Reduced), hold = true, notice = CallVideoNotice.Reduced),
    )

    @Test
    fun `chaque vecteur nomme rend les pastilles attendues`() {
        vectors.forEach { vector ->
            val pills = CallServicePillLaw.of(vector.signals)
            assertWithMessage("${vector.name} : En attente").that(pills.isHoldShown).isEqualTo(vector.hold)
            assertWithMessage("${vector.name} : Vidéo réduite").that(pills.videoNotice).isEqualTo(vector.notice)
        }
    }

    @Test
    fun `les vecteurs ont des noms uniques, que les miroirs iOS et web reprennent`() {
        assertThat(vectors.map { it.name }.toSet()).hasSize(vectors.size)
    }

    @Test
    fun `les pastilles montrees sont des maillons de la pile des bannieres, l'attente avant la video`() {
        val both = CallServicePillLaw.of(signals(isOnHold = true, videoNotice = CallVideoNotice.LowLight))

        assertThat(both.banners).containsExactly(CallTopBanner.Hold, CallTopBanner.VideoNotice)
        assertThat(CallServicePillLaw.of(signals()).banners).isEmpty()
        assertThat(CallServicePillLaw.of(signals(videoNotice = CallVideoNotice.Reduced)).banners).containsExactly(CallTopBanner.VideoNotice)
    }

    @Test
    fun `E3 et E4 - ma vignette descend sous les pastilles et n'est jamais couverte, comme sous tout bandeau de la pile`() {
        val both = CallServicePillLaw.of(signals(isOnHold = true, videoNotice = CallVideoNotice.Reduced))
        val counted = CallTopBannerStack.countedForSelfTile(
            isLocalScreenShareShown = false,
            isRecordingShown = false,
            isCaptureAlertShown = false,
            service = both.banners,
        )

        assertThat(counted).containsExactly(CallTopBanner.Hold, CallTopBanner.VideoNotice)
        assertThat(CallTopBannerStack.selfTileClearanceDp(counted, emptyMap()))
            .isEqualTo(2 * (CallTopBannerStack.BANNER_HEIGHT_DP + CallTopBannerStack.GAP_DP))
    }
}
