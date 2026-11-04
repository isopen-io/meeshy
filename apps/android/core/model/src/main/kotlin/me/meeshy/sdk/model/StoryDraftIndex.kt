package me.meeshy.sdk.model

/**
 * L'index des brouillons de story (iOS `StoryDraftStore.listDrafts`) : la règle PURE qui range, résume et unifie les
 * brouillons de la bibliothèque et l'emplacement unique d'avant. Aucun disque ici : la bibliothèque lit, cette loi décide.
 *
 * - le tri est du plus récent au plus ancien, l'identifiant départageant deux dates égales (l'ordre ne tremble jamais) ;
 * - un identifiant est unique : le premier rencontré l'emporte ;
 * - le brouillon UNIQUE d'avant ([SLOT_ID]) se range comme n'importe quel brouillon, jamais perdu, jamais dédoublé.
 */
public object StoryDraftIndex {

    /** L'identifiant sous lequel l'emplacement unique du composeur se range tant qu'il n'a pas été versé à la bibliothèque. */
    public const val SLOT_ID: String = "composer-draft"

    /** Du plus récemment modifié au plus ancien ; à date égale, l'identifiant ; un identifiant déjà vu est écarté. */
    public fun sorted(drafts: List<StoryDraftSummary>): List<StoryDraftSummary> =
        drafts.distinctBy { it.id }.sortedWith(compareByDescending<StoryDraftSummary> { it.updatedAtMillis }.thenBy { it.id })

    /**
     * Les brouillons de la bibliothèque et l'emplacement unique, en une seule liste triée. Sur un identifiant commun,
     * l'emplacement (la copie la plus vivante : le composeur y écrit) l'emporte.
     */
    public fun merged(stored: List<StoryDraftSummary>, slot: StoryDraftSummary?): List<StoryDraftSummary> =
        sorted(listOfNotNull(slot) + stored)

    /** Le résumé de l'emplacement unique, ou `null` s'il ne vaut pas d'être repris. */
    public fun slotSummary(snapshot: StoryComposerDraftSnapshot?, nowMillis: Long): StoryDraftSummary? {
        if (snapshot == null || !snapshot.isWorthRestoring) return null
        val updated = isoToEpochMillisOrNull(snapshot.updatedAt)?.takeIf { it > 0L } ?: nowMillis
        return StoryDraftMeta.of(snapshot, updated, imageFileNames = emptyList())
            .toSummary(SLOT_ID, mediaDirPath = "") { false }
    }

    /** Un identifiant qui n'est pas déjà pris : le candidat suivant, tant que le précédent est occupé. */
    public fun freshId(taken: Set<String>, candidate: () -> String): String {
        var id = candidate()
        while (id in taken || id == SLOT_ID) id = candidate()
        return id
    }
}
