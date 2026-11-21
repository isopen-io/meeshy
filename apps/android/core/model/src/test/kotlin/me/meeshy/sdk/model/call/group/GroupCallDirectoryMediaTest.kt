package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.call.ActiveCallSession
import org.junit.Test

/**
 * La caméra et le micro d'un membre découvert par son offre sont LES SIENS (#19650) : la session servie
 * (`isMuted` / `isVideoOff`, aplatis par `call-session-response.ts`) les dit, jamais ma caméra à moi.
 */
class GroupCallDirectoryMediaTest {

    private val json = Json { ignoreUnknownKeys = true }

    private val served = """
        {"id":"call-1","conversationId":"group-1","mode":"p2p","status":"active","participants":[
          {"id":"p1","userId":"ada","isMuted":false,"isVideoOff":true,"user":{"id":"ada","username":"ada","displayName":"Ada"}},
          {"id":"p2","userId":"bruno","isMuted":true,"isVideoOff":false,"user":{"id":"bruno","username":"bruno"}},
          {"id":"p3","userId":"cleo","user":{"id":"cleo","username":"cleo"}}
        ]}
    """.trimIndent()

    private fun directory() = GroupCallDirectory.fromActiveCall(json.decodeFromString<ActiveCallSession>(served), callId = "call-1")

    @Test
    fun `la session servie dit la camera et le micro de chaque membre, et ne fabrique rien quand elle se tait`() {
        val names = directory().names
        assertThat(names.getValue("ada").isVideoEnabled).isFalse()
        assertThat(names.getValue("ada").isAudioEnabled).isTrue()
        assertThat(names.getValue("bruno").isVideoEnabled).isTrue()
        assertThat(names.getValue("bruno").isAudioEnabled).isFalse()
        assertThat(names.getValue("cleo").isVideoEnabled).isNull()
        assertThat(names.getValue("cleo").isAudioEnabled).isNull()
    }

    @Test
    fun `une lecture plus tardive complete les medias sans effacer ce qui etait su`() {
        val known = GroupCallDirectory(names = mapOf("cleo" to GroupCallArrival("cleo", isVideoEnabled = true)))
        val merged = known.merging(directory())
        assertThat(merged.names.getValue("cleo").isVideoEnabled).isTrue()
        assertThat(merged.names.getValue("bruno").isVideoEnabled).isTrue()
    }

    @Test
    fun `les medias de l'annuaire s'appliquent aux membres dont aucun evenement n'a parle`() {
        val roster = GroupCallRoster(localUserId = "me")
            .admitting(GroupCallArrival("ada", isVideoEnabled = true))
            .admitting(GroupCallArrival("bruno"))

        val applied = roster.withMediaFrom(directory(), asserted = setOf("ada"))

        assertThat(applied.member("ada")?.isCameraOn).isTrue()
        assertThat(applied.member("bruno")?.isCameraOn).isTrue()
        assertThat(applied.member("bruno")?.isMicMuted).isTrue()
    }
}
