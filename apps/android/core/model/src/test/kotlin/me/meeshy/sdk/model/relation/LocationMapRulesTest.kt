package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * LA CARTE COMME ACTION, SUR ANDROID (#18890) — les règles pures de la carte des positions partagées, iso
 * `LocationMapRules.swift` (#18872) : combien de temps il reste, à quelle distance, dans quel ordre. Aucune ne rend une
 * position plus fine que servie.
 */
class LocationMapRulesTest {
    private val t0 = 1_800_000_000_000L
    private val minute = 60_000L

    @Test
    fun `la distance entre deux points est la distance au sol en metres`() {
        val meters = LocationMapRules.distanceMeters(48.8566, 2.3522, 48.8606, 2.3376)
        assertThat(meters).isWithin(15.0).of(1_130.0)
        assertThat(LocationMapRules.distanceMeters(10.0, 10.0, 10.0, 10.0)).isEqualTo(0.0)
    }

    @Test
    fun `a pied se compte a 80 m par minute, jamais sous une minute, et se tait au dela de 15 km`() {
        assertThat(LocationMapRules.walkingMinutes(2_400.0)).isEqualTo(30)
        assertThat(LocationMapRules.walkingMinutes(3.0)).isEqualTo(1)
        assertThat(LocationMapRules.walkingMinutes(15_000.0)).isEqualTo(188)
        assertThat(LocationMapRules.walkingMinutes(15_000.1)).isNull()
        assertThat(LocationMapRules.walkingMinutes(Double.NaN)).isNull()
        assertThat(LocationMapRules.walkingMinutes(-1.0)).isNull()
    }

    @Test
    fun `le temps restant d un partage se lit sur la plus petite duree servie qui le contient`() {
        val short = SharedLocationWindow.of(deadlineMillis = t0 + 42 * minute, nowMillis = t0)
        assertThat(short.remainingMinutes).isEqualTo(42)
        assertThat(short.totalMillis).isEqualTo(3_600_000L)
        assertThat(short.fraction).isWithin(1e-9).of(42.0 / 60.0)

        val long = SharedLocationWindow.of(deadlineMillis = t0 + 5 * 60 * minute, nowMillis = t0)
        assertThat(long.totalMillis).isEqualTo(8 * 3_600_000L)
    }

    @Test
    fun `une echeance plus lointaine que huit heures est bornee et une echeance passee est echue`() {
        val far = SharedLocationWindow.of(deadlineMillis = t0 + 20 * 3_600_000L, nowMillis = t0)
        assertThat(far.remainingMillis).isEqualTo(SharedLocationContract.MAX_LIFETIME_MS)

        val over = SharedLocationWindow.of(deadlineMillis = t0 - minute, nowMillis = t0)
        assertThat(over.isOver).isTrue()
        assertThat(over.remainingMinutes).isEqualTo(0)
        assertThat(over.fraction).isEqualTo(0.0)
    }

    @Test
    fun `les minutes restantes s arrondissent au dessus tant qu une seconde reste`() {
        assertThat(SharedLocationWindow.of(t0 + 1_000L, t0).remainingMinutes).isEqualTo(1)
        assertThat(SharedLocationWindow.of(t0 + 61_000L, t0).remainingMinutes).isEqualTo(2)
    }

    @Test
    fun `une position mise a jour depuis moins de deux minutes est en direct, sinon elle dit depuis combien de minutes`() {
        assertThat(SharedLocationFreshness.of(updatedAtMillis = t0 - 30_000L, nowMillis = t0))
            .isEqualTo(SharedLocationFreshness.Live(secondsAgo = 30))
        assertThat(SharedLocationFreshness.of(updatedAtMillis = t0 - 119_000L, nowMillis = t0))
            .isEqualTo(SharedLocationFreshness.Live(secondsAgo = 119))
        assertThat(SharedLocationFreshness.of(updatedAtMillis = t0 - 5 * minute, nowMillis = t0))
            .isEqualTo(SharedLocationFreshness.Stale(minutesAgo = 5))
        assertThat(SharedLocationFreshness.of(updatedAtMillis = t0 + minute, nowMillis = t0))
            .isEqualTo(SharedLocationFreshness.Live(secondsAgo = 0))
    }

    @Test
    fun `ma position n est partagee avec la personne regardee que si elle est parmi mes destinataires`() {
        assertThat(LocationMapOwnShare.resolve(emptyList(), "u2")).isEqualTo(LocationMapOwnShare.NOT_SHARED)
        assertThat(LocationMapOwnShare.resolve(listOf("u3"), "u2")).isEqualTo(LocationMapOwnShare.NOT_SHARED)
        assertThat(LocationMapOwnShare.resolve(listOf("u3", "u2"), "u2")).isEqualTo(LocationMapOwnShare.SHARED_WITH_THEM)
        assertThat(LocationMapOwnShare.resolve(listOf("u3"), null)).isEqualTo(LocationMapOwnShare.SHARED)
        assertThat(LocationMapOwnShare.resolve(emptyList(), null)).isEqualTo(LocationMapOwnShare.NOT_SHARED)
    }

    @Test
    fun `autour de toi, du plus pres, les distances inconnues a la fin et l identifiant qui departage`() {
        val people = listOf(
            NearbyPlacement("c", SharedLocationCircle.FRIEND, null),
            NearbyPlacement("b", SharedLocationCircle.CLOSE, 900.0),
            NearbyPlacement("a", SharedLocationCircle.BLOOD, 900.0),
            NearbyPlacement("d", SharedLocationCircle.FRIEND, 120.0),
        )
        val ids = NearbyRules.arranged(people, NearbyCircleFilter.ALL).map { it.id }
        assertThat(ids).containsExactly("d", "a", "b", "c").inOrder()
    }

    @Test
    fun `une puce de cercle ne garde que ce cercle et un cercle non servi n entre que dans tous`() {
        val people = listOf(
            NearbyPlacement("a", SharedLocationCircle.BLOOD, 10.0),
            NearbyPlacement("b", SharedLocationCircle.CLOSE, 20.0),
            NearbyPlacement("c", null, 30.0),
        )
        assertThat(NearbyRules.arranged(people, NearbyCircleFilter.CLOSE).map { it.id }).containsExactly("b")
        assertThat(NearbyRules.arranged(people, NearbyCircleFilter.ALL).map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(NearbyRules.counts(people)).containsExactly(
            NearbyCircleFilter.ALL, 3,
            NearbyCircleFilter.FRIEND, 0,
            NearbyCircleFilter.CLOSE, 1,
            NearbyCircleFilter.BLOOD, 1,
        )
    }

    @Test
    fun `la fin la plus proche passe devant, sans duree connue en dernier`() {
        val people = listOf(
            NearbyPlacement("a", SharedLocationCircle.FRIEND, 10.0, remainingMillis = 50 * minute),
            NearbyPlacement("b", SharedLocationCircle.FRIEND, 20.0, remainingMillis = 5 * minute),
            NearbyPlacement("c", SharedLocationCircle.FRIEND, 5.0, remainingMillis = null),
        )
        val ids = NearbyRules.arranged(people, NearbyCircleFilter.ALL, NearbySort.ENDING_SOON).map { it.id }
        assertThat(ids).containsExactly("b", "a", "c").inOrder()
    }

    @Test
    fun `par cercle, Sang puis Proche puis Ami, chacun du plus pres`() {
        val people = listOf(
            NearbyPlacement("f", SharedLocationCircle.FRIEND, 1.0),
            NearbyPlacement("c2", SharedLocationCircle.CLOSE, 50.0),
            NearbyPlacement("c1", SharedLocationCircle.CLOSE, 5.0),
            NearbyPlacement("b", SharedLocationCircle.BLOOD, 999.0),
        )
        val ids = NearbyRules.arranged(people, NearbyCircleFilter.ALL, NearbySort.BY_CIRCLE).map { it.id }
        assertThat(ids).containsExactly("b", "c1", "c2", "f").inOrder()
    }
}
