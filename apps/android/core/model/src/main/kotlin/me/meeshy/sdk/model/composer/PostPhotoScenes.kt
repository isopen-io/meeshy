package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.CanvasV3Migration
import me.meeshy.sdk.model.ClientIdFormat
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.StoryBackgroundTransform
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.scene.StoryFitMode

/**
 * **Un post de plusieurs photos part en document de scènes, une scène par photo** — comme iOS (#13612).
 *
 * En Post, une slide d'iOS est UN média (`MeeshyComposerHost+Intake`, « en Post, une slide est UN média »), et
 * `ComposerStoryCanvas.publishedSlide` publie le document de toutes les slides dès qu'il y en a deux ; `layout` n'y entre
 * que dans ce document-là. Le lecteur iOS (`FeedPostCard`) et le web peignent TOUT document de scènes À LA PLACE des médias
 * du post : un `{v:3, layout}` sans scène, ou un document dont une photo n'a pas sa scène, la ferait disparaître chez eux.
 *
 * La règle est donc tout ou rien : le document existe pour l'ensemble des médias du post, ou n'existe pas (le post garde
 * alors ses seuls médias, que tous les clients lisent, anciens compris — la passerelle omet `storyEffects` d'un post à
 * média chez un client sans `X-Canvas-Caps: 3`).
 *
 * Il n'est composé que pour DES PHOTOS : une vidéo, un son ou un fichier gardent l'ancien chemin, faute d'un témoin de
 * lecture sur les trois clients pour leur scène.
 */
object PostPhotoScenes {

    /** Le nombre de scènes que ces médias donnent sous ce format ; 0 quand ils n'en donnent pas (aucun document). */
    fun sceneCount(mimeTypes: List<String>, format: ComposerFormat): Int =
        if (format == ComposerFormat.POST &&
            mimeTypes.size in 2..CanvasV3Migration.MAX_SCENES &&
            mimeTypes.all(::isPhoto)
        ) {
            mimeTypes.size
        } else {
            0
        }

    /**
     * Le document de [media] — `null` quand [sceneCount] est nul, sauf pour une photo SEULE, avec ou sans fond de couleur.
     * [language] est la langue de composition (`locale` de l'objet, `declaredContentLanguage` d'iOS) ; [armedLayout] n'est
     * écrit que là où le contrôle était offert ; [background] se pose sous la PREMIÈRE photo, comme iOS garde la couleur
     * sur la slide où elle a été choisie (`applyBackground` n'écrit que la slide courante, et `addSlide` en ouvre une vierge).
     *
     * Une photo seule part en document d'UNE scène, comme iOS : `publishedSlide` rend les effets de la slide, et
     * `StoryEffects.encode` les écrit TOUJOURS en document v3 (fixture `post-photo-scenes-1`, produite par le composeur).
     * Le fond de couleur éventuel y reste sous la photo : la couleur seule la masquerait, la photo seule la perdrait.
     * Le `layout` n'y est jamais écrit (une scène n'a rien à disposer).
     *
     * Un média encore en file (son id est un `cmid`) désigne cet id provisoire et ne porte pas d'adresse : l'outbox
     * (`PostPublishMediaWriteBack`) le remplace par le vrai à l'arrivée du téléversement, scène comprise.
     */
    fun effects(
        media: List<UploadedMedia>,
        language: String?,
        armedLayout: MosaicLayoutMode?,
        background: String? = null,
    ): StoryEffects? {
        val count = sceneCount(media.map { it.mimeType }, ComposerFormat.POST)
        val singlePhoto = media.size == 1 && isPhoto(media.single().mimeType)
        if (count == 0 && !singlePhoto) return null
        val slides = media.mapIndexed { index, item -> slide(index, item, language, background.takeIf { index == 0 }) }
        val layout = ComposerMosaicChoice.published(armedLayout, count, ComposerFormat.POST)
        return StoryEffects(canvas = CanvasV3Migration.migrate(slides, layout))
    }

    /**
     * Le `storyEffects` d'une publication de post : le document de scènes des photos ([effects]) pour un Post de photos ;
     * sinon le fond de couleur choisi — mais jamais seul sous des médias : iOS et le web peignent tout document de scène à
     * la place des médias du post, donc un fond seul les masquerait. Rien pour un post ordinaire.
     */
    fun storyEffects(
        type: String,
        media: List<UploadedMedia>,
        language: String?,
        armedLayout: MosaicLayoutMode?,
        background: String?,
    ): StoryEffects? =
        (if (type == PostType.POST.name) effects(media, language, armedLayout, background) else null)
            ?: background?.takeIf { media.isEmpty() }?.let { StoryEffects(background = it) }

    private fun slide(index: Int, media: UploadedMedia, language: String?, background: String?): StoryEffects = StoryEffects(
        background = background,
        backgroundTransform = StoryBackgroundTransform(videoFitMode = StoryFitMode.posedFitMode(null)),
        mediaObjects = listOf(
            StoryMediaObject(
                id = "m${index + 1}",
                postMediaId = media.id,
                mediaURL = media.url.takeIf { it.isNotBlank() && !media.id.startsWith(ClientIdFormat.CMID_PREFIX) },
                mediaType = "image",
                aspectRatio = aspectRatioOf(media),
                isBackground = true,
                loop = true,
                sourceLanguage = language?.takeIf { it.isNotBlank() },
            ),
        ),
    )

    private fun aspectRatioOf(media: UploadedMedia): Double? {
        val width = media.width ?: return null
        val height = media.height ?: return null
        return if (width > 0 && height > 0) width.toDouble() / height else null
    }

    private fun isPhoto(mimeType: String): Boolean = mimeType.startsWith("image/", ignoreCase = true)
}
