package me.meeshy.sdk.model

/** Permission de communauté — port de `CommunityPermission` (CommunityModels.swift). */
enum class CommunityPermission {
    INVITE_MEMBERS,
    REMOVE_MEMBERS,
    EDIT_COMMUNITY,
    DELETE_COMMUNITY,
    MODERATE_CONTENT,
    MANAGE_ROLES,
    CREATE_CONVERSATIONS,
    EDIT_CONVERSATIONS,
}

/** Matrice rôle -> permissions, identique à iOS `CommunityPermissions.forRole`. */
object CommunityPermissions {
    fun forRole(role: MemberRole): Set<CommunityPermission> = when (role) {
        MemberRole.CREATOR, MemberRole.ADMIN -> CommunityPermission.entries.toSet()
        MemberRole.MODERATOR -> setOf(
            CommunityPermission.INVITE_MEMBERS,
            CommunityPermission.REMOVE_MEMBERS,
            CommunityPermission.MODERATE_CONTENT,
            CommunityPermission.CREATE_CONVERSATIONS,
            CommunityPermission.EDIT_CONVERSATIONS,
        )
        MemberRole.MEMBER -> setOf(CommunityPermission.CREATE_CONVERSATIONS)
    }

    fun has(role: MemberRole, permission: CommunityPermission): Boolean = permission in forRole(role)
}
