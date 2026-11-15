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
    fun `a server regime lets the allowed role switch it to another mode`() {
        val shown = view()

        assertThat(shown.regime).isEqualTo(ConversationEncryptionRegime.SERVER)
        assertThat(shown.content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = true))
    }

    @Test
    fun `end to end never offers a mode change, even for the role that can toggle`() {
        val shown = view(status = status(mode = "e2ee", canToggle = true))

        assertThat(shown.regime).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(shown.content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = false))
    }

    @Test
    fun `a device that saw the conversation encrypted keeps it end to end when the server serves clear`() {
        val shown = view(status = status(mode = null, canToggle = true), sealed = true)

        assertThat(shown.regime).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(shown.servedGap).isTrue()
        assertThat(shown.mayToggle).isFalse()
        assertThat(shown.content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = false))
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
    fun `a group offers activation to the moderator the gateway named, and to nobody else (#16044)`() {
        assertThat(view(status = status(mode = null, canToggle = true), isDirect = false).content)
            .isEqualTo(ConversationEncryptionContent.Activation)
        assertThat(view(status = status(mode = null, canToggle = false), isDirect = false).content)
            .isEqualTo(ConversationEncryptionContent.InactiveReadOnly)
        assertThat(view(status = status(mode = null, canToggle = null), isDirect = false).content)
            .isEqualTo(ConversationEncryptionContent.InactiveReadOnly)
    }

    @Test
    fun `a server group climbs to hybrid for its moderator, never otherwise`() {
        assertThat(view(status = status(mode = "server"), isDirect = false).content)
            .isEqualTo(ConversationEncryptionContent.Active(offersModeChange = true))
        assertThat(view(status = status(mode = "server", canToggle = false), isDirect = false).content)
            .isEqualTo(ConversationEncryptionContent.Active(offersModeChange = false))
    }

    @Test
    fun `a hybrid group returns to server for its moderator (#14663)`() {
        assertThat(view(status = status(mode = "hybrid"), isDirect = false).content)
            .isEqualTo(ConversationEncryptionContent.Active(offersModeChange = true))
        assertThat(view(status = status(mode = "hybrid", canToggle = false), isDirect = false).content)
            .isEqualTo(ConversationEncryptionContent.Active(offersModeChange = false))
    }

    @Test
    fun `a group sealed end to end on this device is never toggled, whatever the gateway serves`() {
        val shown = view(status = status(mode = null, canToggle = true), sealed = true, isDirect = false)

        assertThat(shown.mayToggle).isFalse()
        assertThat(shown.content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = false))
    }

    @Test
    fun `a group switches like a direct conversation, end to end excepted from this phone`() {
        assertThat(ConversationEncryptionModeChoice.switchTargets(ConversationEncryptionRegime.HYBRID))
            .contains(ConversationEncryptionModeChoice.SERVER)
        assertThat(
            ConversationEncryptionModeChoice.switchTargets(ConversationEncryptionRegime.HYBRID)
                .filter { it.isOfferedFor(isDirect = false) },
        ).containsExactly(ConversationEncryptionModeChoice.SERVER)
        assertThat(
            ConversationEncryptionModeChoice.switchTargets(ConversationEncryptionRegime.SERVER)
                .filter { it.isOfferedFor(isDirect = false) },
        ).containsExactly(ConversationEncryptionModeChoice.HYBRID)
    }
}
