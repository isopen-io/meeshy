package me.meeshy.sdk.model.location

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Test

/** L'heure de la DERNIÈRE position connue d'une fiche (#20242, iso `ProfileWhereHeroTests.swift`). */
class ProfileWhereStampTest {
    private val zone = ZoneId.of("Europe/Paris")
    private val now = ZonedDateTime.of(2026, 11, 21, 15, 30, 0, 0, zone).toInstant().toEpochMilli()
    private val minute = 60_000L

    @Test
    fun `moins d'une minute se dit a l'instant`() {
        assertThat(ProfileWhereStamp.of(now - 59_000L, now, zone)).isEqualTo(ProfileWhereStamp.JustNow)
        assertThat(ProfileWhereStamp.of(now, now, zone)).isEqualTo(ProfileWhereStamp.JustNow)
    }

    @Test
    fun `une horloge en avance se lit a l'instant`() {
        assertThat(ProfileWhereStamp.of(now + 5 * minute, now, zone)).isEqualTo(ProfileWhereStamp.JustNow)
    }

    @Test
    fun `moins d'une heure se dit en minutes entieres`() {
        assertThat(ProfileWhereStamp.of(now - 60_000L, now, zone)).isEqualTo(ProfileWhereStamp.MinutesAgo(1))
        assertThat(ProfileWhereStamp.of(now - 7 * minute - 30_000L, now, zone)).isEqualTo(ProfileWhereStamp.MinutesAgo(7))
        assertThat(ProfileWhereStamp.of(now - 59 * minute - 59_000L, now, zone)).isEqualTo(ProfileWhereStamp.MinutesAgo(59))
    }

    @Test
    fun `au dela d'une heure se dit a l'heure, avec la date si c'est un autre jour`() {
        val sameDay = now - 2 * 60 * minute
        assertThat(ProfileWhereStamp.of(sameDay, now, zone)).isEqualTo(ProfileWhereStamp.At(sameDay, sameDay = true))
        val yesterday = now - 20 * 60 * minute
        assertThat(ProfileWhereStamp.of(yesterday, now, zone)).isEqualTo(ProfileWhereStamp.At(yesterday, sameDay = false))
    }

    @Test
    fun `un instant inconnu ne se dit pas`() {
        assertThat(ProfileWhereStamp.of(0L, now, zone)).isNull()
        assertThat(ProfileWhereStamp.of(-1L, now, zone)).isNull()
    }

    @Test
    fun `ma propre position se montre seulement quand elle part, hors fantome, et qu'elle est connue`() {
        val fix = GeoPoint(48.85, 2.35)
        assertThat(ProfileOwnPositionPreview.resolve(recipients = 1, isGhost = false, fix = fix, atMillis = now))
            .isEqualTo(ProfileOwnPositionPreview.Map(fix, now))
        assertThat(ProfileOwnPositionPreview.resolve(recipients = 0, isGhost = false, fix = fix, atMillis = now))
            .isEqualTo(ProfileOwnPositionPreview.Note)
        assertThat(ProfileOwnPositionPreview.resolve(recipients = 2, isGhost = true, fix = fix, atMillis = now))
            .isEqualTo(ProfileOwnPositionPreview.Note)
        assertThat(ProfileOwnPositionPreview.resolve(recipients = 2, isGhost = false, fix = null, atMillis = null))
            .isEqualTo(ProfileOwnPositionPreview.Note)
    }

    @Test
    fun `ma position se releve en silence quand le cache manque ou a plus de dix minutes`() {
        assertThat(ProfileOwnPositionPreview.needsSilentFix(sharing = true, authorized = true, knownAtMillis = null, nowMillis = now)).isTrue()
        assertThat(ProfileOwnPositionPreview.needsSilentFix(true, true, now - 11 * minute, now)).isTrue()
        assertThat(ProfileOwnPositionPreview.needsSilentFix(true, true, now - 9 * minute, now)).isFalse()
        assertThat(ProfileOwnPositionPreview.needsSilentFix(false, true, null, now)).isFalse()
        assertThat(ProfileOwnPositionPreview.needsSilentFix(true, false, null, now)).isFalse()
    }
}
