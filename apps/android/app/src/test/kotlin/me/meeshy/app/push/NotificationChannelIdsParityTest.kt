package me.meeshy.app.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

/** Les identifiants envoyés par la passerelle (`android-push-config.ts`) sont ceux que l'app garde. */
class NotificationChannelIdsParityTest {

    private fun gatewayFile(): File {
        val relative = "services/gateway/src/services/android-push-config.ts"
        return generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, relative) }
            .first { it.isFile }
    }

    private fun gatewayConstant(name: String): String =
        Regex("""export const $name = '([^']+)'""").find(gatewayFile().readText())!!.groupValues[1]

    @Test
    fun `CHANNEL_MESSAGES est l identifiant que la passerelle envoie`() {
        assertThat(NotificationChannelIds.CHANNEL_MESSAGES).isEqualTo(gatewayConstant("ANDROID_DEFAULT_CHANNEL_ID"))
    }

    @Test
    fun `CHANNEL_SILENT est le canal muet que la passerelle envoie`() {
        assertThat(NotificationChannelIds.CHANNEL_SILENT).isEqualTo(gatewayConstant("ANDROID_SILENT_CHANNEL_ID"))
    }
}
