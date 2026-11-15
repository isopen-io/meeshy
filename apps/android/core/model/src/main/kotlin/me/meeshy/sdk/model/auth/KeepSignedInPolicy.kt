package me.meeshy.sdk.model.auth

/**
 * « Rester connecté sur cet appareil » (#8286) — miroir de `LoginView.keepsNewSession` et
 * `AuthManager.offersKeepSignedIn` (iOS).
 *
 * Le PREMIER compte de l'appareil est gardé sans question ; la case n'est proposée que lorsqu'un AUTRE
 * compte garde déjà une session endormie. Le choix part au serveur (`rememberDevice`, 365 jours plutôt
 * qu'un jour) et reste attaché au compte ([SavedAccount.keepsSession]).
 */
object KeepSignedInPolicy {

    /** La case est-elle proposée ? Seulement quand un autre compte garde une session. */
    fun offers(accounts: List<SavedAccount>, activeId: String?, accountsWithTokens: Set<String>): Boolean =
        AccountSessionBook.of(accounts, activeId).offersKeepSignedIn(accountsWithTokens)

    /** Ce que la nouvelle session garde : la case quand elle est proposée, sinon toujours « oui ». */
    fun keepsNewSession(offered: Boolean, toggle: Boolean): Boolean = if (offered) toggle else true
}
