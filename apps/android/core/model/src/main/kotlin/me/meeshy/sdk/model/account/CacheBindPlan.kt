package me.meeshy.sdk.model.account

/**
 * Une étape de la liaison du cache au compte actif (#8674). Pure donnée : c'est
 * l'exécuteur qui touche aux fichiers et au marqueur [LiveOwner].
 */
sealed interface CacheBindAction {

    /**
     * Met de côté le contenu du cache vivant, sous l'empreinte de [account]. Quand
     * la mise de côté échoue, le compte quitté ne garde rien : l'exécuteur applique
     * [onFailure].
     */
    data class ArchiveLive(val account: AccountStorageKey) : CacheBindAction {
        val onFailure: CacheBindAction get() = DiscardArchive(account)
    }

    /** Efface le cache mis de côté de [account] (déconnecté ou retiré de l'appareil). */
    data class DiscardArchive(val account: AccountStorageKey) : CacheBindAction

    /** Grave « bascule en cours » : à partir d'ici, le contenu n'appartient à personne. */
    data object MarkInterrupted : CacheBindAction

    /** Vide le cache vivant. */
    data object WipeLive : CacheBindAction

    /** Grave « personne » : le cache vivant est vide et le restera. */
    data object MarkNobody : CacheBindAction

    /**
     * Rend le cache mis de côté de [account] dans le cache vivant. Une restauration
     * qui échoue laisse un cache vide ; l'étape suivante ([MarkOwner]) reste due.
     */
    data class RestoreArchive(val account: AccountStorageKey) : CacheBindAction

    /** Grave [account] comme propriétaire du cache vivant. */
    data class MarkOwner(val account: AccountStorageKey) : CacheBindAction

    /**
     * Attribue à [account] un cache d'avant la loi, SANS le vider : le contenu n'est
     * pas rechargé.
     */
    data class ClaimUnrecorded(val account: AccountStorageKey) : CacheBindAction
}

/**
 * **La suite ordonnée d'actions qui lie le cache au compte actif** (#8674).
 *
 * Le cache n'appartient jamais qu'à UN compte : le compte quitté garde le sien s'il
 * reste gardé sur l'appareil (mis de côté sous son empreinte), l'efface sinon ;
 * le cache vivant est vidé AVANT que celui du compte arrivé n'y soit rendu ; et le
 * marqueur passe par [LiveOwner.Interrupted] pendant toute la bascule — un processus
 * tué au milieu repart d'un cache effacé, jamais d'un mélange. Le marqueur ne dit
 * « personne » ([CacheBindAction.MarkNobody]) que lorsque le cache est vide et qu'aucun
 * compte n'est attendu ; il ne nomme un compte ([CacheBindAction.MarkOwner]) qu'une fois
 * son contenu en place.
 *
 * Une liaison déjà faite ne fait rien ([isNoOp]) : demander deux fois le même compte
 * est sans effet, ce qui permet de la demander partout où une session commence ou
 * finit sans compter qui l'a déjà faite.
 *
 * Miroir Kotlin de iOS `CacheCoordinator.bindAccount`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator+Accounts.swift`).
 * Une seule divergence, de sûreté : iOS grave « personne » entre le vidage et la
 * restauration, ce qui laisse un cache à moitié restauré lisible par le compte
 * suivant si le processus est tué à cet instant ; ici le marqueur reste
 * « interrompu » jusqu'à ce que le compte arrivé soit nommé.
 */
class CacheBindPlan private constructor(
    /** Les étapes, dans l'ordre où elles s'exécutent. Vide quand la liaison est déjà faite. */
    val actions: List<CacheBindAction>,
    /**
     * `false` quand le cache vivant appartenait déjà au compte demandé, ou quand un
     * cache d'avant la loi vient d'être attribué : rien n'a changé de mains, et les
     * points de reprise de la synchronisation restent où ils sont.
     */
    val ownerChanged: Boolean,
) {

    /** `true` quand il n'y a rien à faire. */
    val isNoOp: Boolean get() = actions.isEmpty()

    companion object {

        private val AlreadyBound = CacheBindPlan(actions = emptyList(), ownerChanged = false)

        /**
         * @param liveOwner à qui appartient le cache vivant, tel que gravé.
         * @param incoming le compte à lier ; `null` pour « personne » (déconnexion,
         *   écran de connexion).
         * @param preserved les comptes dont la session reste gardée sur l'appareil —
         *   seuls ceux-là voient leur cache mis de côté quand ils sont quittés.
         * @param archives les comptes dont un cache est déjà mis de côté sur l'appareil.
         */
        fun of(
            liveOwner: LiveOwner,
            incoming: AccountStorageKey?,
            preserved: Set<AccountStorageKey>,
            archives: Set<AccountStorageKey>,
        ): CacheBindPlan {
            if (incoming != null && liveOwner == LiveOwner.Account(incoming)) return AlreadyBound
            if (incoming == null && liveOwner == LiveOwner.Nobody) return AlreadyBound
            if (incoming != null && liveOwner == LiveOwner.Unrecorded) {
                return CacheBindPlan(listOf(CacheBindAction.ClaimUnrecorded(incoming)), ownerChanged = false)
            }

            val leaving = (liveOwner as? LiveOwner.Account)?.key
            val incomingArchive = incoming?.takeIf { it in archives }
            val mustWipe = liveOwner != LiveOwner.Nobody || incomingArchive != null

            val actions = buildList {
                if (leaving != null) add(leavingAction(leaving, kept = leaving in preserved))
                if (mustWipe) {
                    add(CacheBindAction.MarkInterrupted)
                    add(CacheBindAction.WipeLive)
                }
                if (incomingArchive != null) add(CacheBindAction.RestoreArchive(incomingArchive))
                add(if (incoming != null) CacheBindAction.MarkOwner(incoming) else CacheBindAction.MarkNobody)
            }
            return CacheBindPlan(actions, ownerChanged = true)
        }

        private fun leavingAction(leaving: AccountStorageKey, kept: Boolean): CacheBindAction =
            if (kept) CacheBindAction.ArchiveLive(leaving) else CacheBindAction.DiscardArchive(leaving)
    }
}
