package me.meeshy.ui.component.skeleton

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Dimensions des squelettes, 1:1 avec `Skeletons/\*.swift` (iOS) : le passage au contenu reel ne saute pas. */
public object SkeletonGeometry {
    public object FeedPost {
        public val avatar: Dp = 40.dp
        public val nameWidth: Dp = 120.dp
        public val nameHeight: Dp = 12.dp
        public val metaWidth: Dp = 80.dp
        public val metaHeight: Dp = 10.dp
        public val trailingWidth: Dp = 22.dp
        public const val bodyLineCount: Int = 3
        public val bodyLineHeight: Dp = 12.dp
        public val lastLineMaxWidth: Dp = 220.dp
        public val mediaHeight: Dp = 200.dp
        public val mediaRadius: Dp = 14.dp
        public const val actionCount: Int = 4
        public val actionGlyph: Dp = 18.dp
        public val actionLabelWidth: Dp = 22.dp
        public val actionLabelHeight: Dp = 10.dp
        public const val listCount: Int = 3
    }

    public object ProfileHeader {
        public val banner: Dp = 120.dp
        public val bannerRadius: Dp = 16.dp
        public val avatar: Dp = 90.dp
        public val avatarRing: Dp = 4.dp
        public val nameWidth: Dp = 160.dp
        public val nameHeight: Dp = 18.dp
        public val handleWidth: Dp = 100.dp
        public val handleHeight: Dp = 12.dp
        public const val bioLineCount: Int = 2
        public val bioLastLineMaxWidth: Dp = 200.dp
        public const val statCount: Int = 3
        public val statValueWidth: Dp = 40.dp
        public val statValueHeight: Dp = 20.dp
        public val statLabelWidth: Dp = 60.dp
        public val statLabelHeight: Dp = 10.dp
    }

    public object StoryThumb {
        public val avatar: Dp = 88.dp
        public val ring: Dp = 96.dp
        public val labelWidth: Dp = 72.dp
        public val labelHeight: Dp = 7.dp
        public const val trayCount: Int = 6
    }

    public object LinkRow {
        public val avatar: Dp = 40.dp
        public val titleHeight: Dp = 14.dp
        public val subtitleHeight: Dp = 11.dp
        public val trailing: Dp = 20.dp
        public const val listCount: Int = 4
        public val titleWidths: List<Dp> = listOf(140.dp, 110.dp, 168.dp, 96.dp)
        public val subtitleWidths: List<Dp> = listOf(180.dp, 150.dp, 120.dp, 200.dp)
        public fun titleWidth(index: Int): Dp = titleWidths[index.mod(titleWidths.size)]
        public fun subtitleWidth(index: Int): Dp = subtitleWidths[index.mod(subtitleWidths.size)]
    }
}
