package me.meeshy.ui.story.reader

import me.meeshy.sdk.model.scene.StoryReaderWindow

/** Une slide préparée hors écran : image décodée, vidéo de fond et lecteurs de premier plan PRÊTS, en pause. */
public interface PreparedStorySlide {
    /** Bascule la slide entre lecture (visible) et pause (voisine) ; appelée de façon idempotente. */
    public fun setActive(active: Boolean)

    /** Libère décodeurs et lecteurs ; appelée à l'éviction hors fenêtre. */
    public fun release()
}

/**
 * La prélecture à fenêtre glissante `[N-1, N, N+1, N+2]` (iOS `StoryReaderPrefetcher`) : le slide suivant n'a ni
 * décodage d'image ni création de lecteur à faire. Tout ce qui sort de la fenêtre est évincé, la mémoire reste bornée.
 *
 * Les slides préparées naissent EN PAUSE : seule la courante est activée par [activate], sans quoi les voisines
 * démarreraient leur son. [prepare] fabrique la slide (côté hôte, sur le fil principal) ; ce type ne connaît ni
 * Compose ni Media3.
 */
public class StoryReaderPrefetcher(private val prepare: (slideId: String) -> PreparedStorySlide) {

    private val warm = LinkedHashMap<String, PreparedStorySlide>()
    private val active = HashSet<String>()

    /** Les identifiants préparés, dans l'ordre de préparation. */
    public val preparedIds: Set<String> get() = warm.keys.toSet()

    /** La slide préparée, ou `null` hors fenêtre (l'appelant retombe sur une instanciation paresseuse). */
    public fun slide(id: String): PreparedStorySlide? = warm[id]

    /**
     * Recalcule la fenêtre autour de [current]. [extraWarm] : slides gardées chaudes HORS fenêtre, typiquement
     * l'entrée des groupes voisins, pour que le passage d'un auteur à l'autre soit instantané.
     */
    public fun updateWindow(ids: List<String>, current: Int, extraWarm: List<String> = emptyList()) {
        val plan = StoryReaderWindow.plan(ids, current, warm.keys, extraWarm)
        // On évince d'abord : sur un appareil à peu de mémoire, trois lecteurs plein écran se tiennent au bord.
        plan.evict.forEach(::evict)
        plan.prepare.forEach { id -> warm[id] = prepare(id) }
    }

    /** La slide [currentId] joue, toutes les autres sont en pause. Idempotent. */
    public fun activate(currentId: String) {
        warm.forEach { (id, slide) ->
            val shouldPlay = id == currentId
            if (shouldPlay == (id in active)) return@forEach
            if (shouldPlay) active += id else active -= id
            slide.setActive(shouldPlay)
        }
    }

    /** Libère tout : à la sortie du lecteur. */
    public fun detach() {
        warm.keys.toList().forEach(::evict)
    }

    private fun evict(id: String) {
        active -= id
        warm.remove(id)?.release()
    }
}
