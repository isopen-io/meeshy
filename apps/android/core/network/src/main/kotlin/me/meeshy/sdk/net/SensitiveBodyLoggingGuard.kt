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
        val logger = if (isSensitive(path)) sensitive else full
        return logger.intercept(chain)
    }

    private fun isSensitive(path: String): Boolean =
        SENSITIVE_PATHS.any { path.endsWith(it) } || SENSITIVE_SEGMENTS.any { it in path }

    companion object {
        /**
         * Routes dont le corps de requete porte un mot de passe ou un code de
         * second facteur en clair. `/auth/login` et `/auth/register` (le mot
         * de passe choisi) ; `/auth/login/2fa` (le code de second facteur,
         * #4843) ; `/auth/2fa/disable` (confirmation par mot de passe) ;
         * `/users/me/password` (l'ancien ET le nouveau) ; `/me/account/deletion`
         * (#4811 — le site qui a declenche cette garde). Puis le reste des portes
         * qui portent un SECRET d'authentification au corps ou dans la reponse : le
         * code et le mot de passe de la preuve d'adresse, le jeton d'un lien
         * magique, le nouveau mot de passe d'une reinitialisation et son jeton, le
         * jeton d'attente, un code de second facteur, un code SMS, l'identite
         * complete de la recuperation par telephone, la session d'invite.
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
            // api-path: inspection — le jeton FCM est un identifiant d'appareil que
            // la passerelle route vers lui, il ne part dans aucun journal.
            "/users/register-device-token",
            // api-path: inspection — le texte d'une transcription d'appel est une
            // donnee sensible (la passerelle non plus ne le journalise jamais).
            "/transcript",
            // api-path: inspection, pas emission — preuve d'adresse et lien magique.
            "/auth/verify-email",
            "/auth/magic-link/validate",
            "/auth/verification/status",
            // api-path: inspection, pas emission — reinitialisation du mot de passe.
            "/auth/reset-password",
            "/auth/reset-password/verify-token",
            "/auth/forgot-password/phone/verify-identity",
            "/auth/forgot-password/phone/verify-code",
            // api-path: inspection, pas emission — second facteur, SMS, session d'invite.
            "/auth/2fa/verify",
            "/auth/verify-phone",
            "/auth/phone-transfer/verify",
            "/auth/phone-transfer/verify-registration",
            "/anonymous/refresh",
            // api-path: inspection, pas emission — un carnet d'adresses entier (noms,
            // numeros, e-mails) part dans ces corps et revient dans les reponses.
            "/directory/contacts",
            "/users/me/contacts/match",
            "/users/me/contacts/sync",
            "/contacts/resolve",
        )

        /**
         * Familles de routes dont NI la requete NI la reponse ne se journalisent :
         * le protocole Signal publie et lit des paquets de cles et etablit des
         * sessions chiffrees. Une famille se reconnait a un SEGMENT, pas a un
         * suffixe, parce que `/signal/keys/{userId}` porte un identifiant.
         */
        // api-path: inspection, pas emission — comme les chemins ci-dessus.
        internal val SENSITIVE_SEGMENTS = setOf("/signal/")

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
