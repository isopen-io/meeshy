package me.meeshy.sdk.model.card

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.card.PostCommentCardMode.CHOSEN_REPLIES
import me.meeshy.sdk.model.card.PostCommentCardMode.COMMENT_ALONE
import me.meeshy.sdk.model.card.PostCommentCardMode.POST_AND_COMMENT
import me.meeshy.sdk.model.card.PostCommentCardMode.POST_ROOT_AND_REPLY
import me.meeshy.sdk.model.card.PostCommentCardMode.THREAD_TO_HERE
import org.junit.Test

/**
 * #13922 — « Imager » un commentaire compose la carte d'iOS : les témoins de `PostCommentCardCompositionTests.swift` et de
 * `comment-card-composition.test.ts`, portés cas pour cas sur ce que la carte Android peint.
 */
class PostCommentCardCompositionTest {

    private val viewer = PostCommentCardViewer(id = "me", displayName = "Moi")
    private val labels = PostCommentCardLabels(thread = "Fil de commentaires", folded = { "+$it réponses" })
    private val t0 = 1_800_000_000_000L
    private fun at(minutes: Int) = t0 + minutes * 60_000L

    private fun post(
        text: String = "Le coucher de soleil à Dakar",
        type: String? = null,
        visibility: String? = "PUBLIC",
        media: List<PostCommentCardMedia> = emptyList(),
    ) = PostCommentCardPost(
        type = type, visibility = visibility, createdAtMillis = at(0),
        author = PostCommentCardAuthor("awa", "Awa", "awa"), text = text, media = media,
    )

    private fun comment(id: String, author: String, text: String, minute: Int, parent: String? = null, flags: Long = 0, media: List<PostCommentCardMedia> = emptyList()) =
        PostCommentCardComment(
            id = id, parentId = parent, createdAtMillis = at(minute), author = PostCommentCardAuthor(author.lowercase(), author, author.lowercase()),
            text = text, effectFlags = flags, media = media,
        )

    private val root = comment("root", "Bob", "Magnifique !", 1)
    private val r1 = comment("r1", "Cleo", "Tu étais où ?", 2, parent = "root")
    private val r2 = comment("r2", "Bob", "Sur la corniche", 3, parent = "root")
    private val r3 = comment("r3", "Dan", "J’y vais demain", 4, parent = "root")
    private val later = comment("r4", "Eve", "Écrit après", 9, parent = "root")
    private val photo = PostCommentCardMedia("pic", PostCommentCardMediaKind.IMAGE)

    private fun source(target: PostCommentCardComment, support: PostCommentCardPost? = post(), thread: List<PostCommentCardComment> = listOf(root, r1, r2, r3, later)) =
        PostCommentCardSource(support, target, thread, viewer)

    private fun blocks(from: PostCommentCardSource, mode: PostCommentCardMode, showsPost: Boolean = mode.showsPostByDefault, chosen: Set<String> = emptySet()) =
        PostCommentCardComposition.blocks(from, PostCommentCardChoice(mode, showsPost, chosen)).map {
            when (it) {
                is PostCommentCardBlock.Post -> "post"
                is PostCommentCardBlock.Comment -> it.id
                is PostCommentCardBlock.Folded -> "+${it.count}"
            }
        }

    private fun subject(from: PostCommentCardSource, mode: PostCommentCardMode, showsPost: Boolean = mode.showsPostByDefault) =
        PostCommentCardComposition.subject(from, PostCommentCardChoice(mode, showsPost), labels)

    @Test
    fun `a top-level comment opens on the post then the comment, or the comment alone`() {
        val from = source(root)

        assertThat(PostCommentCardComposition.modes(from)).containsExactly(POST_AND_COMMENT, COMMENT_ALONE).inOrder()
        assertThat(blocks(from, POST_AND_COMMENT)).containsExactly("post", "root").inOrder()
        assertThat(blocks(from, COMMENT_ALONE)).containsExactly("root")
        assertThat(blocks(from, POST_AND_COMMENT, showsPost = false)).containsExactly("root")
        assertThat(PostCommentCardComposition.modes(source(root, support = null))).containsExactly(COMMENT_ALONE)
    }

    @Test
    fun `a reply opens on its thread, never on what came after it`() {
        val from = source(r2)

        assertThat(PostCommentCardComposition.modes(from)).containsExactly(THREAD_TO_HERE, POST_ROOT_AND_REPLY, CHOSEN_REPLIES).inOrder()
        assertThat(blocks(from, THREAD_TO_HERE)).containsExactly("root", "r1", "r2").inOrder()
        assertThat(blocks(source(r3, thread = listOf(r3, later, r1, root, r2)), THREAD_TO_HERE)).containsExactly("root", "r1", "r2", "r3").inOrder()
        assertThat(blocks(source(r3), POST_ROOT_AND_REPLY)).containsExactly("post", "root", "r3").inOrder()
        assertThat(blocks(source(r3), CHOSEN_REPLIES, chosen = setOf("r2", "root"))).containsExactly("root", "r2", "r3").inOrder()
        assertThat(PostCommentCardComposition.initialChoice(from)).containsExactly("root", "r1")
    }

    @Test
    fun `a reply whose root is not loaded composes nothing but falls back to the comment alone`() {
        val from = source(r2, thread = listOf(r1, r2))

        assertThat(PostCommentCardComposition.modes(from)).isEmpty()
        assertThat(PostCommentCardComposition.fallsBackToCommentAlone(from)).isTrue()
    }

    @Test
    fun `a protected comment, or a reply under a protected ancestor, never images`() {
        val ephemeral = comment("x", "Bob", "Secret", 1, flags = MessageEffectFlags.EPHEMERAL)
        val viewOnceRoot = comment("root", "Bob", "Vue unique", 1, flags = MessageEffectFlags.VIEW_ONCE)
        val underProtected = source(r2, thread = listOf(viewOnceRoot, r1, r2))

        assertThat(PostCommentCardComposition.modes(source(ephemeral))).isEmpty()
        assertThat(subject(source(ephemeral), POST_AND_COMMENT)).isNull()
        assertThat(PostCommentCardComposition.modes(underProtected)).isEmpty()
        assertThat(PostCommentCardComposition.fallsBackToCommentAlone(underProtected)).isFalse()
        assertThat(PostCommentCardComposition.fallsBackToCommentAlone(source(r2, thread = listOf(viewOnceRoot, r2)))).isFalse()
    }

    @Test
    fun `a protected or in-flight neighbour stays out of the thread`() {
        val blurred = comment("r1", "Cleo", "Flouté", 2, parent = "root", flags = MessageEffectFlags.BLURRED)

        assertThat(blocks(source(r2, thread = listOf(root, blurred, r2, r3)), THREAD_TO_HERE)).containsExactly("root", "r2").inOrder()
        assertThat(blocks(source(r2, thread = listOf(root, r1.copy(inFlight = true), r2)), THREAD_TO_HERE)).containsExactly("root", "r2").inOrder()
        assertThat(PostCommentCardComposition.modes(source(root.copy(inFlight = true)))).isEmpty()
    }

    @Test
    fun `only a PUBLIC support goes on top, and its audience says why it is withheld`() {
        listOf("FRIENDS", "COMMUNITY", "PRIVATE", "EXCEPT", "ONLY", null).forEach { audience ->
            val from = source(root, support = post(visibility = audience))
            assertThat(PostCommentCardComposition.modes(from)).containsExactly(COMMENT_ALONE)
            assertThat(PostCommentCardComposition.withheldByAudience(from)).isTrue()
        }
        assertThat(PostCommentCardComposition.withheldByAudience(source(root))).isFalse()
        assertThat(PostCommentCardComposition.withheldByAudience(source(root, support = null))).isFalse()
    }

    @Test
    fun `a story or a status goes on top only through its visual, which is the hero`() {
        listOf("STORY", "STATUS").forEach { type ->
            assertThat(PostCommentCardComposition.modes(source(root, support = post(type = type)))).containsExactly(COMMENT_ALONE)
            val voice = PostCommentCardMedia("v", PostCommentCardMediaKind.AUDIO)
            assertThat(PostCommentCardComposition.modes(source(root, support = post(type = type, media = listOf(voice))))).containsExactly(COMMENT_ALONE)
            val card = subject(source(root, support = post(type = type, media = listOf(photo))), POST_AND_COMMENT)
            assertThat(card?.media?.map { it.media.id to it.hero }).containsExactly("pic" to true)
        }
    }

    @Test
    fun `two blocks are a quotation and a reply`() {
        val card = subject(source(root), POST_AND_COMMENT)

        assertThat(card?.quoted).isEqualTo(PostCommentCardPart("Awa", "Le coucher de soleil à Dakar", "awa"))
        assertThat(card?.reply).isEqualTo(PostCommentCardPart("Bob", "Magnifique !", "bob"))
        assertThat(card?.thread).isEmpty()
        assertThat(card?.sentAtMillis).isEqualTo(root.createdAtMillis)
        assertThat(card?.quotedAtMillis).isEqualTo(at(0))
        assertThat(subject(source(root), COMMENT_ALONE)?.quoted).isNull()
    }

    @Test
    fun `beyond two blocks the thread is ONE block titled Comment thread, one line per comment, the reply last`() {
        val card = subject(source(r2), THREAD_TO_HERE)

        assertThat(card?.quoted?.text).isEqualTo("Magnifique !")
        assertThat(card?.reply).isEqualTo(PostCommentCardPart("Fil de commentaires", "Cleo : Tu étais où ?\nBob : Sur la corniche", null))
        assertThat(card?.thread?.map { it.level }).containsExactly(1, 1).inOrder()
    }

    @Test
    fun `with the post on top, the root joins the thread at level zero`() {
        val card = subject(source(r2), POST_ROOT_AND_REPLY)

        assertThat(card?.quoted?.author).isEqualTo("Awa")
        assertThat(card?.thread).containsExactly(
            PostCommentCardThreadLine("Bob : Magnifique !", 0),
            PostCommentCardThreadLine("Bob : Sur la corniche", 1),
        ).inOrder()
    }

    @Test
    fun `a long thread folds its middle and says how many replies it folded`() {
        val replies = (1..9).map { comment("m$it", "U$it", "R$it", it + 1, parent = "root") }
        val from = source(replies.last(), thread = listOf(root) + replies)

        assertThat(blocks(from, THREAD_TO_HERE)).containsExactly("root", "+5", "m6", "m7", "m8", "m9").inOrder()
        assertThat(blocks(from, THREAD_TO_HERE, showsPost = true)).containsExactly("post", "root", "+6", "m7", "m8", "m9").inOrder()
        assertThat(subject(from, THREAD_TO_HERE)?.thread?.first()).isEqualTo(PostCommentCardThreadLine("+5 réponses", 1))
    }

    @Test
    fun `the post text is cut at four lines and 280 characters, and to a short excerpt under its hero`() {
        assertThat(PostCommentCardComposition.excerpt(List(6) { "ligne" }.joinToString("\n"))).isEqualTo("ligne\nligne\nligne\nligne…")
        val cut = PostCommentCardComposition.excerpt(List(120) { "mot" }.joinToString(" "))
        assertThat(cut).endsWith("mot…")
        assertThat(cut.length).isAtMost(PostCommentCardLimits.MAX_POST_CHARACTERS + 1)
        assertThat(PostCommentCardComposition.excerpt("Court")).isEqualTo("Court")
        val hero = subject(source(root, support = post(text = "un\ndeux\ntrois\nquatre", media = listOf(photo))), POST_AND_COMMENT)
        assertThat(hero?.quoted?.text).isEqualTo("un\ndeux…")
        assertThat(subject(source(root, support = post(text = "  ", media = listOf(photo))), POST_AND_COMMENT)?.quoted?.text).isEqualTo("📷")
    }

    @Test
    fun `the viewer is named as they name themselves, and a textless comment by its media symbols`() {
        val mine = comment("mine", "x", "Je confirme", 1).copy(author = PostCommentCardAuthor("me", "moi-pseudo", "moi"))
        val voice = comment("r1", "Cleo", " ", 2, parent = "root", media = listOf(PostCommentCardMedia("a", PostCommentCardMediaKind.AUDIO), PostCommentCardMedia("v", PostCommentCardMediaKind.VIDEO)))

        assertThat(subject(source(mine), COMMENT_ALONE)?.reply?.author).isEqualTo("Moi")
        assertThat(subject(source(r2, thread = listOf(root, voice, r2)), THREAD_TO_HERE)?.thread?.first()?.text).isEqualTo("Cleo : 🎤 🎬")
    }

    @Test
    fun `the default card is the first mode with its defaults`() {
        assertThat(PostCommentCardComposition.defaultSubject(source(r2), labels)).isEqualTo(subject(source(r2), THREAD_TO_HERE))
        assertThat(PostCommentCardComposition.defaultSubject(source(root), labels)).isEqualTo(subject(source(root), POST_AND_COMMENT))
        assertThat(PostCommentCardComposition.defaultSubject(source(r2, thread = listOf(r2)), labels)).isNull()
    }

    @Test
    fun `Imager opens the default card, the comment alone when its thread is not loaded, nothing when protected`() {
        assertThat(PostCommentCardComposition.cardOf(source(r2), labels)).isEqualTo(subject(source(r2), THREAD_TO_HERE))
        val alone = PostCommentCardComposition.cardOf(source(r2, thread = listOf(r2)), labels)
        assertThat(alone?.quoted).isNull()
        assertThat(alone?.reply).isEqualTo(PostCommentCardPart("Bob", "Sur la corniche", "bob"))
        val viewOnceRoot = comment("root", "Bob", "Vue unique", 1, flags = MessageEffectFlags.VIEW_ONCE)
        assertThat(PostCommentCardComposition.cardOf(source(r2, thread = listOf(viewOnceRoot, r2)), labels)).isNull()
        assertThat(PostCommentCardComposition.cardOf(source(comment("x", "Bob", "Secret", 1, flags = MessageEffectFlags.EPHEMERAL)), labels)).isNull()
    }
}
