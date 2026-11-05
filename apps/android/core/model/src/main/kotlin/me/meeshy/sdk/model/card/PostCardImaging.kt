package me.meeshy.sdk.model.card

public object PostCardImaging {

    public fun cardOf(post: PostCommentCardPost, ephemeral: Boolean): PostCommentCardSubject? {
        if (ephemeral || post.disappears) return null
        val text = post.text.trim()
        if (text.isEmpty() && post.media.isEmpty()) return null
        val part = PostCommentCardPart(
            author = nameOf(post.author),
            text = text.ifEmpty { post.media.joinToString(" ") { it.kind.symbol } },
            handle = handleOf(post.author),
        )
        val signature = PostCommentCardMediaAuthor(part.author, part.handle, quoted = false)
        return PostCommentCardSubject(
            quoted = null,
            reply = part,
            thread = emptyList(),
            sentAtMillis = post.createdAtMillis,
            quotedAtMillis = null,
            media = post.media.take(PostCommentCardLimits.MAX_MEDIA).map { PostCommentCardPlacedMedia(it, signature, hero = false) },
        )
    }

    private val PostCommentCardPost.disappears: Boolean
        get() = type?.uppercase().let { it == "STORY" || it == "STATUS" }

    private fun nameOf(author: PostCommentCardAuthor): String =
        listOf(author.displayName, author.username).firstNotNullOfOrNull { it?.trim()?.takeIf(String::isNotEmpty) } ?: "Meeshy"

    private fun handleOf(author: PostCommentCardAuthor): String? =
        author.username?.trim()?.trimStart('@')?.takeIf { it.isNotEmpty() }
}
