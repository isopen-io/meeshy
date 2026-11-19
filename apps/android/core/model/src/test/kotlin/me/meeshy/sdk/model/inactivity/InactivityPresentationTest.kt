package me.meeshy.sdk.model.inactivity

import com.google.common.truth.Truth.assertThat
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.connection.ConnectionPill
import me.meeshy.sdk.model.connection.SyncPillEntryKind
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.syncpill.SyncPillGlyph
import me.meeshy.sdk.model.syncpill.SyncPillPresenter
import me.meeshy.sdk.model.syncpill.SyncPillTapOutcome
import org.junit.Test

class InactivityPresentationTest {
    private val paris = ZoneId.of("Europe/Paris")

    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int): Long =
        LocalDateTime.of(y, mo, d, h, mi).atZone(paris).toInstant().toEpochMilli()

    private fun announcement(kind: InactivityAnnouncementKind = InactivityAnnouncementKind.ALERT, at: Long = 1L) =
        InactivityAnnouncement(kind, inactiveSinceMillis = 0L, atMillis = at)

    @Test
    fun `aucune activite depuis l'heure locale du lecteur, le jour s'il n'est pas d'aujourd'hui`() {
        val since = at(2026, 11, 18, 8, 0)
        assertThat(InactivityPresentation.sinceText(since, at(2026, 11, 18, 20, 30), paris, Locale.FRENCH)).isEqualTo("08:00")
        assertThat(InactivityPresentation.sinceText(since, at(2026, 11, 19, 1, 0), paris, Locale.FRENCH)).isEqualTo("mercredi 08:00")
    }

    @Test
    fun `la batterie se dit en pourcentage borne`() {
        assertThat(InactivityPresentation.batteryPercent(InactivityLastBattery(9, 0L))).isEqualTo(9)
        assertThat(InactivityPresentation.batteryPercent(InactivityLastBattery(140, 0L))).isEqualTo(100)
        assertThat(InactivityPresentation.batteryPercent(InactivityLastBattery(-3, 0L))).isEqualTo(0)
    }

    @Test
    fun `la derniere position ouvre la carte sur ses coordonnees`() {
        assertThat(InactivityPresentation.mapUri(InactivityLastPosition(48.85, 2.35, null, 0L)))
            .isEqualTo("geo:48.85,2.35?q=48.85,2.35")
    }

    @Test
    fun `le partage ne se regle qu'avec un Sang, et mon etat ne m'est jamais montre`() {
        assertThat(InactivityPersonRules.mayShare(RelationLevel.CLOSE)).isFalse()
        assertThat(InactivityPersonRules.mayShare(RelationLevel.BLOOD)).isTrue()
        assertThat(InactivityPersonRules.shows("me", "me")).isFalse()
        assertThat(InactivityPersonRules.shows("jacques", "me")).isTrue()
        assertThat(InactivityPersonRules.shows(null, "me")).isFalse()
        assertThat(InactivityPersonRules.shows(" ", "me")).isFalse()
    }

    @Test
    fun `une annonce defile puis quitte la pastille et ne revient jamais`() {
        val shown = InactivityPillAnnouncements().announce("a", announcement(at = 10L), "Jacques n'a pas répondu", 0L)
        assertThat(shown.entries().map { it.literalLabel }).containsExactly("Jacques n'a pas répondu")
        val gone = shown.expire(InactivityPillAnnouncements.VISIBLE_MS)
        assertThat(gone.entries()).isEmpty()
        assertThat(gone.announce("a", announcement(at = 10L), "x", 10_000L).entries()).isEmpty()
    }

    @Test
    fun `le retour remplace l'alerte de la meme personne`() {
        val first = InactivityPillAnnouncements().announce("a", announcement(at = 1L), "alerte", 0L)
        val second = first.announce("a", announcement(InactivityAnnouncementKind.RESPONDED, at = 2L), "va bien", 100L)
        assertThat(second.entries().map { it.literalLabel }).containsExactly("va bien")
        assertThat(second.nextExpiryMs()).isEqualTo(100L + InactivityPillAnnouncements.VISIBLE_MS)
    }

    @Test
    fun `une annonce n'est jamais lue comme en cours ni persistante, avec son glyphe`() {
        val entries = InactivityPillAnnouncements().announce("a", announcement(), "x", 0L).entries()
        assertThat(entries.single().kind).isEqualTo(SyncPillEntryKind.ANNOUNCEMENT)
        val rows = SyncPillPresenter.rows(ConnectionPill.HIDDEN, entries)
        val row = rows.single()
        assertThat(row.glyph).isEqualTo(SyncPillGlyph.INACTIVITY)
        assertThat(row.showsActivityDots).isFalse()
        assertThat(row.tapOutcome).isEqualTo(SyncPillTapOutcome.Advance)
        assertThat(SyncPillPresenter.isPersistent(rows)).isFalse()
    }

    @Test
    fun `l'identifiant d'une annonce distingue la personne, le genre et l'instant`() {
        assertThat(InactivityPillAnnouncements.idOf("a", announcement(at = 5L))).isEqualTo("inactivity:a:alert:5")
        assertThat(InactivityPillAnnouncements.idOf("a", announcement(InactivityAnnouncementKind.RESPONDED, at = 5L)))
            .isEqualTo("inactivity:a:responded:5")
    }
}
