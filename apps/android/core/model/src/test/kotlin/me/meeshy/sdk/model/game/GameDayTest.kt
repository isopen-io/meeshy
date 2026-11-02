package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.time.Instant
import me.meeshy.sdk.model.game.GameLawVectors.array
import me.meeshy.sdk.model.game.GameLawVectors.doubleValue
import me.meeshy.sdk.model.game.GameLawVectors.text
import org.junit.Test

class GameDayTest {

    private fun millis(iso: String): Long = Instant.parse(iso).toEpochMilli()

    @Test
    fun `la cle de jour se calcule dans le fuseau du compte, pas celui de l'appareil`() {
        val instant = millis("2026-10-05T23:30:00Z")
        assertThat(GameDay.dayKey(instant, "UTC")).isEqualTo("2026-10-05")
        assertThat(GameDay.dayKey(instant, "Europe/Paris")).isEqualTo("2026-10-06")
        assertThat(GameDay.dayKey(instant, "America/Los_Angeles")).isEqualTo("2026-10-05")
        assertThat(GameDay.dayKey(instant, "Pacific/Auckland")).isEqualTo("2026-10-06")
    }

    @Test
    fun `sans fuseau ou avec un fuseau inconnu le jour se decoupe en UTC`() {
        val instant = millis("2026-10-05T23:30:00Z")
        assertThat(GameDay.dayKey(instant, null)).isEqualTo("2026-10-05")
        assertThat(GameDay.dayKey(instant, "")).isEqualTo("2026-10-05")
        assertThat(GameDay.dayKey(instant, "Mars/Olympus")).isEqualTo("2026-10-05")
    }

    @Test
    fun `la minute du jour est locale au compte`() {
        assertThat(GameDay.minuteOfDay(millis("2026-10-05T23:30:00Z"), "Europe/Paris")).isEqualTo(90)
    }

    @Test
    fun `une cle n'est un jour que si c'est une vraie date du calendrier`() {
        assertThat(GameDay.isDayKey("2026-10-05")).isTrue()
        assertThat(GameDay.isDayKey("2024-02-29")).isTrue()
        assertThat(GameDay.isDayKey("2026-02-29")).isFalse()
        assertThat(GameDay.isDayKey("2026-13-01")).isFalse()
        assertThat(GameDay.isDayKey("0050-01-01")).isFalse()
        assertThat(GameDay.isDayKey("2026-1-5")).isFalse()
        assertThat(GameDay.number("nope")).isNull()
    }

    @Test
    fun `l'arithmetique de jours est calendaire`() {
        assertThat(GameDay.add(1, "2026-02-28")).isEqualTo("2026-03-01")
        assertThat(GameDay.add(-1, "2026-01-01")).isEqualTo("2025-12-31")
        assertThat(GameDay.diff("2026-10-02", "2026-10-05")).isEqualTo(3)
        assertThat(GameDay.diff("2026-10-05", "2026-10-02")).isEqualTo(-3)
        assertThat(GameDay.diff("x", "2026-10-02")).isNull()
        assertThat(GameDay.month("2026-10-05")).isEqualTo("2026-10")
    }

    @Test
    fun `FNV-1a est non signee sur les octets UTF-8`() {
        assertThat(GameSeed.fnv1a("")).isEqualTo(0x811c9dc5u)
        assertThat(GameSeed.fnv1a("a")).isEqualTo(0xe40c292cu)
        assertThat(GameSeed.fnv1a("é")).isNotEqualTo(GameSeed.fnv1a("e"))
        assertThat(GameSeed.fnv1a("foobar")).isEqualTo(0xbf9cf968u)
    }

    @Test
    fun `la graine et la suite rejouent les vecteurs partages`() {
        GameLawVectors.cases("rng").forEach { case ->
            val parts = GameSeedParts(case.str("userId"), case.str("dayKey"), case.str("salt"))
            assertWithMessage(case.label).that(GameSeed.seed(parts).toLong()).isEqualTo(case.expected["seed"].text().toLong())
            val rng = GameRandom(parts)
            case.expected["draws"].array().forEach { draw ->
                assertWithMessage(case.label).that(rng.next()).isEqualTo(draw.doubleValue())
            }
        }
    }

    @Test
    fun `pickIndex consomme un tirage meme sur une liste vide`() {
        val a = GameRandom(1u)
        val b = GameRandom(1u)
        a.pickIndex(0)
        b.next()
        assertThat(a.next()).isEqualTo(b.next())
    }
}
