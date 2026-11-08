package me.meeshy.sdk.preferences

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.voice.ConsentPurpose
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class UserPreferencesManagerConsentTest {

    @Test
    fun `the consent is granted first, then the four audio functions are switched on`() = runTest {
        val harness = UserPreferencesHarness(this)
        coEvery { harness.consents.grant(ConsentPurpose.VOICE_CLONING) } returns NetworkResult.Success(Unit)
        val manager = harness.manager()

        val result = manager.grantVoiceAutoTranslationConsent()

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
        coVerifyOrder { harness.consents.grant(ConsentPurpose.VOICE_CLONING) }
        val audio = manager.audio.value
        assertThat(audio.transcriptionEnabled).isTrue()
        assertThat(audio.audioTranslationEnabled).isTrue()
        assertThat(audio.ttsEnabled).isTrue()
        assertThat(audio.voiceProfileEnabled).isTrue()
    }

    @Test
    fun `a refused grant changes nothing locally and queues nothing`() = runTest {
        val harness = UserPreferencesHarness(this)
        coEvery { harness.consents.grant(ConsentPurpose.VOICE_CLONING) } returns
            NetworkResult.Failure(ApiError(message = "refused", code = "FORBIDDEN"))
        val manager = harness.manager()
        val before = manager.audio.value

        val result = manager.grantVoiceAutoTranslationConsent()

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(manager.audio.value).isEqualTo(before)
        assertThat(harness.sync.pendingCategories()).isEmpty()
        coVerify(exactly = 1) { harness.consents.grant(any()) }
    }
}
