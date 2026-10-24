package me.meeshy.sdk.model.socket

import me.meeshy.sdk.model.net.AppVersionHeader
import me.meeshy.sdk.model.net.ClientIdentity

/**
 * Ce que la poignée de main Socket.IO remet dans `handshake.auth` — miroir de
 * `ClientInfoProvider.socketAuthPayload` (iOS) et de `CLIENT_SESSION_AUTH_KEY`
 * (`packages/shared/utils/client-session.ts`).
 *
 * La passerelle branche sur les CLÉS : `sessionToken` SANS `token` désigne un invité.
 * Un compte inscrit déclare en plus l'appareil sous `client` ; un invité n'envoie que son jeton.
 */
public object SocketAuthPayload {
    public const val TOKEN: String = "token"
    public const val SESSION_TOKEN: String = "sessionToken"
    public const val CLIENT: String = "client"

    public fun registered(jwt: String, sessionToken: String?, client: ClientIdentity?): Map<String, Any> =
        buildMap {
            put(TOKEN, jwt)
            sessionToken?.let { put(SESSION_TOKEN, it) }
            client?.let { put(CLIENT, clientFields(it)) }
        }

    public fun guest(sessionToken: String): Map<String, Any> = mapOf(SESSION_TOKEN to sessionToken)

    public fun clientFields(identity: ClientIdentity): Map<String, String> = buildMap {
        put("appVersion", identity.appVersion)
        put("appBuild", identity.appBuild)
        put("platform", AppVersionHeader.PLATFORM_VALUE)
        put("deviceModel", identity.deviceName)
        put("osVersion", identity.osVersion)
        put("timezone", identity.timezone)
        identity.localeTag?.takeIf { it.isNotBlank() }?.let { put("deviceLocale", it) }
        put("deviceName", identity.deviceName)
    }

    public fun of(decision: SocketConnectDecision, client: ClientIdentity?): Map<String, Any>? = when (decision) {
        is SocketConnectDecision.ConnectRegistered -> registered(decision.jwt, decision.sessionToken, client)
        is SocketConnectDecision.ConnectGuest -> guest(decision.sessionToken)
        else -> null
    }
}
