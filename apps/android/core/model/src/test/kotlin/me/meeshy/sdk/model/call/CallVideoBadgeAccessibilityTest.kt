package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallVideoBadgeAccessibilityTest {
    private val phrases = CallVideoBadgeAccessibility.Phrases(
        duration = "Durée",
        peerMuted = "Contact en sourdine",
        peerNetworkWeak = "Réseau faible (contact)",
        reconnecting = "Reconnexion…",
    )

    private fun label(
        signal: String? = null,
        muted: Boolean = false,
        weak: Boolean = false,
        reconnecting: Boolean = false,
    ) = CallVideoBadgeAccessibility.label(phrases, signal, muted, weak, reconnecting)

    @Test
    fun `sans rien d'autre la phrase est la duree`() {
        assertThat(label()).isEqualTo("Durée")
    }

    @Test
    fun `la phrase compose signal, micro du pair, reseau du contact et reconnexion dans cet ordre`() {
        assertThat(label("Signal moyen", muted = true, weak = true, reconnecting = true))
            .isEqualTo("Durée, Signal moyen, Contact en sourdine, Réseau faible (contact), Reconnexion…")
    }

    @Test
    fun `chaque element absent est omis sans virgule orpheline`() {
        assertThat(label(muted = true, reconnecting = true)).isEqualTo("Durée, Contact en sourdine, Reconnexion…")
    }

    @Test
    fun `le titre et le nombre de la capsule ouvrent la phrase, la duree peut manquer en audio`() {
        assertThat(CallVideoBadgeAccessibility.label(phrases, null, false, false, false, title = "Les Copains", participants = "Participants 5"))
            .isEqualTo("Les Copains, Participants 5, Durée")
        assertThat(CallVideoBadgeAccessibility.label(phrases, "Signal faible", false, true, false, includesDuration = false))
            .isEqualTo("Signal faible, Réseau faible (contact)")
    }
}
