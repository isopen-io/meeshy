package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.AttachmentMessageType

/** Les trois familles de messages qu'un envoi de pièces produit (iOS `MultiAttachmentSendPlanner.Kind`). */
public enum class AttachmentGroupKind { AUDIO, VISUAL, TEXT }

/** Une pièce prête à partir, vue par le planificateur : son identifiant local et son type MIME. */
public data class PlannableAttachment(val id: String, val mimeType: String?)

/**
 * Un message du plan : [attachmentIds] dans l'ordre du composeur, [text] en légende, et [carriesReply] quand la citation
 * voyage avec lui.
 */
public data class PlannedMessage(
    val kind: AttachmentGroupKind,
    val attachmentIds: List<String>,
    val text: String?,
    val carriesReply: Boolean,
) {
    val messageContent: String get() = text.orEmpty()

    val isAudio: Boolean get() = kind == AttachmentGroupKind.AUDIO
}

/**
 * Découpe les pièces du composeur et son texte en messages (iOS `MultiAttachmentSendPlanner`, spec 2026-05-30 lot A2) :
 * - les pièces se rangent en deux familles, AUDIO et VISUAL (image, vidéo, fichier) ; un message par famille non vide, dans
 *   l'ordre de première apparition ;
 * - le texte est la légende du groupe VISUAL ; sans groupe visuel (audio seul, ou aucune pièce) il reste un message à lui,
 *   envoyé EN DERNIER ;
 * - la citation ne voyage que sur le PREMIER message du plan.
 */
public object AttachmentSendPlanner {

    public fun plan(attachments: List<PlannableAttachment>, text: String, hasReply: Boolean): List<PlannedMessage> {
        val buckets = attachments.groupBy { bucketOf(it.mimeType) }
        val caption = text.trim().takeIf { it.isNotEmpty() }
        val captionRidesVisual = caption != null && buckets.containsKey(AttachmentGroupKind.VISUAL)
        val planned = buckets.map { (kind, members) ->
            PlannedMessage(
                kind = kind,
                attachmentIds = members.map { it.id },
                text = if (kind == AttachmentGroupKind.VISUAL) caption else null,
                carriesReply = false,
            )
        }.toMutableList()
        if (caption != null && !captionRidesVisual) {
            planned += PlannedMessage(AttachmentGroupKind.TEXT, emptyList(), caption, carriesReply = false)
        }
        if (hasReply && planned.isNotEmpty()) planned[0] = planned[0].copy(carriesReply = true)
        return planned
    }

    internal fun bucketOf(mimeType: String?): AttachmentGroupKind =
        if (AttachmentMessageType.forMime(mimeType) == AttachmentMessageType.AUDIO) AttachmentGroupKind.AUDIO else AttachmentGroupKind.VISUAL
}

/** Un groupe média du plan, apparié à la bulle optimiste (`cid_`) qui le porte (iOS `OutgoingMediaGroup`). */
public data class OutgoingMediaGroup(val group: PlannedMessage, val tempId: String)

/**
 * Ce qu'UN tap sur Envoyer a décidé, figé (iOS `AttachmentSendBatch`) : les groupes média, dans l'ordre du composeur, chacun
 * avec sa bulle ; puis, EN DERNIER, le message texte (ou le lieu, seul quand il n'y a pas de texte), posé lui aussi dès le
 * tap sous [textTempId].
 */
public data class AttachmentSendBatch(
    val plan: List<PlannedMessage>,
    val mediaGroups: List<OutgoingMediaGroup>,
    val textGroup: PlannedMessage?,
    val textTempId: String?,
    val hasPlace: Boolean,
) {
    /** Le message de fin existe : un texte sans groupe visuel, ou un lieu. */
    val hasTrailing: Boolean get() = textGroup != null || hasPlace

    /** Les identifiants de pièces dont le fichier de travail se supprime tout de suite (visuels) ou après [VOICE_RETENTION_MS] (vocaux). */
    public fun cleanupIds(): Cleanup = Cleanup(
        audio = idsOf(AttachmentGroupKind.AUDIO),
        visual = idsOf(AttachmentGroupKind.VISUAL),
    )

    private fun idsOf(kind: AttachmentGroupKind): List<String> = plan.filter { it.kind == kind }.flatMap { it.attachmentIds }

    public data class Cleanup(val audio: List<String>, val visual: List<String>)

    public companion object {
        /** Un vocal garde son fichier 10 s après l'envoi : la bulle porte l'URL `file://` jusqu'à l'écho, et la lecture lit le disque. */
        public const val VOICE_RETENTION_MS: Long = 10_000L

        /**
         * Construit le lot d'un tap. [availableIds] : les pièces dont le fichier existe encore ; un groupe sans fichier est
         * exclu des DEUX phases (la bulle et l'envoi), jamais seulement de l'une, pour que les `tempId` ne se désynchronisent pas.
         */
        public fun of(
            attachments: List<PlannableAttachment>,
            text: String,
            hasReply: Boolean,
            hasPlace: Boolean,
            availableIds: Set<String>? = null,
            newTempId: () -> String,
        ): AttachmentSendBatch {
            val usable = attachments.filter { availableIds == null || it.id in availableIds }
            val plan = AttachmentSendPlanner.plan(usable, text, hasReply)
            val textGroup = plan.firstOrNull { it.kind == AttachmentGroupKind.TEXT }
            return AttachmentSendBatch(
                plan = plan,
                mediaGroups = plan.filter { it.kind != AttachmentGroupKind.TEXT }.map { OutgoingMediaGroup(it, newTempId()) },
                textGroup = textGroup,
                textTempId = textTempId(textGroup, hasPlace, newTempId),
                hasPlace = hasPlace,
            )
        }

        /** La bulle du texte est posée dès le tap : le texte seul, ou un lieu sans groupe texte. */
        public fun textTempId(textGroup: PlannedMessage?, hasPlace: Boolean, generate: () -> String): String? {
            val hasText = !textGroup?.text.isNullOrBlank()
            return if (hasText || (textGroup == null && hasPlace)) generate() else null
        }
    }
}
