package me.meeshy.sdk.story

/**
 * Reprend le brouillon UNIQUE de l'ancien emplacement (DataStore) dans le magasin à brouillons multiples, sans le perdre :
 * l'ancien emplacement n'est vidé qu'après que le nouveau a confirmé l'écriture.
 */
public class LegacyDraftMigrator(
    private val legacy: StoryComposerDraftStore,
    private val store: StoryDraftStoring,
    private val newId: () -> String = StoryDraftStoring::newDraftId,
) {
    /** L'identifiant du brouillon migré, ou `null` quand il n'y avait rien à migrer (ou que l'écriture a échoué : l'ancien reste). */
    public suspend fun migrate(): String? {
        val snapshot = legacy.load() ?: return null
        if (!snapshot.isWorthRestoring) {
            legacy.clear()
            return null
        }
        val id = newId()
        if (!store.save(id, snapshot, emptyMap())) return null
        legacy.clear()
        return id
    }
}
