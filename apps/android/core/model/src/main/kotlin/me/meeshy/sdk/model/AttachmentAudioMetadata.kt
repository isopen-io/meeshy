package me.meeshy.sdk.model

/**
 * La règle unique de ce qu'une pièce audio sait d'elle-même — sa transcription et ses pistes parlées traduites — quand
 * trois sources se la disputent : la page REST, la trame socket et ce que l'appareil a déjà (miroir de
 * `AttachmentAudioMetadata`, iOS). Une loi pure sur les types servis : Room reste l'unique magasin, il n'y a pas
 * de second état en mémoire.
 *
 * - [mergedAttachment] : `forceOverwrite` (une page REST) = le serveur a raison ; sinon, le premier arrivé gagne. Une
 *   source qui ne dit rien ne retire JAMAIS ce que l'autre a dit.
 * - [supersededTranscriptions] / [supersededAudio] : ce qu'une page a re-servi, donc ce que la ligne retenue (socket)
 *   a de plus ancien — l'équivalent, pour les lignes dédiées, du `forceOverwrite` REST.
 * - [rekeyedTranscriptions] / [rekeyedAudio] : à l'accusé d'un envoi, ce que l'id LOCAL a retenu passe sous l'id
 *   serveur, sans écraser ce que le serveur a déjà fait arriver, et sans rien réécrire au second passage.
 */
object AttachmentAudioMetadata {

    fun mergedAttachment(
        cached: ApiMessageAttachment,
        served: ApiMessageAttachment,
        forceOverwrite: Boolean,
    ): ApiMessageAttachment = served.copy(
        transcription = mergedTranscription(cached.transcription, served.transcription, forceOverwrite),
        translations = mergedTracks(cached.translations, served.translations, forceOverwrite),
    )

    private fun mergedTranscription(
        cached: ApiAttachmentTranscription?,
        served: ApiAttachmentTranscription?,
        forceOverwrite: Boolean,
    ): ApiAttachmentTranscription? {
        val servedSays = served?.readableText() != null
        val cachedSays = cached?.readableText() != null
        return when {
            !servedSays -> cached ?: served
            !cachedSays -> served
            forceOverwrite -> served
            else -> cached
        }
    }

    private fun mergedTracks(
        cached: Map<String, ApiAttachmentTranslation>?,
        served: Map<String, ApiAttachmentTranslation>?,
        forceOverwrite: Boolean,
    ): Map<String, ApiAttachmentTranslation>? {
        if (served == null) return cached
        if (cached.isNullOrEmpty()) return served
        val merged = LinkedHashMap(cached)
        served.forEach { (language, track) ->
            val key = merged.keys.firstOrNull { it.equals(language, ignoreCase = true) }
            val held = key?.let { merged[it] }
            val playable = !track.url.isNullOrBlank()
            val heldPlayable = !held?.url.isNullOrBlank()
            when {
                key == null -> merged[language] = track
                forceOverwrite && (playable || !heldPlayable) -> merged[key] = track
                !heldPlayable && playable -> merged[key] = track
            }
        }
        return merged
    }

    /** Les ids des pièces de [after] dont la transcription SERVIE n'est pas celle que [before] portait. */
    fun supersededTranscriptions(before: ApiMessage, after: ApiMessage): Set<String> {
        val held = before.attachments.associate { it.id to it.transcription?.readableText() }
        return after.attachments
            .filter { attachment ->
                val served = attachment.transcription?.readableText() ?: return@filter false
                held[attachment.id] != served
            }
            .map { it.id }
            .toSet()
    }

    /** Les couples (pièce, langue minuscule) de [after] dont la piste parlée servie n'est pas celle que [before] portait. */
    fun supersededAudio(before: ApiMessage, after: ApiMessage): Set<Pair<String, String>> {
        val held = before.attachments.associate { attachment ->
            attachment.id to attachment.translations.orEmpty().entries.associate { (language, track) ->
                language.trim().lowercase() to track.url
            }
        }
        return after.attachments.flatMap { attachment ->
            attachment.translations.orEmpty().entries
                .filter { !it.value.url.isNullOrBlank() }
                .filter { (language, track) -> held[attachment.id]?.get(language.trim().lowercase()) != track.url }
                .map { (language, _) -> attachment.id to language.trim().lowercase() }
        }.toSet()
    }

    /**
     * Les ids de pièce que l'envoi optimiste a posés ([local]) vers ceux que le serveur a rendus ([served]) : par id
     * quand le serveur l'a gardé (aucune entrée), sinon rang pour rang parmi les pièces audio, à nombre égal. Rien n'est
     * deviné autrement.
     */
    fun attachmentIdMap(local: List<ApiMessageAttachment>, served: List<ApiMessageAttachment>): Map<String, String> {
        val localAudio = local.filter { it.isAudio() }
        val servedAudio = served.filter { it.isAudio() }
        if (localAudio.size != servedAudio.size) return emptyMap()
        val servedIds = servedAudio.map { it.id }.toSet()
        return localAudio.zip(servedAudio)
            .filter { (placeholder, _) -> placeholder.id !in servedIds }
            .associate { (placeholder, real) -> placeholder.id to real.id }
    }

    /** Les transcriptions à ÉCRIRE sous [serverId] : celles de [local] que [server] n'a pas encore (rien si déjà fait). */
    fun rekeyedTranscriptions(
        local: List<StoredTranscription>,
        server: List<StoredTranscription>,
        serverId: String,
        attachmentIds: Map<String, String>,
    ): List<StoredTranscription> {
        val taken = server.map { it.attachmentId }.toSet()
        return local
            .filter { it.messageId != serverId }
            .map { it.copy(messageId = serverId, attachmentId = attachmentIds[it.attachmentId] ?: it.attachmentId) }
            .filter { it.attachmentId !in taken }
            .distinctBy { it.attachmentId }
    }

    /** La jumelle audio de [rekeyedTranscriptions] : unique par (pièce, langue). */
    fun rekeyedAudio(
        local: List<StoredAudioTranslation>,
        server: List<StoredAudioTranslation>,
        serverId: String,
        attachmentIds: Map<String, String>,
    ): List<StoredAudioTranslation> {
        val taken = server.map { it.attachmentId to it.language.lowercase() }.toSet()
        return local
            .filter { it.messageId != serverId }
            .map { it.copy(messageId = serverId, attachmentId = attachmentIds[it.attachmentId] ?: it.attachmentId) }
            .filter { (it.attachmentId to it.language.lowercase()) !in taken }
            .distinctBy { it.attachmentId to it.language.lowercase() }
    }

    private fun ApiAttachmentTranscription.readableText(): String? =
        (transcribedText ?: text)?.takeIf { it.isNotBlank() }

    private fun ApiMessageAttachment.isAudio(): Boolean = mimeType?.startsWith("audio/") == true
}
