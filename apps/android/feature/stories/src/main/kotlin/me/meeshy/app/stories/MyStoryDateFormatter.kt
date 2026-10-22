package me.meeshy.app.stories

import android.icu.text.RelativeDateTimeFormatter
import android.icu.text.RelativeDateTimeFormatter.Direction
import android.icu.text.RelativeDateTimeFormatter.RelativeUnit
import me.meeshy.sdk.model.MyStoryDateLabel
import java.text.DateFormat
import java.util.Date
import java.util.Locale

/**
 * Rend un [MyStoryDateLabel] dans la langue de l'utilisateur. Le formateur relatif de la
 * plateforme produit DÉJÀ « il y a 2 jours » : aucun préfixe n'est ajouté ici.
 */
internal object MyStoryDateFormatter {

    fun format(label: MyStoryDateLabel, locale: Locale): String = when (label) {
        is MyStoryDateLabel.Relative ->
            RelativeDateTimeFormatter.getInstance(locale)
                .format(label.amount.toDouble(), Direction.LAST, label.unit.toIcu())
        is MyStoryDateLabel.Medium ->
            DateFormat.getDateInstance(DateFormat.MEDIUM, locale).format(Date(label.epochMillis))
    }

    private fun MyStoryDateLabel.Unit.toIcu(): RelativeUnit = when (this) {
        MyStoryDateLabel.Unit.SECONDS -> RelativeUnit.SECONDS
        MyStoryDateLabel.Unit.MINUTES -> RelativeUnit.MINUTES
        MyStoryDateLabel.Unit.HOURS -> RelativeUnit.HOURS
        MyStoryDateLabel.Unit.DAYS -> RelativeUnit.DAYS
        MyStoryDateLabel.Unit.WEEKS -> RelativeUnit.WEEKS
    }
}
