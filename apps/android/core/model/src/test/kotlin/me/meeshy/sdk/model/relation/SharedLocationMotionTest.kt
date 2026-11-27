package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le mouvement d'une personne qui me montre sa position (#19887, #20665) — iso `SharedLocationMotion.swift` et
 * `LocationMotionGlyph.swift`. La passerelle ne le sert qu'au lecteur à la précision exacte : le client ne fait que le
 * lire, le vieillir et le dire, jamais le fabriquer.
 */
class SharedLocationMotionTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val t0 = Instant.parse("2026-11-13T18:00:00Z").toEpochMilli()

    private fun decode(motion: String?): SharedLocation? {
        val key = motion?.let { ""","motion":"$it"""" } ?: ""
        return json.decodeFromString(
            SharedLocationChangedWire.serializer(),
            """{"userId":"u2","latitude":48.85,"longitude":2.35,"precision":"exact","radiusMeters":10,"updatedAt":"2026-11-13T18:00:00Z","expiresAt":"2026-11-13T19:00:00Z"$key}""",
        ).served()
    }

    @Test
    fun `chaque mouvement du contrat se lit, et la position reste lue sans lui`() {
        assertThat(SharedLocationMotion.entries.map { it.wire })
            .containsExactly("stationary", "walking", "running", "cycling", "automotive").inOrder()
        SharedLocationMotion.entries.forEach { assertThat(decode(it.wire)?.motion).isEqualTo(it) }
        assertThat(decode(null)).isNotNull()
        assertThat(decode(null)?.motion).isNull()
    }

    @Test
    fun `un mouvement inconnu se lit absent sans faire tomber la position`() {
        val decoded = decode("teleporting")

        assertThat(decoded).isNotNull()
        assertThat(decoded?.motion).isNull()
    }

    @Test
    fun `un mouvement se montre moins de cinq minutes apres sa position, plus ensuite`() {
        val walking = SharedLocationMotion.WALKING

        assertThat(SharedLocationMotion.shown(walking, updatedAtMillis = t0, nowMillis = t0 + 299_999L)).isEqualTo(walking)
        assertThat(SharedLocationMotion.shown(walking, updatedAtMillis = t0, nowMillis = t0 + 300_000L)).isNull()
        assertThat(SharedLocationMotion.shown(null, updatedAtMillis = t0, nowMillis = t0)).isNull()
    }

    @Test
    fun `immobile ne se dessine pas, tout autre mouvement frais se dessine`() {
        assertThat(SharedLocationMotion.drawn(SharedLocationMotion.STATIONARY)).isNull()
        assertThat(SharedLocationMotion.drawn(null)).isNull()
        listOf(SharedLocationMotion.WALKING, SharedLocationMotion.RUNNING, SharedLocationMotion.CYCLING, SharedLocationMotion.AUTOMOTIVE)
            .forEach { assertThat(SharedLocationMotion.drawn(it)).isEqualTo(it) }
    }

    @Test
    fun `le mouvement servi traverse le magasin jusqu'a l'epingle, et vieillit avec elle`() {
        val served = requireNotNull(decode("automotive"))
        val state = SharedLocationsState().receive(served, viewerId = "me", nowMillis = t0)
        val pin = SharedLocationsMap.pins(state.byUser, people = emptyMap()).single()

        assertThat(pin.motion).isEqualTo(SharedLocationMotion.AUTOMOTIVE)
        assertThat(pin.drawnMotion(nowMillis = t0 + 60_000L)).isEqualTo(SharedLocationMotion.AUTOMOTIVE)
        assertThat(pin.drawnMotion(nowMillis = t0 + 300_000L)).isNull()
    }

    @Test
    fun `une position suivante sans mouvement efface le mouvement garde`() {
        val first = requireNotNull(decode("running"))
        val next = first.copy(updatedAtMillis = t0 + 10_000L, motion = null)
        val state = SharedLocationsState().receive(first, "me", t0).receive(next, "me", t0 + 10_000L)

        assertThat(state.byUser.getValue("u2").motion).isNull()
    }
}
