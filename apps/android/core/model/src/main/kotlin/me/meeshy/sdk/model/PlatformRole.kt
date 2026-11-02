package me.meeshy.sdk.model

import java.util.Locale

/**
 * Le RÔLE DE PLATEFORME d'un utilisateur (`User.role`) — miroir de `GlobalUserRole` et de
 * `GLOBAL_ROLE_HIERARCHY` (`packages/shared/types/role-types.ts`) et de `PlatformRole.swift`.
 * BIGBOSS > ADMIN > MODERATOR > AUDIT > ANALYST > USER > AGENT.
 *
 * Deux LECTURES, comme la loi des actions (#11205) qui en fait foi :
 * - [exact] compare EXACTEMENT : c'est ainsi que la passerelle décide qui MODÈRE
 *   (`PRIVILEGED_GLOBAL_ROLES`), donc un « moderator » en minuscules ne modère pas ;
 * - [caseFolding] plie la casse : c'est ainsi que `isGlobalAdmin` et `globalRoleLevel`
 *   décident qui ADMINISTRE et à quel niveau.
 *
 * FERMÉ PAR DÉFAUT : un rôle inconnu n'est aucun cas (`null`) et vaut [MINIMUM_LEVEL]. AUDIT
 * et ANALYST lisent ; ils n'ont aucun privilège d'ACTION — pour la loi des actions, ils valent USER.
 */
enum class PlatformRole(val wireValue: String, val level: Int) {
    BIGBOSS("BIGBOSS", 100),
    ADMIN("ADMIN", 80),
    MODERATOR("MODERATOR", 60),
    AUDIT("AUDIT", 40),
    ANALYST("ANALYST", 30),
    USER("USER", 10),
    AGENT("AGENT", 5),
    ;

    /** Modère le contenu : modifier le message d'autrui, retirer, écrire là où le rang manque. */
    val moderatesContent: Boolean get() = this == MODERATOR || administers

    /** Administre la plateforme : vaut le créateur dans une conversation dont il est membre (`isGlobalAdmin`). */
    val administers: Boolean get() = this == ADMIN || this == BIGBOSS

    companion object {
        /** Le niveau d'un rôle illisible : sous [AGENT], le plus bas des rôles connus. */
        const val MINIMUM_LEVEL: Int = 0

        /** Lecture EXACTE, en majuscules comme `User.role`. */
        fun exact(raw: String?): PlatformRole? {
            if (raw == null) return null
            return entries.firstOrNull { it.wireValue == raw }
        }

        /** Lecture sans casse, celle de `isGlobalAdmin` et de `globalRoleLevel`. */
        fun caseFolding(raw: String?): PlatformRole? = exact(raw?.uppercase(Locale.ROOT))

        /** `globalRoleLevel` : la casse pliée, un rôle inconnu au niveau minimal. */
        fun levelOf(raw: String?): Int = caseFolding(raw)?.level ?: MINIMUM_LEVEL
    }
}
