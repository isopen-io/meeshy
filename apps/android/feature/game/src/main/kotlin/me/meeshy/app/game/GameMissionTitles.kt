package me.meeshy.app.game

import android.content.res.Resources
import java.util.Locale
import me.meeshy.sdk.model.game.GameMissionTitles as GameMissionTitleLaw

/** Le titre d'une mission du jour, en clair ; un gabarit inconnu reste « Un acte du rêve ». */
object GameMissionTitles {

    fun title(
        resources: Resources,
        templateKey: String,
        target: Int,
        locale: Locale = resources.configuration.locales[0],
    ): String = GameCopy.resolve(resources, GameMissionTitleLaw.title(templateKey, target), locale)
}
