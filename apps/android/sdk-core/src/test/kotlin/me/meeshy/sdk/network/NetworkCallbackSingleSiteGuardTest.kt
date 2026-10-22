package me.meeshy.sdk.network

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * nss-net-reachability — **un seul `registerDefaultNetworkCallback` dans le processus.**
 *
 * Deux moniteurs qui observaient chacun le systeme ont fini par se contredire (la pastille disait
 * « Hors ligne » pendant que la file se croyait autorisee a partir). Le chemin reseau a desormais
 * une source unique, [AndroidNetworkPathSource], et toute lecture — binaire, qualitative, type
 * d'interface — en est une projection. Cette garde ferme la porte du retour : un second
 * enregistrement de rappel reseau, ou qu'il soit dans le code de production, rend ce test rouge
 * au lieu de rouvrir silencieusement la divergence. Un besoin neuf (un appel qui veut reagir a
 * un changement de Wi-Fi) lit `NetworkPathSource.snapshot`, il n'enregistre pas son propre rappel.
 */
class NetworkCallbackSingleSiteGuardTest {

    private val enregistrements = Regex("""\b(registerDefaultNetworkCallback|registerNetworkCallback|requestNetwork)\s*\(""")

    /**
     * Le repertoire de travail de Gradle est le MODULE (`sdk-core`) ; on remonte jusqu'a la racine
     * de l'application. `check` fait echouer FORT plutot que de balayer un repertoire inexistant,
     * ce qui laisserait la garde au vert en ne lisant rien.
     */
    private fun racineAndroid(): File {
        var courant: File? = File("").absoluteFile
        while (courant != null) {
            if (File(courant, "settings.gradle.kts").isFile && File(courant, "sdk-core").isDirectory) return courant
            courant = courant.parentFile
        }
        error("racine de l'application Android introuvable depuis ${File("").absolutePath}")
    }

    private fun sourcesDeProduction(): List<File> =
        racineAndroid().walkTopDown()
            .onEnter { it.name != "build" && it.name != ".gradle" }
            .filter { it.isFile && it.extension == "kt" && "/src/main/" in it.invariantSeparatorsPath }
            .toList()

    private fun estCommentaire(ligne: String): Boolean {
        val nue = ligne.trim()
        return nue.startsWith("*") || nue.startsWith("//") || nue.startsWith("/*")
    }

    private fun fichiersQuiEnregistrent(): List<String> =
        sourcesDeProduction()
            .filter { fichier -> fichier.readLines().any { !estCommentaire(it) && enregistrements.containsMatchIn(it) } }
            .map { it.name }

    @Test
    fun `le balayage voit bien des fichiers — sinon la garde passerait au vert en ne lisant rien`() {
        assertThat(sourcesDeProduction().size).isAtLeast(100)
    }

    @Test
    fun `un seul fichier de production enregistre un rappel reseau, la source unique`() {
        assertThat(fichiersQuiEnregistrent()).containsExactly("AndroidNetworkMonitor.kt")
    }
}
