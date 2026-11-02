package me.meeshy.sdk.model.session

/**
 * Ce qu'une ligne de Sécurité > Sessions DIT d'une session (#9612), en parties STRUCTURÉES :
 * aucune chaîne localisée ici, l'écran compose les libellés (pays, dates relatives, « approximatif »).
 * Miroir de `SessionRowPresentation` (ActiveSessionsPresentation.swift).
 */
public data class SessionRowPresentation(
    val id: String,
    val title: Title,
    val icon: Icon,
    val isCurrent: Boolean,
    val software: Software?,
    val place: Place?,
    val timezone: String?,
    val openedAtMillis: Long?,
    val loginMethod: LoginMethod?,
    val activity: Activity?,
) {
    public sealed interface Title {
        /** Le nom servi. */
        public data class Named(val name: String) : Title
        /** Le nom commercial déduit du modèle (`iPhone15,2` → « iPhone 14 Pro »). */
        public data class Model(val name: String) : Title
        public data class VendorModel(val vendor: String, val model: String) : Title
        public data class BrowserOnOs(val browser: String, val os: String) : Title
        public data class Browser(val name: String) : Title
        public data object Unknown : Title
    }

    public enum class Icon { TABLET, PHONE, DESKTOP, ANDROID_APP, WEB }

    /** « Meeshy 1.2.0 (1874) · Chrome 129 · Android 15 · Web ». */
    public data class Software(
        val appVersion: String?,
        val appBuild: String?,
        val browserName: String?,
        val browserMajorVersion: String?,
        val osName: String?,
        val osVersion: String?,
        val platform: Platform?,
    )

    /** La plateforme ne se nomme que quand le système ne la dit pas déjà. */
    public enum class Platform { WEB, PWA, ANDROID_APP }

    /** Lieu APPROXIMATIF (tiré de l'IP) : « Lyon, France (approximatif) · 203.0.113.4 ». */
    public data class Place(
        val city: String?,
        val countryCode: String?,
        val location: String?,
        val ipAddress: String?,
    )

    public enum class LoginMethod {
        PASSWORD, TWO_FACTOR, MAGIC_LINK, REGISTRATION, EMAIL_VERIFICATION, OAUTH, ANONYMOUS;

        public companion object {
            public fun from(wire: String?): LoginMethod? = when (wire) {
                "password" -> PASSWORD
                "two_factor" -> TWO_FACTOR
                "magic_link" -> MAGIC_LINK
                "registration" -> REGISTRATION
                "email_verification" -> EMAIL_VERIFICATION
                "oauth" -> OAUTH
                "anonymous" -> ANONYMOUS
                else -> null
            }
        }
    }

    public sealed interface Activity {
        public data object ActiveNow : Activity
        /** Dernière activité, jamais dans le futur. */
        public data class Since(val epochMillis: Long) : Activity
    }

    public companion object {
        /** En dessous, une session est « active maintenant ». */
        public const val ACTIVE_NOW_WINDOW_MILLIS: Long = 60_000L

        public fun of(
            session: UserSession,
            nowMillis: Long,
            activeNowWindowMillis: Long = ACTIVE_NOW_WINDOW_MILLIS,
        ): SessionRowPresentation = SessionRowPresentation(
            id = session.id,
            title = title(session),
            icon = icon(session),
            isCurrent = session.isCurrentSession,
            software = software(session),
            place = place(session),
            timezone = session.timezone.filled(),
            openedAtMillis = session.createdAtMillis,
            loginMethod = LoginMethod.from(session.loginMethod),
            activity = activity(session, nowMillis, activeNowWindowMillis),
        )

        public fun title(session: UserSession): Title {
            session.deviceName.filled()?.let { return Title.Named(it) }
            val model = session.deviceModel.filled()
            model?.let { id -> ServedDeviceModelName.readable(id)?.let { return Title.Model(it) } }
            val vendor = session.deviceVendor.filled()
            if (vendor != null && model != null) {
                return if (model.startsWith(vendor)) Title.Model(model) else Title.VendorModel(vendor, model)
            }
            val browser = session.browserName.filled()
            val os = session.osName.filled()
            if (browser != null && os != null) return Title.BrowserOnOs(browser, os)
            if (browser != null) return Title.Browser(browser)
            return Title.Unknown
        }

        public fun icon(session: UserSession): Icon {
            when (session.deviceType?.lowercase()) {
                "tablet" -> return Icon.TABLET
                "mobile" -> return Icon.PHONE
                "desktop" -> return Icon.DESKTOP
            }
            return when (session.platform) {
                "ios" -> if (session.deviceModel?.startsWith("iPad") == true) Icon.TABLET else Icon.PHONE
                "android-shell" -> Icon.ANDROID_APP
                "web", "pwa" -> Icon.WEB
                else -> if (session.isMobile == true) Icon.PHONE else Icon.DESKTOP
            }
        }

        public fun software(session: UserSession): Software? {
            val appVersion = session.appVersion.filled()
            val browser = session.browserName.filled()
            val osName = session.osName.filled() ?: if (session.platform == "ios") "iOS" else null
            val platform = when (session.platform) {
                "web" -> Platform.WEB
                "pwa" -> Platform.PWA
                "android-shell" -> Platform.ANDROID_APP
                else -> null
            }
            if (appVersion == null && browser == null && osName == null && platform == null) return null
            return Software(
                appVersion = appVersion,
                appBuild = appVersion?.let { session.appBuild.filled() },
                browserName = browser,
                browserMajorVersion = browser?.let { session.browserVersion.filled()?.substringBefore('.') },
                osName = osName,
                osVersion = osName?.let { session.osVersion.filled() },
                platform = platform,
            )
        }

        public fun place(session: UserSession): Place? {
            val place = Place(
                city = session.city.filled(),
                countryCode = session.country.filled(),
                location = session.location.filled(),
                ipAddress = session.ipAddress.filled(),
            )
            val empty = place.city == null && place.countryCode == null &&
                place.location == null && place.ipAddress == null
            return if (empty) null else place
        }

        public fun activity(session: UserSession, nowMillis: Long, windowMillis: Long): Activity? {
            if (session.isCurrentSession) return Activity.ActiveNow
            val last = session.lastActiveMillis ?: return null
            val clamped = minOf(last, nowMillis)
            return if (nowMillis - clamped < windowMillis) Activity.ActiveNow else Activity.Since(clamped)
        }

        private fun String?.filled(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
    }
}
