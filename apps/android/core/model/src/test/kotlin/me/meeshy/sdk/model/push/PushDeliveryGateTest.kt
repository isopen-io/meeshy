package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FocusFilterSnapshot
import me.meeshy.sdk.model.UserNotificationPreferences
import java.time.LocalDateTime
import org.junit.Test

class PushDeliveryGateTest {

    private val awake = LocalDateTime.of(2026, 8, 17, 12, 0)
    private val quiet = LocalDateTime.of(2026, 8, 17, 23, 0)

    private fun payload(type: String? = "new_message", conversationId: String? = "c1", conversationType: String? = null) =
        PushPayload(type = type, conversationId = conversationId, conversationType = conversationType)

    private fun context(
        appInForeground: Boolean = false,
        socketConnected: Boolean = false,
        activeConversationId: String? = null,
        preferences: UserNotificationPreferences = UserNotificationPreferences(),
        focus: FocusFilterSnapshot = FocusFilterSnapshot.PERMISSIVE,
        now: LocalDateTime = awake,
    ) = PushDeliveryContext(appInForeground, socketConnected, activeConversationId, preferences, focus, now)

    @Test
    fun `un push autorise en arriere-plan leve une alerte sonore`() {
        assertThat(PushDeliveryGate.decide(payload(), context())).isEqualTo(PushDelivery.Alert(playSound = true))
    }

    @Test
    fun `sons coupes donnent une alerte silencieuse`() {
        val decision = PushDeliveryGate.decide(payload(), context(preferences = UserNotificationPreferences(soundEnabled = false)))

        assertThat(decision).isEqualTo(PushDelivery.Alert(playSound = false))
    }

    @Test
    fun `la conversation ouverte au premier plan l emporte sur tout`() {
        val decision = PushDeliveryGate.decide(payload(), context(appInForeground = true, activeConversationId = "c1"))

        assertThat(decision).isEqualTo(PushDelivery.Suppress)
    }

    @Test
    fun `la conversation ouverte ne compte pas en arriere-plan`() {
        val decision = PushDeliveryGate.decide(payload(), context(activeConversationId = "c1"))

        assertThat(decision).isEqualTo(PushDelivery.Alert(playSound = true))
    }

    @Test
    fun `la socket vivante ne supprime qu au premier plan`() {
        assertThat(PushDeliveryGate.decide(payload(), context(appInForeground = true, socketConnected = true)))
            .isEqualTo(PushDelivery.Suppress)
        assertThat(PushDeliveryGate.decide(payload(), context(socketConnected = true)))
            .isEqualTo(PushDelivery.Alert(playSound = true))
    }

    @Test
    fun `un refus des preferences passe en livraison passive en arriere-plan`() {
        val decision = PushDeliveryGate.decide(payload(), context(preferences = UserNotificationPreferences(pushEnabled = false)))

        assertThat(decision).isEqualTo(PushDelivery.Passive)
    }

    @Test
    fun `un refus des preferences supprime au premier plan comme avant`() {
        val decision = PushDeliveryGate.decide(
            payload(),
            context(appInForeground = true, preferences = UserNotificationPreferences(pushEnabled = false)),
        )

        assertThat(decision).isEqualTo(PushDelivery.Suppress)
    }

    @Test
    fun `les heures calmes rendent la livraison passive`() {
        val decision = PushDeliveryGate.decide(payload(), context(preferences = UserNotificationPreferences(dndEnabled = true), now = quiet))

        assertThat(decision).isEqualTo(PushDelivery.Passive)
    }

    @Test
    fun `l interrupteur du type rend la livraison passive`() {
        val decision = PushDeliveryGate.decide(payload(), context(preferences = UserNotificationPreferences(newMessageEnabled = false)))

        assertThat(decision).isEqualTo(PushDelivery.Passive)
    }

    @Test
    fun `le ne pas deranger systeme coupe un message de groupe mais laisse passer le direct en priorite`() {
        val priority = FocusFilterSnapshot.fromInterruptionFilter(FocusFilterSnapshot.INTERRUPTION_FILTER_PRIORITY)

        assertThat(PushDeliveryGate.decide(payload(conversationType = "group"), context(focus = priority)))
            .isEqualTo(PushDelivery.Passive)
        assertThat(PushDeliveryGate.decide(payload(conversationType = "direct"), context(focus = priority)))
            .isEqualTo(PushDelivery.Alert(playSound = true))
    }

    @Test
    fun `un type inconnu est gouverne par la categorie systeme sans exception`() {
        assertThat(PushDeliveryGate.decide(payload(type = "future_type"), context()))
            .isEqualTo(PushDelivery.Alert(playSound = true))
        assertThat(PushDeliveryGate.decide(payload(type = "future_type"), context(preferences = UserNotificationPreferences(systemEnabled = false))))
            .isEqualTo(PushDelivery.Passive)
    }
}
