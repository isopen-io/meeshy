package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryKeyframe

/** La pose d'un objet à un instant : position/échelle/rotation normalisées et opacité composée. */
public data class ScenePose(
    val x: Double,
    val y: Double,
    val scale: Double,
    val rotation: Double,
    val opacity: Double,
)

/**
 * La composition d'opacité : enveloppe de fondu, sinon opacité de keyframe, sinon base. Les
 * transitions de clips multiplient ensuite les opacités sortante et entrante d'un même média.
 */
public object SceneOpacityComposition {

    public fun compose(fade: Double?, keyframe: Double?, base: Double = 1.0): Double =
        (fade ?: keyframe ?: base).coerceIn(0.0, 1.0)

    public fun withTransitions(opacity: Double, transitionFactor: Double): Double =
        (opacity * transitionFactor).coerceIn(0.0, 1.0)
}

internal val MeeshySceneObject.fadeInSeconds: Double?
    get() = when (this) {
        is MeeshySceneObject.Text -> value.fadeIn
        is MeeshySceneObject.Media -> value.fadeIn
        is MeeshySceneObject.Sticker -> value.fadeIn
        is MeeshySceneObject.Place -> value.fadeIn
        is MeeshySceneObject.Audio -> value.fadeIn?.toDouble()
    }

internal val MeeshySceneObject.fadeOutSeconds: Double?
    get() = when (this) {
        is MeeshySceneObject.Text -> value.fadeOut
        is MeeshySceneObject.Media -> value.fadeOut
        is MeeshySceneObject.Sticker -> value.fadeOut
        is MeeshySceneObject.Place -> value.fadeOut
        is MeeshySceneObject.Audio -> value.fadeOut?.toDouble()
    }

internal val MeeshySceneObject.keyframeList: List<StoryKeyframe>?
    get() = when (this) {
        is MeeshySceneObject.Text -> value.keyframes
        is MeeshySceneObject.Media -> value.keyframes
        is MeeshySceneObject.Audio -> value.keyframes
        is MeeshySceneObject.Sticker, is MeeshySceneObject.Place -> null
    }

/** Résolution de la pose en lecture : base tenue avant la première keyframe de chaque canal. */
public object ScenePoseResolver {

    public fun resolve(
        obj: MeeshySceneObject,
        time: Double,
        clipTransitions: List<StoryClipTransition> = emptyList(),
    ): ScenePose {
        val start = obj.startTime ?: 0.0
        val keyframed = StoryKeyframeResolver.resolve(
            keyframes = obj.keyframeList,
            currentTime = time.toFloat(),
            startTime = start.toFloat(),
            baseX = obj.x,
            baseY = obj.y,
            baseScale = obj.scale,
            baseOpacity = 1.0,
        )
        val fade = StoryMediaFadeResolver.fadeOpacity(
            fadeIn = obj.fadeInSeconds,
            fadeOut = obj.fadeOutSeconds,
            startTime = obj.startTime,
            duration = obj.duration?.takeIf { it > 0.0 },
            currentTime = time,
        )
        val composed = SceneOpacityComposition.compose(
            fade = fade,
            keyframe = keyframed?.opacity,
        )
        return ScenePose(
            x = keyframed?.x ?: obj.x,
            y = keyframed?.y ?: obj.y,
            scale = keyframed?.scale ?: obj.scale,
            rotation = obj.rotation,
            opacity = SceneOpacityComposition.withTransitions(composed, transitionFactor(obj, time, clipTransitions)),
        )
    }

    /** Facteur des transitions de clips : seuls les médias à fenêtre finie en portent. */
    private fun transitionFactor(
        obj: MeeshySceneObject,
        time: Double,
        transitions: List<StoryClipTransition>,
    ): Double {
        val media = (obj as? MeeshySceneObject.Media)?.value ?: return 1.0
        val duration = media.duration?.takeIf { it > 0.0 } ?: return 1.0
        if (transitions.none { it.fromClipId == media.id || it.toClipId == media.id }) return 1.0
        return StoryClipTransitionResolver.opacity(
            mediaId = media.id,
            startTime = media.startTime ?: 0.0,
            duration = duration,
            transitions = transitions,
            currentTime = time,
        )
    }
}
