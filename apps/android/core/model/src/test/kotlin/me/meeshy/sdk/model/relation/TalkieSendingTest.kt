package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.socket.SocketAck
import me.meeshy.sdk.model.socket.SocketAckParsing
import me.meeshy.sdk.model.socket.SocketAckPayloadSource
import org.junit.Test

/** Émettre le talkie depuis Android (#17150) : les briques pures, iso `TalkieSending.swift`. */
class TalkieSendingTest {

    private fun ack(raw: String): SocketAck<JsonObject> = SocketAckParsing.parse(raw, SocketAckPayloadSource.DATA)

    // L'accusé de talkie:start

    @Test
    fun `un accuse accepte ouvre la prise de parole avec ses bornes et son mode`() {
        val verdict = TalkieStartVerdict.read(
            ack("""{"success":true,"data":{"talkieId":"t1","maxDurationMs":20000,"maxChunkBytes":8000,"delivery":"waking"}}"""),
        )
        assertThat(verdict).isEqualTo(
            TalkieStartVerdict.Opened(TalkieOpened("t1", 20_000, 8_000, TalkieDelivery.WAKING)),
        )
    }

    @Test
    fun `une borne absurde est ramenee au contrat et un mode absent vaut le direct`() {
        val verdict = TalkieStartVerdict.read(
            ack("""{"success":true,"data":{"talkieId":"t1","maxDurationMs":-5,"maxChunkBytes":999999}}"""),
        ) as TalkieStartVerdict.Opened
        assertThat(verdict.opened.maxDurationMs).isEqualTo(TalkieContract.MAX_DURATION_MS)
        assertThat(verdict.opened.maxChunkBytes).isEqualTo(TalkieContract.MAX_CHUNK_BYTES)
        assertThat(verdict.opened.delivery).isEqualTo(TalkieDelivery.LIVE)
    }

    @Test
    fun `un accuse sans identifiant est un echec et une echeance vaut hors ligne`() {
        assertThat(TalkieStartVerdict.read(ack("""{"success":true,"data":{}}""")))
            .isEqualTo(TalkieStartVerdict.Refused(TalkieSendOutcome.FAILED))
        assertThat(TalkieStartVerdict.read(SocketAck.Timeout)).isEqualTo(TalkieStartVerdict.Refused(TalkieSendOutcome.OFFLINE))
    }

    @Test
    fun `un blocage et un repli rendent la meme information, et le repli peut nommer sa conversation`() {
        assertThat(TalkieStartVerdict.read(ack("""{"success":false,"error":"x","code":"TALKIE_BLOCKED"}""")))
            .isEqualTo(TalkieStartVerdict.Refused(TalkieSendOutcome.VOICE))
        val id = "a".repeat(24)
        assertThat(TalkieStartVerdict.read(ack("""{"success":false,"error":"x","code":"TALKIE_FALLBACK_VOICE","conversationId":"$id"}""")))
            .isEqualTo(TalkieStartVerdict.VoiceInto(id))
        assertThat(TalkieStartVerdict.read(ack("""{"success":false,"error":"x","code":"TALKIE_FALLBACK_VOICE","conversationId":"nope"}""")))
            .isEqualTo(TalkieStartVerdict.Refused(TalkieSendOutcome.VOICE))
    }

    @Test
    fun `chaque code connu a son issue et un code inconnu vaut un echec`() {
        assertThat(TalkieSendOutcome.ofRefusal("TALKIE_NOT_ALLOWED")).isEqualTo(TalkieSendOutcome.NOT_ALLOWED)
        assertThat(TalkieSendOutcome.ofRefusal("TALKIE_E2EE_CONVERSATION")).isEqualTo(TalkieSendOutcome.E2EE)
        assertThat(TalkieSendOutcome.ofRefusal("TALKIE_RATE_LIMITED")).isEqualTo(TalkieSendOutcome.RATE_LIMITED)
        assertThat(TalkieSendOutcome.ofRefusal("TALKIE_FUTURE")).isEqualTo(TalkieSendOutcome.FAILED)
        assertThat(TalkieSendOutcome.ofRefusal(null)).isEqualTo(TalkieSendOutcome.FAILED)
        assertThat(TalkieSendOutcome.entries.filter { it.isInformation }).containsExactly(TalkieSendOutcome.VOICE)
    }

    // L'en-tête ADTS

    @Test
    fun `une trame ecrite se relit avec son format et sa charge`() {
        val written = TalkieAdts.frame(byteArrayOf(1, 2, 3), sampleRate = 48_000, channels = 1)!!
        assertThat(written.size).isEqualTo(10)
        val read = TalkieAdts.frames(written + TalkieAdts.frame(byteArrayOf(4), 48_000, 1)!!)
        assertThat(read.map { it.payload.toList() }).containsExactly(listOf<Byte>(1, 2, 3), listOf<Byte>(4)).inOrder()
        assertThat(read.first().format).isEqualTo(AdtsFormat(audioObjectType = 2, sampleRateIndex = 3, channels = 1))
    }

    @Test
    fun `une trame vide, une frequence hors table ou trop longue ne s'ecrit pas`() {
        assertThat(TalkieAdts.frame(ByteArray(0), 48_000, 1)).isNull()
        assertThat(TalkieAdts.frame(byteArrayOf(1), 47_000, 1)).isNull()
        assertThat(TalkieAdts.frame(byteArrayOf(1), 48_000, 0)).isNull()
        assertThat(TalkieAdts.frame(ByteArray(0x1FFF), 48_000, 1)).isNull()
    }

    // Fragments et plafonds

    @Test
    fun `un fragment part des qu'il atteint sa duree, et le reste au vidage`() {
        val fragmenter = TalkieFragmenter(fragmentDurationMs = 100.0)
        val first = (0 until 4).flatMap { fragmenter.append(ByteArray(10), 30.0, atMs = 1_000L + it) }
        assertThat(first.map { it.data.size }).containsExactly(40)
        assertThat(first.single().capturedAtMs).isEqualTo(1_000L)
        assertThat(fragmenter.append(ByteArray(5), 30.0, atMs = 2_000L)).isEmpty()
        assertThat(fragmenter.flush()?.data?.size).isEqualTo(5)
        assertThat(fragmenter.flush()).isNull()
    }

    @Test
    fun `un fragment part avant qu'une trame ne lui fasse depasser le plafond d'octets`() {
        val fragmenter = TalkieFragmenter(maxChunkBytes = 25, fragmentDurationMs = 1_000.0)
        assertThat(fragmenter.append(ByteArray(10), 10.0, 0L)).isEmpty()
        assertThat(fragmenter.append(ByteArray(10), 10.0, 0L)).isEmpty()
        assertThat(fragmenter.append(ByteArray(10), 10.0, 0L).map { it.data.size }).containsExactly(20)
        assertThat(fragmenter.append(ByteArray(0), 10.0, 0L)).isEmpty()
    }

    @Test
    fun `le budget numerote les fragments et refuse au dela des plafonds`() {
        val budget = TalkieBudget(maxTotalBytes = 25, maxChunks = 3)
        assertThat(budget.admit(10)).isEqualTo(0)
        assertThat(budget.admit(10)).isEqualTo(1)
        assertThat(budget.admit(10)).isNull()
        assertThat(budget.admit(5)).isEqualTo(2)
        assertThat(budget.admit(0)).isNull()
    }

    @Test
    fun `les temps se comptent depuis l'appui, la premiere marque compte`() {
        val latency = TalkieLatency(pressedAtMs = 1_000)
            .marked(TalkieLatencyStep.MIC_READY, 1_200)
            .marked(TalkieLatencyStep.MIC_READY, 1_900)
            .marked(TalkieLatencyStep.OPENED, 500)
        assertThat(latency.summary).isEqualTo("micro 200 ms · accusé 0 ms · premier fragment —")
    }

    // La copie vocale

    @Test
    fun `la copie part dans la conversation la plus recente qui peut la porter`() {
        val candidates = listOf(
            TalkieCopyCandidate("old", "direct", rankAtMs = 1),
            TalkieCopyCandidate("crypt", "direct", encryptionMode = "e2ee", rankAtMs = 9),
            TalkieCopyCandidate("pub", "public", rankAtMs = 9),
            TalkieCopyCandidate("left", "group", isMember = false, rankAtMs = 9),
            TalkieCopyCandidate("mute", "group", writeRestricted = true, rankAtMs = 9),
            TalkieCopyCandidate("news", "group", isAnnouncementChannel = true, rankAtMs = 9),
            TalkieCopyCandidate("recent", "group", rankAtMs = 5),
        )
        assertThat(TalkieCopyDestination.pick(candidates)).isEqualTo("recent")
        assertThat(TalkieCopyDestination.pick(candidates.take(2).drop(1))).isNull()
    }

    @Test
    fun `la copie porte le nom de l'heure locale de la prise de parole`() {
        assertThat(TalkieVoiceCopyName.of(1_794_456_300_000, ZoneOffset.UTC)).isEqualTo("talkie_2026-11-12_0405.m4a")
    }

    @Test
    fun `le talkie se propose des Proche, jamais chiffre ni en apercu`() {
        assertThat(TalkieOfferRule.offers(RelationLevel.FRIEND)).isFalse()
        assertThat(TalkieOfferRule.offers(RelationLevel.CLOSE)).isTrue()
        assertThat(TalkieOfferRule.offers(RelationLevel.BLOOD)).isTrue()
        assertThat(TalkieOfferRule.mayShowInHeader("server")).isTrue()
        assertThat(TalkieOfferRule.mayShowInHeader(null)).isTrue()
        assertThat(TalkieOfferRule.mayShowInHeader("e2ee")).isFalse()
        assertThat(TalkieOfferRule.mayShowInHeader("server", isPreview = true)).isFalse()
    }

    @Test
    fun `le verdict joined voyage avec la fin servie`() {
        val json = Json { ignoreUnknownKeys = true }
        val ended = json.decodeFromString<TalkieEnded>("""{"talkieId":"t","fromUserId":"a","reason":"sender","joined":false}""")
        assertThat(ended.joined).isFalse()
        assertThat(json.decodeFromString<TalkieEnded>("""{"talkieId":"t","fromUserId":"a"}""").joined).isNull()
    }
}
