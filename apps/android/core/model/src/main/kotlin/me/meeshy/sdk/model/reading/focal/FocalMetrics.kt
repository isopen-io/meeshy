package me.meeshy.sdk.model.reading.focal

/**
 * Cotes normatives de la rangée plate du fil (Focal) que les lois pures de ce paquet lisent.
 * Miroir de `FocalMetrics.swift` (`packages/shared/design/lentille-tokens.json` → `thread`),
 * restreint aux cotes dont une loi a besoin : aucune de ces valeurs ne se réécrit ailleurs.
 */
public object FocalMetrics {

    public object Row {
        public const val PADDING_VERTICAL: Double = 3.0
        public const val PADDING_HORIZONTAL: Double = 16.0
        public const val GROUP_TOP_PADDING: Double = 8.0
    }

    public object MetaColumn {
        public const val RESERVED_WIDTH: Double = 62.0
        public const val SPACING: Double = 6.0
    }

    public object FocusCard {
        public const val MARGIN_VERTICAL: Double = 8.0
    }

    public object Focus {
        public const val AVATAR_SIZE: Double = 34.0
        public const val LOUPE_GAIN: Double = 0.26
        public const val EXPANDED_LOUPE_GAIN: Double = 0.05
    }

    public object FocusStrip {
        public const val CHIP_HEIGHT: Double = 24.0
        public const val IDENTITY_CHIP_HEIGHT: Double = 34.0
        public const val STRIP_GAP: Double = Row.PADDING_VERTICAL

        public fun contentLift(isFirstInGroup: Boolean): Double =
            if (isFirstInGroup) 0.0 else IDENTITY_CHIP_HEIGHT + Row.PADDING_VERTICAL
    }

    public object Scene {
        public const val REST_DELAY_MS: Long = 4_500
        public const val FLATTEN_DURATION_MS: Long = 450
        public const val ENTER_DURATION_MS: Long = 250
    }
}
