package me.meeshy.sdk.model.account

/**
 * **Quand la base locale doit être purgée** (#5968).
 *
 * La règle est PURE parce que c'est la DÉCISION qui se teste : le défaut qu'elle
 * ferme est une course d'abonnement, invisible à toute garde de source. Un
 * `StateFlow` rejoue sa valeur courante à tout nouvel abonné ; l'état d'authentification
 * naît `false`, la restauration de la session est asynchrone, et un collecteur qui
 * purge sur « non authentifié » effaçait donc la base à chaque démarrage à froid,
 * session parfaitement valide.
 *
 * Elle prend DEUX signaux parce que la question a trois réponses :
 *
 * | `sessionResolved` | `isAuthenticated` | ce que cela veut dire | purge |
 * |---|---|---|---|
 * | `false` | `false` | personne n'a encore regardé | **non** |
 * | `true` | `true` | session valide restaurée | non |
 * | `true` | `false` | fin de session — en vol ou constatée au démarrage | **oui** |
 *
 * Le booléen d'authentification SEUL confond la première ligne et la troisième.
 *
 * Miroir Kotlin de iOS `SessionPurgeDecision`
 * (`apps/ios/Meeshy/Core/SessionPurgeDecision.swift`).
 */
object SessionPurgeDecision {

    /**
     * `true` seulement quand la session a été RÉSOLUE et qu'il n'y en a pas.
     *
     * Fail-closed dans le sens qui compte : tant qu'on ne SAIT pas, on ne détruit
     * rien. Purger dans le doute coûte des données que l'utilisateur a écrites ;
     * attendre ne coûte qu'un tour de boucle.
     */
    fun shouldPurgeLocalMessages(sessionResolved: Boolean, isAuthenticated: Boolean): Boolean =
        sessionResolved && !isAuthenticated
}

/**
 * **Quelle base locale la session lit** (#8656) — la même table de vérité que la
 * purge, lue dans l'autre sens :
 *
 * | `sessionResolved` | `isAuthenticated` | base |
 * |---|---|---|
 * | `false` | `false` | [Unchanged] — personne n'a encore regardé : la base ouverte au démarrage (celle du compte mémorisé) reste servie, cache-first |
 * | indifférent | `true` | celle du compte ACTIF ([Account], ou [Nobody] si aucun compte n'est nommable) |
 * | `true` | `false` | celle de personne ([Nobody]) |
 *
 * L'authentification peut passer à `true` AVANT la résolution au démarrage à froid :
 * la base d'un compte restauré se sert sans attendre.
 *
 * Miroir Kotlin de iOS `MessageStoreTarget`.
 */
sealed interface LocalStoreTarget {

    data object Unchanged : LocalStoreTarget

    data object Nobody : LocalStoreTarget

    data class Account(val key: AccountStorageKey) : LocalStoreTarget

    companion object {
        fun resolve(
            sessionResolved: Boolean,
            isAuthenticated: Boolean,
            activeKey: AccountStorageKey?,
        ): LocalStoreTarget = when {
            isAuthenticated -> activeKey?.let(::Account) ?: Nobody
            sessionResolved -> Nobody
            else -> Unchanged
        }
    }
}
