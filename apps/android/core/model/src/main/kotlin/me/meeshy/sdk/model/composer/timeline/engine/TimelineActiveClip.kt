package me.meeshy.sdk.model.composer.timeline.engine

import me.meeshy.sdk.model.timeline.TimelineProject

/** Quel clip est « actif » à un instant de la lecture (miroir d'`ActiveClipResolver`) : bornes `[début, début + durée)`. */
object TimelineActiveClip {

    private data class Window(val id: String, val start: Float, val duration: Float)

    /** L'identifiant du clip dont la fenêtre contient [time] (le démarré le plus récemment gagne), `null` dans un trou. */
    fun activeClipId(time: Float, project: TimelineProject): String? =
        windows(project)
            .filter { it.start <= time && time < it.start + it.duration }
            .maxByOrNull { it.start }
            ?.id

    private fun windows(project: TimelineProject): List<Window> = buildList {
        project.mediaObjects.filter { !it.isBackground }.forEach { m ->
            m.duration?.takeIf { it > 0 }?.let { add(Window(m.id, (m.startTime ?: 0.0).toFloat(), it.toFloat())) }
        }
        project.audioPlayerObjects.filter { it.isBackground != true }.forEach { a ->
            a.duration?.takeIf { it > 0 }?.let { add(Window(a.id, a.startTime ?: 0f, it)) }
        }
        project.textObjects.forEach { t ->
            t.duration?.takeIf { it > 0 }?.let { add(Window(t.id, (t.startTime ?: 0.0).toFloat(), it.toFloat())) }
        }
        project.stickerObjects.forEach { s ->
            s.duration?.takeIf { it > 0 }?.let { add(Window(s.id, (s.startTime ?: 0.0).toFloat(), it.toFloat())) }
        }
        project.locationObjects.forEach { l ->
            l.duration?.takeIf { it > 0 }?.let { add(Window(l.id, (l.startTime ?: 0.0).toFloat(), it.toFloat())) }
        }
    }
}
