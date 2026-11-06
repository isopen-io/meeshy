package me.meeshy.app.chat.export

import androidx.compose.runtime.State
import java.io.File
import me.meeshy.sdk.model.card.PostCommentCardMedia
import me.meeshy.sdk.model.composer.scene.SceneExportPlan
import me.meeshy.sdk.model.card.PostCommentCardMediaKind
import me.meeshy.sdk.model.card.PostCommentCardPart
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.sdk.util.resolveMediaUrl
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * CE QUE L'ATELIER IMAGE — un message, relu VIVANT (sa bulle), ou une carte que l'hôte a déjà composée (un commentaire,
 * #13922). L'atelier n'en connaît que la carte de chaque langue offerte et le droit de continuer à la peindre.
 */
internal interface CardSource {
    /** L'identité de ce qu'on image : l'atelier se rouvre neuf quand elle change. */
    val key: String
    val languages: List<CardLanguage>
    fun subject(language: String?): CardSubject?

    /** Le contenu a-t-il encore le droit de partir ? Faux : l'atelier se ferme au lieu de peindre l'instantané. */
    fun stillAllowed(nowMillis: Long): Boolean

    val preparing: Boolean get() = false
}

/** Un message de la conversation : sa garde se relit à chaque peinture (supprimé, rendu éphémère, protégé). */
internal class BubbleCardSource(
    private val bubble: BubbleContent,
    private val viewer: CardViewer,
    private val openedAt: Long,
) : CardSource {
    override val key: String get() = bubble.messageId
    override val languages: List<CardLanguage> = CardSubjects.languages(bubble)
    override fun subject(language: String?): CardSubject? = CardSubjects.of(bubble, viewer, openedAt, language)
    override fun stillAllowed(nowMillis: Long): Boolean = CardSubjects.refusal(bubble, nowMillis) == null
}

/** Une carte déjà composée (le texte servi par le Prisme, le support en tête) : une seule langue, la servie. */
internal class ComposedCardSource(override val key: String, private val card: CardSubject) : CardSource {
    override val languages: List<CardLanguage> = emptyList()
    override fun subject(language: String?): CardSubject = card
    override fun stillAllowed(nowMillis: Long): Boolean = true
}

sealed interface SceneCardRender {
    data object Pending : SceneCardRender
    data class Ready(val path: String) : SceneCardRender
    data object Failed : SceneCardRender
}

internal class RenderingCardSource(
    override val key: String,
    private val card: CardSubject,
    private val render: State<SceneCardRender?>,
) : CardSource {
    override val languages: List<CardLanguage> = emptyList()
    override fun subject(language: String?): CardSubject = when (val current = render.value) {
        is SceneCardRender.Ready -> card.copy(hero = sceneMedia(key, current.path))
        else -> card
    }
    override fun stillAllowed(nowMillis: Long): Boolean = true
    override val preparing: Boolean get() = render.value == SceneCardRender.Pending
}

internal fun sceneMedia(key: String, path: String): CardMedia {
    val kind = if (SceneExportPlan.mimeType(path).startsWith("video/")) CardMediaKind.VIDEO else CardMediaKind.IMAGE
    return CardMedia(id = "scene:$key", kind = kind, url = File(path).toURI().toString(), aspect = CardMediaPicking.aspectOf(SCENE_WIDTH, SCENE_HEIGHT))
}

private const val SCENE_WIDTH = 9
private const val SCENE_HEIGHT = 16

/**
 * La carte d'un commentaire, composée par `PostCommentCardComposition`, telle que le moteur de carte la peint : le visuel
 * du support en HÉROS, les visuels des commentaires sous la réponse, chacun joint par la passerelle ([mediaBaseUrl]).
 * Un son, ou une pièce dont le fichier ne se joint pas, ne se peint pas.
 */
internal fun CardSubjects.of(card: PostCommentCardSubject, mediaBaseUrl: String? = null): CardSubject {
    val painted = card.media.mapNotNull { placed -> paintable(placed.media, mediaBaseUrl)?.let { placed.hero to it } }
    return CardSubject(
        quoted = card.quoted?.let(::partOf),
        reply = partOf(card.reply).copy(thread = card.thread.map { CardThreadLine(it.text, it.level) }),
        sentAtMillis = card.sentAtMillis,
        quotedAtMillis = card.quotedAtMillis,
        media = painted.filterNot { it.first }.map { it.second },
        hero = painted.firstOrNull { it.first }?.second,
    )
}

private fun paintable(media: PostCommentCardMedia, mediaBaseUrl: String?): CardMedia? {
    val kind = when (media.kind) {
        PostCommentCardMediaKind.IMAGE -> CardMediaKind.IMAGE
        PostCommentCardMediaKind.VIDEO -> CardMediaKind.VIDEO
        PostCommentCardMediaKind.AUDIO -> return null
    }
    val url = reachable(media.url, mediaBaseUrl) ?: return null
    return CardMedia(media.id, kind, url, reachable(media.posterUrl, mediaBaseUrl), CardMediaPicking.aspectOf(media.width, media.height))
}

/** Le fichier tel qu'on peut le charger ; un chemin que rien ne raccroche à un hôte n'en est pas un. */
private fun reachable(url: String?, mediaBaseUrl: String?): String? = url?.let { resolveMediaUrl(it, mediaBaseUrl) }
    ?.takeIf { resolved -> LOADABLE.any { resolved.startsWith(it, ignoreCase = true) } }

private val LOADABLE = listOf("http", "file:", "content:")

private fun partOf(part: PostCommentCardPart): CardPart = CardPart(author = part.author, text = part.text, handle = part.handle)
