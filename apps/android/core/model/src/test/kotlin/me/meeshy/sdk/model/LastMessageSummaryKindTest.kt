package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LastMessageSummaryKindTest {
    private val now = 1_700_000_000_000L
    private val past = "2023-11-14T22:13:19.000Z"
    private val future = "2023-11-14T22:14:21.000Z"

    private fun message(
        expiresAt: String? = null,
        isBlurred: Boolean = false,
        isViewOnce: Boolean = false,
        effectFlags: Int? = null,
        isEncrypted: Boolean? = null,
    ) = ApiConversationLastMessage(
        id = "m1", expiresAt = expiresAt, isBlurred = isBlurred, isViewOnce = isViewOnce,
        effectFlags = effectFlags, isEncrypted = isEncrypted,
    )

    private val afterReadFlag = MessageEffectFlags.EPHEMERAL_AFTER_READ.toInt()

    @Test fun `sans message la nature est standard`() {
        assertThat(LastMessageSummaryKind.of(null, now)).isEqualTo(LastMessageSummaryKind.STANDARD)
    }

    @Test fun `apres lecture est reconnu`() {
        assertThat(LastMessageSummaryKind.of(message(effectFlags = afterReadFlag), now))
            .isEqualTo(LastMessageSummaryKind.AFTER_READ)
    }

    @Test fun `expire l'emporte sur tout`() {
        val m = message(expiresAt = past, isBlurred = true, isViewOnce = true, effectFlags = afterReadFlag)
        assertThat(LastMessageSummaryKind.of(m, now)).isEqualTo(LastMessageSummaryKind.EXPIRED)
    }

    @Test fun `flou l'emporte sur vue unique et apres lecture`() {
        val m = message(isBlurred = true, isViewOnce = true, effectFlags = afterReadFlag)
        assertThat(LastMessageSummaryKind.of(m, now)).isEqualTo(LastMessageSummaryKind.HIDDEN)
    }

    @Test fun `vue unique l'emporte sur apres lecture`() {
        val m = message(isViewOnce = true, effectFlags = afterReadFlag)
        assertThat(LastMessageSummaryKind.of(m, now)).isEqualTo(LastMessageSummaryKind.VIEW_ONCE)
    }

    @Test fun `apres lecture l'emporte sur ephemere actif`() {
        val m = message(expiresAt = future, effectFlags = afterReadFlag)
        assertThat(LastMessageSummaryKind.of(m, now)).isEqualTo(LastMessageSummaryKind.AFTER_READ)
    }

    @Test fun `ephemere actif quand l'echeance est future`() {
        assertThat(LastMessageSummaryKind.of(message(expiresAt = future), now))
            .isEqualTo(LastMessageSummaryKind.EPHEMERAL_ACTIVE)
    }

    @Test fun `chiffre vient apres expire et avant flou`() {
        assertThat(LastMessageSummaryKind.of(message(isEncrypted = true, isBlurred = true), now))
            .isEqualTo(LastMessageSummaryKind.ENCRYPTED)
    }
}
