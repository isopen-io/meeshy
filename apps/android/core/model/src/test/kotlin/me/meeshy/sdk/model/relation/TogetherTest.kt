package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.Test

/**
 * « Regarder ou écouter ensemble » lu par Android (#17100) — le contrat `packages/shared/types/together.ts`, la loi de
 * synchronisation (iso `together-sync.ts` / `TogetherSync.swift`) et l'état de l'appareil (iso `TogetherState.swift`),
 * avec les MÊMES cas que les témoins web et iOS.
 */
class TogetherTest {
    private val me = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val proche = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private val sessionId = "0123456789abcdef0123456789abcdef"
    private val t0 = 999_000L

    private fun el(raw: String): JsonElement = Json.parseToJsonElement(raw)

    private fun playbackWire(playing: Boolean = true, positionMs: String = "10000", at: Long = 1_000_000, rev: Int = 1) =
        """{"playing":$playing,"positionMs":$positionMs,"at":$at,"rev":$rev,"byUserId":"$proche"}"""

    private fun playback(playing: Boolean = true, positionMs: Double = 10_000.0, at: Double = 1_000_000.0, rev: Int = 1) =
        TogetherPlayback(playing = playing, positionMs = positionMs, at = at, rev = rev, byUserId = proche)

    private fun invitedWire(from: String = proche, media: String = "video", session: String = sessionId) =
        """{"sessionId":"$session","fromUserId":"$from","conversationId":"c1","attachmentId":"a1","media":"$media","expiresAt":"x"}"""

    private fun invited(from: String = proche, session: String = sessionId) =
        TogetherInvited(session, from, "c1", "a1", TogetherMediaKind.VIDEO, "x")

    private fun started(host: String = proche, guest: String = me, rev: Int = 1, at: Double = 1_000_000.0) =
        TogetherStarted(sessionId, host, guest, "c1", "a1", TogetherMediaKind.VIDEO, playback(rev = rev, at = at))

    // Le contrat

    @Test
    fun `une invitation servie se decode, un genre inconnu ou un champ vide la rend illisible`() {
        assertThat(TogetherInvited.read(el(invitedWire()))).isEqualTo(invited())
        assertThat(TogetherInvited.read(el(invitedWire(media = "image")))).isNull()
        assertThat(TogetherInvited.read(el(invitedWire(from = "")))).isNull()
        assertThat(TogetherInvited.read(el("""{"sessionId":"$sessionId"}"""))).isNull()
    }

    @Test
    fun `une seance ouverte se decode avec son etat de lecture`() {
        val wire = """{"sessionId":"$sessionId","hostUserId":"$proche","guestUserId":"$me","conversationId":"c1",""" +
            """"attachmentId":"a1","media":"video","playback":${playbackWire()}}"""
        assertThat(TogetherStarted.read(el(wire))).isEqualTo(started())
    }

    @Test
    fun `une lecture aux nombres absurdes est illisible`() {
        assertThat(TogetherSynced.read(el("""{"sessionId":"$sessionId","playback":${playbackWire(positionMs = "-1")}}"""))).isNull()
        assertThat(TogetherSynced.read(el("""{"sessionId":"$sessionId","playback":{"playing":true}}"""))).isNull()
        assertThat(TogetherSynced.read(el("""{"sessionId":"$sessionId","playback":${playbackWire(positionMs = "\"10\"")}}"""))).isNull()
        assertThat(TogetherSynced.read(el("""{"sessionId":"$sessionId","playback":${playbackWire()}}""")))
            .isEqualTo(TogetherSynced(sessionId, playback()))
    }

    @Test
    fun `une fin au motif inconnu est illisible, comme sur le web`() {
        assertThat(TogetherEnded.read(el("""{"sessionId":"$sessionId","reason":"left","endedAt":"x"}"""))?.reason)
            .isEqualTo(TogetherEndReason.LEFT)
        assertThat(TogetherEnded.read(el("""{"sessionId":"$sessionId","reason":"cut","endedAt":"x"}"""))).isNull()
    }

    @Test
    fun `l'autre de la seance est l'invite quand je suis l'hote, l'hote sinon, personne si je n'en suis pas`() {
        assertThat(started(host = me, guest = proche).partner(me)).isEqualTo(proche)
        assertThat(started().partner(me)).isEqualTo(proche)
        assertThat(started().partner("999999999999999999999999")).isNull()
    }

    @Test
    fun `une invitation acceptee rend sa seance, et chaque refus son issue`() {
        fun outcome(raw: String?) = TogetherInviteOutcome.read(raw?.let(::el))
        assertThat(outcome("""{"success":true,"data":{"sessionId":"$sessionId","media":"video","expiresAt":"x"}}"""))
            .isEqualTo(TogetherInviteOutcome.Invited(sessionId, TogetherMediaKind.VIDEO))
        assertThat(outcome("""{"success":true,"data":{"sessionId":"$sessionId","media":"image"}}""")).isEqualTo(TogetherInviteOutcome.Failed)
        assertThat(outcome("""{"success":false,"error":"x","code":"TOGETHER_NOT_ALLOWED"}""")).isEqualTo(TogetherInviteOutcome.NotAllowed)
        assertThat(outcome("""{"success":false,"error":"x","code":"TOGETHER_RATE_LIMITED"}""")).isEqualTo(TogetherInviteOutcome.RateLimited)
        assertThat(outcome("""{"success":false,"error":"x","code":"TOGETHER_UNAVAILABLE"}""")).isEqualTo(TogetherInviteOutcome.Failed)
        assertThat(outcome("\"NO ACK\"")).isEqualTo(TogetherInviteOutcome.Offline)
        assertThat(outcome(null)).isEqualTo(TogetherInviteOutcome.Offline)
    }

    @Test
    fun `rejoindre une seance finie ou refusee dit seulement qu'elle n'est plus valable`() {
        fun outcome(raw: String?) = TogetherJoinOutcome.read(raw?.let(::el))
        assertThat(outcome("""{"success":false,"code":"TOGETHER_NOT_FOUND"}""")).isEqualTo(TogetherJoinOutcome.Gone)
        assertThat(outcome("""{"success":false,"code":"TOGETHER_NOT_ALLOWED"}""")).isEqualTo(TogetherJoinOutcome.Gone)
        assertThat(outcome("""{"success":false,"code":"TOGETHER_UNAVAILABLE"}""")).isEqualTo(TogetherJoinOutcome.Failed)
        assertThat(outcome(null)).isEqualTo(TogetherJoinOutcome.Offline)
        val data = """{"sessionId":"$sessionId","hostUserId":"$proche","guestUserId":"$me","conversationId":"c1",""" +
            """"attachmentId":"a1","media":"video","playback":${playbackWire()}}"""
        assertThat(outcome("""{"success":true,"data":$data}""")).isEqualTo(TogetherJoinOutcome.Joined(started()))
        assertThat(outcome("""{"success":true}""")).isEqualTo(TogetherJoinOutcome.Failed)
    }

    @Test
    fun `les evenements du contrat ont leurs noms de fil`() {
        assertThat(TogetherEvents.INVITE).isEqualTo("together:invite")
        assertThat(TogetherEvents.JOIN).isEqualTo("together:join")
        assertThat(TogetherEvents.SYNC).isEqualTo("together:sync")
        assertThat(TogetherEvents.LEAVE).isEqualTo("together:leave")
        assertThat(TogetherEvents.INVITED).isEqualTo("together:invited")
        assertThat(TogetherEvents.STARTED).isEqualTo("together:started")
        assertThat(TogetherEvents.SYNCED).isEqualTo("together:synced")
        assertThat(TogetherEvents.ENDED).isEqualTo("together:ended")
    }

    // La loi de synchronisation

    @Test
    fun `en lecture la position avance avec l'horloge du serveur, en pause elle reste, et ne recule jamais`() {
        assertThat(TogetherSync.servedPositionMs(playback(), serverNowMs = 1_002_500.0)).isEqualTo(12_500.0)
        assertThat(TogetherSync.servedPositionMs(playback(playing = false), serverNowMs = 1_090_000.0)).isEqualTo(10_000.0)
        assertThat(TogetherSync.servedPositionMs(playback(), serverNowMs = 999_000.0)).isEqualTo(10_000.0)
    }

    @Test
    fun `l'ecart d'horloge garde le plus grand echantillon`() {
        assertThat(TogetherSync.estimateClockOffset(current = null, serverAt = 5_000.0, localAt = 4_000.0)).isEqualTo(1_000.0)
        assertThat(TogetherSync.estimateClockOffset(current = 1_000.0, serverAt = 5_000.0, localAt = 4_500.0)).isEqualTo(1_000.0)
        assertThat(TogetherSync.estimateClockOffset(current = 500.0, serverAt = 5_000.0, localAt = 4_200.0)).isEqualTo(800.0)
    }

    @Test
    fun `la derive se rattrape par la vitesse, puis par un saut, et en pause par un saut seulement`() {
        assertThat(TogetherSync.correction(localMs = 10_100.0, targetMs = 10_000.0, playing = true)).isEqualTo(TogetherCorrection.None)
        assertThat(TogetherSync.correction(localMs = 9_600.0, targetMs = 10_000.0, playing = true)).isEqualTo(TogetherCorrection.Rate(1.05))
        assertThat(TogetherSync.correction(localMs = 10_400.0, targetMs = 10_000.0, playing = true)).isEqualTo(TogetherCorrection.Rate(0.95))
        assertThat(TogetherSync.correction(localMs = 2_000.0, targetMs = 10_000.0, playing = true)).isEqualTo(TogetherCorrection.Seek(10_000.0))
        assertThat(TogetherSync.correction(localMs = 10_400.0, targetMs = 10_000.0, playing = false)).isEqualTo(TogetherCorrection.Seek(10_000.0))
        assertThat(TogetherSync.correction(localMs = 10_050.0, targetMs = 10_000.0, playing = false)).isEqualTo(TogetherCorrection.None)
    }

    @Test
    fun `seul un geste qui change l'etat partage part chez l'autre`() {
        fun effect(gesture: TogetherGesture, localMs: Double, targetMs: Double, sharedPlaying: Boolean) =
            TogetherSync.effect(gesture, localMs = localMs, targetMs = targetMs, sharedPlaying = sharedPlaying)
        assertThat(effect(TogetherGesture.PAUSE, 10_000.0, 10_000.0, true)).isEqualTo(TogetherGestureEffect.SEND)
        assertThat(effect(TogetherGesture.PLAY, 10_000.0, 10_000.0, false)).isEqualTo(TogetherGestureEffect.SEND)
        assertThat(effect(TogetherGesture.SEEK, 40_000.0, 10_000.0, true)).isEqualTo(TogetherGestureEffect.SEND)
        assertThat(effect(TogetherGesture.PLAY, 0.0, 30_000.0, true)).isEqualTo(TogetherGestureEffect.ALIGN)
        assertThat(effect(TogetherGesture.PAUSE, 10_000.0, 10_000.0, false)).isEqualTo(TogetherGestureEffect.ALIGN)
        assertThat(effect(TogetherGesture.SEEK, 10_400.0, 10_000.0, true)).isEqualTo(TogetherGestureEffect.ALIGN)
    }

    // L'état de l'appareil

    @Test
    fun `ma propre invitation, partie d'un autre de mes appareils, ne se presente jamais`() {
        assertThat(TogetherState().invited(invited(from = me), viewerId = me, nowMs = t0).invitation).isNull()
    }

    @Test
    fun `une invitation se retire quand la seance ouvre, et l'ecart d'horloge se mesure`() {
        val state = TogetherState()
            .invited(invited(), viewerId = me, nowMs = t0)
            .started(started(at = 1_000_500.0), viewerId = me, nowMs = t0)
        assertThat(state.invitation).isNull()
        assertThat(state.session?.partnerId).isEqualTo(proche)
        assertThat(state.clockOffsetMs).isEqualTo(1_000_500.0 - 999_000.0)
    }

    @Test
    fun `une seance ou je ne suis pas ne s'ouvre pas`() {
        assertThat(TogetherState().started(started(host = "x", guest = "y"), viewerId = me, nowMs = t0).session).isNull()
        assertThat(TogetherState().started(started(), viewerId = null, nowMs = t0).session).isNull()
    }

    @Test
    fun `un rev deja applique ne rejoue rien`() {
        val open = TogetherState().started(started(rev = 3), viewerId = me, nowMs = t0)
        val stale = open.synced(TogetherSynced(sessionId, playback(playing = false, rev = 3)), nowMs = t0)
        assertThat(stale.session?.playback?.playing).isTrue()
        val fresh = open.synced(TogetherSynced(sessionId, playback(playing = false, rev = 4)), nowMs = t0)
        assertThat(fresh.session?.playback?.playing).isFalse()
    }

    @Test
    fun `une seance close ne se rouvre pas sur un evenement en retard`() {
        val closed = TogetherState().started(started(), viewerId = me, nowMs = t0).ended(sessionId)
        assertThat(closed.session).isNull()
        assertThat(closed.started(started(), viewerId = me, nowMs = t0).session).isNull()
        assertThat(closed.invited(invited(), viewerId = me, nowMs = t0).invitation).isNull()
        assertThat(closed.waiting(TogetherOutgoing(sessionId, proche, TogetherMediaKind.AUDIO)).outgoing).isNull()
    }

    @Test
    fun `l'attente se ferme quand la seance ouvre chez l'hote`() {
        val state = TogetherState()
            .waiting(TogetherOutgoing(sessionId, proche, TogetherMediaKind.VIDEO))
            .started(started(host = me, guest = proche), viewerId = me, nowMs = t0)
        assertThat(state.outgoing).isNull()
        assertThat(state.session?.partnerId).isEqualTo(proche)
    }

    @Test
    fun `une invitation sans reponse s'eteint deux minutes apres sa reception`() {
        val state = TogetherState().invited(invited(), viewerId = me, nowMs = t0)
        assertThat(state.expiringInvitation(nowMs = t0 + 119_000).invitation).isNotNull()
        val expired = state.expiringInvitation(nowMs = t0 + 121_000)
        assertThat(expired.invitation).isNull()
        assertThat(expired.invited(invited(), viewerId = me, nowMs = t0).invitation).isNull()
    }

    @Test
    fun `la memoire des seances closes est bornee`() {
        val ids = (0..TogetherState.CLOSED_MEMORY).map { it.toString().padStart(32, '0') }
        val state = ids.fold(TogetherState()) { acc, id -> acc.ended(id) }
        assertThat(state.invited(invited(session = ids[0]), viewerId = me, nowMs = t0).invitation).isNotNull()
        assertThat(state.invited(invited(session = ids[1]), viewerId = me, nowMs = t0).invitation).isNull()
    }
}
