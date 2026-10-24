package me.meeshy.app

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

// #12569 : la loi « UN cercle d'avatar = UN visage » se garde sur la SOURCE.
//  (1) tout `MeeshyAvatar(` passe `imageUrl` (la photo servie atteint le cercle), sauf les
//      exemptions NOMMÉES ci-dessous, chacune avec sa raison — et jamais un `imageUrl = null` écrit
//      en dur, qui satisferait la lettre de la règle sans jamais montrer de photo ;
//  (2) aucun `AsyncImage(` n'est posé en couche à côté d'un `MeeshyAvatar(` : c'est ainsi que photo
//      et initiales se retrouvaient visibles ensemble (Fit, liseré, PNG transparent) ;
//  (3) aucun cercle d'initiales n'est dessiné à la main (`nom.take(1).uppercase()`) : un tel cercle
//      échappe aux deux règles précédentes et ne montre jamais la photo (la pastille d'appel l'a prouvé).
// Miroir d'`apps/web/scripts/check-avatar-src.mjs`.
class AvatarSourceGuardTest {

    private val exemptions: Map<String, String> = mapOf(
        "FriendsIllustration.kt" to "illustration d'onboarding : personnages fictifs, aucune photo servie",
        "StoryRingIllustration.kt" to "illustration d'onboarding : personnages fictifs, aucune photo servie",
        "MeeshyAvatar.kt" to "l'atome lui-même",
    )

    private fun androidRoot(): File {
        var dir: File? = File(".").canonicalFile
        while (dir != null && !File(dir, "gradle/libs.versions.toml").isFile) dir = dir.parentFile
        return checkNotNull(dir) { "racine apps/android introuvable" }
    }

    private fun mainSources(): List<File> =
        androidRoot().walkTopDown()
            .filter { it.isFile && it.extension == "kt" && "/src/main/" in it.path && "/build/" !in it.path }
            .toList()

    private fun callText(text: String, open: Int): String {
        var depth = 0
        for (i in open until text.length) {
            when (text[i]) {
                '(' -> depth++
                ')' -> if (--depth == 0) return text.substring(open, i + 1)
            }
        }
        return text.substring(open)
    }

    @Test
    fun `tout MeeshyAvatar passe imageUrl sauf exemption nommee`() {
        val offenders = mutableListOf<String>()
        mainSources().filter { it.name !in exemptions }.forEach { file ->
            val text = file.readText()
            Regex("""(?<![\w.])MeeshyAvatar\(""").findAll(text).forEach { m ->
                val call = callText(text, m.range.last)
                val passesNoPhoto = "imageUrl" !in call || Regex("""imageUrl\s*=\s*null\b""").containsMatchIn(call)
                if (passesNoPhoto) offenders += "${file.name}:${text.substring(0, m.range.first).count { it == '\n' } + 1}"
            }
        }
        assertWithMessage("MeeshyAvatar sans imageUrl servi (ajouter la photo servie, ou une exemption nommée)")
            .that(offenders).isEmpty()
    }

    @Test
    fun `aucun cercle d'initiales n'est dessine a la main hors de l'atome`() {
        val handDrawn = Regex("""\w*[Nn]ame\w*\??\.take\(1\)\.uppercase\(\)""")
        val offenders = mainSources().flatMap { file ->
            file.readLines().mapIndexedNotNull { index, line ->
                "${file.name}:${index + 1}".takeIf { handDrawn.containsMatchIn(line) }
            }
        }
        assertWithMessage("initiales dessinées à la main (passer par MeeshyAvatar, qui montre la photo servie)")
            .that(offenders).isEmpty()
    }

    @Test
    fun `aucun AsyncImage n'est pose en couche a cote d'un MeeshyAvatar`() {
        val offenders = mutableListOf<String>()
        mainSources().filter { it.name != "MeeshyAvatar.kt" }.forEach { file ->
            val lines = file.readLines()
            lines.forEachIndexed { index, line ->
                if (Regex("""(?<![\w.])MeeshyAvatar\(""").containsMatchIn(line)) {
                    val window = lines.subList(index, minOf(lines.size, index + 12))
                    if (window.drop(1).any { "AsyncImage(" in it }) offenders += "${file.name}:${index + 1}"
                }
            }
        }
        assertWithMessage("AsyncImage en couche sous/sur un MeeshyAvatar (passer imageUrl à l'atome)")
            .that(offenders).isEmpty()
    }
}
