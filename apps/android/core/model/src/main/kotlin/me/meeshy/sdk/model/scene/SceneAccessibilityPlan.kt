package me.meeshy.sdk.model.scene

/**
 * Ce que TalkBack lit d'une scène (miroir de `StoryCanvasUIView+Accessibility`, iOS) : un résumé, puis chaque
 * objet avec ses actions personnalisées — les mêmes que le menu d'appui long. Le plan ne porte aucune chaîne
 * localisée : il dit QUOI lire, l'écran le met en mots.
 */
public object SceneAccessibilityPlan {

    public sealed interface Label {
        /** Un texte non vide, lu dans la langue servie par le Prisme. */
        public data class Text(val content: String) : Label
        public data object EmptyText : Label
        public data class Media(val video: Boolean, val background: Boolean) : Label
        /** [unicodeName] : le nom Unicode de l'emoji, `null` si l'identifiant n'en est pas un. */
        public data class Sticker(val unicodeName: String?) : Label
        public data class Place(val name: String?) : Label
        public data object Audio : Label
        public data object Drawing : Label
    }

    public data class Entry(
        val id: String,
        val kind: MeeshySceneObject.Kind,
        val label: Label,
        val actions: List<SceneObjectMenuPlan.Action>,
    )

    public data class Summary(val count: Int, val labels: List<Label>)

    public data class Plan(val summary: Summary?, val entries: List<Entry>)

    public val EMPTY: Plan = Plan(null, emptyList())

    /**
     * Pas de résumé sur une slide vide : la surface de départ porte ses propres libellés, un résumé fantôme ferait
     * doublon. Le dessin compte dans le résumé sans être touchable.
     */
    public fun build(
        lists: SceneLists,
        readers: SceneReaderLanguages = SceneReaderLanguages.NONE,
        hasDrawing: Boolean = false,
        capabilities: SceneObjectMenuPlan.Capabilities = SceneObjectMenuPlan.Capabilities(),
    ): Plan {
        val objects = lists.texts.map { MeeshySceneObject.Text(it) } +
            lists.medias.map { MeeshySceneObject.Media(it) } +
            lists.stickers.map { MeeshySceneObject.Sticker(it) } +
            lists.places.map { MeeshySceneObject.Place(it) } +
            lists.audios.map { MeeshySceneObject.Audio(it) }
        val entries = objects.map { obj ->
            Entry(
                id = obj.id,
                kind = obj.kind,
                label = labelOf(obj, readers),
                actions = SceneObjectMenuPlan.offered(lists, obj.id, capabilities),
            )
        }
        val labels = entries.map { it.label } + if (hasDrawing) listOf(Label.Drawing) else emptyList()
        if (labels.isEmpty()) return EMPTY
        return Plan(Summary(labels.size, labels), entries)
    }

    private fun labelOf(obj: MeeshySceneObject, readers: SceneReaderLanguages): Label = when (obj) {
        is MeeshySceneObject.Text -> {
            val served = readers.serve(obj.value.sourceLanguage, obj.value.translations)?.text ?: obj.value.text
            served.trim().let { if (it.isEmpty()) Label.EmptyText else Label.Text(it) }
        }
        is MeeshySceneObject.Media -> Label.Media(
            video = obj.value.kind == me.meeshy.sdk.model.StoryMediaKind.VIDEO,
            background = obj.value.isBackground,
        )
        is MeeshySceneObject.Sticker -> Label.Sticker(unicodeName(obj.value.emoji))
        is MeeshySceneObject.Place -> Label.Place(obj.value.place.name?.takeIf { it.isNotEmpty() })
        is MeeshySceneObject.Audio -> Label.Audio
    }

    /** « 🔥 » -> « Fire » : le nom Unicode du premier point de code, en casse titre. */
    internal fun unicodeName(emoji: String): String? {
        if (emoji.isEmpty()) return null
        val name = Character.getName(emoji.codePointAt(0)) ?: return null
        return name.lowercase().split(' ').filter { it.isNotEmpty() }
            .joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } }
            .takeIf { it.isNotEmpty() }
    }
}
