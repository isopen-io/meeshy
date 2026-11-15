package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PresenceLabelsTest {

    @Test
    fun `moins de 60 secondes se lit en ligne`() {
        assertThat(PresenceLabels.lastSeen(59L)).isEqualTo(PresenceLastSeen.Online)
    }

    @Test
    fun `60 secondes donnent une minute`() {
        assertThat(PresenceLabels.lastSeen(60L)).isEqualTo(PresenceLastSeen.MinutesAgo(1))
    }

    @Test
    fun `59 minutes restent en minutes`() {
        assertThat(PresenceLabels.lastSeen(59L * 60L + 59L)).isEqualTo(PresenceLastSeen.MinutesAgo(59))
    }

    @Test
    fun `une heure bascule en heures jusqu'a 23 h`() {
        assertThat(PresenceLabels.lastSeen(3_600L)).isEqualTo(PresenceLastSeen.HoursAgo(1))
        assertThat(PresenceLabels.lastSeen(23L * 3_600L + 59L)).isEqualTo(PresenceLastSeen.HoursAgo(23))
    }

    @Test
    fun `un jour et au-dela se lit en jours`() {
        assertThat(PresenceLabels.lastSeen(86_400L)).isEqualTo(PresenceLastSeen.DaysAgo(1))
        assertThat(PresenceLabels.lastSeen(3L * 86_400L + 5L)).isEqualTo(PresenceLastSeen.DaysAgo(3))
    }

    @Test
    fun `l'horloge est comptee depuis la derniere activite en millisecondes`() {
        assertThat(PresenceLabels.lastSeen(lastSeenAtEpochMillis = 0L, nowEpochMillis = 3L * 86_400_000L))
            .isEqualTo(PresenceLastSeen.DaysAgo(3))
    }

    @Test
    fun `chaque etat a son libelle et ici le sien`() {
        assertThat(PresenceState.entries.map(PresenceLabels::label)).containsExactly(
            PresenceLabel.ONLINE, PresenceLabel.AWAY, PresenceLabel.IDLE, PresenceLabel.OFFLINE,
        ).inOrder()
    }
}
