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
}
