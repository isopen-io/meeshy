package me.meeshy.app.settings

import androidx.annotation.StringRes
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.session.SessionRowPresentation
import me.meeshy.sdk.model.session.SessionRowPresentation.Activity
import me.meeshy.sdk.model.session.SessionRowPresentation.LoginMethod
import me.meeshy.sdk.model.session.SessionRowPresentation.Platform
import me.meeshy.sdk.model.session.SessionRowPresentation.Title

/** Les libellés d'une ligne de session, composés une fois : la cellule ne calcule rien. */
internal data class SessionRowTexts(
    val title: String,
    val software: String?,
    val place: String?,
    val timezone: String?,
    val opened: String?,
    val activity: String?,
) {
    /** Les lignes de détail, dans l'ordre d'iOS : logiciel, lieu, fuseau, ouverture, activité. */
    val details: List<String> get() = listOfNotNull(software, place, timezone, opened, activity)
}

/**
 * Parties STRUCTURÉES de [SessionRowPresentation] -> ressources de chaînes (miroir d'`ActiveSessionsPresentation`).
 * [string] résout une ressource avec ses arguments positionnels ; les trois autres portent ce qui dépend de la
 * langue et de l'horloge (nom du pays, date d'ouverture, « il y a … »).
 */
internal class ActiveSessionsUiMapper(
    private val string: (resId: Int, args: List<Any>) -> String,
    private val countryName: (code: String) -> String,
    private val dateText: (epochMillis: Long) -> String,
    private val relativeText: (epochMillis: Long) -> String,
) {

    fun texts(row: SessionRowPresentation): SessionRowTexts = SessionRowTexts(
        title = title(row.title),
        software = software(row.software),
        place = place(row.place),
        timezone = row.timezone?.let { string(R.string.sessions_timezone, listOf(it)) },
        opened = opened(row),
        activity = row.activity?.let(::activity),
    )

    fun title(title: Title): String = when (title) {
        is Title.Named -> title.name
        is Title.Model -> title.name
        is Title.VendorModel -> "${title.vendor} ${title.model}"
        is Title.BrowserOnOs -> string(R.string.sessions_device_browser_on_system, listOf(title.browser, title.os))
        is Title.Browser -> title.name
        Title.Unknown -> string(R.string.sessions_unknown_device, emptyList())
    }

    private fun software(software: SessionRowPresentation.Software?): String? {
        software ?: return null
        val meeshy = software.appVersion?.let { version ->
            software.appBuild?.let { "Meeshy $version ($it)" } ?: "Meeshy $version"
        }
        val browser = software.browserName?.let { name ->
            software.browserMajorVersion?.let { "$name $it" } ?: name
        }
        val system = software.osName?.let { name -> software.osVersion?.let { "$name $it" } ?: name }
        val parts = listOfNotNull(meeshy, browser, system, software.platform?.let(::platform))
        return parts.takeIf { it.isNotEmpty() }?.joinToString(SEPARATOR)
    }

    @StringRes
    fun platformRes(platform: Platform): Int = when (platform) {
        Platform.WEB -> R.string.sessions_platform_web
        Platform.PWA -> R.string.sessions_platform_pwa
        Platform.ANDROID_APP -> R.string.sessions_platform_android
    }

    private fun platform(platform: Platform): String = string(platformRes(platform), emptyList())

    private fun place(place: SessionRowPresentation.Place?): String? {
        place ?: return null
        val named = listOfNotNull(place.city, place.countryCode?.let(countryName)).joinToString(", ")
        val located = named.ifEmpty { place.location }
        return listOfNotNull(located, place.ipAddress).takeIf { it.isNotEmpty() }?.joinToString(SEPARATOR)
    }

    private fun opened(row: SessionRowPresentation): String? {
        val date = row.openedAtMillis ?: return null
        val opened = string(R.string.sessions_opened, listOf(dateText(date)))
        val method = row.loginMethod?.let { string(loginMethodRes(it), emptyList()) } ?: return opened
        return "$opened$SEPARATOR$method"
    }

    @StringRes
    fun loginMethodRes(method: LoginMethod): Int = when (method) {
        LoginMethod.PASSWORD -> R.string.sessions_login_password
        LoginMethod.TWO_FACTOR -> R.string.sessions_login_two_factor
        LoginMethod.MAGIC_LINK -> R.string.sessions_login_magic_link
        LoginMethod.REGISTRATION -> R.string.sessions_login_registration
        LoginMethod.EMAIL_VERIFICATION -> R.string.sessions_login_email_verification
        LoginMethod.OAUTH -> R.string.sessions_login_oauth
        LoginMethod.ANONYMOUS -> R.string.sessions_login_anonymous
    }

    private fun activity(activity: Activity): String = when (activity) {
        Activity.ActiveNow -> string(R.string.sessions_activity_now, emptyList())
        is Activity.Since -> string(R.string.sessions_activity_last, listOf(relativeText(activity.epochMillis)))
    }

    private companion object {
        const val SEPARATOR = " · "
    }
}
