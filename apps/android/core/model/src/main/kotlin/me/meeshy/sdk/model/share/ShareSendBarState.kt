package me.meeshy.sdk.model.share

/**
 * **Ce que la barre Envoyer dit et permet** (zone 4, iOS `ShareSendBar`) — pur : bannières dans l'ordre
 * (hors ligne, sortie du chiffrement, trop lourd, trop de destinataires), légende et « Ensemble /
 * Séparément » selon le plan, bouton qui compte les destinataires. Une fois quelque chose parti, la barre
 * ne garde que ce qui se lit : plus de légende, de choix ni de bouton.
 */
data class ShareSendBarState(
    val banners: List<Banner>,
    val showsCaption: Boolean,
    val showsGrouping: Boolean,
    val button: Button?,
) {
    sealed interface Banner {
        data object Offline : Banner

        /** Les destinations NON chiffrées d'une source chiffrée, nommées (V8). */
        data class EncryptionExit(val names: List<String>) : Banner

        data class TooHeavy(val files: Int, val bytes: Long) : Banner

        data object TooManyRecipients : Banner
    }

    sealed interface ButtonLabel {
        data class Send(val count: Int) : ButtonLabel

        data class Forward(val count: Int) : ButtonLabel

        data class TrimLast(val count: Int) : ButtonLabel
    }

    data class Button(val label: ButtonLabel, val recipientCount: Int, val enabled: Boolean)

    companion object {
        const val SEND_TEST_ID: String = "share.sheet.send"

        fun of(plan: SharePlan, selection: List<ShareRecipient>, hasSent: Boolean, online: Boolean): ShareSendBarState {
            val limits = plan.limits
            val banners = buildList {
                if (!online) add(Banner.Offline)
                encryptionExit(plan, selection, hasSent)?.let(::add)
                if (limits.trimCount > 0) add(Banner.TooHeavy(files = limits.files, bytes = limits.bytes))
                if (limits.overRecipients > 0) add(Banner.TooManyRecipients)
            }
            return ShareSendBarState(
                banners = banners,
                showsCaption = plan.caption != null && !hasSent,
                showsGrouping = plan.grouping != null && !hasSent,
                button = if (hasSent) null else Button(label(plan), limits.recipients, plan.canSend),
            )
        }

        private fun encryptionExit(plan: SharePlan, selection: List<ShareRecipient>, hasSent: Boolean): Banner.EncryptionExit? {
            val encryption = plan.encryption ?: return null
            if (hasSent || encryption.warnDestinationIds.isEmpty()) return null
            val names = selection.filter { it.id in encryption.warnDestinationIds }.map { it.title }
            return names.takeIf { it.isNotEmpty() }?.let(Banner::EncryptionExit)
        }

        private fun label(plan: SharePlan): ButtonLabel = when {
            plan.limits.trimCount > 0 -> ButtonLabel.TrimLast(plan.limits.trimCount)
            plan.title == ShareTitle.FORWARD -> ButtonLabel.Forward(plan.limits.recipients)
            else -> ButtonLabel.Send(plan.limits.recipients)
        }
    }
}
