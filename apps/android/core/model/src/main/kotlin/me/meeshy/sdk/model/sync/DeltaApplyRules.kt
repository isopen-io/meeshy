package me.meeshy.sdk.model.sync

import me.meeshy.sdk.model.ApiConversation

/**
 * Application d'un delta `/sync` au cache de conversations — miroir de `deltaViaSync` (iOS).
 *
 * L'ordre est la loi : les upserts d'abord, PUIS les sorties (`meta.deletedConversationIds`, tombstones
 * et lignes `isActive=false`). Une conversation à la fois mise à jour et supprimée ailleurs disparaît.
 */
object DeltaApplyRules {

    /** Ce que le delta prouve : il règle la synchro, ou il faut retomber sur le balayage complet. */
    enum class Verdict { SETTLED, FALL_BACK_TO_FULL }

    /** Le résultat d'application : le fusion et les conversations dont les messages en cache sont à invalider. */
    data class Applied(val merge: ConversationDeltaRules.Merge, val invalidatedMessageIds: List<String>)

    fun apply(
        existing: Map<String, ApiConversation>,
        rows: List<SyncConversationRow>,
        tombstoneIds: List<String>,
    ): Applied {
        val merge = ConversationDeltaRules.merge(existing, rows, tombstoneIds)
        return Applied(merge, invalidatedMessageIds = merge.removedIds)
    }

    /**
     * Un drapeau `truncated` (fenêtre coupée) ou un trou n'est JAMAIS pris pour une liste complète :
     * [complete] est faux dans ces cas, et une ligne que la ligne maigre n'explique pas exige la route riche.
     */
    fun verdict(complete: Boolean, hasGap: Boolean, needsRichRefresh: Boolean): Verdict =
        if (complete && !hasGap && !needsRichRefresh) Verdict.SETTLED else Verdict.FALL_BACK_TO_FULL
}
