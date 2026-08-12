package me.meeshy.sdk.model.licenses

/**
 * Pure gate mirroring the iOS `LicensesView`'s `if let URL(string:)` card guard: a license only
 * renders as a tappable repository card when its URL is launchable. Licenses only ever open web
 * repository pages, so — unlike Help & Support — only `http(s)://` counts as launchable; blank URLs
 * and every other scheme are silently dropped. Order is preserved, matching + trim are case-folded.
 */
public object OpenSourceLicenseResolver {

    private val LAUNCHABLE_SCHEMES: List<String> = listOf("http://", "https://")

    public fun resolvable(licenses: List<OpenSourceLicense>): List<OpenSourceLicense> =
        licenses.filter { isLaunchable(it.url) }

    private fun isLaunchable(url: String): Boolean {
        val lower = url.trim().lowercase()
        return LAUNCHABLE_SCHEMES.any { lower.startsWith(it) }
    }
}
