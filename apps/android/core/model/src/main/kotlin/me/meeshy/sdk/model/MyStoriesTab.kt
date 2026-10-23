package me.meeshy.sdk.model

/**
 * Les quatre onglets de « Mes stories » — port de `MyStoriesTab` / `MyStoriesTabResolver`
 * (apps/ios/Meeshy/Features/Main/Views/MyStoriesTab.swift). Chaque onglet reste
 * complètement distinct : Publiées = stories actives, File = travail réseau (envois
 * actifs ou échecs), Brouillons = contenu local jamais envoyé, Archive = stories expirées.
 */
enum class MyStoriesTab { PUBLISHED, QUEUE, DRAFTS, ARCHIVE }

object MyStoriesTabResolver {

    /**
     * L'onglet d'ouverture, choisi UNE fois : Publiées si une story est active, sinon File
     * quand un envoi ou un échec attend une action, sinon Brouillons s'il y en a, sinon
     * Publiées. Archive n'est jamais un atterrissage initial.
     */
    fun initialTab(
        hasPublishedStories: Boolean,
        hasQueueWork: Boolean,
        hasDraftWork: Boolean,
    ): MyStoriesTab = when {
        hasPublishedStories -> MyStoriesTab.PUBLISHED
        hasQueueWork -> MyStoriesTab.QUEUE
        hasDraftWork -> MyStoriesTab.DRAFTS
        else -> MyStoriesTab.PUBLISHED
    }

    /**
     * Publiées et Brouillons sont toujours visibles ; File et Archive n'apparaissent que
     * lorsqu'ils ont de la matière (pas de matière, pas d'onglet).
     */
    fun visibleTabs(hasQueueWork: Boolean, hasArchivedStories: Boolean): List<MyStoriesTab> =
        buildList {
            add(MyStoriesTab.PUBLISHED)
            if (hasQueueWork) add(MyStoriesTab.QUEUE)
            add(MyStoriesTab.DRAFTS)
            if (hasArchivedStories) add(MyStoriesTab.ARCHIVE)
        }

    /** Revient sur Publiées quand l'onglet courant n'est plus visible (il a perdu sa matière). */
    fun tabAfterContentChange(current: MyStoriesTab, visibleTabs: List<MyStoriesTab>): MyStoriesTab =
        if (current in visibleTabs) current else MyStoriesTab.PUBLISHED

    fun shouldShowEmptyState(
        tab: MyStoriesTab,
        hasPublishedStories: Boolean,
        hasDrafts: Boolean,
        hasActiveUpload: Boolean,
        hasFailedItems: Boolean,
        hasArchivedStories: Boolean,
    ): Boolean = when (tab) {
        MyStoriesTab.PUBLISHED -> !hasPublishedStories
        MyStoriesTab.QUEUE -> !hasActiveUpload && !hasFailedItems
        MyStoriesTab.DRAFTS -> !hasDrafts
        MyStoriesTab.ARCHIVE -> !hasArchivedStories
    }
}
