package me.meeshy.sdk.net.api

import java.io.File

/**
 * Une route telle que l'écrit une interface `*Api.kt` : le verbe, le chemin relatif
 * au préfixe d'API (sans barre initiale), et le fichier qui la déclare.
 */
internal data class DeclaredRoute(val source: String, val verb: String, val path: String) {
    /** « GET notifications/{id} » — la forme que les messages d'échec montrent. */
    val label: String get() = "$verb $path ($source)"
}

/**
 * Lit les routes que les interfaces Retrofit DÉCLARENT, directement dans leurs
 * sources — la même méthode que `ApiPathLiteralGuardTest`, qui se lit au module ou à
 * la racine du dépôt selon le répertoire de travail de Gradle.
 *
 * Deux garanties contre la forme la plus silencieuse de mort d'une garde (lire
 * un répertoire vide et passer au vert) : [apiSourceDirectory] échoue FORT quand
 * le répertoire manque, et [declared] échoue quand il en lit trop peu.
 */
internal object RetrofitRouteSources {

    private const val API_SOURCES = "src/main/kotlin/me/meeshy/sdk/net/api"

    private val verbAnnotation = Regex("""@(GET|POST|PUT|PATCH|DELETE|HEAD)\(\s*"([^"]*)"\s*\)""")
    private val httpAnnotation = Regex("""@HTTP\(([^)]*)\)""")
    private val httpMethod = Regex("""method\s*=\s*"([A-Za-z]+)"""")
    private val httpPath = Regex("""path\s*=\s*"([^"]*)"""")

    fun apiSourceDirectory(): File {
        val fromModule = File(API_SOURCES)
        if (fromModule.isDirectory) return fromModule
        val fromRepoRoot = File("core/network/$API_SOURCES")
        check(fromRepoRoot.isDirectory) {
            "sources des interfaces Api introuvables depuis ${fromModule.absolutePath}"
        }
        return fromRepoRoot
    }

    fun apiSourceFiles(): List<File> =
        apiSourceDirectory().listFiles { file: File -> file.isFile && file.name.endsWith("Api.kt") }
            ?.sortedBy { it.name }
            .orEmpty()

    /** Les commentaires retirés : une KDoc qui cite une annotation n'est pas une déclaration. */
    private fun code(source: String): String =
        source.replace(Regex("/\\*.*?\\*/", RegexOption.DOT_MATCHES_ALL), "")
            .lines()
            .joinToString("\n") { it.replace(Regex("(^|\\s)//.*$"), "$1") }

    fun routesOf(file: File): List<DeclaredRoute> {
        val text = code(file.readText())
        val simple = verbAnnotation.findAll(text).map { DeclaredRoute(file.name, it.groupValues[1], it.groupValues[2]) }
        val custom = httpAnnotation.findAll(text).mapNotNull { match ->
            val verb = httpMethod.find(match.groupValues[1])?.groupValues?.get(1)?.uppercase()
            val path = httpPath.find(match.groupValues[1])?.groupValues?.get(1)
            if (verb != null && path != null) DeclaredRoute(file.name, verb, path) else null
        }
        return (simple + custom).toList()
    }

    fun declared(): List<DeclaredRoute> {
        val files = apiSourceFiles()
        check(files.size >= 20) { "${files.size} sources Api lues seulement — la garde est aveugle" }
        return files.flatMap(::routesOf)
    }

    /** Le chemin comparable : sans barre initiale ni query, chaque segment variable devient `*`. */
    fun canonical(path: String): List<String> =
        path.substringBefore('?').trim('/').split('/').map { segment ->
            if (segment.startsWith("{") || segment.startsWith(":") || segment == "*") "*" else segment
        }

    /**
     * STRICT : une variable répond à une variable, un littéral au MÊME littéral. Une
     * correspondance lâche (une variable servie qui accepte un littéral déclaré)
     * aurait laissé passer `DELETE notifications/device-token`, que la passerelle
     * sert comme `DELETE notifications/:id` avec `id = "device-token"` — la route
     * « existe », et répond 404 « Notification not found ».
     */
    fun sameRoute(left: List<String>, right: List<String>): Boolean = left == right
}

/** Trouve la racine du dépôt en REMONTANT jusqu'à un marqueur — jamais en comptant les composants du chemin. */
internal object RepositoryRoot {
    fun containing(marker: String): File {
        var current: File? = File(".").absoluteFile
        repeat(8) {
            val here = current ?: return@repeat
            if (File(here, marker).exists()) return here
            current = here.parentFile
        }
        error("racine du depot introuvable : $marker n'existe au-dessus d'aucun parent de ${File(".").absolutePath}")
    }
}
