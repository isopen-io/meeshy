package me.meeshy.sdk.audioedit

import androidx.annotation.OptIn
import androidx.media3.common.Metadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.muxer.Muxer
import com.google.common.collect.ImmutableList

/**
 * **UN SON RENDU NE PORTE AUCUNE MÉTADONNÉE DE SA SOURCE** (#13462, #13450). Media3 Transformer recopie les
 * métadonnées de la piste d'entrée dans le fichier écrit — `Mp4LocationData` devient un `©xyz` par
 * `MediaMuxer.setLocation` : un mémo vocal enregistré avec son lieu le garderait après un rognage. iOS ne le
 * transporte pas (`AVMutableComposition` n'hérite d'aucune métadonnée de l'asset). Ce muxeur écrit la piste et
 * ses échantillons, jamais une entrée de métadonnées.
 */
@OptIn(UnstableApi::class)
internal class MetadataFreeMuxerFactory(private val delegate: Muxer.Factory) : Muxer.Factory {

    override fun create(path: String): Muxer = MetadataFreeMuxer(delegate.create(path))

    override fun getSupportedSampleMimeTypes(trackType: Int): ImmutableList<String> =
        delegate.getSupportedSampleMimeTypes(trackType)
}

@OptIn(UnstableApi::class)
private class MetadataFreeMuxer(private val delegate: Muxer) : Muxer by delegate {
    override fun addMetadataEntry(metadataEntry: Metadata.Entry) = Unit
}
