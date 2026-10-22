package me.meeshy.sdk.net

import okhttp3.Request
import retrofit2.Invocation

/**
 * Marque une interface ou une méthode Retrofit dont les appels ne doivent JAMAIS
 * être rejoués — par aucune couche de réessai, ni du transport ni de l'application.
 *
 * Retrofit attache la méthode appelée à la requête ([Invocation]) : une couche de
 * réessai lit la marque avec [isNeverRetried] au lieu de tenir une liste de
 * chemins qui se périme au premier ajout. La marque voyage avec la déclaration
 * qu'elle protège, et se lit là où l'on décide de rejouer.
 */
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class NeverRetried

/**
 * Vrai quand la requête vient d'une méthode (ou d'une interface) [NeverRetried].
 * Une requête qui ne vient pas de Retrofit — le rafraîchissement du jeton, par
 * exemple — n'est pas marquée.
 */
fun Request.isNeverRetried(): Boolean {
    val method = tag(Invocation::class.java)?.method() ?: return false
    return method.isAnnotationPresent(NeverRetried::class.java) ||
        method.declaringClass.isAnnotationPresent(NeverRetried::class.java)
}
