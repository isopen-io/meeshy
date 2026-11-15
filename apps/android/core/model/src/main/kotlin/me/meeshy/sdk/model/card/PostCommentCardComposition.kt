package me.meeshy.sdk.model.card

import me.meeshy.sdk.model.MessageEffectFlags

/**
 * **CE QU'« IMAGER » UN COMMENTAIRE MET SUR LA CARTE** (#13922) — fonction PURE, miroir de `PostCommentCardComposition`
 * (`packages/MeeshySDK/.../MessageCard/PostCommentCardComposition.swift`) et de sa jumelle web
 * (`packages/shared/utils/comment-card-composition.ts`) : mêmes modes, mêmes gardes, mêmes bornes, même ordre.
 *
 * Un commentaire de premier niveau : le post en tête puis le commentaire (défaut), ou le commentaire seul. Une RÉPONSE :
 * le fil jusqu'à elle (défaut), le post puis la racine puis elle, ou les réponses choisies — l'ordre chronologique gardé,
 * la réponse visée toujours incluse et dernière.
 *
 * GARDES (fail-closed) : un commentaire protégé (éphémère, flouté, vue unique) ou en vol ne s'image pas ; une réponse dont
 * un ANCÊTRE est protégé ne s'image dans aucun mode ; une réponse voisine protégée ou vide n'entre pas dans le fil. Un
 * support non PUBLIC, ou sans rien à montrer, ne se met pas en tête ; une story ou un statut ne s'y met que par son visuel.
 *
 * BORNES : le texte du post s'arrête à 4 lignes et 280 caractères, coupé au mot ; au plus 6 blocs — au-delà, le milieu
 * du fil se replie en « +N réponses » ; au plus 4 médias, celui du support d'abord.
 */
public object PostCommentCardComposition {

    /** Les modes qui composent une carte, le défaut en tête — vide : rien ne s'image. */
    public fun modes(source: PostCommentCardSource): List<PostCommentCardMode> {
        if (!source.target.isPaintable) return emptyList()
        val offersPost = postHead(source) != null
        if (source.target.parentId == null) {
            return if (offersPost) listOf(PostCommentCardMode.POST_AND_COMMENT, PostCommentCardMode.COMMENT_ALONE) else listOf(PostCommentCardMode.COMMENT_ALONE)
        }
        val chain = ancestors(source)
        if (chain == null || chain.any { it.isProtected }) return emptyList()
        return listOfNotNull(
            PostCommentCardMode.THREAD_TO_HERE,
            PostCommentCardMode.POST_ROOT_AND_REPLY.takeIf { offersPost },
            PostCommentCardMode.CHOSEN_REPLIES.takeIf { choosable(source).size >= 2 },
        )
    }

    public fun defaultMode(source: PostCommentCardSource): PostCommentCardMode? = modes(source).firstOrNull()

    /**
     * Le repli « commentaire seul » : aucun mode ne compose parce que le fil d'une réponse n'est pas chargé (sa racine
     * manque), mais elle est peignable et aucun ancêtre CONNU n'est protégé — la carte du commentaire seul s'offre.
     */
    public fun fallsBackToCommentAlone(source: PostCommentCardSource): Boolean {
        if (source.target.parentId == null || !source.target.isPaintable || modes(source).isNotEmpty()) return false
        return knownAncestors(source).none { it.isProtected }
    }

    /** Les commentaires qu'on peut cocher : la racine et ses réponses peignables, sans la réponse visée, dans l'ordre. */
    public fun choosable(source: PostCommentCardSource): List<PostCommentCardComment> {
        val root = rootOf(source) ?: return emptyList()
        val known = byId(source.thread)
        val tree = source.thread.filter { it.id == root.id || descends(root.id, it, known) }
        return chronological(tree.distinctBy { it.id }.filter { it.id != source.target.id && it.isPaintable })
    }

    /** Les cases cochées à l'ouverture de « Choisir les réponses » : le fil jusqu'ici. */
    public fun initialChoice(source: PostCommentCardSource): Set<String> =
        threadToHere(source).map { it.id }.filter { it != source.target.id }.toSet()

    public fun offersPost(source: PostCommentCardSource): Boolean = postHead(source) != null

    /** Les médias du support que la tête peut montrer — vide quand le support ne se met pas en tête. */
    public fun headMedia(source: PostCommentCardSource): List<PostCommentCardMedia> =
        source.post?.takeIf { postHead(source) != null }?.headCandidates.orEmpty()

    /** La place du média de tête par défaut : le premier visuel, à défaut le premier — `null` sans média. */
    public fun defaultHeadMediaIndex(source: PostCommentCardSource): Int? {
        val media = headMedia(source)
        if (media.isEmpty()) return null
        return media.indexOfFirst { it.kind.isVisual }.takeIf { it >= 0 } ?: 0
    }

    /** Le support existe mais son AUDIENCE le retient : vrai seulement quand le même support, public, serait en tête. */
    public fun withheldByAudience(source: PostCommentCardSource): Boolean {
        val post = source.post ?: return false
        if (post.isPublic) return false
        return postHead(source.copy(post = post.copy(visibility = PUBLIC))) != null
    }

    /** Le texte du post, lisible : [lines] lignes et [characters] caractères au plus, coupé à un mot. */
    public fun excerpt(
        text: String,
        lines: Int = PostCommentCardLimits.MAX_POST_LINES,
        characters: Int = PostCommentCardLimits.MAX_POST_CHARACTERS,
    ): String {
        val all = text.trim().split('\n')
        val kept = all.take(lines).joinToString("\n")
        val points = kept.codePoints().toArray()
        if (points.size <= characters) return if (all.size > lines) "${kept.trim()}…" else kept
        val prefix = String(points, 0, characters)
        val boundary = maxOf(prefix.lastIndexOf(' '), prefix.lastIndexOf('\n'))
        val cut = if (boundary == -1) prefix else prefix.substring(0, boundary)
        return "${cut.trim()}…"
    }

    /** Les blocs de la carte, dans l'ordre — vide quand le mode ne s'offre pas. */
    public fun blocks(source: PostCommentCardSource, choice: PostCommentCardChoice): List<PostCommentCardBlock> {
        if (choice.mode !in modes(source)) return emptyList()
        val comments = commentsOf(source, choice)
        if (comments.isEmpty()) return emptyList()
        val head = if (choice.showsPost) postHead(source) else null
        val budget = PostCommentCardLimits.MAX_BLOCKS - if (head == null) 0 else 1
        return listOfNotNull<PostCommentCardBlock>(head?.let { PostCommentCardBlock.Post(it) }) + folded(comments, budget, source)
    }

    /** La carte du mode d'ouverture, avec ses défauts — `null` quand rien ne s'image. */
    public fun defaultSubject(source: PostCommentCardSource, labels: PostCommentCardLabels): PostCommentCardSubject? {
        val mode = defaultMode(source) ?: return null
        return subject(source, PostCommentCardChoice(mode, chosen = initialChoice(source)), labels)
    }

    /**
     * La carte qu'« Imager » ouvre (iOS `CommentMoreMenu.ownRequest`) : celle du mode d'ouverture ; à défaut, quand le fil
     * d'une réponse n'est pas chargé, le commentaire seul ; `null` quand rien ne s'image.
     */
    public fun cardOf(source: PostCommentCardSource, labels: PostCommentCardLabels): PostCommentCardSubject? =
        defaultSubject(source, labels) ?: if (fallsBackToCommentAlone(source)) alone(source) else null

    private fun alone(source: PostCommentCardSource): PostCommentCardSubject {
        val part = partOf(source.target, source)
        val author = PostCommentCardMediaAuthor(part.author, part.handle, quoted = false)
        return PostCommentCardSubject(
            quoted = null,
            reply = part,
            thread = emptyList(),
            sentAtMillis = source.target.createdAtMillis,
            quotedAtMillis = null,
            media = source.target.media.map { PostCommentCardPlacedMedia(it, author, hero = false) },
        )
    }

    /**
     * La carte que l'atelier peint pour ce choix — `null` quand rien ne s'image. Deux blocs : le premier en citation, le
     * second en réponse. Au-delà, le premier reste la citation et les suivants s'écrivent « Auteur : texte » dans UN bloc
     * titré [PostCommentCardLabels.thread], chacun à son niveau ; le pli dit [PostCommentCardLabels.folded].
     */
    public fun subject(source: PostCommentCardSource, choice: PostCommentCardChoice, labels: PostCommentCardLabels): PostCommentCardSubject? {
        val composed = blocks(source, choice)
        val first = composed.firstOrNull() ?: return null
        val last = composed.last()
        val lastPart = last.part ?: return null
        val headMedia = if (first is PostCommentCardBlock.Post) chosenHeadMedia(source, choice.headMediaIndex) else null
        val head = if (composed.size > 1) first.part else null
        val quoted = if (head != null && headMedia != null) heroLine(head, source, headMedia.kind) else head
        val rest = if (composed.size > 1) composed.drop(1) else composed
        val base = composed.filterIsInstance<PostCommentCardBlock.Comment>().firstOrNull()?.depth ?: 0
        val thread = if (rest.size > 1) rest.map { threadLine(it, base, labels) } else emptyList()
        val reply = if (thread.isEmpty()) lastPart else PostCommentCardPart(labels.thread, thread.joinToString("\n") { it.text }, null)
        return PostCommentCardSubject(
            quoted = quoted,
            reply = reply,
            thread = thread,
            sentAtMillis = source.target.createdAtMillis,
            quotedAtMillis = quoted?.let { timeOf(first, source) },
            media = mediaOf(composed, source, choice.headMediaIndex),
        )
    }

    private const val PUBLIC = "PUBLIC"

    private val PostCommentCardComment.isProtected: Boolean get() = MessageEffectFlags.hasLifecycle(effectFlags)

    private val PostCommentCardComment.isPaintable: Boolean
        get() = !isProtected && !inFlight && (nonBlank(text) != null || media.isNotEmpty())

    private val PostCommentCardPost.isPublic: Boolean get() = visibility?.uppercase() == PUBLIC

    /** Une story ou un statut disparaît : il ne se fige en tête que par le visuel qui le représente. */
    private val PostCommentCardPost.disappears: Boolean get() = type?.uppercase().let { it == "STORY" || it == "STATUS" }

    private val PostCommentCardPost.headCandidates: List<PostCommentCardMedia>
        get() = if (disappears) media.filter { it.kind.isVisual }.take(1) else media

    private val PostCommentCardBlock.part: PostCommentCardPart?
        get() = when (this) {
            is PostCommentCardBlock.Post -> part
            is PostCommentCardBlock.Comment -> part
            is PostCommentCardBlock.Folded -> null
        }

    private fun nonBlank(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }

    private fun byId(thread: List<PostCommentCardComment>): Map<String, PostCommentCardComment> =
        thread.fold(emptyMap()) { known, comment -> if (comment.id in known) known else known + (comment.id to comment) }

    private fun chronological(comments: List<PostCommentCardComment>): List<PostCommentCardComment> =
        comments.distinctBy { it.id }.sortedBy { it.createdAtMillis }

    /** La chaîne des ancêtres, de la racine au parent direct — `null` quand un maillon manque. */
    private fun ancestors(source: PostCommentCardSource): List<PostCommentCardComment>? {
        val known = byId(source.thread)
        tailrec fun walk(next: String?, chain: List<PostCommentCardComment>): List<PostCommentCardComment>? {
            if (next == null) return chain
            val parent = known[next]
            if (parent == null || next == source.target.id || chain.any { it.id == next }) return null
            return walk(parent.parentId, listOf(parent) + chain)
        }
        return walk(source.target.parentId, emptyList())
    }

    /** Les ancêtres connus, du parent direct vers la racine, jusqu'au premier maillon manquant. */
    private fun knownAncestors(source: PostCommentCardSource): List<PostCommentCardComment> {
        val known = byId(source.thread)
        tailrec fun walk(next: String?, chain: List<PostCommentCardComment>): List<PostCommentCardComment> {
            val parent = next?.let(known::get)
            if (parent == null || next == source.target.id || chain.any { it.id == next }) return chain
            return walk(parent.parentId, chain + parent)
        }
        return walk(source.target.parentId, emptyList())
    }

    private fun rootOf(source: PostCommentCardSource): PostCommentCardComment? = ancestors(source)?.firstOrNull()

    private fun descends(rootId: String, comment: PostCommentCardComment, known: Map<String, PostCommentCardComment>): Boolean {
        tailrec fun walk(next: String?, seen: Set<String>): Boolean {
            if (next == null) return false
            if (next == rootId) return true
            val parent = known[next]
            if (next in seen || parent == null) return false
            return walk(parent.parentId, seen + next)
        }
        return walk(comment.parentId, setOf(comment.id))
    }

    /** La racine, les réponses peignables écrites jusqu'à la réponse visée, puis elle. */
    private fun threadToHere(source: PostCommentCardSource): List<PostCommentCardComment> {
        val chain = ancestors(source)
        if (chain.isNullOrEmpty()) return emptyList()
        val ancestorIds = chain.map { it.id }.toSet()
        val others = choosable(source).filter { it.id !in ancestorIds && it.createdAtMillis <= source.target.createdAtMillis }
        return chronological(chain + others) + source.target
    }

    private fun authorOf(author: PostCommentCardAuthor, viewer: PostCommentCardViewer): String {
        val isViewer = viewer.id.isNotEmpty() && author.id == viewer.id
        val candidates = if (isViewer) listOf(viewer.displayName, author.displayName, author.username) else listOf(author.displayName, author.username)
        return candidates.firstNotNullOfOrNull(::nonBlank) ?: "Meeshy"
    }

    private fun handleOf(author: PostCommentCardAuthor): String? = nonBlank(author.username)?.trimStart('@')?.takeIf { it.isNotEmpty() }

    /** Le post en tête : son auteur et son texte servi, tronqué — `null` quand il ne se met pas en tête. */
    private fun postHead(source: PostCommentCardSource): PostCommentCardPart? {
        val post = source.post ?: return null
        if (!post.isPublic) return null
        if ((post.disappears || post.hasStoryCanvas) && post.headCandidates.isEmpty()) return null
        val text = nonBlank(post.text)
        if (text == null && post.headCandidates.isEmpty()) return null
        return PostCommentCardPart(authorOf(post.author, source.viewer), text?.let { excerpt(it) }.orEmpty(), handleOf(post.author))
    }

    private fun chosenHeadMedia(source: PostCommentCardSource, index: Int?): PostCommentCardMedia? {
        val media = headMedia(source)
        val picked = index?.takeIf { it in media.indices } ?: defaultHeadMediaIndex(source)
        return picked?.let(media::getOrNull)
    }

    private fun heroLine(head: PostCommentCardPart, source: PostCommentCardSource, kind: PostCommentCardMediaKind): PostCommentCardPart {
        val text = nonBlank(source.post?.text)
        val line = text?.let { excerpt(it, PostCommentCardLimits.HERO_EXCERPT_LINES, PostCommentCardLimits.HERO_EXCERPT_CHARACTERS) } ?: kind.symbol
        return head.copy(text = line)
    }

    private fun depthOf(comment: PostCommentCardComment, known: Map<String, PostCommentCardComment>): Int {
        tailrec fun walk(next: String?, seen: Set<String>, depth: Int): Int {
            val parent = next?.let(known::get)
            if (next == null || parent == null || next in seen) return depth
            return walk(parent.parentId, seen + next, depth + 1)
        }
        return minOf(PostCommentCardLimits.MAX_DEPTH, walk(comment.parentId, setOf(comment.id), 0))
    }

    private fun partOf(comment: PostCommentCardComment, source: PostCommentCardSource): PostCommentCardPart {
        val text = nonBlank(comment.text) ?: comment.media.joinToString(" ") { it.kind.symbol }
        return PostCommentCardPart(authorOf(comment.author, source.viewer), text, handleOf(comment.author))
    }

    /** Plus de commentaires que de place : la tête, « +N », puis les derniers. */
    private fun folded(comments: List<PostCommentCardComment>, budget: Int, source: PostCommentCardSource): List<PostCommentCardBlock> {
        val known = byId(source.thread + source.target)
        val blocks = comments.map { PostCommentCardBlock.Comment(it.id, partOf(it, source), depthOf(it, known)) }
        if (blocks.size <= budget || budget < 3 || blocks.isEmpty()) return blocks
        val tail = budget - 2
        val kept = blocks.takeLast(tail)
        return listOf<PostCommentCardBlock>(blocks.first(), PostCommentCardBlock.Folded(blocks.size - 1 - tail, kept.firstOrNull()?.depth ?: 0)) + kept
    }

    private fun commentsOf(source: PostCommentCardSource, choice: PostCommentCardChoice): List<PostCommentCardComment> = when (choice.mode) {
        PostCommentCardMode.POST_AND_COMMENT, PostCommentCardMode.COMMENT_ALONE -> listOf(source.target)
        PostCommentCardMode.THREAD_TO_HERE -> threadToHere(source)
        PostCommentCardMode.POST_ROOT_AND_REPLY -> rootOf(source)?.let { listOf(it, source.target) }.orEmpty()
        PostCommentCardMode.CHOSEN_REPLIES -> choosable(source).filter { it.id in choice.chosen } + source.target
    }

    private fun timeOf(block: PostCommentCardBlock, source: PostCommentCardSource): Long? = when (block) {
        is PostCommentCardBlock.Post -> source.post?.createdAtMillis
        is PostCommentCardBlock.Folded -> null
        is PostCommentCardBlock.Comment ->
            if (block.id == source.target.id) source.target.createdAtMillis else byId(source.thread)[block.id]?.createdAtMillis
    }

    private fun threadLine(block: PostCommentCardBlock, base: Int, labels: PostCommentCardLabels): PostCommentCardThreadLine = when (block) {
        is PostCommentCardBlock.Folded -> PostCommentCardThreadLine(labels.folded(block.count), 1)
        is PostCommentCardBlock.Comment -> PostCommentCardThreadLine("${block.part.author} : ${block.part.text}", levelOf(block.depth, base))
        is PostCommentCardBlock.Post -> PostCommentCardThreadLine("${block.part.author} : ${block.part.text}", 0)
    }

    private fun levelOf(depth: Int, base: Int): Int = (depth - base).coerceIn(0, PostCommentCardLimits.MAX_DEPTH)

    /** Le média choisi du support en tête — un visuel en HÉROS — puis les médias des commentaires peints, les plus récents. */
    private fun mediaOf(blocks: List<PostCommentCardBlock>, source: PostCommentCardSource, headMediaIndex: Int?): List<PostCommentCardPlacedMedia> {
        val known = byId(source.thread + source.target)
        val quotes = blocks.size > 1
        val painted = blocks.mapIndexed { index, block ->
            fun author(part: PostCommentCardPart) = PostCommentCardMediaAuthor(part.author, part.handle, quotes && index == 0)
            when (block) {
                is PostCommentCardBlock.Post ->
                    listOfNotNull(chosenHeadMedia(source, headMediaIndex)?.let { PostCommentCardPlacedMedia(it, author(block.part), it.kind.isVisual) })
                is PostCommentCardBlock.Folded -> emptyList()
                is PostCommentCardBlock.Comment ->
                    known[block.id]?.media.orEmpty().map { PostCommentCardPlacedMedia(it, author(block.part), hero = false) }
            }
        }
        val head = if (blocks.firstOrNull() is PostCommentCardBlock.Post) painted.firstOrNull().orEmpty() else emptyList()
        val rest = painted.drop(if (head.isEmpty()) 0 else 1).flatten()
        val room = maxOf(0, PostCommentCardLimits.MAX_MEDIA - head.size)
        return head + if (room == 0) emptyList() else rest.takeLast(room)
    }
}
