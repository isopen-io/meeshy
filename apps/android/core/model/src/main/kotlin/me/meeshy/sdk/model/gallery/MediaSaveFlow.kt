package me.meeshy.sdk.model.gallery

import kotlin.coroutines.cancellation.CancellationException

/** Où « Enregistrer » dépose un média : l'album de la galerie (MediaStore) ou un fichier choisi par l'utilisateur. */
public enum class GallerySaveDestination { GALLERY, FILES }

public sealed interface MediaSaveOutcome {
    public data class Saved(val destination: GallerySaveDestination) : MediaSaveOutcome
    public data class Failed(val destination: GallerySaveDestination) : MediaSaveOutcome
}

/**
 * La feuille « Enregistrer » : les destinations offertes pour un média, puis l'exécution d'une écriture avec un résultat
 * toujours rendu (succès ou échec), jamais une exception — l'écran en tire le retour d'état.
 */
public object MediaSaveFlow {
    /** Les fichiers sont toujours offerts ; la galerie seulement si l'appareil sait l'écrire (MediaStore, Android 10+). */
    public fun destinations(isGallerySupported: Boolean): List<GallerySaveDestination> =
        if (isGallerySupported) listOf(GallerySaveDestination.GALLERY, GallerySaveDestination.FILES)
        else listOf(GallerySaveDestination.FILES)

    public suspend fun perform(
        destination: GallerySaveDestination,
        write: suspend (GallerySaveDestination) -> Boolean,
    ): MediaSaveOutcome =
        try {
            if (write(destination)) MediaSaveOutcome.Saved(destination) else MediaSaveOutcome.Failed(destination)
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            MediaSaveOutcome.Failed(destination)
        }
}
