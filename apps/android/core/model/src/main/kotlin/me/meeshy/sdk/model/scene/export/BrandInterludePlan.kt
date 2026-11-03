package me.meeshy.sdk.model.scene.export

/** Les trois temps d'une vidéo exportée habillée Meeshy, dans l'ordre où elle se lit. */
public enum class BrandSegmentKind { INTERLUDE, STORY, OUTRO }

public data class BrandSegment(val kind: BrandSegmentKind, val range: StoryExportTimeRange)

/**
 * **L'ordre et les durées de l'habillage** : l'interlude de marque (sans identité, pas d'interlude), la scène de
 * l'auteur, puis la carte de fin avec sa signature sonore. La carte recouvre la fin de la scène ; l'interlude se fond
 * dans son début. Tout vient de [StoryExportBrandingPlan], le miroir de `StoryExportBranding.makePlan` iOS.
 */
public object BrandInterludePlan {

    public fun segments(plan: StoryExportBrandingPlan, storyDurationMillis: Long): List<BrandSegment> = buildList {
        if (plan.hasIntro) add(BrandSegment(BrandSegmentKind.INTERLUDE, StoryExportTimeRange(0L, StoryExportBrandingPlan.INTRO_CLIP_MILLIS)))
        add(BrandSegment(BrandSegmentKind.STORY, StoryExportTimeRange(plan.storyStartMillis, storyDurationMillis)))
        add(BrandSegment(BrandSegmentKind.OUTRO, StoryExportTimeRange(plan.outroStartMillis(storyDurationMillis), plan.outroDurationMillis)))
    }

    public fun totalMillis(plan: StoryExportBrandingPlan, storyDurationMillis: Long): Long = plan.totalMillis(storyDurationMillis)
}
