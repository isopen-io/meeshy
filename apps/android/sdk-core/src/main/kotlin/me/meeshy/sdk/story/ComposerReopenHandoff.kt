package me.meeshy.sdk.story

/**
 * Le brouillon d'un composeur de story démonté AVEC sa racine (iOS `RootNavigationHandoff`, #7712) : la racine
 * qui le portait part, la suivante le rouvre dessus, UNE fois. Seule la racine montée, et qui ne présente pas
 * déjà le composeur, peut le prendre ; le revoir à l'écran annule l'annonce.
 */
public class ComposerReopenHandoff {
    private var tornDownDraftId: String? = null
    private var mountedRoot: Any? = null

    public fun rootAppeared(root: Any) {
        mountedRoot = root
    }

    public fun rootDisappeared(root: Any) {
        if (mountedRoot == root) mountedRoot = null
    }

    public fun noteComposerTornDown(draftId: String) {
        tornDownDraftId = draftId
    }

    public fun composerAppeared() {
        tornDownDraftId = null
    }

    public fun takeComposerToReopen(presentingComposer: Boolean, root: Any): String? {
        if (presentingComposer || mountedRoot != root) return null
        return tornDownDraftId?.also { tornDownDraftId = null }
    }
}
