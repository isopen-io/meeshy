package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

class CallRulesContractTest {

    private val ts = read("packages/shared/types/call-rules.ts")
    private val swift = read("packages/MeeshySDK/Sources/MeeshySDK/Models/CallRules.swift")

    private fun read(relative: String): String {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        error("introuvable en remontant : $relative")
    }

    private fun tsValue(name: String): Long =
        Regex("""export const $name = ([0-9_]+);""").find(ts)!!.groupValues[1].replace("_", "").toLong()

    private fun swiftSeconds(name: String): Long =
        Regex("""static let $name(?:: TimeInterval)? = ([0-9]+)""").find(swift)!!.groupValues[1].toLong()

    @Test
    fun `chaque delai Kotlin egale le TypeScript`() {
        assertThat(CallRules.RING_TIMEOUT_MS).isEqualTo(tsValue("CALL_RING_TIMEOUT_MS"))
        assertThat(CallRules.RING_GC_MS).isEqualTo(tsValue("CALL_RING_GC_MS"))
        assertThat(CallRules.OFFER_TIMEOUT_MS).isEqualTo(tsValue("CALL_OFFER_TIMEOUT_MS"))
        assertThat(CallRules.CONNECTING_GRACE_MS).isEqualTo(tsValue("CALL_CONNECTING_GRACE_MS"))
        assertThat(CallRules.HEARTBEAT_INTERVAL_MS).isEqualTo(tsValue("CALL_HEARTBEAT_INTERVAL_MS"))
        assertThat(CallRules.HEARTBEAT_TIMEOUT_MS).isEqualTo(tsValue("CALL_HEARTBEAT_TIMEOUT_MS"))
        assertThat(CallRules.BACKGROUND_HEARTBEAT_TIMEOUT_MS).isEqualTo(tsValue("CALL_BACKGROUND_HEARTBEAT_TIMEOUT_MS"))
        assertThat(CallRules.REJOIN_GRACE_MS).isEqualTo(tsValue("CALL_REJOIN_GRACE_MS"))
        assertThat(CallRules.PUSH_TTL_MS).isEqualTo(tsValue("CALL_PUSH_TTL_MS"))
        assertThat(CallRules.MAX_PARTICIPANTS.toLong()).isEqualTo(tsValue("CALL_MAX_PARTICIPANTS"))
    }

    @Test
    fun `chaque delai Kotlin egale le miroir Swift en secondes`() {
        assertThat(CallRules.RING_TIMEOUT_MS).isEqualTo(swiftSeconds("ringTimeout") * 1000)
        assertThat(CallRules.RING_GC_MS).isEqualTo(swiftSeconds("ringGarbageCollection") * 1000)
        assertThat(CallRules.OFFER_TIMEOUT_MS).isEqualTo(swiftSeconds("offerTimeout") * 1000)
        assertThat(CallRules.CONNECTING_GRACE_MS).isEqualTo(swiftSeconds("connectingGrace") * 1000)
        assertThat(CallRules.HEARTBEAT_INTERVAL_MS).isEqualTo(swiftSeconds("heartbeatInterval") * 1000)
        assertThat(CallRules.HEARTBEAT_TIMEOUT_MS).isEqualTo(swiftSeconds("heartbeatTimeout") * 1000)
        assertThat(CallRules.BACKGROUND_HEARTBEAT_TIMEOUT_MS).isEqualTo(swiftSeconds("backgroundHeartbeatTimeout") * 1000)
        assertThat(CallRules.REJOIN_GRACE_MS).isEqualTo(swiftSeconds("rejoinGrace") * 1000)
        assertThat(CallRules.PUSH_TTL_MS).isEqualTo(swiftSeconds("pushTimeToLive") * 1000)
        assertThat(CallRules.MAX_PARTICIPANTS.toLong()).isEqualTo(swiftSeconds("maxParticipants"))
    }
}
