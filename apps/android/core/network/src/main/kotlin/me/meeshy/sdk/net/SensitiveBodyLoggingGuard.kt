package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor

/**
 * Empeche un mot de passe de partir en clair dans logcat quand le logging BODY
 * est actif (#4811).
 *
 * `HttpLoggingInterceptor` n'offre de redaction que sur les EN-TETES
 * (`redactHeader`) — rien sur le corps. Ce garde REMPLACE le logger dans la
 * chaine : il en tient DEUX, chacun a un niveau FIXE, et delegue a celui qui
 * convient a la route.
 *
 * **Pourquoi deux instances et non un `level` que l'on abaisse.** La forme
 * evidente — un seul logger dont on pose le `level` juste avant qu'il ne
 * s'execute — a une COURSE, et elle rouvre exactement le trou qu'on ferme.
 * `HttpLoggingInterceptor.level` est un champ d'INSTANCE, partage par tous les
 * appels ; OkHttp en depeche jusqu'a 64 en parallele. Deux fils s'entrelacent
 * alors ainsi :
 *
 *     T1 (POST /auth/login)   : garde -> level = BASIC
 *     T2 (GET /conversations) : garde -> level = BODY
 *     T1                      : le logger lit BODY -> le mot de passe part
 *
 * La fenetre est etroite et le defaut probabiliste — donc PIRE qu'une absence
 * de garde : il passe les temoins, il passe la revue, et il fuit en production
 * sous la charge exacte ou il compte. Un temoin mono-fil ne peut pas le voir ;
 * il lit `logger.level` APRES l'appel, quand plus rien ne bouge.
 *
 * Ici aucun niveau n'est jamais ecrit apres construction : [sensitive] reste a
 * BASIC (methode + URL + statut, sans corps ni en-tetes), [full] au niveau
 * demande. Le choix se fait par route, sur la pile du fil appelant, sans etat
 * partage — il n'y a donc plus de course a avoir.
 */
class SensitiveBodyLoggingGuard(
    private val full: HttpLoggingInterceptor,
    private val sensitive: HttpLoggingInterceptor,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val path = chain.request().url.encodedPath
        val logger = if (SENSITIVE_PATHS.any { path.endsWith(it) }) sensitive else full
        return logger.intercept(chain)
    }

    companion object {
        /**
         * Routes dont le corps de requete porte un mot de passe ou un code de
         * second facteur en clair. `/auth/login` et `/auth/register` (le mot
         * de passe choisi) ; `/auth/login/2fa` (le code de second facteur,
         * #4843) ; `/auth/2fa/disable` (confirmation par mot de passe) ;
         * `/users/me/password` (l'ancien ET le nouveau) ; `/me/account/deletion`
         * (#4811 — le site qui a declenche cette garde).
         */
        // api-path: ces six chemins ne sont PAS des appels — ce garde n'en emet
        // aucun. Il INSPECTE le chemin d'une requete deja formee, comme
        // `RefreshAuthenticator` compare son `apiPathPrefix` pour reconnaitre
        // les siennes. Les declarer ici est le seul moyen de decider par route ;
        // les derver d'une interface `*Api.kt` demanderait de lire une
        // annotation a l'execution, ce que la JVM ne rend pas ici.
        internal val SENSITIVE_PATHS = setOf(
            // api-path: inspection, pas emission — la marque couvre les six.
            "/auth/login",
            "/auth/login/2fa",
            "/auth/register",
            "/auth/2fa/disable",
            "/users/me/password",
            "/me/account/deletion",
        )

        /**
         * Le garde arme avec ses deux niveaux fixes — le seul montage correct.
         *
         * L'EN-TETE `Authorization` (le jeton porteur) et `Cookie` (la session
         * anonyme) sont redigés SUR LES DEUX loggers, sans condition de route
         * (#4843) : contrairement au corps, un jeton d'authentification part
         * sur TOUTE requete authentifiee — une liste de routes serait fausse
         * des la premiere route protegee ajoutee demain. `redactHeader` est la
         * seule redaction native d'`HttpLoggingInterceptor` ; c'est le mecanisme
         * prevu pour cet usage exact.
         */
        fun atLevel(full: HttpLoggingInterceptor.Level): SensitiveBodyLoggingGuard =
            SensitiveBodyLoggingGuard(
                full = HttpLoggingInterceptor().apply {
                    level = full
                    redactHeader("Authorization")
                    redactHeader("Cookie")
                },
                sensitive = HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                    redactHeader("Authorization")
                    redactHeader("Cookie")
                },
            )
    }
}
