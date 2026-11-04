package me.meeshy.app.stories

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.StoryViewedLaw
import me.meeshy.sdk.story.StoryViewedLedger

/**
 * Reporte le registre durable des vues sur des stories venues d'AILLEURS que de la mémoire (cache, page serveur) :
 * l'anneau d'une story vue ne repasse jamais en épais après une revalidation (iOS `applyViewedLedger`).
 */
internal fun List<ApiPost>.withViewedLedger(viewed: Map<String, Long>, selfId: String?): List<ApiPost> =
    StoryViewedLaw.reinject(this, viewed, selfId)

internal suspend fun StoryViewedLedger.reinjected(posts: List<ApiPost>?, selfId: String?): List<ApiPost>? =
    posts?.withViewedLedger(viewed(), selfId)
