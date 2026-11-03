package me.meeshy.sdk.model.licenses

/**
 * Surpasses the iOS `LicensesView`'s flat list: groups the launchable licenses by
 * [OpenSourceLicenseType] in the enum's declaration order (deterministic, not insertion order),
 * sorts each group's entries by name case-insensitively, and drops empty groups. Non-launchable
 * entries are excluded up front via [OpenSourceLicenseResolver] so a dead link never yields a
 * tappable card. Pure and fully unit-testable — no Android/UI import.
 */
public object OpenSourceLicensePresentationBuilder {

    public fun build(licenses: List<OpenSourceLicense>): List<OpenSourceLicenseGroup> {
        val launchable = OpenSourceLicenseResolver.resolvable(licenses)
        return OpenSourceLicenseType.entries.mapNotNull { type ->
            val inType = launchable
                .filter { it.type == type }
                .sortedBy { it.name.lowercase() }
            if (inType.isEmpty()) null else OpenSourceLicenseGroup(type, inType)
        }
    }

    /**
     * Flat list of cards, one per launchable library (iOS `LicensesView`), in the same order as the
     * groups: license family, then name.
     */
    public fun cards(licenses: List<OpenSourceLicense>): List<OpenSourceLicenseCard> =
        build(licenses).flatMap { group ->
            group.licenses.map { license ->
                OpenSourceLicenseCard(
                    name = license.name,
                    author = license.author,
                    type = license.type,
                    typeName = typeName(license.type),
                    badge = badge(license.type),
                    url = license.url,
                )
            }
        }

    public fun badge(type: OpenSourceLicenseType): LicenseBadge = when (type) {
        OpenSourceLicenseType.MIT -> LicenseBadge.SUCCESS
        OpenSourceLicenseType.APACHE_2_0 -> LicenseBadge.WARNING
        OpenSourceLicenseType.BSD -> LicenseBadge.INFO
        OpenSourceLicenseType.OTHER -> LicenseBadge.NEUTRAL
    }

    private fun typeName(type: OpenSourceLicenseType): String? = when (type) {
        OpenSourceLicenseType.MIT -> "MIT"
        OpenSourceLicenseType.APACHE_2_0 -> "Apache 2.0"
        OpenSourceLicenseType.BSD -> "BSD"
        OpenSourceLicenseType.OTHER -> null
    }
}
