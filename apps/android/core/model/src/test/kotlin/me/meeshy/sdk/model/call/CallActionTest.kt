package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [CallAction] — the vocabulary of everything the call screen
 * can offer the user. The identifiers of the pill actions mirror the iOS
 * `CallAction` raw values (`CallControlsLayout.swift`), so a gesture keeps the
 * same name on every platform and a future wire / analytics mention is portable.
 */
class CallActionTest {

    private val iosPillActions = listOf(
        "camera", "flipCamera", "cameraPicker", "effects", "screenShare",
        "captions", "recording", "pictureInPicture", "addPeople", "react", "capture", "journal",
    )

    @Test
    fun `every iOS pill action has an Android counterpart under the same identifier`() {
        val ids = CallAction.entries.map { it.id }

        assertThat(ids).containsAtLeastElementsIn(iosPillActions)
    }

    @Test
    fun `the base row of the pill is present - mute, audio output and hang up`() {
        assertThat(CallAction.entries.map { it.id }).containsAtLeast("mute", "audioOutput", "hangUp")
    }

    @Test
    fun `the lifecycle controls of the ringing and ended screens are present`() {
        assertThat(CallAction.entries.map { it.id })
            .containsAtLeast("accept", "decline", "retry", "close")
    }

    @Test
    fun `identifiers are unique and never blank`() {
        val ids = CallAction.entries.map { it.id }

        assertThat(ids).containsNoDuplicates()
        assertThat(ids.all { it.isNotBlank() }).isTrue()
    }

    @Test
    fun `an identifier resolves back to its action`() {
        CallAction.entries.forEach { action ->
            assertThat(CallAction.fromId(action.id)).isEqualTo(action)
        }
    }

    @Test
    fun `an unknown or missing identifier resolves to nothing - never a guess`() {
        assertThat(CallAction.fromId("teleport")).isNull()
        assertThat(CallAction.fromId("")).isNull()
        assertThat(CallAction.fromId(null)).isNull()
    }
}
