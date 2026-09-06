package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.logging.HttpLoggingInterceptor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Constate a l'usage (#4811) : `HttpLoggingInterceptor.Level.BODY` journalise le
 * corps de `/me/account/deletion` en build debug, mot de passe compris — un
 * niveau global n'a pas de granularite par route.
 *
 * **Ces temoins mesurent CE QUI EST JOURNALISE, jamais un champ `level`.** La
 * premiere forme du garde posait `logger.level` juste avant que le logger ne
 * s'execute, et se mesurait en relisant ce champ APRES l'appel. Ce temoin-la
 * etait vert sur une garde qui avait une COURSE : `level` est un champ
 * d'INSTANCE, partage par tous les appels, et OkHttp en depeche jusqu'a 64 en
 * parallele — le fil voisin pouvait reposer BODY entre l'ecriture du garde et
 * la lecture du logger. Un temoin mono-fil ne peut pas voir ca : il lit quand
 * plus rien ne bouge.
 *
 * On mesure donc la SORTIE (les lignes ecrites), et on la mesure aussi SOUS
 * CONCURRENCE.
 */
class SensitiveBodyLoggingGuardTest {

    /** Le corps qu'aucune ligne de journal ne doit contenir. */
    private val motDePasse = "hunter2-ne-doit-jamais-paraitre"

    private fun chain(path: String, jeton: String? = null): Interceptor.Chain {
        val builder = Request.Builder()
            .url("https://gate.meeshy.me/api/v1$path")
            .post("""{"password":"$motDePasse"}""".toRequestBody("application/json".toMediaType()))
        if (jeton != null) builder.header("Authorization", "Bearer $jeton")
        val request = builder.build()
        val response = Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(200)
            .message("OK")
            .body("{}".toResponseBody(null))
            .build()
        return object : Interceptor.Chain {
            override fun request(): Request = request
            override fun proceed(request: Request): Response = response
            override fun connection() = null
            override fun call(): okhttp3.Call = throw UnsupportedOperationException()
            override fun connectTimeoutMillis() = 0
            override fun withConnectTimeout(timeout: Int, unit: TimeUnit) = this
            override fun readTimeoutMillis() = 0
            override fun withReadTimeout(timeout: Int, unit: TimeUnit) = this
            override fun writeTimeoutMillis() = 0
            override fun withWriteTimeout(timeout: Int, unit: TimeUnit) = this
        }
    }

    /** Un garde dont les deux loggers ecrivent dans [lignes]. */
    private fun gardeQuiEcritDans(lignes: MutableCollection<String>): SensitiveBodyLoggingGuard {
        val recueil = HttpLoggingInterceptor.Logger { lignes.add(it) }
        return SensitiveBodyLoggingGuard(
            full = HttpLoggingInterceptor(recueil).apply {
                level = HttpLoggingInterceptor.Level.BODY
            },
            sensitive = HttpLoggingInterceptor(recueil).apply {
                level = HttpLoggingInterceptor.Level.BASIC
            },
        )
    }

    @Test
    fun `aucune route a mot de passe ne journalise son corps`() {
        for (route in SensitiveBodyLoggingGuard.SENSITIVE_PATHS) {
            val lignes = mutableListOf<String>()
            gardeQuiEcritDans(lignes).intercept(chain(route))

            assertTrue(
                "$route a journalise des lignes — le garde ne s'est pas execute",
                lignes.isNotEmpty(),
            )
            assertTrue(
                "$route a journalise le mot de passe : ${lignes.joinToString(" | ")}",
                lignes.none { it.contains(motDePasse) },
            )
        }
    }

    @Test
    fun `une route ordinaire garde son corps au journal`() {
        val lignes = mutableListOf<String>()
        gardeQuiEcritDans(lignes).intercept(chain("/conversations"))

        assertTrue(
            "le niveau complet n'a pas ete applique hors des routes sensibles",
            lignes.any { it.contains(motDePasse) },
        )
    }

    /**
     * (#4843) L'en-tete `Authorization` porte le jeton de la session — sur
     * TOUTE requete authentifiee, jamais seulement sur une route choisie a
     * l'avance. Contrairement au corps, redige par ROUTE (`SENSITIVE_PATHS`),
     * cette redaction ne depend d'AUCUNE liste : une route ordinaire, au
     * niveau BODY complet (en-tetes ET corps), ne doit jamais laisser
     * paraitre le jeton porteur.
     */
    @Test
    fun `l'en-tete Authorization ne fuit jamais, meme sur une route ordinaire`() {
        val jeton = "jwt-jamais-vu-en-clair"
        val lignes = mutableListOf<String>()
        gardeQuiEcritDans(lignes).intercept(chain("/conversations", jeton = jeton))

        assertTrue(
            "le jeton Authorization a fuite : ${lignes.joinToString(" | ")}",
            lignes.none { it.contains(jeton) },
        )
    }

    /**
     * (#4843) `/auth/login/2fa` porte le code de second facteur au corps —
     * absent de `SENSITIVE_PATHS` avant ce correctif. Ce temoin cible LA
     * ROUTE directement, sans passer par l'iteration du set : un set qui
     * omettrait cette route encore demain ne ferait tomber aucun des temoins
     * existants, puisqu'ils ne testent que ce que le set contient deja.
     */
    @Test
    fun `le code de second facteur ne fuit pas via slash-auth-login-2fa`() {
        val lignes = mutableListOf<String>()
        gardeQuiEcritDans(lignes).intercept(chain("/auth/login/2fa"))

        assertTrue(
            "/auth/login/2fa a journalise son corps : ${lignes.joinToString(" | ")}",
            lignes.none { it.contains(motDePasse) },
        )
    }

    /**
     * LA COURSE, mesuree. Cinquante appels sensibles et cinquante ordinaires,
     * melanges sur huit fils. Avec un `level` partage et mute par requete, il
     * suffit qu'un seul appel ordinaire repose BODY entre l'ecriture d'un appel
     * sensible et sa lecture pour qu'un mot de passe parte — et avec cent
     * appels entrelaces, cela arrive.
     *
     * Avec deux instances a niveau FIXE, il n'y a rien a entrelacer : le choix
     * se fait sur la pile du fil appelant.
     */
    @Test
    fun `aucun mot de passe ne fuit sous concurrence`() {
        val lignes = ConcurrentLinkedQueue<String>()
        val garde = gardeQuiEcritDans(lignes)
        val pool = Executors.newFixedThreadPool(8)
        val depart = CountDownLatch(1)
        val fini = CountDownLatch(100)

        repeat(100) { i ->
            val route = if (i % 2 == 0) "/auth/login" else "/conversations"
            pool.execute {
                depart.await()
                runCatching { garde.intercept(chain(route)) }
                fini.countDown()
            }
        }
        depart.countDown()
        assertTrue("les appels n'ont pas termine", fini.await(30, TimeUnit.SECONDS))
        pool.shutdown()

        val fuites = lignes.filter { it.contains(motDePasse) }
        // Seules les routes ORDINAIRES ont le droit de journaliser leur corps ;
        // il y en a cinquante. Toute ligne au-dela vient d'une route sensible.
        assertEquals(
            "des appels sensibles ont journalise leur corps : ${fuites.size} lignes pour 50 appels ordinaires",
            50,
            fuites.size,
        )
    }
}
