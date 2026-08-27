package me.meeshy.ui.component.viewer

/**
 * The fullscreen mount for an image: [fullUrl] is what [MeeshyImageViewer]
 * always requests, and [backdropUrl] is the blurred placeholder shown WHILE
 * it loads — `null` once (or if) the full image is [isResident] (already
 * decoded in Coil's memory cache this session), meaning nothing needs to be
 * covered and no transition is required.
 */
public data class FullscreenImageMount(
    val fullUrl: String,
    val backdropUrl: String?,
    val isResident: Boolean,
)

/**
 * Décision de source pour le plein écran d'une image — port Kotlin du patron
 * iOS `FullscreenImageSource.resolve` (`ConversationMediaGalleryView.swift`,
 * commit 4bedd04bb, #3871) et de son miroir web
 * `resolveFullscreenImageSource` (`apps/web/lib/images/fullscreen-source.ts`,
 * #3878). Le plein format RÉSIDENT (déjà décodé dans le cache mémoire Coil
 * côté client) s'affiche TEL QUEL, sans transition, sans spinner ; sinon on
 * force le chargement du plein format et on ne montre QUE la vignette comme
 * fond flou assumé pendant l'attente — jamais comme l'image affichée nette
 * elle-même. Pure : aucune E/S, aucun accès Coil/Android — la résidence
 * (`isFullResident`) est un FAIT que l'appelant a déjà établi (état RÉEL de
 * l'`AsyncImage`, amorcé par une lecture synchrone du cache mémoire Coil,
 * cf. `MeeshyImageViewer`).
 */
public object ImageViewerSource {

    /**
     * `null` sans plein format disponible — l'appelant rend alors son état vide.
     *
     * [canRenderBlurredBackdrop] dit si l'hôte sait VRAIMENT flouter. Sur
     * Android le flou passe par `RenderEffect`, que `RenderNodeApi29
     * .setRenderEffect` n'applique qu'à partir de l'API 31 (vérifié dans le
     * bytecode de `compose-ui` : `SDK_INT` comparé à 31, appel sauté en
     * dessous) — `Modifier.blur` y est un NO-OP silencieux. Avec `minSdk = 26`,
     * un fond posé sans cette garde s'afficherait donc NET, plein écran, sur
     * l'API 26→30 : exactement la vignette basse résolution que #3878
     * interdit. Sans flou possible, pas de fond du tout — la règle « jamais la
     * vignette nette » prime sur l'agrément du fond. (Le web n'a pas ce
     * paramètre : `blur-3xl` s'applique partout, cf.
     * `resolveFullscreenImageSource` ; iOS n'expose jamais la vignette et
     * floute un `thumbHash`, qui ne porte aucun détail par construction.)
     */
    public fun resolve(
        fullUrl: String?,
        thumbnailUrl: String?,
        isFullResident: Boolean,
        canRenderBlurredBackdrop: Boolean,
    ): FullscreenImageMount? {
        if (fullUrl.isNullOrEmpty()) return null
        val mayShowBackdrop = !isFullResident && canRenderBlurredBackdrop
        return FullscreenImageMount(
            fullUrl = fullUrl,
            backdropUrl = if (mayShowBackdrop) thumbnailUrl else null,
            isResident = isFullResident,
        )
    }
}
