package me.meeshy.sdk.audioedit

import androidx.annotation.OptIn
import androidx.media3.common.Metadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.muxer.Muxer
import androidx.media3.transformer.FrameworkMuxer
import androidx.media3.transformer.InAppMp4Muxer
import androidx.media3.transformer.Transformer
import com.google.common.collect.ImmutableList
import me.meeshy.sdk.model.media.ExportContainerPolicy

/**
 * **UN SON RENDU NE PORTE AUCUNE MÉTADONNÉE DE SA SOURCE** (#13462, #13450). Media3 Transformer recopie les
 * métadonnées de la piste d'entrée dans le fichier écrit — `Mp4LocationData` devient un `©xyz`, par
 * `MediaMuxer.setLocation` comme par le muxeur MP4 de Media3 (`MuxerUtil.isMetadataSupported`) : un mémo vocal
 * enregistré avec son lieu le garderait après un rognage. iOS ne le transporte pas (`AVMutableComposition` n'hérite
 * d'aucune métadonnée de l'asset). Ce muxeur écrit la piste et ses échantillons, jamais une entrée de métadonnées.
 */
@OptIn(UnstableApi::class)
internal class MetadataFreeMuxerFactory(private val delegate: Muxer.Factory) : Muxer.Factory {

    override fun create(path: String): Muxer = MetadataFreeMuxer(delegate.create(path))

    override fun getSupportedSampleMimeTypes(trackType: Int): ImmutableList<String> =
        delegate.getSupportedSampleMimeTypes(trackType)

    override fun supportsWritingNegativeTimestampsInEditList(): Boolean =
        delegate.supportsWritingNegativeTimestampsInEditList()
}

@OptIn(UnstableApi::class)
private class MetadataFreeMuxer(private val delegate: Muxer) : Muxer by delegate {
    override fun addMetadataEntry(metadataEntry: Metadata.Entry) = Unit
}

/**
 * **Le fichier qu'un export écrit, selon [ExportContainerPolicy]** (#14567) : un fichier publié passe par le muxeur
 * MP4 de Media3, qui tente de placer son index en tête ; sinon par `MediaMuxer`. Une vidéo commence sur une image, et
 * aucun diagnostic ne part vers la plateforme. Quel que soit le conteneur, le fichier ne garde rien de sa source
 * ([MetadataFreeMuxerFactory]) : le muxeur MP4 de Media3 recopierait le lieu, l'horodatage, le XMP et les entrées
 * `mdta` de la vidéo d'origine, là où `MediaMuxer` ne gardait que le lieu.
 */
@OptIn(UnstableApi::class)
internal fun Transformer.Builder.writingContainer(policy: ExportContainerPolicy): Transformer.Builder =
    setMuxerFactory(exportMuxerFactory(policy))
        .setEnsureFileStartsOnVideoFrameEnabled(policy.ensureStartsOnVideoFrame)
        .setUsePlatformDiagnostics(policy.platformDiagnostics)

@OptIn(UnstableApi::class)
internal fun exportMuxerFactory(
    policy: ExportContainerPolicy,
    streamable: Muxer.Factory = InAppMp4Muxer.Factory(),
    framework: Muxer.Factory = FrameworkMuxer.Factory(),
): Muxer.Factory = MetadataFreeMuxerFactory(if (policy.streamable) streamable else framework)
