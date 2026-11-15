package me.meeshy.app.feed

/**
 * La forme de la liste du fil (#13653) : sa TÊTE — le rail de stories, puis la porte du composeur (iOS `FeedView` :
 * `StoryTrayView`, puis `composerPlaceholder`, dans le contenu qui défile) — puis un post par ligne. Une lecture par
 * index de ligne passe par ici, jamais par `posts[index]`.
 */
internal object FeedListLayout {
    const val HEAD_ITEMS: Int = 2

    /** Le post que désigne la ligne [listIndex] ; la tête désigne le premier post. */
    fun postIndexAt(listIndex: Int): Int = (listIndex - HEAD_ITEMS).coerceAtLeast(0)
}
