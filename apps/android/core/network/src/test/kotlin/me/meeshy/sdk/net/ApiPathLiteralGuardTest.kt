package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #4279 critere 3 — **aucun litteral de chemin d'API hors d'une interface `*Api.kt`.**
 *
 * ## Ce que la garde protege
 *
 * Un appel qui part d'ailleurs qu'une interface declaree echappe a tout : au
 * manifeste des routes, a l'inventaire par client, et a la revue qui compare
 * les trois surfaces. Le depot a deja perdu l'ouverture d'un profil pour cette
 * raison exacte (#4250) — Android appelait trois alias qu'aucun audit n'avait
 * comptes, parce que le commentaire cote passerelle ne nommait que iOS.
 *
 * ## Ce que la garde TOLERE, et pourquoi c'est nomme
 *
 * Une garde negative qui ne dit pas ce qu'elle accepte se fait desarmer au
 * premier ajout legitime — on elargit le motif « juste un peu », et elle cesse
 * de proteger sans que rien ne rougisse. Les exceptions sont donc EXPLICITES :
 *
 *  - `MeeshyConfig.kt` — les URL de base (production, staging). Un prefixe
 *    d'API n'est pas un chemin de route ; c'est la ou il DOIT vivre.
 *  - `RefreshAuthenticator.kt` — `apiPathPrefix`, le prefixe que
 *    l'authentificateur compare pour reconnaitre ses propres routes.
 *
 * Les deux `@Url` de `TusApi` ne sont pas des litteraux : leur `location` est
 * une URL **rendue par le serveur** au moment de `createUpload`, ce que le
 * protocole tus.io impose. Elle ne peut pas etre declaree d'avance, et c'est la
 * raison legitime que le critere 1 demandait d'ecrire.
 */
class ApiPathLiteralGuardTest {

    /**
     * Le repertoire de travail de Gradle est tantot le MODULE, tantot la racine
     * du depot. Le motif est repris de `PublicProfileEndpointTest` : sans lui,
     * `walkTopDown` sur un chemin inexistant rend une liste VIDE, et la garde
     * passe au vert en ne lisant rien — la forme la plus silencieuse de mort.
     * Le `check` fait echouer FORT plutot que de laisser passer.
     */
    private fun repertoire(relatif: String): File {
        val depuisModule = File(relatif)
        if (depuisModule.isDirectory) return depuisModule
        val depuisRacine = File("core/network/$relatif")
        check(depuisRacine.isDirectory) {
            "sources introuvables depuis ${depuisModule.absolutePath}"
        }
        return depuisRacine
    }

    private val racineReseau: File get() = repertoire("src/main/kotlin/me/meeshy/sdk/net")

    /** Ce qui porte un prefixe d'API pour une raison dite. */
    private val exceptionsNommees = setOf(
        "MeeshyConfig.kt",
        "RefreshAuthenticator.kt",
    )

    private fun sourcesKotlin(): List<File> =
        racineReseau.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()

    @Test
    fun `le balayage voit bien des fichiers — sinon la garde passerait au vert en ne lisant rien`() {
        // Le cas positif. Une garde qui balaie un repertoire vide protege zero
        // fichier et ne le dit pas : c'est la forme la plus silencieuse de mort.
        assertThat(sourcesKotlin().size).isAtLeast(10)
    }

    @Test
    fun `aucun litteral de chemin d'API hors d'une interface Api`() {
        val fautifs = sourcesKotlin()
            .filter { !it.path.contains("/api/") }
            .filter { it.name !in exceptionsNommees }
            .mapNotNull { fichier ->
                val lignesFautives = fichier.readLines()
                    .withIndex()
                    .filter { (_, ligne) ->
                        val nu = ligne.trim()
                        val estCommentaire =
                            nu.startsWith("//") || nu.startsWith("*") || nu.startsWith("/*")
                        !estCommentaire && Regex("\"/?api/v\\d").containsMatchIn(ligne)
                    }
                    .map { (i, ligne) -> "${fichier.name}:${i + 1}  ${ligne.trim()}" }
                if (lignesFautives.isEmpty()) null else lignesFautives
            }
            .flatten()

        assertThat(fautifs).isEmpty()
    }

    @Test
    fun `les interfaces Api declarent bien les chemins — la garde a quelque chose a proteger`() {
        // Second cas positif : si plus aucune annotation Retrofit n'existait, le
        // test precedent passerait au vert sur un module qui n'appelle plus rien.
        val annotations = repertoire("src/main/kotlin/me/meeshy/sdk/net/api")
            .walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .sumOf { fichier ->
                Regex("@(GET|POST|PATCH|PUT|DELETE|HEAD)\\(").findAll(fichier.readText()).count()
            }

        assertThat(annotations).isAtLeast(100)
    }
}
