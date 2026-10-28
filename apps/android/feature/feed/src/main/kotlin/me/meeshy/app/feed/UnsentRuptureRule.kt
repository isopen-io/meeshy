package me.meeshy.app.feed

import me.meeshy.sdk.model.media.PublicationRupture
import me.meeshy.sdk.model.media.RuptureGesture
import me.meeshy.sdk.publication.UnsentPublication
import me.meeshy.sdk.publication.UnsentPublicationKind
import me.meeshy.sdk.publication.UnsentPublicationStatus

/** What « Publications non envoyées » says about a break, and which gesture it offers (#13429). Pure. */
internal object UnsentRuptureRule {

    fun rupture(item: UnsentPublication, offline: Boolean): PublicationRupture =
        PublicationRupture.of(
            fates = item.media.map { it.fate },
            failed = item.status == UnsentPublicationStatus.FAILED,
            offline = offline,
        )

    /** A publication that lost a media is not retried — it would fail again for the same reason. */
    fun showsRetry(item: UnsentPublication, rupture: PublicationRupture): Boolean =
        item.canRetry && rupture.gesture != RuptureGesture.REPLACE_MISSING

    /** Silence while everything goes well: the break is told only when there is one, or a wait worth naming. */
    fun speaks(item: UnsentPublication, rupture: PublicationRupture): Boolean =
        item.media.isNotEmpty() && rupture.gesture != RuptureGesture.NONE

    /** A story cannot be reopened in the composer: the only way to replace a missing media is to start it again. */
    fun replaceByRecomposing(item: UnsentPublication): Boolean = item.kind == UnsentPublicationKind.STORY
}
