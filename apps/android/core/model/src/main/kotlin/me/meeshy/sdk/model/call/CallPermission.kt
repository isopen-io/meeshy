package me.meeshy.sdk.model.call

import java.util.Locale

/**
 * QUI PEUT LANCER UN APPEL — miroir de `canStartCall`
 * (`packages/shared/utils/call-permission.ts`, #10207) et de
 * `CallPermission.swift`. Fail-closed : un type inconnu (`broadcast`…) n'ouvre
 * aucun appel. Les rôles se comparent sans tenir compte de la casse.
 */
object CallPermission {

    data class Context(
        val conversationType: String,
        val viewerIsCreator: Boolean,
        val viewerConversationRole: String?,
        val viewerPlatformRole: String? = null,
        val viewerIsGuest: Boolean = false,
    )

    private val openCallTypes = setOf("direct", "group")
    private val publicCallConversationRoles = setOf("creator", "admin")
    private val publicCallPlatformRoles = setOf("ADMIN", "BIGBOSS")

    fun canStartCall(context: Context): Boolean {
        if (context.viewerIsGuest) return false
        val type = context.conversationType.lowercase(Locale.ROOT)
        if (type == "global") return false
        if (type == "public") return holdsPublicCallRight(context)
        return type in openCallTypes
    }

    private fun holdsPublicCallRight(context: Context): Boolean {
        if (context.viewerIsCreator) return true
        if ((context.viewerConversationRole ?: "").lowercase(Locale.ROOT) in publicCallConversationRoles) return true
        return (context.viewerPlatformRole ?: "").uppercase(Locale.ROOT) in publicCallPlatformRoles
    }
}
