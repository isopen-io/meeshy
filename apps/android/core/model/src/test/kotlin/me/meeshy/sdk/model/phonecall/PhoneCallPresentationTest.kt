package me.meeshy.sdk.model.phonecall

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

class PhoneCallPresentationTest {
    private val paris = ZoneId.of("Europe/Paris")
    private val minute = 60_000L

    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int): Long =
        LocalDateTime.of(y, mo, d, h, mi).atZone(paris).toInstant().toEpochMilli()

    private fun announcement(kind: PhoneCallAnnouncementKind = PhoneCallAnnouncementKind.STARTED, at: Long = 1L) =
        PhoneCallAnnouncement(kind, atMillis = at)

    @Test
    fun `en appel depuis quelques minutes se dit en minutes, jamais moins d'une`() {
        val since = at(2026, 11, 19, 14, 0)
        assertThat(PhoneCallPresentation.since(since, since + 12 * minute + 30_000L, paris, Locale.FRENCH))
            .isEqualTo(PhoneCallSince.Minutes(12))
        assertThat(PhoneCallPresentation.since(since, since + 20_000L, paris, Locale.FRENCH)).isEqualTo(PhoneCallSince.Minutes(1))
        assertThat(PhoneCallPresentation.since(since, since - 5 * minute, paris, Locale.FRENCH)).isEqualTo(PhoneCallSince.Minutes(1))
        assertThat(PhoneCallPresentation.since(since, since + 59 * minute, paris, Locale.FRENCH)).isEqualTo(PhoneCallSince.Minutes(59))
    }

    @Test
    fun `au-dela d'une heure, l'heure locale du lecteur`() {
        val since = at(2026, 11, 19, 14, 0)
        assertThat(PhoneCallPresentation.since(since, since + 60 * minute, paris, Locale.FRENCH)).isEqualTo(PhoneCallSince.Clock("14:00"))
        assertThat(PhoneCallPresentation.since(since, at(2026, 11, 20, 0, 30), paris, Locale.FRENCH))
            .isEqualTo(PhoneCallSince.Clock("jeudi 14:00"))
    }

    @Test
    fun `l'echeance d'affichage est l'expiration, et rien n'attend un etat expire`() {
        val state = PhoneCallState("a", sinceMillis = 0L, expiresAtMillis = 1_000L)
        assertThat(state.isLiveAt(999L)).isTrue()
        assertThat(state.isLiveAt(1_000L)).isFalse()
        assertThat(PhoneCallPresentation.visibleFor(state, 400L)).isEqualTo(600L)
        assertThat(PhoneCallPresentation.visibleFor(state, 1_000L)).isNull()
        assertThat(PhoneCallPresentation.visibleFor(null, 0L)).isNull()
    }

    @Test
    fun `le partage ne se regle qu'avec un Sang, et mon etat ne m'est jamais montre`() {
        assertThat(PhoneCallPersonRules.mayShare(RelationLevel.CLOSE)).isFalse()
        assertThat(PhoneCallPersonRules.mayShare(RelationLevel.BLOOD)).isTrue()
        assertThat(PhoneCallPersonRules.shows("me", "me")).isFalse()
        assertThat(PhoneCallPersonRules.shows("jacques", "me")).isTrue()
        assertThat(PhoneCallPersonRules.shows(null, "me")).isFalse()
        assertThat(PhoneCallPersonRules.shows(" ", "me")).isFalse()
    }

    @Test
    fun `une annonce defile puis quitte la pastille et ne revient jamais`() {
        val shown = PhoneCallPillAnnouncements().announce("a", announcement(at = 10L), "Jacques est en appel", 0L)
        assertThat(shown.entries().map { it.literalLabel }).containsExactly("Jacques est en appel")
        val gone = shown.expire(PhoneCallPillAnnouncements.VISIBLE_MS)
        assertThat(gone.entries()).isEmpty()
        assertThat(gone.announce("a", announcement(at = 10L), "x", 10_000L).entries()).isEmpty()
    }

    @Test
    fun `le raccroche remplace l'annonce de la meme personne, une pastille par personne`() {
        val first = PhoneCallPillAnnouncements()
            .announce("a", announcement(at = 1L), "en appel", 0L)
            .announce("b", announcement(at = 1L), "b en appel", 0L)
        val second = first.announce("a", announcement(PhoneCallAnnouncementKind.ENDED, at = 2L), "a raccroché", 100L)
        assertThat(second.entries().map { it.literalLabel }).containsExactly("b en appel", "a raccroché").inOrder()
        assertThat(second.items.count { it.userId == "a" }).isEqualTo(1)
    }

    @Test
    fun `une annonce n'est jamais lue comme en cours ni persistante, avec son glyphe`() {
        val entries = PhoneCallPillAnnouncements().announce("a", announcement(), "x", 0L).entries()
        assertThat(entries.single().kind).isEqualTo(SyncPillEntryKind.ANNOUNCEMENT)
        val row = SyncPillPresenter.rows(ConnectionPill.HIDDEN, entries).single()
        assertThat(row.glyph).isEqualTo(SyncPillGlyph.PHONE_CALL)
        assertThat(row.showsActivityDots).isFalse()
        assertThat(row.tapOutcome).isEqualTo(SyncPillTapOutcome.Advance)
        assertThat(SyncPillPresenter.isPersistent(listOf(row))).isFalse()
    }

    @Test
    fun `l'identifiant d'une annonce distingue la personne, le genre et l'instant`() {
        assertThat(PhoneCallPillAnnouncements.idOf("a", announcement(at = 5L))).isEqualTo("phone-call:a:started:5")
        assertThat(PhoneCallPillAnnouncements.idOf("a", announcement(PhoneCallAnnouncementKind.ENDED, at = 5L)))
            .isEqualTo("phone-call:a:ended:5")
    }
}
