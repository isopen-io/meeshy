package me.meeshy.sdk.model.navigation

/**
 * La règle de pile d'iOS (`Router.place`, `Route.isHub`) : un HUB (réglages, contacts, communautés, liens,
 * notifications, découverte) ne s'empile jamais deux fois. Renaviguer vers un hub déjà dans la pile DÉPILE jusqu'à lui
 * au lieu d'en poser un second ; une route égale à la courante est ignorée ; et on ne dépile jamais la racine.
 *
 * Pure : elle lit la pile en routes RÉSOLUES (arguments compris), le routeur de [:app] applique la décision.
 */
public class NavigationHubRule(hubs: Set<String>) {

    private val hubBases: Set<String> = hubs.map(::base).toSet()

    public sealed interface Decision {
        /** La route visée est déjà celle de l'écran : rien ne bouge. */
        public data object Ignore : Decision

        /** La route s'empile. */
        public data object Push : Decision

        /** Le hub est déjà dans la pile, à [index] (0 = racine) : on dépile jusqu'à lui. */
        public data class PopTo(val index: Int) : Decision
    }

    /** Vrai pour un hub : la route sans sa requête (`links?create=1` est le hub `links`). */
    public fun isHub(route: String?): Boolean = route != null && base(route) in hubBases

    public fun decide(stack: List<String>, target: String): Decision {
        if (stack.lastOrNull() == target) return Decision.Ignore
        if (!isHub(target)) return Decision.Push
        val existing = stack.indexOfLast { base(it) == base(target) }
        return if (existing >= 0) Decision.PopTo(existing) else Decision.Push
    }

    /** Un retour n'a de sens que s'il reste une page dessous : jamais de pop à la racine. */
    public fun canPop(stack: List<String>): Boolean = stack.size > 1

    private companion object {
        fun base(route: String): String = route.substringBefore('?')
    }
}
