package me.meeshy.sdk.model.call

import java.util.Locale

/**
 * L'ENTRÉE D'APPEL de l'en-tête d'une conversation — miroir de `HeaderCallEntry`
 * (`apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift`). La règle
 * « qui peut lancer » reste [CallPermission] ; ce type n'y ajoute que la FORME de
 * l'appel : un pair pour un direct, la conversation pour un groupe ou une public.
 *
 * `null` : aucun bouton d'appel — invité sans compte, conversation `global`, type que
 * l'app n'appelle pas, ou direct dont le pair n'est pas connu. Une `public` dont le
 * lecteur n'est ni créateur ni administrateur garde l'entrée avec [canStart] `false` :
 * il ne lance rien, mais rejoint l'appel déjà en cours.
 */
data class HeaderCallEntry(
    val callee: Callee,
    val canStart: Boolean,
) {
    sealed interface Callee {
        data class Peer(val userId: String) : Callee
        data object Conversation : Callee
    }

    companion object {
        fun resolve(
            conversationId: String,
            conversationType: String,
            viewerConversationRole: String?,
            viewerPlatformRole: String?,
            viewerIsGuest: Boolean,
            directPeerUserId: String?,
        ): HeaderCallEntry? {
            val type = conversationType.lowercase(Locale.ROOT)
            if (viewerIsGuest || type == GLOBAL) return null
            val canStart = CallPermission.canStartCall(
                CallPermission.Context(
                    conversationType = type,
                    viewerIsCreator = viewerConversationRole?.lowercase(Locale.ROOT) == CREATOR,
                    viewerConversationRole = viewerConversationRole,
                    viewerPlatformRole = viewerPlatformRole,
                    viewerIsGuest = viewerIsGuest,
                ),
            )
            return when (type) {
                DIRECT -> directPeerUserId?.takeIf { it.isNotBlank() }
                    ?.let { HeaderCallEntry(Callee.Peer(it), canStart) }
                GROUP, PUBLIC -> conversationId.takeIf { it.isNotBlank() }
                    ?.let { HeaderCallEntry(Callee.Conversation, canStart) }
                else -> null
            }
        }

        private const val GLOBAL = "global"
        private const val DIRECT = "direct"
        private const val GROUP = "group"
        private const val PUBLIC = "public"
        private const val CREATOR = "creator"
    }
}
