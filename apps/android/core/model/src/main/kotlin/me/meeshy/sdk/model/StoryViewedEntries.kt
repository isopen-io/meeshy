package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Les stories qu'un compte a VUES sur cet appareil, avec l'instant de la vue — miroir de `StoryViewedEntries`
 * (iOS `StoryViewedLedger.swift`). Brique pure : un identifiant opaque et une date ; la règle « quand une vue
 * locale cède » reste à [StoryViewedLaw]. Le compte est porté par le magasin (un registre par compte).
 */
@Serializable
public data class StoryViewedEntries(val viewedAt: Map<String, Long> = emptyMap()) {

    /** Garde la vue la PLUS RÉCENTE : revoir une story après son édition la rend de nouveau vue. */
    public fun recording(storyId: String, atMillis: Long): StoryViewedEntries {
        val existing = viewedAt[storyId]
        if (existing != null && existing >= atMillis) return this
        return StoryViewedEntries(viewedAt + (storyId to atMillis))
    }

    /** Oublie les vues antérieures à [olderThanMillis] : une story vit 20 h, le registre n'a rien à garder au-delà. */
    public fun pruned(olderThanMillis: Long): StoryViewedEntries {
        val kept = viewedAt.filterValues { it >= olderThanMillis }
        return if (kept.size == viewedAt.size) this else StoryViewedEntries(kept)
    }

    public companion object {
        /** 72 h : bien au-delà de la vie d'une story, aligné sur la rétention du registre iOS. */
        public const val RETENTION_MILLIS: Long = 72L * 3_600_000L
    }
}
