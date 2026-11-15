package me.meeshy.ui.component.media

import android.content.Context
import coil.ImageLoader
import coil.decode.ExifOrientationPolicy

/**
 * **LE CHARGEUR D'IMAGES DE L'APP : une photo s'affiche à l'endroit, d'où qu'elle vienne.**
 *
 * Coil 2 n'applique l'orientation EXIF que s'il connaît le type MIME de la source (`RESPECT_PERFORMANCE`). Or les
 * prises copiées par `MediaIntake` portent un nom sans extension, et les octets en mémoire n'ont pas de type : leur
 * aperçu restait COUCHÉ, la photo de l'objectif ayant des pixels au sens du capteur et son orientation dans l'EXIF.
 * `RESPECT_ALL` lit l'orientation de toute image décodée, quel que soit son nom.
 */
public object MeeshyImageLoader {
    public fun build(context: Context): ImageLoader = configured(ImageLoader.Builder(context)).build()

    public fun configured(builder: ImageLoader.Builder): ImageLoader.Builder =
        builder.bitmapFactoryExifOrientationPolicy(ExifOrientationPolicy.RESPECT_ALL)
}
