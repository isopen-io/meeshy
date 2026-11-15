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
    /** Le prefixe d'API, qui n'est pas une route. */
    private val PREFIXE_API = "/api/v1"

    /** Ce qu'un site doit ecrire pour qu'un chemin RECONNU (jamais appele) passe. */
    private val MARQUE_JUSTIFICATION = "api-path:"
    private val PORTEE_JUSTIFICATION = 6

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

    /**
     * **Le motif ci-dessus ne voit que le PREFIXE, jamais la route** — et le
     * titre de cette classe en promet plus.
     *
     * Mesure du 2026-08-31 : une sonde `"/api/v1/conversations"` posee hors
     * interface la fait tomber ; la meme sonde ecrite `"/conversations"` la
     * laisse VERTE. Or c'est cette seconde forme que les sites d'appel
     * emploient — le prefixe est ajoute par la couche de transport.
     *
     * Ce temoin ferme l'ecart en confrontant chaque litteral au MANIFESTE des
     * routes du serveur (`services/gateway/route-manifest.json`, produit
     * mecaniquement depuis le Fastify assemble). Un litteral n'est denonce que
     * s'il APPARIE une route servie : ni un chemin de fichier ni `"/150"` ne
     * peuvent l'etre, donc le faux positif est structurellement impossible —
     * la condition pour qu'une garde soit lue plutot que contournee.
     */
    @Test
    fun `aucun litteral n'apparie une route servie, prefixe ou non`() {
        val routes = routesServies()
        assertThat(routes.size).isAtLeast(100)

        val litteral = Regex("\"(/[A-Za-z0-9][A-Za-z0-9/_{}$.-]*)\"")
        val fautifs = sourcesKotlin()
            .filter { !it.path.contains("/api/") }
            .filter { it.name !in exceptionsNommees }
            .flatMap { fichier ->
                fichier.readLines().withIndex().flatMap { (i, ligne) ->
                    val nu = ligne.trim()
                    if (nu.startsWith("//") || nu.startsWith("*") || nu.startsWith("/*")) {
                        emptyList()
                    } else if (justifie(fichier, i)) {
                        emptyList()
                    } else {
                        litteral.findAll(ligne)
                            .map { it.groupValues[1] }
                            .filter { it.count { c -> c == '/' } >= 1 }
                            .filter { apparie(it, routes) }
                            .map { "${fichier.name}:${i + 1}  $it" }
                            .toList()
                    }
                }
            }

        assertThat(fautifs).isEmpty()
    }

    /**
     * **Une MARQUE au site, jamais une liste de fichiers.**
     *
     * `exceptionsNommees` exempte un FICHIER ENTIER : tout ce qu'on y ajoutera
     * ensuite passera, sans que personne ne le sache — mesure du 2026-08-31,
     * une sonde posee dans `RefreshAuthenticator.kt` est restee verte. Une
     * liste se perime au premier ajout, et le fichier qui l'ajoute n'a aucune
     * raison de la lire.
     *
     * La marque, elle, voyage avec le code qu'elle justifie et se lit la ou on
     * decide. Elle couvre la ligne qu'elle precede et les cinq suivantes.
     */
    private fun justifie(fichier: File, indexLigne: Int): Boolean {
        val lignes = fichier.readLines()
        val debut = maxOf(0, indexLigne - PORTEE_JUSTIFICATION)
        return lignes.subList(debut, minOf(indexLigne + 1, lignes.size))
            .any { it.contains(MARQUE_JUSTIFICATION) }
    }

    /** Les chemins servis, canonises — tout segment variable vaut `*`. */
    private fun routesServies(): List<List<String>> {
        val manifeste = File(racineDepot(), "services/gateway/route-manifest.json")
        check(manifeste.isFile) { "manifeste introuvable : ${manifeste.absolutePath}" }
        return Regex("\"path\"\\s*:\\s*\"([^\"]+)\"")
            .findAll(manifeste.readText())
            .map { canonise(it.groupValues[1]) }
            .distinct()
            .toList()
    }

    private fun canonise(chemin: String): List<String> =
        chemin.substringBefore('?')
            .split('/')
            .map { if (it.startsWith(":") || it == "*" || it.startsWith("{")) "*" else it }

    private fun apparie(litteral: String, routes: List<List<String>>): Boolean {
        if (litteral == PREFIXE_API) return false
        val nu = canonise(litteral)
        val prefixe = if (litteral.startsWith("/api")) nu else canonise("$PREFIXE_API$litteral")
        return listOf(nu, prefixe).any { candidat ->
            routes.any { route ->
                route.size == candidat.size &&
                    route.indices.all { route[it] == "*" || candidat[it] == "*" || route[it] == candidat[it] }
            }
        }
    }

    /**
     * La racine du depot, trouvee en REMONTANT jusqu'au manifeste — jamais en
     * comptant les composants du chemin, qui se perime des que Gradle change
     * de repertoire de travail (ce que `repertoire()` documente deja plus haut).
     */
    private fun racineDepot(): File {
        var courant: File? = File(".").absoluteFile
        repeat(8) {
            val ici = courant ?: return@repeat
            if (File(ici, "services/gateway/route-manifest.json").isFile) return ici
            courant = ici.parentFile
        }
        error("racine du depot introuvable depuis ${File(".").absolutePath}")
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
