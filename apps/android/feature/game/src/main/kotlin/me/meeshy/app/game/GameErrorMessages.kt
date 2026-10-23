package me.meeshy.app.game

import android.content.res.Resources
import java.util.Locale
import me.meeshy.sdk.model.game.GameErrorCode
import me.meeshy.sdk.model.game.GameErrorTexts

/** La phrase localisée d'un refus du jeu : jamais un code affiché, un code inconnu rend la phrase générique. */
object GameErrorMessages {

    fun message(
        resources: Resources,
        code: GameErrorCode?,
        locale: Locale = resources.configuration.locales[0],
    ): String = GameCopy.resolve(resources, GameErrorTexts.forCode(code), locale)

    fun message(
        resources: Resources,
        wireCode: String?,
        locale: Locale = resources.configuration.locales[0],
    ): String = message(resources, GameErrorCode.fromWire(wireCode), locale)
}
