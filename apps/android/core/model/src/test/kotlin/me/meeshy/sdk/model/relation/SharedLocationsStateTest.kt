package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Les positions qu'on me partage, CHEZ MOI (#16985) — la réduction pure, iso `SharedLocationsLiveTests.swift` et
 * `shared-locations-live.ts`. Le serveur a déjà jugé (niveau, consentement, blocage, précision) : l'état ne rejuge rien
 * et ne rend rien plus précis que servi.
 */
class SharedLocationsStateTest {
    private val hour = 3_600_000L
    private val t0 = 1_800_000_000_000L

    private fun location(
        userId: String = "u2",
        latitude: Double = 48.85,
        longitude: Double = 2.35,
        precision: SharedLocationPrecision = SharedLocationPrecision.CITY,
        radiusMeters: Double = 12_000.0,
        circle: SharedLocationCircle? = SharedLocationCircle.FRIEND,
        updatedAt: Long = t0,
        expiresAt: Long = t0 + hour,
    ) = SharedLocation(userId, latitude, longitude, precision, radiusMeters, circle, updatedAt, expiresAt)

    private val paris = checkNotNull(SharedLocationBounds.of(minLongitude = 2.0, minLatitude = 48.5, maxLongitude = 2.6, maxLatitude = 49.0))

    @Test
    fun `une position recue se garde telle que servie, jusqu'a son terme`() {
        val state = SharedLocationsState().receive(location(), viewerId = "me", nowMillis = t0)

        assertThat(state.byUser.getValue("u2")).isEqualTo(
            SharedLocationEntry(48.85, 2.35, SharedLocationPrecision.CITY, 12_000.0, SharedLocationCircle.FRIEND, t0, t0 + hour),
        )
        assertThat(state.nextDeadlineMillis).isEqualTo(t0 + hour)
    }

    @Test
    fun `une montee de precision rend la position plus fine sans recharger, une baisse la rend plus grossiere`() {
        val city = SharedLocationsState().receive(location(), "me", t0)
        val exact = city.receive(
            location(latitude = 48.8566, precision = SharedLocationPrecision.EXACT, radiusMeters = 15.0, circle = SharedLocationCircle.CLOSE, updatedAt = t0 + 1_000),
            "me",
            t0 + 1_000,
        )
        val back = exact.receive(location(updatedAt = t0 + 2_000), "me", t0 + 2_000)

        assertThat(exact.byUser.getValue("u2").precision).isEqualTo(SharedLocationPrecision.EXACT)
        assertThat(exact.byUser.getValue("u2").circle).isEqualTo(SharedLocationCircle.CLOSE)
        assertThat(back.byUser.getValue("u2").precision).isEqualTo(SharedLocationPrecision.CITY)
        assertThat(back.byUser.getValue("u2").radiusMeters).isEqualTo(12_000.0)
    }

    @Test
    fun `une position plus ancienne que celle gardee n'ecrase rien`() {
        val kept = SharedLocationsState().receive(location(latitude = 1.0, updatedAt = t0 + 5_000), "me", t0)
        val stale = kept.receive(location(latitude = 2.0, updatedAt = t0), "me", t0 + 6_000)

        assertThat(stale.byUser.getValue("u2").latitude).isEqualTo(1.0)
    }

    @Test
    fun `ma propre position, venue d'un autre de mes appareils, ne s'affiche pas`() {
        val state = SharedLocationsState().receive(location(userId = "ME"), viewerId = "me", nowMillis = t0)

        assertThat(state.byUser).isEmpty()
    }

    @Test
    fun `la fin d'un partage efface la position`() {
        val state = SharedLocationsState().receive(location(), "me", t0).clear("u2")

        assertThat(state.byUser).isEmpty()
        assertThat(state.nextDeadlineMillis).isNull()
    }

    @Test
    fun `l'echeance est la plus proche de expiresAt et de la duree servie comptee a l'horloge de l'appareil`() {
        val late = SharedLocationsState().receive(location(), "me", nowMillis = t0 - 10 * 60_000)
        val replayed = SharedLocationsState().receive(location(), "me", nowMillis = t0 + 20 * 60_000)

        assertThat(late.byUser.getValue("u2").deadlineMillis).isEqualTo(t0 + 50 * 60_000)
        assertThat(replayed.byUser.getValue("u2").deadlineMillis).isEqualTo(t0 + hour)
    }

    @Test
    fun `une position rejouee deja echue n'est jamais affichee, et efface l'ancienne`() {
        val kept = SharedLocationsState().receive(location(updatedAt = t0 - 2 * hour, expiresAt = t0 - hour + 30_000), "me", t0 - 2 * hour)
        val replayed = kept.receive(location(updatedAt = t0 - hour, expiresAt = t0 - 1), "me", t0)

        assertThat(replayed.byUser).isEmpty()
    }

    @Test
    fun `ce qui a passe son echeance s'eteint sans evenement du serveur`() {
        val state = SharedLocationsState()
            .receive(location(userId = "u2", expiresAt = t0 + hour), "me", t0)
            .receive(location(userId = "u3", expiresAt = t0 + 2 * hour), "me", t0)

        val expired = state.expireDue(nowMillis = t0 + hour)

        assertThat(expired.byUser.keys).containsExactly("u3")
        assertThat(expired.nextDeadlineMillis).isEqualTo(t0 + 2 * hour)
    }

    @Test
    fun `le rattrapage fait foi dans son emprise, une fin survenue pendant la coupure efface`() {
        val state = SharedLocationsState()
            .receive(location(userId = "u2"), "me", t0)
            .receive(location(userId = "u3"), "me", t0)
        val mark = state.mark

        val reconciled = state.reconcile(listOf(location(userId = "u3")), mark, bounds = null, viewerId = "me", nowMillis = t0 + 1_000)

        assertThat(reconciled.byUser.keys).containsExactly("u3")
    }

    @Test
    fun `ce qui arrive pendant la demande de rattrapage reste`() {
        val before = SharedLocationsState()
        val mark = before.mark
        val during = before.receive(location(userId = "u2"), "me", t0)

        val reconciled = during.reconcile(emptyList(), mark, bounds = null, viewerId = "me", nowMillis = t0 + 1_000)

        assertThat(reconciled.byUser.keys).containsExactly("u2")
    }

    @Test
    fun `hors de l'emprise demandee, le rattrapage ne dit rien et rien ne bouge`() {
        val state = SharedLocationsState()
            .receive(location(userId = "u2", latitude = 48.85, longitude = 2.35), "me", t0)
            .receive(location(userId = "u3", latitude = 43.3, longitude = 5.37), "me", t0)

        val reconciled = state.reconcile(emptyList(), state.mark, bounds = paris, viewerId = "me", nowMillis = t0 + 1_000)

        assertThat(reconciled.byUser.keys).containsExactly("u3")
    }

    @Test
    fun `le rattrapage ajoute ce qu'il sert, a la precision servie`() {
        val reconciled = SharedLocationsState().reconcile(
            listOf(location(userId = "u4", precision = SharedLocationPrecision.NEIGHBORHOOD, radiusMeters = 1_200.0)),
            mark = 0,
            bounds = paris,
            viewerId = "me",
            nowMillis = t0,
        )

        assertThat(reconciled.byUser.getValue("u4").precision).isEqualTo(SharedLocationPrecision.NEIGHBORHOOD)
        assertThat(reconciled.byUser.getValue("u4").radiusMeters).isEqualTo(1_200.0)
    }

    @Test
    fun `une personne effacee puis revenue apres le repere n'est pas effacee par un rattrapage plus ancien`() {
        val start = SharedLocationsState().receive(location(userId = "u2"), "me", t0)
        val mark = start.mark
        val back = start.clear("u2").receive(location(userId = "u2", updatedAt = t0 + 1_000), "me", t0 + 1_000)

        val reconciled = back.reconcile(emptyList(), mark, bounds = null, viewerId = "me", nowMillis = t0 + 2_000)

        assertThat(reconciled.byUser.keys).containsExactly("u2")
    }
}
