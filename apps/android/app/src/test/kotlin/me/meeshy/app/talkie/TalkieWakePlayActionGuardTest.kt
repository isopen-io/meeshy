package me.meeshy.app.talkie

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.app.i18n.ResourceTree
import org.junit.Test

/**
 * TÉMOIN de la directive porteur du 2026-11-08 (#17144) : la notification de réveil du talkie d'urgence est la SEULE
 * notification de Meeshy dont on fait jouer la voix sans ouvrir l'app. Son action « Lire » ne vit que dans
 * `TalkieWakeNotification` (et le service qu'elle vise) ; aucune autre notification — message, appel, Bring, social,
 * pipeline push — ne la porte. Toutes les autres restent informatives.
 */
class TalkieWakePlayActionGuardTest {

    private val sources: File get() = File(ResourceTree.androidRoot(), "app/src/main/kotlin")

    private val allowed = setOf("TalkieWakeNotification.kt", "TalkieWakeService.kt")

    private fun filesMentioning(marker: String): List<String> = sources.walkTopDown()
        .filter { it.isFile && it.extension == "kt" }
        .filter { it.readText().contains(marker) }
        .map { it.name }
        .toList()

    @Test
    fun `seule la notification de reveil du talkie porte l'action Lire`() {
        assertThat(filesMentioning("R.string.talkie_wake_play")).containsExactly("TalkieWakeNotification.kt")
    }

    @Test
    fun `l'intention de lecture ne part que de la notification de reveil vers son service`() {
        val users = filesMentioning("TalkieWakeNotification.ACTION_PLAY") + filesMentioning("ACTION_PLAY = \"me.meeshy.app.talkie")

        assertThat(users).isNotEmpty()
        assertThat(users.toSet() - allowed).isEmpty()
    }

    @Test
    fun `le pipeline des notifications push ne construit aucune action de lecture`() {
        val push = File(sources, "me/meeshy/app/push").walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()

        assertThat(push).isNotEmpty()
        assertThat(push.filter { it.readText().contains("talkie_wake_play") || it.readText().contains("TalkieWakeService") }.map { it.name })
            .isEmpty()
    }
}
