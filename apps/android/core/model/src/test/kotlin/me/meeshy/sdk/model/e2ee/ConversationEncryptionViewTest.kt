package me.meeshy.sdk.model.e2ee

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Ce que la feuille Chiffrement rend (#12880, #12949) : le bout en bout ne se quitte jamais, et ne s'active pas depuis ce téléphone. */
class ConversationEncryptionViewTest {

    private fun status(
        mode: String? = "server",
        canToggle: Boolean? = true,
        pair: String? = null,
    ) = ConversationEncryptionStatus(
        isEncrypted = mode != null,
        mode = mode,
        enabledAt = null,
        canTranslate = mode == "server" || mode == "hybrid",
        canToggleEncryption = canToggle,
        pairEndToEndConversationId = pair,
    )

    private fun view(
        status: ConversationEncryptionStatus? = status(),
        sealed: Boolean = false,
        isDirect: Boolean = true,
        loading: Boolean = false,
        fallback: Boolean = false,
    ) = ConversationEncryptionView.resolve(status, sealed, isDirect, loading, fallbackMayToggle = fallback)

    @Test
    fun `while loading nothing else is shown`() {
        assertThat(view(loading = true).content).isEqualTo(ConversationEncryptionContent.Loading)
    }

    @Test
    fun `a server regime lets the allowed role deactivate it`() {
        val shown = view()

        assertThat(shown.regime).isEqualTo(ConversationEncryptionRegime.SERVER)
        assertThat(shown.content).isEqualTo(ConversationEncryptionContent.Active(offersDeactivation = true))
    }

    @Test
    fun `end to end is never deactivated, even for the role that can toggle`() {
        val shown = view(status = status(mode = "e2ee", canToggle = true))

        assertThat(shown.regime).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(shown.content).isEqualTo(ConversationEncryptionContent.Active(offersDeactivation = false))
    }

    @Test
    fun `a device that saw the conversation encrypted keeps it end to end when the server serves clear`() {
        val shown = view(status = status(mode = null, canToggle = true), sealed = true)

        assertThat(shown.regime).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(shown.servedGap).isTrue()
        assertThat(shown.mayToggle).isFalse()
        assertThat(shown.content).isEqualTo(ConversationEncryptionContent.Active(offersDeactivation = false))
    }

    @Test
    fun `a device that saw it encrypted shows the gap even when the server serves a readable regime`() {
        val shown = view(status = status(mode = "server"), sealed = true)

        assertThat(shown.regime).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(shown.servedGap).isTrue()
    }

    @Test
    fun `no gap when the server agrees it is end to end`() {
        assertThat(view(status = status(mode = "e2ee"), sealed = true).servedGap).isFalse()
    }

    @Test
    fun `a clear direct conversation offers activation only to the role the gateway named`() {
        assertThat(view(status = status(mode = null, canToggle = true)).content).isEqualTo(ConversationEncryptionContent.Activation)
        assertThat(view(status = status(mode = null, canToggle = false)).content).isEqualTo(ConversationEncryptionContent.InactiveReadOnly)
        assertThat(view(status = status(mode = null, canToggle = null)).content).isEqualTo(ConversationEncryptionContent.InactiveReadOnly)
    }

    @Test
    fun `a group explains itself without activating`() {
        val shown = view(status = status(mode = null, canToggle = true), isDirect = false)

        assertThat(shown.content).isEqualTo(ConversationEncryptionContent.InactiveReadOnly)
    }

    @Test
    fun `without a served status the fallback right decides, closed by default`() {
        assertThat(view(status = null).content).isEqualTo(ConversationEncryptionContent.InactiveReadOnly)
        assertThat(view(status = null, fallback = true).content).isEqualTo(ConversationEncryptionContent.Activation)
    }

    @Test
    fun `the pair end to end conversation is offered from the readable direct only`() {
        assertThat(view(status = status(mode = null, pair = "c42")).pairEndToEndConversationId).isEqualTo("c42")
        assertThat(view(status = status(mode = "e2ee", pair = "c42")).pairEndToEndConversationId).isNull()
        assertThat(view(status = status(mode = null, pair = "")).pairEndToEndConversationId).isNull()
    }
}
