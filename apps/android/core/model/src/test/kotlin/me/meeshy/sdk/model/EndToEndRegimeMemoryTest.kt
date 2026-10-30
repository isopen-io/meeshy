package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Test

/**
 * #12956 — une conversation vue chiffrée de bout en bout reste fermée au clair : toute
 * rétrogradation servie est ignorée (#12949). Les trois classes d'iOS (#13099) : l'avis
 * d'activation s'apprend partout, un message e2ee dans un tête-à-tête ; un chiffré sans mode,
 * d'un mode inconnu, ou un e2ee de groupe retient l'envoi en cours sans s'apprendre.
 */
class EndToEndRegimeMemoryTest {

    private fun conversation(mode: String?) = ApiConversation(id = "c1", encryptionMode = mode)

    private fun message(
        isEncrypted: Boolean? = false,
        mode: String? = null,
        type: String = "text",
        deletedAt: String? = null,
    ) = ApiMessage(id = "m", conversationId = "c1", content = "x", messageType = type, isEncrypted = isEncrypted, encryptionMode = mode, deletedAt = deletedAt)

    @Test
    fun `une conversation vue e2ee servie sans mode garde le mode e2ee`() {
        assertThat(EndToEndRegimeMemory.kept(conversation(null), seenEndToEnd = true).encryptionMode).isEqualTo("e2ee")
        assertThat(EndToEndRegimeMemory.kept(conversation("server"), seenEndToEnd = true).encryptionMode).isEqualTo("e2ee")
    }

    @Test
    fun `jamais vue e2ee, la conversation servie passe telle quelle`() {
        val served = conversation("server")
        assertThat(EndToEndRegimeMemory.kept(served, seenEndToEnd = false)).isSameInstanceAs(served)
    }

    @Test
    fun `le registre apprend une fois et ne recule jamais`() {
        val learned = EndToEndSealedConversations().learn("c1")
        assertThat(learned.isSealed("c1")).isTrue()
        assertThat(learned.learn("c1")).isSameInstanceAs(learned)
        assertThat(learned.learn(" ")).isSameInstanceAs(learned)
    }

    @Test
    fun `l avis d activation s apprend partout`() {
        val notice = message(type = "system").copy(metadata = buildJsonObject { put("kind", JsonPrimitive("encryption-enabled")); put("mode", JsonPrimitive("e2ee")) })
        assertThat(EndToEndRegimeMemory.threadShowsEndToEnd(listOf(notice), isDirect = false)).isTrue()
    }

    @Test
    fun `un message e2ee s apprend dans un tete-a-tete, retient dans un groupe`() {
        val e2ee = message(isEncrypted = true, mode = "e2ee")
        assertThat(EndToEndRegimeMemory.threadShowsEndToEnd(listOf(e2ee), isDirect = true)).isTrue()
        assertThat(EndToEndRegimeMemory.threadShowsEndToEnd(listOf(e2ee), isDirect = false)).isFalse()
        assertThat(EndToEndRegimeMemory.threadHoldsSend(listOf(e2ee), isDirect = false)).isTrue()
    }

    @Test
    fun `un chiffre sans mode ou d un mode inconnu retient sans s apprendre`() {
        val ambiguous = listOf(message(isEncrypted = true), message(isEncrypted = true, mode = "signal_v4"))
        assertThat(EndToEndRegimeMemory.threadHoldsSend(ambiguous, isDirect = true)).isTrue()
        assertThat(EndToEndRegimeMemory.threadShowsEndToEnd(ambiguous, isDirect = true)).isFalse()
    }

    @Test
    fun `server, hybrid, le clair, un supprime ou un message systeme ne retiennent rien`() {
        val quiet = listOf(
            message(),
            message(isEncrypted = true, mode = "server"),
            message(isEncrypted = true, mode = "HYBRID"),
            message(isEncrypted = true, deletedAt = "2026-10-25T00:00:00Z"),
            message(isEncrypted = true, type = "system"),
        )
        assertThat(EndToEndRegimeMemory.threadHoldsSend(quiet, isDirect = false)).isFalse()
    }

    @Test
    fun `un message montré retient l'envoi quelle que soit la forme du fil`() {
        assertThat(EndToEndRegimeMemory.messageHoldsSend(message(isEncrypted = true))).isTrue()
        assertThat(EndToEndRegimeMemory.messageHoldsSend(message(isEncrypted = null, mode = "e2ee"))).isTrue()
        assertThat(EndToEndRegimeMemory.messageHoldsSend(message(isEncrypted = true, mode = "server"))).isFalse()
        assertThat(EndToEndRegimeMemory.messageHoldsSend(message())).isFalse()
    }
    private val activation get() = message(type = "system").copy(
        metadata = buildJsonObject { put("kind", JsonPrimitive("encryption-enabled")); put("mode", JsonPrimitive("e2ee")) },
    )

    @Test
    fun `#13792 un message e2ee servi apprend son tete-a-tete, l avis d activation apprend partout`() {
        assertThat(EndToEndRegimeMemory.teachesEndToEnd(listOf(message(isEncrypted = true, mode = "e2ee"))) { true }).isTrue()
        assertThat(EndToEndRegimeMemory.teachesEndToEnd(listOf(message(isEncrypted = true, mode = " E2EE "))) { true }).isTrue()
        assertThat(EndToEndRegimeMemory.teachesEndToEnd(listOf(activation)) { false }).isTrue()
    }

    @Test
    fun `#13792 un e2ee de groupe, un clair, un chiffre ambigu ou un supprime n apprennent rien`() {
        assertThat(EndToEndRegimeMemory.teachesEndToEnd(listOf(message(isEncrypted = true, mode = "e2ee"))) { false }).isFalse()
        val quiet = listOf(
            message(),
            message(isEncrypted = true, mode = "server"),
            message(isEncrypted = true),
            message(isEncrypted = true, mode = "e2ee", deletedAt = "2026-10-25T00:00:00Z"),
        )
        assertThat(EndToEndRegimeMemory.teachesEndToEnd(quiet) { true }).isFalse()
    }

    @Test
    fun `#13792 la forme de la conversation n est lue que pour un e2ee hors avis`() {
        var reads = 0
        EndToEndRegimeMemory.teachesEndToEnd(listOf(message(), message(isEncrypted = true, mode = "server"))) { reads++; true }
        assertThat(reads).isEqualTo(0)
    }

    @Test
    fun `#13792 le fil en cache scelle les envois hors du fil, groupe compris`() {
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(listOf(message(isEncrypted = true, mode = "e2ee")))).isTrue()
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(listOf(message(isEncrypted = true)))).isTrue()
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(listOf(activation))).isTrue()
        val blob = message().copy(attachments = listOf(ApiMessageAttachment(id = "a1", encryptionMode = "e2ee")))
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(listOf(blob))).isTrue()
    }

    @Test
    fun `#13792 un fil en cache clair, au repos serveur ou supprime ne scelle rien`() {
        val quiet = listOf(
            message(),
            message(isEncrypted = true, mode = "server"),
            message(isEncrypted = true, mode = "hybrid"),
            message(isEncrypted = true, mode = "e2ee", deletedAt = "2026-10-25T00:00:00Z"),
            message(isEncrypted = true, type = "system"),
        )
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(quiet)).isFalse()
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(emptyList())).isFalse()
    }

    private fun at(message: ApiMessage, iso: String?) = message.copy(createdAt = iso)

    private fun deactivation(iso: String?) = message(type = "system").copy(
        createdAt = iso,
        metadata = buildJsonObject { put("kind", JsonPrimitive("encryption-disabled")); put("previousMode", JsonPrimitive("e2ee")) },
    )

    @Test
    fun `#13792 une trace e2ee suivie d un avis de desactivation n apprend ni ne scelle`() {
        val legacy = listOf(
            at(activation, T1),
            at(message(isEncrypted = true, mode = "e2ee"), T2),
            at(message(isEncrypted = true), T2),
            message().copy(attachments = listOf(ApiMessageAttachment(id = "a1", encryptionMode = "e2ee")), createdAt = T2),
            deactivation(T3),
        )
        assertThat(EndToEndRegimeMemory.teachesEndToEnd(legacy) { true }).isFalse()
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(legacy)).isFalse()
    }

    @Test
    fun `#13792 une trace posterieure a la derniere desactivation apprend et scelle`() {
        assertThat(EndToEndRegimeMemory.teachesEndToEnd(listOf(deactivation(T1), at(activation, T2))) { false }).isTrue()
        assertThat(EndToEndRegimeMemory.teachesEndToEnd(listOf(deactivation(T1), at(message(isEncrypted = true, mode = "e2ee"), T2))) { true }).isTrue()
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(listOf(deactivation(T1), at(message(isEncrypted = true), T2)))).isTrue()
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(listOf(at(activation, T1), deactivation(T2), at(activation, T3)))).isTrue()
    }

    @Test
    fun `#13792 la desactivation deja en cache, hors du lot servi, borne aussi l apprentissage`() {
        val olderPage = listOf(at(activation, T1), at(message(isEncrypted = true, mode = "e2ee"), T2))
        assertThat(EndToEndRegimeMemory.teachesEndToEnd(olderPage, reopenedAt = epoch(T3)) { true }).isFalse()
        assertThat(EndToEndRegimeMemory.teachesEndToEnd(olderPage, reopenedAt = epoch(T1)) { true }).isTrue()
        assertThat(EndToEndRegimeMemory.lastReopeningAt(listOf(deactivation(T1), deactivation(T3), at(activation, T2)))).isEqualTo(epoch(T3))
    }

    @Test
    fun `#13792 une trace sans instant lisible compte toujours, un avis sans instant ne rouvre rien`() {
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(listOf(at(message(isEncrypted = true, mode = "e2ee"), null), deactivation(T3)))).isTrue()
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(listOf(at(activation, T1), deactivation(null)))).isTrue()
    }

    @Test
    fun `#13792 un message ordinaire qui cite le mot ne rouvre rien`() {
        val impostor = message().copy(
            createdAt = T3,
            content = "encryption-disabled",
            metadata = buildJsonObject { put("kind", JsonPrimitive("encryption-disabled")) },
        )
        assertThat(EndToEndRegimeMemory.cachedThreadSeals(listOf(at(activation, T1), impostor))).isTrue()
    }

    private companion object {
        const val T1 = "2026-01-01T10:00:00.000Z"
        const val T2 = "2026-01-02T10:00:00.000Z"
        const val T3 = "2026-01-03T10:00:00.000Z"

        fun epoch(iso: String): Long = java.time.Instant.parse(iso).toEpochMilli()
    }
}
