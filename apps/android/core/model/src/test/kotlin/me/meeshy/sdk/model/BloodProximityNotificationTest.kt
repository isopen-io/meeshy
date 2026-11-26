package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.LocalDateTime
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.push.PushDelivery
import me.meeshy.sdk.model.push.PushDeliveryContext
import me.meeshy.sdk.model.push.PushDeliveryGate
import me.meeshy.sdk.model.push.PushPayload
import me.meeshy.sdk.model.push.PushTapDestination
import me.meeshy.sdk.model.relation.SharedLocationPin
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationsMap
import org.junit.Test

/**
 * « Quand un Sang s'approche » (#20540) : la notification `blood_proximity` que la passerelle pousse aux deux Sangs. Le
 * contrat : `data` porte `type`, `userId` (l'autre Sang) et `senderId` ; la ligne porte `{ action, userId, distanceMeters }`,
 * la distance au PALIER. Toucher la bannière ou la ligne ouvre la carte de `userId`, centrée sur les deux.
 */
class BloodProximityNotificationTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `le type se lit par sa valeur de fil`() {
        assertThat(MeeshyNotificationType.fromWire("blood_proximity")).isEqualTo(MeeshyNotificationType.BLOOD_PROXIMITY)
        assertThat(ApiNotification(id = "n", type = "blood_proximity").notificationType)
            .isEqualTo(MeeshyNotificationType.BLOOD_PROXIMITY)
    }

    @Test
    fun `la ligne de la cloche decode l autre Sang et le palier, sans aucune coordonnee`() {
        val raw = """{"id":"n1","type":"blood_proximity","title":"Lina est tout près",
            "content":"À 500 m — touche pour vous voir tous les deux sur la carte",
            "metadata":{"action":"view_profile","userId":"u-lina","distanceMeters":500}}"""

        val notification = json.decodeFromString<ApiNotification>(raw)

        assertThat(notification.metadata?.userId).isEqualTo("u-lina")
        assertThat(notification.metadata?.distanceMeters).isEqualTo(500)
        assertThat(notification.metadata?.locationLat).isNull()
    }

    @Test
    fun `le push decode l autre Sang depuis la cle userId`() {
        val payload = PushPayload.decode(mapOf("type" to "blood_proximity", "userId" to "u-lina", "senderId" to "u-lina"))

        assertThat(payload.userId).isEqualTo("u-lina")
    }

    @Test
    fun `toucher le push ouvre la carte de l autre Sang`() {
        val payload = PushPayload(type = "blood_proximity", userId = "u-lina", senderId = "u-other")

        assertThat(PushTapDestination.resolve(payload)).isEqualTo(PushTapDestination.PersonMap("u-lina"))
    }

    @Test
    fun `une passerelle qui ne sert que senderId ouvre quand meme la carte`() {
        assertThat(PushTapDestination.resolve(PushPayload(type = "blood_proximity", senderId = "u-lina")))
            .isEqualTo(PushTapDestination.PersonMap("u-lina"))
    }

    @Test
    fun `sans personne nommee le toucher ouvre la cloche plutot qu une carte vide`() {
        assertThat(PushTapDestination.resolve(PushPayload(type = "blood_proximity")))
            .isEqualTo(PushTapDestination.Notifications)
    }

    @Test
    fun `la preference absente vaut recue et la coupee retient la notification`() {
        assertThat(UserNotificationPreferences().bloodProximityEnabled).isTrue()
        val decoded = json.decodeFromString<UserNotificationPreferences>("{}")
        assertThat(decoded.bloodProximityEnabled).isTrue()

        assertThat(NotificationTypeToggle.isEnabled("blood_proximity", UserNotificationPreferences())).isTrue()
        assertThat(NotificationTypeToggle.isEnabled("blood_proximity", UserNotificationPreferences(bloodProximityEnabled = false)))
            .isFalse()
        assertThat(NotificationTypeToggle.isEnabled("blood_proximity", UserNotificationPreferences(contactActivityEnabled = false)))
            .isTrue()
    }

    @Test
    fun `la preference voyage vers la passerelle et une passerelle muette ne l ecrase pas`() {
        val off = UserNotificationPreferences(bloodProximityEnabled = false)

        assertThat(NotificationPreferenceSyncBody.from(off).bloodProximityEnabled).isFalse()
        val silent = NotificationPreferenceSyncBody.from(UserNotificationPreferences()).copy(bloodProximityEnabled = null)
        assertThat(silent.toPreferences(off).bloodProximityEnabled).isFalse()
    }

    @Test
    fun `le reglage se range parmi les cercles, avec les autres alertes de Sang`() {
        val descriptor = NotificationTypeCatalog.descriptors.single { it.type == NotificationType.BLOOD_PROXIMITY }

        assertThat(descriptor.category).isEqualTo(NotificationCategory.GROUPS)
        assertThat(descriptor.get(UserNotificationPreferences(bloodProximityEnabled = false))).isFalse()
        assertThat(descriptor.set(UserNotificationPreferences(), false).bloodProximityEnabled).isFalse()
    }

    @Test
    fun `la notification se classe parmi les contacts, canal et filtre de la cloche compris`() {
        assertThat(MeeshyNotificationCategory.of(type = "blood_proximity", ephemeral = false))
            .isEqualTo(MeeshyNotificationCategory.of(type = "contact_recently_active", ephemeral = false))
        assertThat(NotificationFilterCategory.CONTACTS.matches("blood_proximity")).isTrue()
    }

    @Test
    fun `la banniere garde le corps, qui porte la distance`() {
        val notification = ApiNotification(
            id = "n1",
            type = "blood_proximity",
            title = "Lina est tout près",
            content = "À 500 m — touche pour vous voir tous les deux sur la carte",
            actor = NotificationActor(id = "u-lina", displayName = "Lina"),
        )

        val presentation = NotificationBannerFraming.present(notification)

        assertThat(presentation.headline).isEqualTo(BannerHeadline.Plain("Lina est tout près"))
        assertThat(presentation.body).isEqualTo("À 500 m — touche pour vous voir tous les deux sur la carte")
    }

    @Test
    fun `app ouverte et socket branche, le push ne se pose pas une seconde fois au-dessus du bandeau`() {
        val decision = PushDeliveryGate.decide(
            PushPayload(type = "blood_proximity", userId = "u-lina"),
            PushDeliveryContext(
                appInForeground = true,
                socketConnected = true,
                activeConversationId = null,
                preferences = UserNotificationPreferences(),
                now = LocalDateTime.of(2026, 11, 24, 12, 0),
            ),
        )

        assertThat(decision).isEqualTo(PushDelivery.Suppress)
    }

    @Test
    fun `app fermee, le push leve une alerte`() {
        val decision = PushDeliveryGate.decide(
            PushPayload(type = "blood_proximity", userId = "u-lina"),
            PushDeliveryContext(
                appInForeground = false,
                socketConnected = false,
                activeConversationId = null,
                preferences = UserNotificationPreferences(),
                now = LocalDateTime.of(2026, 11, 24, 12, 0),
            ),
        )

        assertThat(decision).isInstanceOf(PushDelivery.Alert::class.java)
    }

    private fun pin(userId: String, point: GeoPoint) = SharedLocationPin(
        userId = userId,
        point = point,
        radiusMeters = 0.0,
        precision = SharedLocationPrecision.EXACT,
        circle = null,
        name = null,
        initials = "?",
        deadlineMillis = 0L,
    )

    @Test
    fun `la carte d une personne se cadre sur elle et sur moi`() {
        val lina = GeoPoint(48.85, 2.35)
        val other = GeoPoint(45.76, 4.83)
        val me = GeoPoint(48.86, 2.36)

        val framed = SharedLocationsMap.framed(listOf(pin("u-lina", lina), pin("u-other", other)), focusUserId = "u-lina", own = me)

        assertThat(framed).containsExactly(lina, me)
    }

    @Test
    fun `sans ma position la carte d une personne se cadre sur elle seule, et la carte de tous ignore la mienne`() {
        val lina = GeoPoint(48.85, 2.35)
        val other = GeoPoint(45.76, 4.83)
        val pins = listOf(pin("u-lina", lina), pin("u-other", other))

        assertThat(SharedLocationsMap.framed(pins, focusUserId = "u-lina", own = null)).containsExactly(lina)
        assertThat(SharedLocationsMap.framed(pins, focusUserId = null, own = GeoPoint(0.0, 0.0))).containsExactly(lina, other)
        assertThat(SharedLocationsMap.framed(pins, focusUserId = "u-absent", own = GeoPoint(0.0, 0.0))).isEmpty()
    }

    @Test
    fun `ma position ne cadre la carte que si elle date de moins d une heure`() {
        val now = 10_000_000L
        val me = GeoPoint(48.86, 2.36)

        assertThat(SharedLocationsMap.ownIfFresh(me, atMillis = now - 59 * 60_000L, nowMillis = now)).isEqualTo(me)
        assertThat(SharedLocationsMap.ownIfFresh(me, atMillis = now - 61 * 60_000L, nowMillis = now)).isNull()
    }
}
