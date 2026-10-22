import Foundation
import AVFoundation
import UIKit
import ImageIO
import VideoToolbox
import MeeshySDK
import os

struct CompressedImageResult {
    let data: Data
    let mimeType: String
    /// Définition DEBOUT des octets remis, quand ils se décodent (#9885).
    let pixelSize: CGSize?

    init(data: Data, mimeType: String, pixelSize: CGSize? = nil) {
        self.data = data
        self.mimeType = mimeType
        self.pixelSize = pixelSize
    }

    var fileExtension: String {
        switch mimeType {
        case "image/jpeg":  return "jpg"
        case "image/png":   return "png"
        case "image/gif":   return "gif"
        case "image/webp":  return "webp"
        case "image/heic":  return "heic"
        default:            return "jpg"
        }
    }
}

// MARK: - Media Context

nonisolated enum MediaContext: Sendable {
    case message
    case story
    case feedPost
    case avatar
    case fullscreen

    var maxImageDimension: CGFloat {
        switch self {
        case .message:    return 1200
        case .story:      return 1080
        case .feedPost:   return 1600
        case .avatar:     return 512
        case .fullscreen: return 2048
        }
    }

    var videoBitRate: Int {
        switch self {
        case .message:    return 4_000_000
        case .story:      return 4_000_000
        case .feedPost:   return 4_000_000
        case .avatar:     return 1_000_000
        case .fullscreen: return 8_000_000
        }
    }

    var maxVideoResolution: CGSize {
        switch self {
        case .message:    return CGSize(width: 1080, height: 1920)
        case .story:      return CGSize(width: 1080, height: 1920)
        case .feedPost:   return CGSize(width: 1080, height: 1920)
        case .avatar:     return CGSize(width: 480, height: 480)
        case .fullscreen: return CGSize(width: 1920, height: 1080)
        }
    }

    var audioBitRate: Int {
        switch self {
        case .story:      return 128_000
        case .fullscreen: return 128_000
        default:          return 96_000
        }
    }
}

// MARK: - La politique d'envoi d'une photo (#9885)

extension MediaContext {
    /// Par défaut, la photo part en HD, en UNE génération perceptuelle à q 0,85,
    /// lieu retiré (verdict #11247). `compresses` est la **compression forte** que
    /// l'utilisateur choisit pour économiser des données (`compressImagesOnUpload`) :
    /// budget du contexte et qualité de sa préférence. Un avatar se réduit toujours :
    /// il ne s'affiche jamais en grand.
    nonisolated func outgoingImagePolicy(compresses: Bool, qualityPercent: Int, keepsLocation: Bool) -> OutgoingImagePolicy {
        let forte = compresses || self == .avatar
        return OutgoingImagePolicy(maxPixelDimension: maxImageDimension, compresses: forte,
                                   quality: forte ? OutgoingImagePolicy.quality(percent: qualityPercent)
                                                  : OutgoingImagePolicy.perceptualQuality,
                                   keepsLocation: keepsLocation)
    }

    /// La politique servie par les préférences de l'utilisateur.
    @MainActor
    func storedOutgoingImagePolicy() -> OutgoingImagePolicy {
        let document = UserPreferencesManager.shared.document
        return outgoingImagePolicy(compresses: document.compressImagesOnUpload,
                                   qualityPercent: document.imageCompressionQuality,
                                   keepsLocation: OutgoingImageLocationSetting.stored())
    }
}

// MARK: - Le budget d'ENVOI d'une vidéo (#11915)

/// **Une vidéo part en HD** (verdict #11247) : au plus 1080p, la définition de la
/// source si elle est plus basse, une génération visée sur la qualité
/// (`VideoTranscodeRecipe`) sous un plafond de débit. La boîte est en portrait et
/// se tourne avec la vidéo : un paysage 1080p reste 1920×1080.
///
/// Plafond par défaut 4 Mb/s, celui des publications : au pire 15,5 Mo pour 30 s
/// et 31 Mo pour 60 s (son de 128 kb/s compris). Une prise d'iPhone visée à
/// q 0,6 en HEVC 1080p descend en général sous ce plafond. Et un rendu du composer
/// se remuxe ainsi pour un message comme pour une story. La compression FORTE
/// reste un choix de l'utilisateur (`compressImagesOnUpload`, « À l'envoi ») :
/// 720p à 2,5 Mb/s, ≤ 9,9 Mo pour 30 s.
nonisolated struct VideoSendBudget: Equatable, Sendable {
    let maxResolution: CGSize
    let bitRate: Int

    static let strong = VideoSendBudget(maxResolution: CGSize(width: 720, height: 1280), bitRate: 2_500_000)

    /// Le poids au plafond, image et son, en octets.
    func maximumBytes(seconds: Int) -> Int {
        (bitRate + VideoTranscodeRecipe.audioBitRate) * seconds / 8
    }
}

extension MediaContext {
    nonisolated func videoSendBudget(compresses: Bool) -> VideoSendBudget {
        let haute = VideoSendBudget(maxResolution: maxVideoResolution, bitRate: videoBitRate)
        guard compresses, self != .avatar else { return haute }
        return .strong
    }

    /// Le budget servi par les préférences de l'utilisateur.
    @MainActor
    func storedVideoSendBudget() -> VideoSendBudget {
        videoSendBudget(compresses: UserPreferencesManager.shared.document.compressImagesOnUpload)
    }
}

// MARK: - Sendable Wrappers for AVFoundation types

private nonisolated struct SendableTrackOutput: @unchecked Sendable {
    let value: AVAssetReaderOutput
}

private nonisolated struct SendableWriterInput: @unchecked Sendable {
    let value: AVAssetWriterInput
}

// MARK: - MediaCompressor

/// **Une vidéo ré-encodée garde l'étiquette couleur de sa source** (#9332).
///
/// Le ré-encodage ne change pas l'espace des pixels — il les recompresse.
/// Sans étiquette, l'encodeur laisse le lecteur supposer du BT.709 : une prise
/// Display P3 ressort délavée. L'étiquette se lit donc sur la description de
/// format de la piste source et se reporte telle quelle. Cette lecture n'invente
/// rien : une source muette rend `nil`, et c'est `VideoTranscodeRecipe` qui
/// l'étiquette alors BT.709, ce que tout lecteur supposait déjà (#11290).
nonisolated enum VideoColorTagging {
    static func properties(of description: CMFormatDescription) -> [String: String]? {
        let tags = [
            (AVVideoColorPrimariesKey, kCMFormatDescriptionExtension_ColorPrimaries),
            (AVVideoTransferFunctionKey, kCMFormatDescriptionExtension_TransferFunction),
            (AVVideoYCbCrMatrixKey, kCMFormatDescriptionExtension_YCbCrMatrix),
        ].compactMap { paire -> (String, String)? in
            guard let valeur = CMFormatDescriptionGetExtension(description, extensionKey: paire.1) as? String else {
                return nil
            }
            return (paire.0, valeur)
        }
        guard tags.count == 3 else { return nil }
        return Dictionary(uniqueKeysWithValues: tags)
    }
}

actor MediaCompressor {
    static let shared = MediaCompressor()

    private static let logger = MeeshyLog.logger(.mediaCompressor)

    private let preparer: any OutgoingImagePreparing

    init(preparer: any OutgoingImagePreparing = OutgoingImagePreparer()) {
        self.preparer = preparer
    }

    // MARK: - From UIImage (format already lost) → always JPEG

    func compressImage(_ image: UIImage, maxDimension: CGFloat = 2048,
                       quality: CGFloat = OutgoingImagePolicy.perceptualQuality) -> CompressedImageResult {
        let size = image.size
        let needsResize = size.width > maxDimension || size.height > maxDimension

        if needsResize {
            // Single-pass downsample via CGImage. Previously this path went
            // image → JPEG@1.0 → downsample(data) → JPEG@0.8, encoding the
            // pixel buffer to JPEG TWICE (~150ms wasted on a 4K image). Now we
            // bypass the round-trip by feeding the CGImage straight to
            // ImageIO via `downsample(cgImage:)`.
            //
            // Ce raccourci dessine le CGImage BRUT : il ne vaut que pour une
            // image `.up`. Une photo d'appareil tenue en portrait (`.right`)
            // y partait couchée (#9403) ; le chemin par données, lui, écrit
            // l'orientation EXIF puis la cuit (`WithTransform`).
            if image.imageOrientation == .up,
               let cg = image.cgImage,
               let downsampled = downsample(cgImage: cg, maxDimension: maxDimension) {
                let jpeg = downsampled.jpegData(compressionQuality: quality) ?? Data()
                return CompressedImageResult(data: jpeg, mimeType: "image/jpeg", pixelSize: Self.pixels(of: downsampled))
            }
            // Fallback: legacy data-roundtrip path if CGImage isn't available.
            guard let data = image.jpegData(compressionQuality: 1.0) else {
                return CompressedImageResult(data: Data(), mimeType: "image/jpeg")
            }
            guard let downsampled = downsample(data: data, maxDimension: maxDimension) else {
                return CompressedImageResult(data: data, mimeType: "image/jpeg", pixelSize: Self.pixels(of: image))
            }
            let jpeg = downsampled.jpegData(compressionQuality: quality) ?? Data()
            return CompressedImageResult(data: jpeg, mimeType: "image/jpeg", pixelSize: Self.pixels(of: downsampled))
        }

        let jpeg = image.jpegData(compressionQuality: quality) ?? Data()
        return CompressedImageResult(data: jpeg, mimeType: "image/jpeg", pixelSize: Self.pixels(of: image))
    }

    /// La définition DEBOUT d'une image, en pixels.
    private static func pixels(of image: UIImage) -> CGSize {
        CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
    }

    // MARK: - From raw Data — une génération d'encodage au plus (#9885)

    /// Les octets d'une photo, préparés pour l'envoi par la loi unique du SDK
    /// (`OutgoingImagePreparer`) : un JPEG ou un PNG dans le budget part octet
    /// pour octet, le lieu se retire sans ré-encoder, un PNG reste un PNG, et
    /// une réduction ou un HEIC coûtent UN encodage. `nil` ⇒ l'image ne peut
    /// pas partir sans un lieu que l'utilisateur n'a pas choisi de partager.
    func compressImageData(_ data: Data, policy: OutgoingImagePolicy) -> CompressedImageResult? {
        guard let prepared = preparer.prepare(data, policy: policy) else { return nil }
        return CompressedImageResult(data: prepared.data,
                                     mimeType: prepared.format.mimeType ?? "image/jpeg",
                                     pixelSize: prepared.pixelSize)
    }

    // MARK: - Video (AVAssetWriter, réglages dérivés de la source — #11290)

    func compressVideo(_ url: URL, context: MediaContext = .message,
                       budget: VideoSendBudget? = nil) async throws -> URL {
        let budget = budget ?? context.videoSendBudget(compresses: false)
        let asset = AVURLAsset(url: url)
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("compressed_\(UUID().uuidString).mp4")
        // `AVAssetWriter` ne REMPLACE pas un fichier : il refuse, et `startSession`
        // en ferait une exception ObjC irrattrapable (#7004).
        try? FileManager.default.removeItem(at: outputURL)

        // Une source déjà au format cible se REMUXE (≈ 1 s) au lieu d'un
        // ré-encodage de 10 à 60 s : voir `passthroughIfPossible`.
        if let fastPath = try? await passthroughIfPossible(asset: asset, sourceURL: url,
                                                           outputURL: outputURL, budget: budget) {
            return fastPath
        }

        guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw CompressionError.noVideoTrack
        }
        let audioTrack = try await asset.loadTracks(withMediaType: .audio).first
        let geometry = try await writerGeometry(of: videoTrack, within: budget.maxResolution)
        let recipe = VideoTranscodeRecipe(source: try await sourceTraits(video: videoTrack, audio: audioTrack),
                                          bitRateCeiling: budget.bitRate,
                                          encodesHEVC: VideoEncoderAvailability.encodesHEVC)

        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = true

        let videoInput = AVAssetWriterInput(mediaType: .video,
                                            outputSettings: VideoEncodePass.videoSettings(recipe, size: geometry.raw, for: writer))
        videoInput.expectsMediaDataInRealTime = false
        videoInput.transform = geometry.transform
        writer.add(videoInput)

        let reader = try AVAssetReader(asset: asset)
        let videoOutput = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: recipe.readerPixelFormat
        ])
        reader.add(videoOutput)

        let audio = Self.audioLane(track: audioTrack, recipe: recipe)
        if let audio {
            writer.add(audio.input)
            reader.add(audio.output)
        }

        try await VideoEncodePass.drain(reader: reader, writer: writer,
                                        video: VideoEncodePass.Lane(output: videoOutput, input: videoInput),
                                        audio: audio,
                                        start: .zero)

        Self.logger.info("Video compressed: \(recipe.codec == .hevc ? "HEVC" : "H.264", privacy: .public) \(recipe.keepsTenBits ? "10-bit" : "8-bit", privacy: .public) \(Int(geometry.display.width))x\(Int(geometry.display.height)) display, quality \(VideoTranscodeRecipe.perceptualQuality) under \(budget.bitRate / 1000)kbps")

        return outputURL
    }

    // MARK: - Les réglages, dérivés de la source (#11290)

    /// Ce que la source dit d'elle-même : étiquette couleur (#9332, HDR compris),
    /// cadence, nombre de canaux de son.
    private func sourceTraits(video: AVAssetTrack, audio: AVAssetTrack?) async throws -> VideoSourceTraits {
        let colorTags = try await video.load(.formatDescriptions).first.flatMap(VideoColorTagging.properties(of:))
        let frameRate = try await video.load(.nominalFrameRate)
        let audioFormat = try await audio?.load(.formatDescriptions).first
        let channels = audioFormat.flatMap { CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee.mChannelsPerFrame }
        return VideoSourceTraits(colorTags: colorTags, nominalFrameRate: frameRate,
                                 audioChannelCount: audio.map { _ in Int(channels ?? 2) })
    }

    private static func audioLane(track: AVAssetTrack?, recipe: VideoTranscodeRecipe) -> VideoEncodePass.Lane? {
        guard let track, let writing = recipe.audioWriterSettings, let reading = recipe.audioReaderSettings else { return nil }
        let input = AVAssetWriterInput(mediaType: .audio, outputSettings: writing)
        input.expectsMediaDataInRealTime = false
        return VideoEncodePass.Lane(output: AVAssetReaderTrackOutput(track: track, outputSettings: reading), input: input)
    }

    private nonisolated struct WriterGeometry {
        let transform: CGAffineTransform
        let raw: CGSize
        let display: CGSize
    }

    /// **Le writer encode les pixel buffers RAW** (orientation capteur), pas
    /// l'image affichée : la rotation part en métadonnée (`transform`). Le budget
    /// du contexte s'exprime côté AFFICHAGE ; on ajuste là puis on revient en
    /// RAW, sinon l'encodeur étire un 16:9 en 9:16 (régression du 2026-04-30).
    private func writerGeometry(of track: AVAssetTrack, within budget: CGSize) async throws -> WriterGeometry {
        let rawSourceSize = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        let isPortraitDisplay = abs(transform.b) == 1 && abs(transform.c) == 1
        let displaySource = isPortraitDisplay ? CGSize(width: rawSourceSize.height, height: rawSourceSize.width) : rawSourceSize
        let display = VideoEncodePass.fitSize(displaySource, within: budget)
        let raw = isPortraitDisplay ? CGSize(width: display.height, height: display.width) : display
        return WriterGeometry(transform: transform, raw: raw, display: display)
    }

    // MARK: - ImageIO hardware-accelerated downsampling

    private func downsample(data: Data, maxDimension: CGFloat) -> UIImage? {
        let sourceOptions: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions as CFDictionary) else {
            return nil
        }

        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimension
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }

    /// Single-pass CGImage downsample using ImageIO. Skips the JPEG@1.0 round-trip
    /// that the data-based variant requires when the caller already holds a CGImage
    /// (via `UIImage.cgImage`). Cuts ~150ms on a 4K source.
    ///
    /// **Échelle 1, et ce n'est pas un détail** (#6922) : le format par défaut
    /// prend l'échelle de l'ÉCRAN, si bien qu'une cible de 2 048 sortait à
    /// 6 144 px sur un écran ×3 — un bitmap transitoire de 113 Mo par photo et
    /// un JPEG plus lourd que l'original. `targetSize` est en pixels.
    private func downsample(cgImage: CGImage, maxDimension: CGFloat) -> UIImage? {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: targetSize(for: cgImage, maxDimension: maxDimension),
                                               format: format)
        let downsampled = renderer.image { ctx in
            ctx.cgContext.interpolationQuality = .high
            UIImage(cgImage: cgImage).draw(in: CGRect(origin: .zero, size: renderer.format.bounds.size))
        }
        return downsampled
    }

    private func targetSize(for cgImage: CGImage, maxDimension: CGFloat) -> CGSize {
        let w = CGFloat(cgImage.width)
        let h = CGFloat(cgImage.height)
        let longest = max(w, h)
        guard longest > maxDimension else { return CGSize(width: w, height: h) }
        let scale = maxDimension / longest
        return CGSize(width: floor(w * scale), height: floor(h * scale))
    }

    // MARK: - Passthrough fast-path

    /// Si la source est déjà compatible avec le budget cible (codec moderne,
    /// résolution & bitrate dans les clous), remuxe vers `outputURL` via
    /// `AVAssetExportPresetPassthrough`. Aucun décodage / ré-encodage —
    /// l'opération est limitée par la vitesse I/O disque (sub-seconde pour
    /// un clip mobile classique). Retourne `nil` si la passthrough n'est
    /// pas applicable, ce qui force le caller à fallback sur la pipeline
    /// AVAssetReader / Writer.
    ///
    /// Critères d'éligibilité :
    /// - Track vidéo en `kCMVideoCodecType_HEVC` ou `kCMVideoCodecType_H264`
    ///   (les codecs déjà efficaces, supportés universellement par les
    ///   players cibles : iOS, macOS, WhatsApp, Photos).
    /// - `naturalSize ≤ context.maxVideoResolution` (largeur ET hauteur).
    ///   Si l'asset est plus grand, il faut le rescaler → forcer le
    ///   re-encodage.
    /// - `estimatedDataRate ≤ context.videoBitRate × 2`. Tolérance 2× au
    ///   budget pour éviter de transcoder un clip à peine au-dessus — la
    ///   différence de taille (quelques MB) ne justifie pas 30 s+ de
    ///   compute thermal.
    ///
    /// Le caller utilise `try? await` car cette méthode peut throw sur
    /// asset corrompu — dans ce cas on retombe sur le path lent, qui
    /// fera la même check de track et throwra une erreur typée.
    private func passthroughIfPossible(
        asset: AVURLAsset,
        sourceURL: URL,
        outputURL: URL,
        budget: VideoSendBudget
    ) async throws -> URL? {
        guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            return nil
        }

        // Codec check via les format descriptions de la track.
        // Sous iOS 16+, le typed getter `.formatDescriptions` retourne
        // directement `[CMFormatDescription]` — pas besoin de downcast.
        let formats = try await videoTrack.load(.formatDescriptions)
        guard let firstFormat = formats.first else { return nil }
        let codec = CMFormatDescriptionGetMediaSubType(firstFormat)
        let isModernCodec = (codec == kCMVideoCodecType_HEVC) || (codec == kCMVideoCodecType_H264)
        guard isModernCodec else { return nil }

        // Résolution check — on compare la natural display size (après
        // rotation préférée) au budget. Si le source dépasse, on a besoin
        // de rescaler → on ne peut pas remux.
        let displaySize = try await videoTrack.naturalDisplaySize()
        let target = VideoEncodePass.oriented(budget.maxResolution, like: displaySize)
        let fitsInBudget = displaySize.width <= target.width + 1 &&
                           displaySize.height <= target.height + 1
        guard fitsInBudget else { return nil }

        // Bitrate check — `estimatedDataRate` en bits/s. On tolère 2× le
        // budget : 4 Mbps story × 2 = 8 Mbps, ce qui couvre la majorité
        // des captures iPhone qui sortent autour de 10–15 Mbps mais
        // qu'on accepte au prix d'un fichier marginalement plus gros
        // plutôt qu'un re-encode de 30+ s.
        let estimatedBitrate = try await videoTrack.load(.estimatedDataRate)
        let bitrateBudget = Float(budget.bitRate * 2)
        guard estimatedBitrate <= bitrateBudget else { return nil }

        // Tous les checks passent → remux via passthrough.
        guard let session = AVAssetExportSession(
            asset: asset,
            presetName: AVAssetExportPresetPassthrough
        ) else {
            return nil
        }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true

        await session.export()
        guard session.status == .completed else {
            // L'export passthrough a échoué pour une raison non-prévue
            // par les checks (asset corrompu, container exotique).
            // On signale au caller en throwant — il fera fallback sur
            // le path transcode lent (qui re-tentera le même asset).
            if let error = session.error {
                throw error
            }
            return nil
        }

        Self.logger.info("Video passthrough (no transcode): \(Int(displaySize.width))x\(Int(displaySize.height)) codec=\(codec == kCMVideoCodecType_HEVC ? "HEVC" : "H264", privacy: .public) @ ~\(Int(estimatedBitrate / 1000))kbps")
        return outputURL
    }

    // MARK: - MIME detection

    /// **Le type d'une image, lu dans ses OCTETS et non dans son nom.**
    ///
    /// La table de signatures est celle du SDK (`OutgoingImageFormat`), la même
    /// que lit `compressImageData`. Les chemins d'INGESTION la consultent, car
    /// ils doivent nommer un fichier avant de le compresser : un
    /// GIF écrit sous le nom `.jpg` a déjà perdu son animation quand le
    /// compresseur le reçoit — le mimeType, en aval, se dérive de l'extension.
    func imageMimeType(of data: Data) -> String {
        OutgoingImageFormat(sniffing: data).mimeType ?? "image/jpeg"
    }
}

// MARK: - Une passe d'encodage (#11290, #11849)

/// Ce qu'un rendu écrit : la copie GARDÉE par l'utilisateur (définition de la
/// source, plafond de sauvegarde) ou l'ENVOI (budget du contexte).
nonisolated struct VideoRenderTarget: Equatable, Sendable {
    let maxSize: CGSize?
    let bitRateCeiling: Int?

    static let sourceDefinition = VideoRenderTarget(maxSize: nil, bitRateCeiling: nil)

    static func sending(_ context: MediaContext) -> VideoRenderTarget {
        let budget = context.videoSendBudget(compresses: false)
        return VideoRenderTarget(maxSize: budget.maxResolution, bitRateCeiling: budget.bitRate)
    }
}

/// **La passe UNIQUE entre un lecteur et un écrivain**, partagée par la
/// compression (`MediaCompressor.compressVideo`) et le rendu d'une retouche
/// (`ComposerLookVideoExporter`). Les réglages viennent de `VideoTranscodeRecipe` ;
/// aucune étape n'écrit un fichier intermédiaire.
nonisolated enum VideoEncodePass {

    /// Une piste : ce que le lecteur rend, ce que l'écrivain reçoit.
    nonisolated struct Lane {
        let output: AVAssetReaderOutput
        let input: AVAssetWriterInput
    }

    /// **Une retouche (look, cadrage, son réglé) s'encode UNE fois par fichier** (#11849).
    ///
    /// La composition est lue image par image (`AVAssetReaderVideoCompositionOutput`)
    /// et le mixage avec elle (`AVAssetReaderAudioMixOutput`, tap d'amplification
    /// compris), puis écrite par la loi des réglages, HEVC à qualité visée, pour
    /// `target` : la copie de l'utilisateur garde la définition de la source,
    /// l'envoi suit son budget et entre dans `compressVideo` pour y être REMUXÉ.
    /// Avant, l'export passait par `AVAssetExportPresetHighestQuality` puis
    /// `compressVideo` ré-encodait : deux générations.
    static func render(_ asset: AVAsset, composition: AVVideoComposition, audioMix: AVAudioMix?,
                       timeRange: CMTimeRange?, metadata: [AVMetadataItem], target: VideoRenderTarget) async throws -> URL {
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        guard let first = videoTracks.first else { throw CompressionError.noVideoTrack }
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        let source = try await traits(of: composition, video: first, audio: audioTracks.first)
        let size = outputSize(of: composition.renderSize, for: target)
        let recipe = VideoTranscodeRecipe(source: source,
                                          bitRateCeiling: bitRateCeiling(for: target, size: size, frameRate: source.nominalFrameRate),
                                          encodesHEVC: VideoEncoderAvailability.encodesHEVC)

        let sortie = FileManager.default.temporaryDirectory.appendingPathComponent("video_look_\(UUID().uuidString).mov")
        try? FileManager.default.removeItem(at: sortie)
        let writer = try AVAssetWriter(outputURL: sortie, fileType: .mov)
        writer.shouldOptimizeForNetworkUse = true
        writer.metadata = metadata
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings(recipe, size: size, for: writer))
        videoInput.expectsMediaDataInRealTime = false
        writer.add(videoInput)

        let reader = try AVAssetReader(asset: asset)
        if let timeRange { reader.timeRange = timeRange }
        let videoOutput = AVAssetReaderVideoCompositionOutput(videoTracks: videoTracks, videoSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: recipe.readerPixelFormat
        ])
        videoOutput.videoComposition = composition
        reader.add(videoOutput)

        let audio = mixLane(audioTracks, audioMix: audioMix, recipe: recipe)
        if let audio {
            writer.add(audio.input)
            reader.add(audio.output)
        }
        do {
            try await drain(reader: reader, writer: writer, video: Lane(output: videoOutput, input: videoInput),
                            audio: audio, start: timeRange?.start ?? .zero)
        } catch {
            try? FileManager.default.removeItem(at: sortie)
            throw error
        }
        return sortie
    }

    /// La définition écrite : celle de la toile pour la copie gardée, ramenée au
    /// budget pour l'envoi — jamais agrandie, toujours paire.
    static func outputSize(of canvas: CGSize, for target: VideoRenderTarget) -> CGSize {
        fitSize(canvas, within: target.maxSize ?? canvas)
    }

    /// Le débit d'envoi borne l'envoi ; la copie gardée n'a qu'un plafond de
    /// sauvegarde proportionnel à sa définition (`archivalCeiling`).
    static func bitRateCeiling(for target: VideoRenderTarget, size: CGSize, frameRate: Float) -> Int {
        target.bitRateCeiling ?? VideoTranscodeRecipe.archivalCeiling(width: Int(size.width), height: Int(size.height),
                                                                      frameRate: frameRate)
    }

    /// La composition ÉMET ses propres couleurs : c'est elles que l'encodeur
    /// étiquette, pas celles de la prise.
    private static func traits(of composition: AVVideoComposition, video: AVAssetTrack,
                               audio: AVAssetTrack?) async throws -> VideoSourceTraits {
        let tags = [(AVVideoColorPrimariesKey, composition.colorPrimaries),
                    (AVVideoTransferFunctionKey, composition.colorTransferFunction),
                    (AVVideoYCbCrMatrixKey, composition.colorYCbCrMatrix)]
            .compactMap { cle, valeur in valeur.map { (cle, $0) } }
        let frameRate = try await video.load(.nominalFrameRate)
        let audioFormat = try await audio?.load(.formatDescriptions).first
        let channels = audioFormat.flatMap { CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee.mChannelsPerFrame }
        return VideoSourceTraits(colorTags: tags.count == 3 ? Dictionary(uniqueKeysWithValues: tags) : nil,
                                 nominalFrameRate: frameRate,
                                 audioChannelCount: audio.map { _ in Int(channels ?? 2) })
    }

    private static func mixLane(_ tracks: [AVAssetTrack], audioMix: AVAudioMix?, recipe: VideoTranscodeRecipe) -> Lane? {
        guard !tracks.isEmpty, let writing = recipe.audioWriterSettings, let reading = recipe.audioReaderSettings else {
            return nil
        }
        let output = AVAssetReaderAudioMixOutput(audioTracks: tracks, audioSettings: reading)
        output.audioMix = audioMix
        let input = AVAssetWriterInput(mediaType: .audio, outputSettings: writing)
        input.expectsMediaDataInRealTime = false
        return Lane(output: output, input: input)
    }

    /// La qualité visée si l'encodeur l'accepte, sinon le débit seul : jamais un
    /// réglage que `AVAssetWriterInput` refuserait par une exception ObjC.
    static func videoSettings(_ recipe: VideoTranscodeRecipe, size: CGSize, for writer: AVAssetWriter) -> [String: Any] {
        let candidates = recipe.videoSettingsCandidates(width: Int(size.width), height: Int(size.height))
        return candidates.first { writer.canApply(outputSettings: $0, forMediaType: .video) } ?? candidates[candidates.count - 1]
    }

    /// Lit et écrit les pistes EN PARALLÈLE, puis vérifie les DEUX bouts : un
    /// lecteur qui échoue en route (composition, disque) laisserait sinon un
    /// fichier tronqué passer pour complet.
    static func drain(reader: AVAssetReader, writer: AVAssetWriter, video: Lane, audio: Lane?,
                      start: CMTime) async throws {
        reader.startReading()
        // `startSession` après un `startWriting` refusé lève une exception ObjC
        // qu'aucun `do/catch` ne rattrape (#7004) : l'envoi échoue, l'app reste.
        guard writer.startWriting() else {
            reader.cancelReading()
            if let cause = writer.error { throw cause }
            throw CompressionError.writerCannotStart
        }
        writer.startSession(atSourceTime: start)

        let vOut = SendableTrackOutput(value: video.output)
        let vIn = SendableWriterInput(value: video.input)
        let aOut = audio.map { SendableTrackOutput(value: $0.output) }
        let aIn = audio.map { SendableWriterInput(value: $0.input) }
        async let videoTask: Void = transferSamples(from: vOut.value, to: vIn.value)
        async let audioTask: Void = {
            guard let aOut, let aIn else { return }
            await transferSamples(from: aOut.value, to: aIn.value)
        }()
        _ = await (videoTask, audioTask)

        guard reader.status != .failed else {
            writer.cancelWriting()
            throw reader.error ?? CompressionError.exportSessionFailed
        }
        await writer.finishWriting()
        guard writer.status == .completed else {
            throw writer.error ?? CompressionError.exportSessionFailed
        }
    }

    /// Une boîte tournée comme la vidéo : un budget 1080×1920 vaut 1920×1080 pour
    /// un paysage (#11915) — la HD ne se rabote pas parce que la vidéo est couchée.
    static func oriented(_ box: CGSize, like source: CGSize) -> CGSize {
        let paysage = source.width > source.height
        guard paysage != (box.width > box.height), source.width != source.height else { return box }
        return CGSize(width: box.height, height: box.width)
    }

    static func fitSize(_ source: CGSize, within box: CGSize) -> CGSize {
        let max = oriented(box, like: source)
        guard source.width > max.width || source.height > max.height else {
            return CGSize(width: evenNumber(source.width), height: evenNumber(source.height))
        }
        let scale = min(max.width / source.width, max.height / source.height)
        return CGSize(width: evenNumber(source.width * scale), height: evenNumber(source.height * scale))
    }

    private static func evenNumber(_ value: CGFloat) -> CGFloat {
        let rounded = Int(value.rounded())
        return CGFloat(rounded % 2 == 0 ? rounded : rounded - 1)
    }

    private static func transferSamples(from output: AVAssetReaderOutput, to input: AVAssetWriterInput) async {
        let wrappedInput = SendableWriterInput(value: input)
        let wrappedOutput = SendableTrackOutput(value: output)
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            nonisolated(unsafe) var finished = false
            nonisolated(unsafe) let inp = wrappedInput.value
            nonisolated(unsafe) let out = wrappedOutput.value
            inp.requestMediaDataWhenReady(on: DispatchQueue(label: "me.meeshy.media-compressor.\(inp.mediaType.rawValue)")) {
                while inp.isReadyForMoreMediaData {
                    guard !finished else { return }
                    guard let sample = out.copyNextSampleBuffer() else {
                        finished = true
                        inp.markAsFinished()
                        continuation.resume()
                        return
                    }
                    // L'écrivain a basculé en échec (disque plein, interruption) : le bloc ne serait
                    // plus jamais rappelé et l'attente resterait suspendue pour toujours, l'envoi
                    // avec elle. Le statut est relu par l'appelant.
                    guard inp.append(sample) else {
                        finished = true
                        inp.markAsFinished()
                        continuation.resume()
                        return
                    }
                }
            }
        }
    }
}

// MARK: - Compression Errors

enum CompressionError: LocalizedError {
    case exportSessionFailed
    case noVideoTrack
    /// `startWriting()` a refusé de commencer — disque plein, chemin de sortie
    /// occupé, réglages rejetés par l'encodeur — et le writer n'a pas donné
    /// d'erreur à lire. Distincte d'`exportSessionFailed`, qui dit qu'un export
    /// COMMENCÉ n'a pas abouti (#7004).
    case writerCannotStart

    var errorDescription: String? {
        switch self {
        case .exportSessionFailed: return "Video compression failed"
        case .noVideoTrack: return "No video track found in source file"
        case .writerCannotStart: return "Video writer could not start (disk full or output path busy)"
        }
    }
}
