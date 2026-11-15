package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryClipTransition

/**
 * Le plan de rendu PUR et UNIQUE (miroir de `StoryRenderer.render`) : ce qu'on compose, ce
 * qu'on lit, la couverture et l'export décident de la même liste d'éléments, dans le même
 * ordre de peinture.
 *
 * - [SceneRenderMode.EDIT] : tout est visible à pleine opacité, texte source.
 * - [SceneRenderMode.PLAY] : un objet hors de sa fenêtre n'existe pas — sauf si
 *   [ghostOpacity] est posé (aperçu de frise à l'arrêt) : il est alors un fantôme.
 */
public object SceneRenderPlanner {

    public fun plan(
        lists: SceneLists,
        time: Double,
        mode: SceneRenderMode,
        languages: SceneReaderLanguages = SceneReaderLanguages.NONE,
        clipTransitions: List<StoryClipTransition> = emptyList(),
        ghostOpacity: Double? = null,
    ): List<SceneRenderItem> {
        val items = lists.sceneObjects
            .filterNot { it.isBackground }
            .mapNotNull { render(it, time, mode, languages, clipTransitions, ghostOpacity) }
        return SceneLayerOrder.sorted(items, { it.plane }, { it.zIndex })
    }

    private fun render(
        obj: MeeshySceneObject,
        time: Double,
        mode: SceneRenderMode,
        languages: SceneReaderLanguages,
        clipTransitions: List<StoryClipTransition>,
        ghostOpacity: Double?,
    ): SceneRenderItem? {
        val inWindow = mode == SceneRenderMode.EDIT || isInWindow(obj, time)
        if (!inWindow && ghostOpacity == null) return null
        val served = if (mode == SceneRenderMode.PLAY) servedText(obj, languages) else null
        val pose = when {
            mode == SceneRenderMode.EDIT -> basePose(obj)
            inWindow -> ScenePoseResolver.resolve(obj, time, clipTransitions)
            else -> ScenePoseResolver.resolve(obj, time).copy(opacity = ghostOpacity ?: SCENE_GHOST_OPACITY)
        }
        val text = (obj as? MeeshySceneObject.Text)?.value
        return SceneRenderItem(
            source = obj,
            plane = SceneLayerOrder.plane(obj),
            pose = pose,
            presence = if (inWindow) ScenePresence.VISIBLE else ScenePresence.GHOST,
            displayText = text?.let { served?.text ?: it.text },
            servedLanguage = served?.language,
            readerLanguages = languages.languages,
            isLocked = text?.isLocked == true,
        )
    }

    private fun isInWindow(obj: MeeshySceneObject, time: Double): Boolean =
        StoryElementVisibility.isVisible(obj.startTime ?: 0.0, obj.duration ?: 0.0, time)

    private fun basePose(obj: MeeshySceneObject) =
        ScenePose(obj.x, obj.y, obj.scale, obj.rotation, opacity = 1.0)

    private fun servedText(obj: MeeshySceneObject, languages: SceneReaderLanguages) =
        (obj as? MeeshySceneObject.Text)?.value?.let { languages.serve(it.sourceLanguage, it.translations) }
}
