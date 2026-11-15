package me.meeshy.sdk.socket

/**
 * Un branchement sur la socket temps reel, contribue en `@IntoSet` par le lot qui
 * possede un flux (un gestionnaire d'evenements, un applicateur de cache...).
 *
 * [RealtimeSessionCoordinator] appelle [attach] une fois la session authentifiee et la
 * socket ouverte, et [detach] a la deconnexion, AVANT la fermeture de la socket. Une
 * exception d'un branchement est isolee : elle n'empeche ni les autres ni la session.
 */
public interface RealtimeBinding {
    public fun attach()

    public fun detach() {}
}
