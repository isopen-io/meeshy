package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DeletionAcknowledgementTest {
    @Test
    fun `forme message seul`() {
        assertThat(DeletionAcknowledgement.parse("""{"success":true,"data":{"message":"ok"}}""").message).isEqualTo("ok")
    }

    @Test
    fun `forme messageId deleted meta`() {
        val a = DeletionAcknowledgement.parse(
            """{"success":true,"data":{"messageId":"m","deleted":true,"meta":{"searchId":"q"}}}""",
        )
        assertThat(a.flags).containsExactly("deleted", true)
        assertThat(a.meta?.searchId).isEqualTo("q")
    }

    @Test
    fun `forme deleted true`() {
        assertThat(DeletionAcknowledgement.parse("""{"data":{"deleted":true}}""").flags["deleted"]).isTrue()
    }

    @Test
    fun `valeur non booleenne ignoree et jamais refusee`() {
        assertThat(DeletionAcknowledgement.parse("""{"data":{"revokedCount":3,"deleted":"yes"}}""").flags).isEmpty()
    }

    @Test
    fun `corps vide ou invalide`() {
        assertThat(DeletionAcknowledgement.parse("")).isEqualTo(DeletionAcknowledgement())
        assertThat(DeletionAcknowledgement.parse(null)).isEqualTo(DeletionAcknowledgement())
        assertThat(DeletionAcknowledgement.parse("<html>")).isEqualTo(DeletionAcknowledgement())
    }
}
