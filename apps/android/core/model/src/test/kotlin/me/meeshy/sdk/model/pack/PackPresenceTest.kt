package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/** Rejoue `packages/shared/design/packs/presence-vectors.json`, lu tel quel : le TypeScript a raison en cas d'écart. */
class PackPresenceTest {

    private fun vectorsFile(): File {
        val path = "packages/shared/design/packs/presence-vectors.json"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            File(dir, path).takeIf { it.isFile }?.let { return it }
            dir = dir.parentFile
        }
        error("vecteurs de présence introuvables ($path)")
    }

    private fun JsonObject.int(key: String): Int = getValue(key).jsonPrimitive.int
    private fun JsonObject.str(key: String): String = getValue(key).jsonPrimitive.content

    private fun presence(o: JsonObject): PackPresence = when (val state = o.str("state")) {
        "absent" -> PackPresence.Absent
        "queued" -> PackPresence.Queued(PackQueueReason.entries.single { it.wire == o.str("reason") })
        "downloading" -> PackPresence.Downloading(o.int("doneBytes"), o.int("totalBytes"))
        "ready" -> PackPresence.Ready(o.int("version"))
        "stale" -> PackPresence.Stale(o.int("version"), o.int("next"))
        "failed" -> PackPresence.Failed(
            PackFailureCause.entries.single { it.wire == o.str("cause") },
            PackRetryAt.entries.single { it.wire == o.str("retryAt") },
        )
        else -> error("état inconnu $state")
    }

    private fun event(o: JsonObject): PackPresenceEvent = when (val type = o.str("type")) {
        "install" -> PackPresenceEvent.Install
        "start" -> PackPresenceEvent.Start(o.int("totalBytes"))
        "download" -> PackPresenceEvent.Download(o.int("totalBytes"))
        "progress" -> PackPresenceEvent.Progress(o.int("doneBytes"))
        "complete" -> PackPresenceEvent.Complete(o.int("version"))
        "integrity-error" -> PackPresenceEvent.IntegrityError
        "network-error" -> PackPresenceEvent.NetworkError
        "no-space" -> PackPresenceEvent.NoSpace
        "cancel" -> PackPresenceEvent.Cancel
        "space-freed" -> PackPresenceEvent.SpaceFreed
        "session-start" -> PackPresenceEvent.SessionStart
        "retry" -> PackPresenceEvent.Retry
        "remove" -> PackPresenceEvent.Remove(PackRemovalOrigin.entries.single { it.wire == o.str("origin") })
        "lease-released" -> PackPresenceEvent.LeaseReleased
        "version-served" -> PackPresenceEvent.VersionServed(o.int("version"))
        else -> error("événement inconnu $type")
    }

    private fun context(o: JsonObject) = PackPresenceContext(
        network = PackNetwork.entries.single { it.wire == o.str("network") },
        lease = o.getValue("lease").jsonPrimitive.boolean,
        embedded = o.getValue("embedded").jsonPrimitive.boolean,
    )

    @Test
    fun `every shared presence vector is replayed exactly`() {
        val vectors = Json.parseToJsonElement(vectorsFile().readText()).jsonObject.getValue("vectors").jsonArray
        assertThat(vectors).isNotEmpty()
        vectors.map { it.jsonObject }.forEach { v ->
            val result = PackPresenceMachine.transition(presence(v.getValue("from").jsonObject), event(v.getValue("event").jsonObject), context(v.getValue("context").jsonObject))
            assertWithMessage(v.str("name")).that(result.presence).isEqualTo(presence(v.getValue("to").jsonObject))
            assertWithMessage(v.str("name")).that(result.effects.map { it.wire }).isEqualTo(v.getValue("effects").jsonArray.map { it.jsonPrimitive.content })
        }
    }

    @Test
    fun `only a ready or stale pack can paint a frame`() {
        assertThat(PackPresence.Ready(1).isPaintable).isTrue()
        assertThat(PackPresence.Stale(1, 2).isPaintable).isTrue()
        assertThat(PackPresence.Absent.isPaintable).isFalse()
        assertThat(PackPresence.Downloading(0, 5).isPaintable).isFalse()
        assertThat(PackPresence.Failed(PackFailureCause.NETWORK, PackRetryAt.BACKOFF).isPaintable).isFalse()
    }

    @Test
    fun `progress is clamped to the total`() {
        val result = PackPresenceMachine.transition(
            PackPresence.Downloading(0, 10), PackPresenceEvent.Progress(99), PackPresenceContext(PackNetwork.UNRESTRICTED),
        )
        assertThat(result.presence).isEqualTo(PackPresence.Downloading(10, 10))
    }
}
