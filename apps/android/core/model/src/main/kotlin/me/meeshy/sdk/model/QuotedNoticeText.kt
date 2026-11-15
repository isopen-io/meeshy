package me.meeshy.sdk.model

import kotlinx.serialization.json.JsonObject

/**
 * **Ce qu'une citation d'avis dit** (#17441) — un appel (manqué ou non), une arrivée (seule ou
 * regroupée) et un départ ANNONCÉ se citent comme un message, et leur citation se dit dans la
 * langue du LECTEUR, de son point de vue : un appel manqué est « manqué » pour l'appelé, « sans
 * réponse » ou « annulé » pour l'appelant. Miroir de `quotedNoticeText`
 * (`packages/shared/utils/quotable-notice.ts`) et de `QuotedNotice` (iOS) ; libellés recopiés de
 * `conversation-preview-strings.ts`, mêmes sept langues, langue hors catalogue ⇒ français.
 *
 * Se lit depuis `replyTo.notice`, la métadonnée que la passerelle sert pour un avis cité. Un avis
 * non citable (capture, retrait, renommage) ou illisible rend `null` : la citation garde `content`.
 */
object QuotedNoticeText {

    fun of(notice: JsonObject?, viewerId: String?, language: String?): String? {
        val lang = SystemNoticeText.normalizedLanguage(language)
        return when (MessageRichMetadata.kind(notice)) {
            "call", "call-live" -> MessageRichMetadata.callSummary(notice)?.let { call(it, viewerId, lang) }
            JoinNoticeMetadata.KIND -> MessageRichMetadata.joinNotice(notice)?.let { join(it, notice, lang) }
            ArrivalsNoticeMetadata.KIND -> MessageRichMetadata.arrivalsNotice(notice)?.let { SystemNoticeText.arrivals(it, lang) }
            "member-left" -> actorName(notice, "actor")?.let { label(lang, "system.member.left").replace("{actor}", it) }
            else -> null
        }
    }

    private fun call(summary: CallSummaryMetadata, viewerId: String?, lang: String): String {
        val key = callKey(summary, outgoing = summary.isOutgoing(viewerId.orEmpty()))
        val text = label(lang, key)
        val completed = key == "call.audio" || key == "call.video"
        return if (completed && summary.durationSeconds > 0) "$text · ${summary.durationLabel}" else text
    }

    private fun callKey(summary: CallSummaryMetadata, outgoing: Boolean): String = when {
        summary.isLive -> "call.active"
        summary.outcome == CallSummaryMetadata.Outcome.MISSED && !outgoing -> "call.missed"
        summary.outcome == CallSummaryMetadata.Outcome.MISSED -> if (summary.endedByInitiator == true) "call.cancelled" else "call.unanswered"
        summary.outcome == CallSummaryMetadata.Outcome.REJECTED -> "call.declined"
        summary.outcome == CallSummaryMetadata.Outcome.FAILED -> "call.failed"
        summary.callType == CallSummaryMetadata.MediaType.VIDEO -> "call.video"
        else -> "call.audio"
    }

    private fun join(join: JoinNoticeMetadata, notice: JsonObject?, lang: String): String {
        val name = join.givenName?.takeIf { it.isNotBlank() } ?: join.displayName
        val addedBy = actorName(notice, "addedBy")
            ?: return label(lang, "system.member.joined").replace("{actor}", name)
        return label(lang, "system.member.added").replace("{actor}", addedBy).replace("{target}", name)
    }

    private fun actorName(notice: JsonObject?, key: String): String? =
        (notice?.get(key) as? JsonObject).text("displayName")?.takeIf { it.isNotEmpty() }

    private fun label(lang: String, key: String): String =
        labels[lang]?.get(key) ?: labels.getValue("fr").getValue(key)

    private val labels: Map<String, Map<String, String>> = mapOf(
        "fr" to mapOf(
            "call.active" to "Appel en cours",
            "call.audio" to "Appel vocal",
            "call.video" to "Appel vidéo",
            "call.missed" to "Appel manqué",
            "call.declined" to "Appel refusé",
            "call.cancelled" to "Appel annulé",
            "call.unanswered" to "Appel sans réponse",
            "call.failed" to "Appel interrompu",
            "system.member.joined" to "{actor} a rejoint la conversation",
            "system.member.added" to "{actor} a ajouté {target}",
            "system.member.left" to "{actor} a quitté la conversation",
        ),
        "en" to mapOf(
            "call.active" to "Call in progress",
            "call.audio" to "Voice call",
            "call.video" to "Video call",
            "call.missed" to "Missed call",
            "call.declined" to "Declined call",
            "call.cancelled" to "Cancelled call",
            "call.unanswered" to "Unanswered call",
            "call.failed" to "Call interrupted",
            "system.member.joined" to "{actor} joined the conversation",
            "system.member.added" to "{actor} added {target}",
            "system.member.left" to "{actor} left the conversation",
        ),
        "es" to mapOf(
            "call.active" to "Llamada en curso",
            "call.audio" to "Llamada de voz",
            "call.video" to "Videollamada",
            "call.missed" to "Llamada perdida",
            "call.declined" to "Llamada rechazada",
            "call.cancelled" to "Llamada cancelada",
            "call.unanswered" to "Llamada sin respuesta",
            "call.failed" to "Llamada interrumpida",
            "system.member.joined" to "{actor} se unió a la conversación",
            "system.member.added" to "{actor} añadió a {target}",
            "system.member.left" to "{actor} salió de la conversación",
        ),
        "pt" to mapOf(
            "call.active" to "Chamada em andamento",
            "call.audio" to "Chamada de voz",
            "call.video" to "Chamada de vídeo",
            "call.missed" to "Chamada perdida",
            "call.declined" to "Chamada recusada",
            "call.cancelled" to "Chamada cancelada",
            "call.unanswered" to "Chamada não atendida",
            "call.failed" to "Chamada interrompida",
            "system.member.joined" to "{actor} entrou na conversa",
            "system.member.added" to "{actor} adicionou {target}",
            "system.member.left" to "{actor} saiu da conversa",
        ),
        "de" to mapOf(
            "call.active" to "Laufender Anruf",
            "call.audio" to "Sprachanruf",
            "call.video" to "Videoanruf",
            "call.missed" to "Verpasster Anruf",
            "call.declined" to "Abgelehnter Anruf",
            "call.cancelled" to "Abgebrochener Anruf",
            "call.unanswered" to "Unbeantworteter Anruf",
            "call.failed" to "Anruf unterbrochen",
            "system.member.joined" to "{actor} ist der Unterhaltung beigetreten",
            "system.member.added" to "{actor} hat {target} hinzugefügt",
            "system.member.left" to "{actor} hat die Unterhaltung verlassen",
        ),
        "it" to mapOf(
            "call.active" to "Chiamata in corso",
            "call.audio" to "Chiamata vocale",
            "call.video" to "Videochiamata",
            "call.missed" to "Chiamata persa",
            "call.declined" to "Chiamata rifiutata",
            "call.cancelled" to "Chiamata annullata",
            "call.unanswered" to "Chiamata senza risposta",
            "call.failed" to "Chiamata interrotta",
            "system.member.joined" to "{actor} si è unito alla conversazione",
            "system.member.added" to "{actor} ha aggiunto {target}",
            "system.member.left" to "{actor} ha lasciato la conversazione",
        ),
        "ar" to mapOf(
            "call.active" to "مكالمة جارية",
            "call.audio" to "مكالمة صوتية",
            "call.video" to "مكالمة فيديو",
            "call.missed" to "مكالمة فائتة",
            "call.declined" to "مكالمة مرفوضة",
            "call.cancelled" to "مكالمة ملغاة",
            "call.unanswered" to "مكالمة بلا رد",
            "call.failed" to "مكالمة منقطعة",
            "system.member.joined" to "انضم {actor} إلى المحادثة",
            "system.member.added" to "أضاف {actor} {target}",
            "system.member.left" to "غادر {actor} المحادثة",
        ),
    )
}
