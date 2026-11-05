package me.meeshy.app.game

import android.content.res.Resources
import java.util.Locale
import me.meeshy.app.game.reveal.RevealCopy
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.element.GameElementDetail
import me.meeshy.sdk.model.game.element.GameElementStatus

internal data class GameSheetFact(val label: String, val value: String)

/** Ce que la feuille d'un élément DIT, habillé dans la langue de l'interface (iOS `GameElementDetail.what` / `.how` / `.statusLine`). */
internal data class GameElementSheetTexts(
    val name: String,
    val status: String,
    val what: String,
    val howTitle: String,
    val how: String?,
    val facts: List<GameSheetFact>,
    val rarity: String?,
) {
    companion object {
        fun of(res: Resources, locale: Locale, detail: GameElementDetail): GameElementSheetTexts = GameElementSheetTexts(
            name = GameCopy.resolve(res, detail.name, locale),
            status = statusLine(res, locale, detail.status),
            what = res.getString(GameElementKindCopy.what(detail)),
            howTitle = res.getString(GameElementKindCopy.howTitle(detail.kind)),
            how = GameElementKindCopy.how(detail.kind)?.let { res.getString(it) },
            facts = detail.facts.map { GameSheetFact(GameCopy.resolve(res, it.label, locale), GameCopy.resolve(res, it.value, locale)) },
            rarity = detail.rarity?.visibleRarity?.let { RevealCopy.rarityName(res, it) },
        )

        /** « Obtenu le … », « Pas encore obtenu · … », ou la valeur. */
        fun statusLine(res: Resources, locale: Locale, status: GameElementStatus): String = when (status) {
            is GameElementStatus.Obtained -> status.phrase?.let { GameCopy.resolve(res, it, locale) } ?: status.reachedAt?.let { RevealCopy.longDate(locale, it) }
                ?.let { res.getString(R.string.game_detail_earned_on, it) }
                ?: res.getString(R.string.game_detail_earned)
            is GameElementStatus.Locked -> {
                val locked = res.getString(R.string.game_detail_locked)
                status.missing?.let { "$locked · ${GameCopy.resolve(res, it, locale)}" } ?: locked
            }
            is GameElementStatus.Value -> GameCopy.resolve(res, status.value, locale)
        }
    }
}
