package me.meeshy.sdk.model

/**
 * Ce qui demande la liste « Mes liens » : la venue à l'écran se contente d'un cache
 * frais ; un geste de l'utilisateur (tirer, retour de création) exige la vérité du
 * serveur. Miroir de `ShareLinksReloadTrigger` (iOS `ShareLinksView.swift`).
 */
public enum class ShareLinksReloadTrigger { Appear, PullToRefresh, LinkCreated }

/**
 * #9195 — un cache frais ne dispense du réseau qu'à l'affichage ; une liste qui n'a pas
 * pu être relue reste celle qu'on montrait. Miroir de `ShareLinksReloadLaw` (iOS).
 */
public object ShareLinksReloadLaw {
    public fun mustFetch(trigger: ShareLinksReloadTrigger, cacheIsFresh: Boolean): Boolean =
        trigger != ShareLinksReloadTrigger.Appear || !cacheIsFresh

    public fun linksAfterFetch(current: List<MyShareLink>, fetched: List<MyShareLink>?): List<MyShareLink> =
        fetched ?: current
}
