package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * The tint of the composer PLATEAU (iOS `PlateauTint`) — always dark, in both app themes, so the
 * scene is the only source of light. [storageKey] is the persisted setting: never rename it.
 */
public enum class PlateauTint(public val storageKey: String, public val color: Color) {
    NOIR("noir", MeeshyPalette.PlateauNoir),
    INDIGO_PROFOND("indigoProfond", MeeshyPalette.Indigo950),
    VIOLET_PROFOND("violetProfond", MeeshyPalette.Violet950),
    ;

    public companion object {
        public val DEFAULT: PlateauTint = INDIGO_PROFOND

        /** An unknown stored value (future version, corrupt storage) never leaves the composer without a plateau. */
        public fun fromStorage(key: String?): PlateauTint = entries.firstOrNull { it.storageKey == key } ?: DEFAULT
    }
}

/** Inks of the plateau: the DARK scheme's, whatever the app theme — the plateau is never painted light. */
public object ComposerPlateauInk {
    public val primary: Color = MeeshyAdaptiveColors.textPrimary(isDark = true)
    public val secondary: Color = MeeshyAdaptiveColors.textSecondary(isDark = true)
    public val accent: Color = MeeshyPalette.Indigo400

    /** Hit target floor of a rail control, in dp (iOS `ComposerRailGeometry.railWidth`). */
    public const val HIT_TARGET_DP: Int = 44
}
