package me.meeshy.sdk.model.profile

/** La relation d'amitié du lecteur avec la personne (miroir de `ConnectionStatus`). */
sealed class ProfileConnection {
    data object None : ProfileConnection()
    data class PendingSent(val requestId: String) : ProfileConnection()
    data class PendingReceived(val requestId: String) : ProfileConnection()
    data object Connected : ProfileConnection()
}

enum class ProfileLayout { NORMAL, BLOCKED_BY_ME, CLOSED }

enum class ProfileConnectionAction { REQUEST, CANCEL, RESEND, ACCEPT, DECLINE }

enum class ProfileContextBanner { RECEIVED, SENT }

data class ProfileActionPlan(
    val layout: ProfileLayout,
    val showsTabs: Boolean,
    val connectionActions: List<ProfileConnectionAction>,
    val contextBanner: ProfileContextBanner?,
    val showsConnectedBanner: Boolean,
    val offersCall: Boolean,
    val interactionsEnabled: Boolean,
    val canMessage: Boolean,
    val canBlock: Boolean,
    val canUnblock: Boolean,
    val canReport: Boolean,
) {
    companion object {
        private val CLOSED = ProfileActionPlan(
            layout = ProfileLayout.CLOSED, showsTabs = false, connectionActions = emptyList(),
            contextBanner = null, showsConnectedBanner = false, offersCall = false,
            interactionsEnabled = false, canMessage = false, canBlock = false,
            canUnblock = false, canReport = false,
        )

        fun of(
            isSelf: Boolean,
            isAnonymous: Boolean,
            connection: ProfileConnection,
            isBlockedByMe: Boolean,
            isBlockedByTarget: Boolean,
            callsAvailable: Boolean,
        ): ProfileActionPlan {
            if (isBlockedByTarget) return CLOSED
            if (isBlockedByMe) {
                return CLOSED.copy(layout = ProfileLayout.BLOCKED_BY_ME, canUnblock = true)
            }
            if (isSelf) {
                return CLOSED.copy(layout = ProfileLayout.NORMAL, showsTabs = true)
            }
            val relation = !isAnonymous
            return ProfileActionPlan(
                layout = ProfileLayout.NORMAL,
                showsTabs = true,
                connectionActions = if (relation) actionsFor(connection) else emptyList(),
                contextBanner = if (relation) bannerFor(connection) else null,
                showsConnectedBanner = relation && connection == ProfileConnection.Connected,
                offersCall = callsAvailable && !isAnonymous,
                interactionsEnabled = true,
                canMessage = true,
                canBlock = !isAnonymous,
                canUnblock = false,
                canReport = true,
            )
        }

        private fun actionsFor(connection: ProfileConnection): List<ProfileConnectionAction> = when (connection) {
            ProfileConnection.None -> listOf(ProfileConnectionAction.REQUEST)
            is ProfileConnection.PendingSent -> listOf(ProfileConnectionAction.CANCEL, ProfileConnectionAction.RESEND)
            is ProfileConnection.PendingReceived -> listOf(ProfileConnectionAction.ACCEPT, ProfileConnectionAction.DECLINE)
            ProfileConnection.Connected -> emptyList()
        }

        private fun bannerFor(connection: ProfileConnection): ProfileContextBanner? = when (connection) {
            is ProfileConnection.PendingReceived -> ProfileContextBanner.RECEIVED
            is ProfileConnection.PendingSent -> ProfileContextBanner.SENT
            else -> null
        }
    }
}
