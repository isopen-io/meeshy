package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import org.junit.Test

class CallLiveFrameStageTest {
    private val frameId = CallLiveFrameRule.frames().first().id

    @Test
    fun `un cadre partage en video etablie prend la scene du duo`() {
        assertThat(CallLiveFrameStage.framesTheDuo(frameId, isVideoCall = true, showsConnectedLayout = true, constrained = false, reduceMotion = false)).isTrue()
    }

    @Test
    fun `un cadre suspendu n'est pas peint, la scene du duo reste la sienne`() {
        assertThat(CallLiveFrameStage.framesTheDuo(frameId, isVideoCall = true, showsConnectedLayout = true, constrained = true, reduceMotion = false)).isFalse()
    }

    @Test
    fun `sans cadre, en audio ou avant la connexion, la scene du duo reste la sienne`() {
        assertThat(CallLiveFrameStage.framesTheDuo(null, isVideoCall = true, showsConnectedLayout = true, constrained = false, reduceMotion = false)).isFalse()
        assertThat(CallLiveFrameStage.framesTheDuo("inconnu", isVideoCall = true, showsConnectedLayout = true, constrained = false, reduceMotion = false)).isFalse()
        assertThat(CallLiveFrameStage.framesTheDuo(frameId, isVideoCall = false, showsConnectedLayout = true, constrained = false, reduceMotion = false)).isFalse()
        assertThat(CallLiveFrameStage.framesTheDuo(frameId, isVideoCall = true, showsConnectedLayout = false, constrained = false, reduceMotion = false)).isFalse()
    }
}
