package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallHoldPolicyTest {

    private fun input(
        onHold: Boolean,
        isVideoCall: Boolean = true,
        userCameraOn: Boolean = true,
        videoHeldByHold: Boolean = false,
        backgroundSuspended: Boolean = false,
        hidden: Boolean = false,
        survivalSuspended: Boolean = false,
    ) = CallHoldInput(onHold, isVideoCall, userCameraOn, videoHeldByHold, backgroundSuspended, hidden, survivalSuspended)

    @Test
    fun `l attente coupe la video sortante d un appel video`() {
        assertThat(CallHoldPolicy.videoAction(input(onHold = true))).isEqualTo(CallHoldVideoAction.Suspend)
    }

    @Test
    fun `l attente ne dit rien quand la video etait deja coupee par l arriere-plan`() {
        assertThat(CallHoldPolicy.videoAction(input(onHold = true, backgroundSuspended = true))).isEqualTo(CallHoldVideoAction.None)
    }

    @Test
    fun `l attente ne dit rien d un appel audio ou d une camera eteinte par choix`() {
        assertThat(CallHoldPolicy.videoAction(input(onHold = true, isVideoCall = false))).isEqualTo(CallHoldVideoAction.None)
        assertThat(CallHoldPolicy.videoAction(input(onHold = true, userCameraOn = false))).isEqualTo(CallHoldVideoAction.None)
    }

    @Test
    fun `une attente repetee ne coupe pas deux fois`() {
        assertThat(CallHoldPolicy.videoAction(input(onHold = true, videoHeldByHold = true))).isEqualTo(CallHoldVideoAction.None)
    }

    @Test
    fun `la reprise rallume la video que l attente a coupee`() {
        assertThat(CallHoldPolicy.videoAction(input(onHold = false, videoHeldByHold = true))).isEqualTo(CallHoldVideoAction.Resume)
    }

    @Test
    fun `table de reprise attente x survie x arriere-plan`() {
        val cases = listOf(
            Triple(false, false, CallHoldVideoAction.Resume),
            Triple(true, false, CallHoldVideoAction.None),
            Triple(false, true, CallHoldVideoAction.HandOffToBackground),
            Triple(true, true, CallHoldVideoAction.HandOffToBackground),
        )
        cases.forEach { (survival, hidden, expected) ->
            val action = CallHoldPolicy.videoAction(
                input(onHold = false, videoHeldByHold = true, survivalSuspended = survival, hidden = hidden),
            )
            assertThat(action).isEqualTo(expected)
        }
    }

    @Test
    fun `la reprise ne rallume rien que l attente n ait coupe`() {
        assertThat(CallHoldPolicy.videoAction(input(onHold = false))).isEqualTo(CallHoldVideoAction.None)
    }

    @Test
    fun `la reprise respecte une camera que l utilisateur a eteinte pendant l attente`() {
        assertThat(CallHoldPolicy.videoAction(input(onHold = false, videoHeldByHold = true, userCameraOn = false)))
            .isEqualTo(CallHoldVideoAction.None)
    }

    @Test
    fun `allumer la camera en attente est refuse mais l eteindre est permis`() {
        assertThat(CallHoldPolicy.refusesCameraActivation(onHold = true, enabling = true)).isTrue()
        assertThat(CallHoldPolicy.refusesCameraActivation(onHold = true, enabling = false)).isFalse()
        assertThat(CallHoldPolicy.refusesCameraActivation(onHold = false, enabling = true)).isFalse()
    }

    @Test
    fun `l appel est en attente des qu une source l est`() {
        assertThat(CallHoldPolicy.isOnHold(telecomHeld = false, audioFocusLost = false)).isFalse()
        assertThat(CallHoldPolicy.isOnHold(telecomHeld = true, audioFocusLost = false)).isTrue()
        assertThat(CallHoldPolicy.isOnHold(telecomHeld = false, audioFocusLost = true)).isTrue()
    }

    @Test
    fun `les tonalites DTMF valides sont normalisees en majuscules`() {
        assertThat(CallDtmfTones.normalize("12*#")).isEqualTo("12*#")
        assertThat(CallDtmfTones.normalize("ab")).isEqualTo("AB")
    }

    @Test
    fun `une chaine vide ou invalide est refusee en bloc`() {
        assertThat(CallDtmfTones.normalize("")).isNull()
        assertThat(CallDtmfTones.normalize("12E")).isNull()
        assertThat(CallDtmfTones.normalize("1 2")).isNull()
    }
}
