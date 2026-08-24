package me.meeshy.sdk.model

/**
 * Prisme Linguistique — realtime merge of per-text-object overlay translations.
 *
 * The canvas sibling of [StoryTranslationMerge] (which merges the caption). The
 * gateway broadcasts `story:translation-updated` (`{ postId, textObjectIndex,
 * translations }`) once it has translated a story's on-canvas text overlay; the
 * open viewer folds those translations into the cached [StoryItem] so the reader —
 * who resolves overlays via their preferred language chain — switches to the
 * requested language the instant it lands, with no refetch.
 *
 * Port of the iOS `StoryItem.mergingTextObjectTranslations(at:translations:)`.
 * Immutable throughout: [StoryItem]/[StoryEffects]/[StoryTextObject] are data
 * classes, so the merge rebuilds only the targeted text object via `copy`.
 */
object StoryTextObjectTranslationMerge {

    /**
     * Merge [translations] into the text object at [textObjectIndex], returning a
     * copy with the existing languages of that object overwritten and new ones
     * added. The story is returned **unchanged** when the merge is a no-op:
     *  - [translations] is empty (nothing to store);
     *  - the story carries no [StoryEffects];
     *  - [textObjectIndex] is out of range (negative or ≥ the text-object count).
     */
    fun merge(item: StoryItem, textObjectIndex: Int, translations: Map<String, String>): StoryItem {
        if (translations.isEmpty()) return item
        val effects = item.storyEffects ?: return item
        val objects = effects.textObjects
        if (textObjectIndex < 0 || textObjectIndex >= objects.size) return item

        val target = objects[textObjectIndex]
        val merged = target.translations.orEmpty() + translations
        val updated = objects.mapIndexed { index, obj ->
            if (index == textObjectIndex) obj.copy(translations = merged) else obj
        }
        return item.copy(storyEffects = effects.copy(textObjects = updated))
    }
}
