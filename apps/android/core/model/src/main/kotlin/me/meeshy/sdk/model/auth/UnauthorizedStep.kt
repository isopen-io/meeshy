package me.meeshy.sdk.model.auth

import me.meeshy.sdk.model.net.EndpointAuthKind

/**
 * Les trois issues d'un 401, miroir d'`UnauthorizedStep` (iOS `APIRequestPipeline.swift`).
 *
 * Un 401 se lit sur DEUX faits : la requête présentait-elle un jeton de compte, et la
 * route en attend-elle un. Sans jeton présenté, il n'y a aucune session à renouveler —
 * surtout pas celle du compte actif au moment de la réponse.
 */
public enum class UnauthorizedStep {
    /** Aucun jeton de compte présenté : session expirée, rien à renouveler. */
    SESSION_EXPIRED,

    /** Un jeton présenté sur une route qui ne renouvelle pas : la session se termine. */
    EXPIRE_SESSION,

    /** Un jeton présenté sur une route bearer : un renouvellement, puis UN rejeu. */
    REFRESH_AND_REPLAY,
    ;

    public companion object {
        public fun decide(presentsBearer: Boolean, authKind: EndpointAuthKind): UnauthorizedStep {
            if (!presentsBearer) return SESSION_EXPIRED
            return if (authKind == EndpointAuthKind.BEARER) REFRESH_AND_REPLAY else EXPIRE_SESSION
        }
    }
}
