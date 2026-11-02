package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.MeeshyMediaConsumption

/** Corps de rapport de consommation bâti depuis des plages drainées. */
public object PlaybackStatusReport {

    /**
     * `complete` vaut vrai dès qu'une plage s'est terminée par la fin du média. Rien à
     * rapporter (aucune plage, aucune complétion) rend `null` : un rapport vide ne dit rien.
     */
    public fun build(
        action: String,
        stretches: List<PlaybackStretch>,
        positionMs: Int,
        durationMs: Int,
        language: String? = null,
    ): AttachmentStatusBody? {
        if (stretches.isEmpty()) return null
        return AttachmentStatusBody(
            action = action,
            playPositionMs = positionMs.coerceAtLeast(0),
            durationMs = durationMs.coerceAtLeast(0),
            complete = stretches.any { it.endedBy == StretchEnd.COMPLETED },
            stretches = stretches,
            language = language,
        )
    }

    /**
     * La consommation du lecteur après envoi de [body] : `listened` met à jour l'écoute
     * (audio), `watched` le visionnage (vidéo) ; une complétion acquise ne se perd jamais.
     */
    public fun project(previous: MeeshyMediaConsumption?, body: AttachmentStatusBody): MeeshyMediaConsumption? {
        val base = previous ?: MeeshyMediaConsumption()
        return when (body.action) {
            AttachmentStatusBody.ACTION_LISTENED -> base.copy(
                lastPlayPositionMs = body.playPositionMs,
                listenedComplete = base.listenedComplete || body.complete,
            )
            AttachmentStatusBody.ACTION_WATCHED -> base.copy(
                lastWatchPositionMs = body.playPositionMs,
                watchedComplete = base.watchedComplete || body.complete,
            )
            else -> previous
        }
    }
}
