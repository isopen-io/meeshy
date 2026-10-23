package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.scene.ResolvedKeyframeTransform
import me.meeshy.sdk.model.scene.StoryBackgroundObjectTransform
import me.meeshy.sdk.model.scene.StoryClipTransitionResolver
import me.meeshy.sdk.model.scene.StoryElementVisibility
import me.meeshy.sdk.model.scene.StoryKeyframeResolver
import me.meeshy.sdk.model.scene.StoryMediaFadeResolver
import me.meeshy.sdk.model.scene.SceneLookRecipe

/**
 * A foreground media layer on a slide — a non-background [StoryMediaObject]
 * (video or image) composited on top of the background. Position/scale are
 * normalised canvas fractions (0..1), matching the wire model. [x]/[y]/[scale]/
 * [opacity] are the layer's *static* base transform; when the clip carries
 * [keyframes] or participates in a slide [clipTransitions] entry, call [animated]
 * with the playhead to obtain the transform for that instant. [id] matches the
 * clip against transitions; [duration] bounds its own timing window. Rotation is
 * still not applied in this projection.
 */
@Immutable
data class StoryForegroundMediaView(
    val id: String,
    val url: String,
    val isVideo: Boolean,
    val x: Double,
    val y: Double,
    val scale: Double,
    val aspectRatio: Double,
    val opacity: Double = 1.0,
    val startTime: Double = 0.0,
    val duration: Double = 0.0,
    val fadeIn: Double = 0.0,
    val fadeOut: Double = 0.0,
    val keyframes: List<StoryKeyframe> = emptyList(),
    val clipTransitions: List<StoryClipTransition> = emptyList(),
    /**
     * Fenêtre de LECTURE dans la source (#5129) — `null` quand la source joue en
     * entier. À ne pas confondre avec [startTime]/[duration], qui disent quand
     * l'objet est à l'écran : ceci dit quelle partie du fichier joue une fois
     * qu'il y est.
     */
    val sourceWindow: StorySourceWindowMs? = null,
) {
    /**
     * The layer's transform at [atSeconds] (absolute playhead). Returns `this`
     * unchanged when nothing animates — no keyframes that key a channel, no clip
     * transition this layer takes part in, AND no fadeIn/fadeOut envelope active at
     * this instant. Otherwise a copy whose [x]/[y]/[scale] follow the interpolated
     * keyframe animation (un-keyed channels holding their static base) and whose
     * [opacity] folds together, in iOS render order, the clip's own fade envelope,
     * its keyframe opacity, and any clip-transition ramp.
     *
     * Opacity precedence mirrors iOS `StoryRenderer` (`fade ?? keyframeOpacity ??
     * base`): a live [fadeIn]/[fadeOut] envelope value OVERRIDES the keyframe/static
     * opacity, and the result is then multiplied by the crossfade/dissolve ramp of
     * any transition naming this clip. Keyframe and fade times are offsets from
     * [startTime], per the timeline spec.
     *
     * A layer that participates in a transition but carries no [duration] is left
     * untouched for the transition ramp: window-clipping on a zero-length window
     * (`end == start`) would hide the clip at almost every instant. Pure — the
     * Compose canvas ticks a clock in and renders the result.
     */
    /**
     * Whether this foreground layer is drawn at [atSeconds] (absolute playhead) —
     * the sharp play-mode timing-window gate the Compose canvas consults before
     * compositing the layer. Delegates to [StoryElementVisibility]: an untimed clip
     * (duration `0`) is always visible; a timed one only inside
     * `[startTime, startTime + duration)`. Pure.
     */
    fun isVisible(atSeconds: Float): Boolean =
        StoryElementVisibility.isVisible(startTime, duration, atSeconds.toDouble())

    fun animated(atSeconds: Float): StoryForegroundMediaView {
        val resolved = StoryKeyframeResolver.resolve(
            keyframes = keyframes,
            currentTime = atSeconds,
            startTime = startTime.toFloat(),
            baseX = x,
            baseY = y,
            baseScale = scale,
            baseOpacity = opacity,
        )
        val transitions = if (duration > 0.0) {
            clipTransitions.filter { it.fromClipId == id || it.toClipId == id }
        } else {
            emptyList()
        }
        val fadeEnvelope = StoryMediaFadeResolver.fadeOpacity(
            fadeIn = fadeIn.takeIf { it > 0.0 },
            fadeOut = fadeOut.takeIf { it > 0.0 },
            startTime = startTime,
            duration = duration.takeIf { it > 0.0 },
            currentTime = atSeconds.toDouble(),
        )
        if (resolved == null && transitions.isEmpty() && fadeEnvelope == null) return this

        val base = resolved ?: ResolvedKeyframeTransform(x = x, y = y, scale = scale, opacity = opacity)
        val transitionOpacity = if (transitions.isEmpty()) {
            1.0
        } else {
            StoryClipTransitionResolver.opacity(
                mediaId = id,
                startTime = startTime,
                duration = duration,
                transitions = transitions,
                currentTime = atSeconds.toDouble(),
            )
        }
        val opacityBase = fadeEnvelope ?: base.opacity
        return copy(
            x = base.x,
            y = base.y,
            scale = base.scale,
            opacity = opacityBase * transitionOpacity,
        )
    }
}

/**
 * A single slide projected for the viewer. Pure data.
 *
 * Background media is EITHER [imageUrl] (static) OR [backgroundVideoUrl]
 * (looping video) — never both; a video background never populates [imageUrl]
 * so the viewer's `AsyncImage` branch (Coil, image-only) is never handed a
 * video URL it cannot decode. [foregroundMedia] layers extra video/image
 * objects on top; [backgroundAudioUrl]/[foregroundAudioUrl] are the resolved
 * playback URLs for the slide's background and foreground/voice audio tracks.
 */
@Immutable
data class StorySlideView(
    val id: String,
    val text: String,
    val isTranslated: Boolean,
    val imageUrl: String?,
    val accentHex: String,
    val reactionCount: Int = 0,
    val backgroundVideoUrl: String? = null,
    val backgroundLoop: Boolean = true,
    val foregroundMedia: List<StoryForegroundMediaView> = emptyList(),
    val textObjects: List<StoryTextObjectView> = emptyList(),
    val backgroundAudioUrl: String? = null,
    val foregroundAudioUrl: String? = null,
    /** Fenêtres de LECTURE des trois pistes de la slide (#5129) — `null` = entière. */
    val backgroundVideoWindow: StorySourceWindowMs? = null,
    val backgroundAudioWindow: StorySourceWindowMs? = null,
    val foregroundAudioWindow: StorySourceWindowMs? = null,
    val languageCode: String? = null,
    /**
     * How long this slide stays on screen before auto-advancing, in milliseconds.
     * Resolved once at projection time from the slide's effects via the shared
     * [StorySlideDuration] rule (author-pinned timeline duration → content-derived
     * → 6s default), so the viewer countdown honours per-slide timing instead of a
     * flat constant. Defaults to the 6s static baseline.
     */
    val autoAdvanceMillis: Int = StorySlideDuration.DEFAULT_STATIC_MS,
    /**
     * The author's colour backdrop (`StoryEffects.background`), parsed once at
     * projection time via the shared [StoryBackgroundValue] rule: a solid colour or
     * a two-colour gradient. `null` when the slide carries no background string — the
     * viewer then keeps its accent→black fallback. Painted only as the base layer when
     * the slide has no background media (media covers it), mirroring iOS's
     * `renderBackground` priority.
     */
    val background: StoryBackgroundValue? = null,
    /**
     * The framing (pan/zoom) the author applied to a background IMAGE, projected once
     * from the background media object via [StoryBackgroundObjectTransform]. iOS
     * aspect-fills the background then applies this on top (an Instagram-style "zoom
     * inside the background"); the viewer mirrors that with a `graphicsLayer` on the
     * image. [StoryBackgroundObjectTransform.IDENTITY] (the default) means a plain
     * aspect-fill — a video background or a legacy/flat story never carries one yet.
     */
    val backgroundTransform: StoryBackgroundObjectTransform = StoryBackgroundObjectTransform.IDENTITY,
    /**
     * The ThumbHash the viewer decodes into an instant blur behind the background
     * [imageUrl] while it loads — no black flash on cold load. Resolved once at
     * projection time via [StorySlidePlaceholder] (slide-level `effects.thumbHash`
     * then the flat background image's per-media hash). `null` when the slide
     * carries no usable hash: the image then loads over the plain background with
     * no placeholder, exactly as before.
     */
    val backgroundThumbHash: String? = null,
    /**
     * The locked repost attribution shown after the author's name when this slide
     * is a repost of someone else's story (repost icon + `@handle`, no "via"),
     * resolved once at projection time via [StoryRepostAttribution]. `null` for a
     * story that is not a repost — the header then shows only the author's name.
     */
    val repostAttribution: StoryRepostAttribution? = null,
    /**
     * The author's freehand drawing (`storyEffects.drawingStrokes`), rendered read-only
     * on top of [foregroundMedia]/[textObjects] by [StoryDrawingLayer] — a drawing-only
     * slide (no other publishable content) would otherwise reach the reader as a bare
     * background: the composer already lets it publish ([StorySlideDeck.publishableSlides]),
     * so the viewer must be able to show what was drawn.
     */
    val strokes: List<StoryDrawingStroke> = emptyList(),
    /** Les stickers posés sur la scène (iOS `StoryStickerLayer`), du plus bas au plus haut. */
    val stickers: List<StoryStickerView> = emptyList(),
    /** Les puces des sons de premier plan (iOS `AudioForegroundChip`). */
    val audioChips: List<StoryAudioChipView> = emptyList(),
    /** Déjà vue par le lecteur à l'ouverture : la lecture commence à la première non vue. */
    val isViewed: Boolean = false,
    /** Instant de publication, pour le « il y a 2 h » de l'en-tête ; `null` si illisible. */
    val createdAtMillis: Long? = null,
    /** Le look du fond (filtre de slide puis réglages) — neutre : aucun coût de rendu. */
    val lookRecipe: SceneLookRecipe = SceneLookRecipe.NEUTRAL,
) {
    /** La slide fait du son : vidéo de fond ou de premier plan, ou piste audio. */
    val hasSound: Boolean
        get() = backgroundVideoUrl != null || backgroundAudioUrl != null || foregroundAudioUrl != null ||
            foregroundMedia.any { it.isVideo }
}

/**
 * One language chip of the story language bar. Pure data.
 *
 * [isTranslatable] marks a language the viewer has configured but which the story
 * has no content for yet — tapping it requests an on-demand translation rather than
 * switching the display. [isTranslating] is true while that request is in flight.
 * A present (content) chip is neither.
 */
@Immutable
data class StoryLanguageOption(
    val code: String,
    val flag: String,
    val label: String,
    val isTranslatable: Boolean = false,
    val isTranslating: Boolean = false,
)

/**
 * Viewer state, derived from the cross-group [StoryPlayback] engine. The screen
 * reads the CURRENT group's slides plus the index so its segmented progress and
 * auto-advance stay simple; group roll-over and dismissal are decided by the
 * pure engine.
 */
data class StoryViewerUiState(
    val authorName: String = "",
    val slides: List<StorySlideView> = emptyList(),
    val index: Int = 0,
    val groupIndex: Int = 0,
    val isLoading: Boolean = true,
    val isDismissed: Boolean = false,
    val reactionCount: Int = 0,
    val myReactions: Set<String> = emptySet(),
    val quickReactions: List<String> = EmojiCatalog.defaultQuickReactions,
    val isOwnStory: Boolean = false,
    val currentStoryId: String? = null,
    val prefetchUrls: List<String> = emptyList(),
    val canAutoAdvance: Boolean = false,
    val availableLanguages: List<StoryLanguageOption> = emptyList(),
    val languageOverride: String? = null,
    /**
     * Ni le cache ni le réseau n'ont de story jouable pour l'auteur demandé : le lecteur
     * propose Réessayer et Fermer au lieu de se refermer seul ou d'ouvrir un autre auteur.
     */
    val loadFailed: Boolean = false,
    /**
     * Pause demandée par l'appui long (iOS `StoryGestureOverlayView`, ≥ 200 ms) : la
     * lecture se fige et l'interface s'efface ; le relâchement ne reprend PAS, le tap
     * suivant reprend sans naviguer.
     */
    val isPaused: Boolean = false,
    /** Coupure du son pour toute la session de lecture (iOS `isGlobalMuted`). */
    val isMuted: Boolean = false,
    /** Avatar de l'auteur du groupe courant, résolu ; `null` ⇒ initiales. */
    val authorAvatarUrl: String? = null,
) {
    val current: StorySlideView? get() = slides.getOrNull(index)
    val hasNext: Boolean get() = index < slides.lastIndex
    val hasPrevious: Boolean get() = index > 0
}
