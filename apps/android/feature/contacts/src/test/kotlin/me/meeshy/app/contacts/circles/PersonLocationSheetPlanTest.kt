package me.meeshy.app.contacts.circles

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.relation.SharedLocationCircle
import me.meeshy.sdk.model.relation.SharedLocationFix
import me.meeshy.sdk.model.relation.SharedLocationFreshness
import me.meeshy.sdk.model.relation.SharedLocationPin
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import org.junit.Test

/** La fiche devenue feuille basse (#18890, planche Carte-Personne) : tout se lit sur la position SERVIE. */
class PersonLocationSheetPlanTest {
    private val now = 1_800_000_000_000L
    private val minute = 60_000L

    private fun pin(deadline: Long = now + 42 * minute, precision: SharedLocationPrecision = SharedLocationPrecision.NEIGHBORHOOD) =
        SharedLocationPin(
            userId = "u2",
            point = GeoPoint(38.7139, -9.1334),
            radiusMeters = 1_200.0,
            precision = precision,
            circle = SharedLocationCircle.CLOSE,
            name = "Léo Marchetti",
            initials = "LM",
            deadlineMillis = deadline,
        )

    @Test
    fun `la feuille dit le temps restant, la fraicheur et l itineraire de la position servie`() {
        val plan = PersonLocationSheetPlan.of(pin(), updatedAtMillis = now - 30_000L, own = null, nowMillis = now)

        assertThat(plan.window.remainingMinutes).isEqualTo(42)
        assertThat(plan.freshness).isEqualTo(SharedLocationFreshness.Live(30))
        assertThat(plan.directionsUri).isEqualTo("geo:38.7139,-9.1334?q=38.7139,-9.1334")
        assertThat(plan.distanceMeters).isNull()
        assertThat(plan.walkMinutes).isNull()
    }

    @Test
    fun `sans relevé de mise a jour la feuille ne dit pas de fraicheur`() {
        val plan = PersonLocationSheetPlan.of(pin(), updatedAtMillis = null, own = null, nowMillis = now)
        assertThat(plan.freshness).isNull()
    }

    @Test
    fun `ma position connue donne la distance et les minutes a pied`() {
        val own = checkNotNull(SharedLocationFix.of(38.7223, -9.1393))
        val plan = PersonLocationSheetPlan.of(pin(), updatedAtMillis = now, own = own, nowMillis = now)

        assertThat(plan.distanceMeters).isWithin(20.0).of(1_070.0)
        assertThat(plan.walkMinutes).isEqualTo(13)
    }

    @Test
    fun `sous 15 % de la duree la jauge passe en alerte, et un partage echu est echu`() {
        assertThat(PersonLocationSheetPlan.of(pin(now + 5 * minute), null, null, now).isUrgent).isTrue()
        assertThat(PersonLocationSheetPlan.of(pin(now + 50 * minute), null, null, now).isUrgent).isFalse()
        val over = PersonLocationSheetPlan.of(pin(now - minute), null, null, now)
        assertThat(over.window.isOver).isTrue()
    }
}
