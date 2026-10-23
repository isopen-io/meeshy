package me.meeshy.app.game

import android.content.res.Resources
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import me.meeshy.sdk.model.game.GameAgreement
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextForm

/**
 * CE QUE LE JEU DIT, habillé dans la langue de l'interface. Les lois
 * (`GameCopyLaws`, `GameMissionTitles`, `GameErrorTexts`) rendent des
 * descripteurs [GameText] ; ici seulement ils deviennent des phrases.
 *
 * Les nombres sont formatés par la locale AVANT d'entrer dans la phrase (un
 * seul trou par nombre) ; l'accord se choisit sur l'entier
 * ([GameAgreement.isSingular]). Une ressource introuvable rend une chaîne vide,
 * jamais le nom d'une clé.
 */
object GameCopy {

    private const val SEPARATOR = " "

    fun resolve(
        resources: Resources,
        text: GameText,
        locale: Locale = resources.configuration.locales[0],
    ): String = when (text.key.form) {
        GameTextForm.Join -> text.args.joinToString(SEPARATOR) { argument(resources, it, locale) }
        GameTextForm.Plain -> plain(resources, text.key.androidName, text.args, locale)
        GameTextForm.Agreement -> agreed(resources, text, locale)
        GameTextForm.Plural -> plural(resources, text)
    }

    private fun plain(resources: Resources, name: String, args: List<GameTextArg>, locale: Locale): String {
        val id = GameStringIds.string(name) ?: return ""
        return resources.getString(id, *args.map { argument(resources, it, locale) }.toTypedArray())
    }

    private fun agreed(resources: Resources, text: GameText, locale: Locale): String {
        val count = text.args.filterIsInstance<GameTextArg.Count>().firstOrNull()?.value ?: 0
        val form = if (GameAgreement.isSingular(count, locale.language)) "one" else "other"
        return plain(resources, "${text.key.androidName}_$form", text.args, locale)
    }

    private fun plural(resources: Resources, text: GameText): String {
        val count = text.args.filterIsInstance<GameTextArg.Count>().firstOrNull()?.value ?: 0
        val id = GameStringIds.plural(text.key.androidName) ?: return ""
        return resources.getQuantityString(id, count, count)
    }

    private fun argument(resources: Resources, argument: GameTextArg, locale: Locale): String = when (argument) {
        is GameTextArg.Count -> GameNumberFormat.formatCount(argument.value, locale)
        is GameTextArg.Compact -> GameNumberFormat.compactCount(argument.value, locale)
        is GameTextArg.Verbatim -> argument.value
        is GameTextArg.Nested -> resolve(resources, argument.text, locale)
    }

    /** « 14:00 – 16:00 », écrit par la locale (12 h ou 24 h de l'appareil), jamais à la main. */
    fun windowRange(startMillis: Long, endMillis: Long, locale: Locale, zone: ZoneId = ZoneId.systemDefault()): String {
        val format = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).withZone(zone)
        return format.format(Instant.ofEpochMilli(startMillis)) + " – " + format.format(Instant.ofEpochMilli(endMillis))
    }

    /** Une heure du jour (minutes depuis minuit), écrite par la locale. */
    fun clock(minuteOfDay: Int, locale: Locale): String =
        DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale)
            .format(LocalTime.MIDNIGHT.plusMinutes(minuteOfDay.toLong()))
}

/** La phrase du descripteur, dans la langue de l'interface courante. */
@Composable
fun gameString(text: GameText): String {
    val resources = LocalContext.current.resources
    val configuration = LocalConfiguration.current
    return remember(text, configuration) { GameCopy.resolve(resources, text, configuration.locales[0]) }
}
