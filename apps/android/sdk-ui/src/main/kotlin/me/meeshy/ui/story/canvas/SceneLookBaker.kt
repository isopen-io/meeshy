package me.meeshy.ui.story.canvas

import android.graphics.Bitmap
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.ui.component.imageedit.ColorMatrixFallback
import me.meeshy.ui.component.imageedit.LatestWinsRenderLoop
import me.meeshy.ui.component.imageedit.LookBitmapCache

/** Ce qu'une cuisson demande : l'image, son identifiant d'appelant et son look. */
public class SceneLookBakeRequest(
    public val image: Bitmap,
    public val imageId: String?,
    public val recipe: SceneLookRecipe,
)

/**
 * Le look d'une image, cuit en UN passage (filtre puis réglages puis effet, jamais deux rendus
 * successifs). Miroir de `StoryLookBake` (iOS) : le fond de la scène, le média posé, la couverture
 * et l'export passent par ici.
 *
 * Le cache suit l'INSTANCE d'image et les VALEURS ([LookBitmapCache]) : un curseur qui revient sur
 * une valeur déjà vue ne refait aucun rendu ; une recette neutre rend l'image elle-même, sans copie.
 */
public class SceneLookBaker(
    private val cache: LookBitmapCache = LookBitmapCache(),
    private val renderer: (Bitmap, SceneLookRecipe) -> Bitmap =
        { bitmap, recipe -> ColorMatrixFallback.render(bitmap, recipe) },
) {
    /** Ce qui se pose SANS cuire : l'image si rien n'est à peindre, le bitmap déjà cuit ; `null` sinon. */
    public fun ready(request: SceneLookBakeRequest): Bitmap? {
        if (request.recipe.isNeutral) return request.image
        return cache.get(request.image, request.imageId, request.recipe.signature())
    }

    /** Le bitmap cuit de [request] (synchrone : à appeler hors du fil principal pour un grand bitmap). */
    public fun bake(request: SceneLookBakeRequest): Bitmap {
        ready(request)?.let { return it }
        val baked = renderer(request.image, request.recipe)
        cache.put(request.image, request.imageId, request.recipe.signature(), baked)
        return baked
    }

    public companion object {
        public val shared: SceneLookBaker by lazy { SceneLookBaker() }
    }
}

/**
 * Le repeint d'une couche pendant qu'un curseur glisse : le bitmap affiché reste à l'écran, la
 * cuisson part hors du fil principal ([LatestWinsRenderLoop] : un rendu en vol, le dernier cran
 * gagne) et le bitmap cuit est remis dès qu'il est prêt. Miroir de `StoryLiveLook` (iOS).
 *
 * Une cuisson n'est remise que si la couche montre encore la MÊME source : un rendu lancé pour
 * l'ancienne image ne recouvre jamais la nouvelle ([supersede]). Les crans intermédiaires, eux,
 * sont remis — c'est le retour visuel du glissé. À utiliser depuis le dispatcher de [scope].
 */
public class SceneLiveLook(
    scope: CoroutineScope,
    renderDispatcher: CoroutineDispatcher,
    private val baker: SceneLookBaker = SceneLookBaker.shared,
) {
    private class Ticket(val request: SceneLookBakeRequest, val generation: Long)

    private var generation = 0L
    private var source: Bitmap? = null
    private var onBaked: ((Bitmap) -> Unit)? = null

    private val loop = LatestWinsRenderLoop<Ticket, Bitmap>(
        scope = scope,
        renderDispatcher = renderDispatcher,
        render = { ticket -> baker.bake(ticket.request) },
        deliver = { ticket, baked -> if (ticket.generation == generation) onBaked?.invoke(baked) },
    )

    public val isBaking: Boolean get() = loop.isBusy

    /** La couche pose une autre source, ou un bitmap qu'elle a cuit elle-même : toute cuisson en vol est caduque. */
    public fun supersede() {
        generation++
        source = null
        onBaked = null
        loop.discardPending()
    }

    /** Pose tout de suite ce qui est prêt ; sinon cuit hors du fil principal et remet à [onBaked]. */
    public fun bake(request: SceneLookBakeRequest, onBaked: (Bitmap) -> Unit) {
        if (source !== request.image) {
            generation++
            source = request.image
        }
        this.onBaked = onBaked
        baker.ready(request)?.let {
            loop.discardPending()
            onBaked(it)
            return
        }
        loop.submit(Ticket(request, generation))
    }
}
