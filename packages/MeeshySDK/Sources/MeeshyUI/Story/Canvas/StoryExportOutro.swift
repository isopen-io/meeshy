import Foundation
import AVFoundation
import CoreGraphics
import UIKit
import MeeshySDK

/// Carte de fin de marque des exports : le logo Meeshy plein écran qui se trace
/// puis respire sur un fond de marque, tenu le temps de la signature sonore de
/// fermeture.
///
/// Pendant de `StoryExportIntro` (l'entrée) mais côté SORTIE. Les frames rendues
/// ici sont OPAQUES : le fondu d'entrée par-dessus la fin de la story est appliqué
/// par la composition d'export (rampe d'opacité `AVFoundation`), pas peint ici.
///
/// SDK — atome pur : ne prend qu'une taille de rendu opaque, aucune dépendance
/// produit. L'orchestration (quand/où l'ajouter à l'export) reste app-side.
public enum StoryExportOutro {

    /// Durée de la carte de fin — calée sur la signature sonore de fermeture (2 s).
    public static var duration: TimeInterval { MeeshyBrandJingle.outroDuration }

    /// Cadence de rendu des frames animées — celle du pipeline entier.
    static let fps: Double = StoryExportFrameRate.fps

    /// Le logo est ENTIÈREMENT tracé à cet instant : le trace du watermark dure
    /// 3 s, trop long pour une carte de 2 s — on l'accélère pour qu'il se forme
    /// tôt puis respire le reste du temps.
    static let traceDuration: TimeInterval = 1.1

    // MARK: - Carte de fin d'AUTEUR (Part D — 2026-07-26)

    /// Fermeture en 2 temps quand une identité d'auteur est fournie (directive
    /// user 2026-07-26) :
    ///   1. le logo animé apparaît pour TERMINER la vidéo — muet (le jingle est
    ///      décalé), pendant `logoPhase`. Il chevauche exactement le crossfade
    ///      d'entrée (`overlap`) : le logo est plein pile quand la story s'éteint.
    ///   2. PUIS l'interlude d'auteur (comme l'intro : avatar + nom + @username +
    ///      mood) mais le fond bannière est remplacé par le logo animé DIMMÉ en
    ///      filigrane, pendant `identityPhase` — et c'est CETTE carte qui porte le
    ///      jingle de fermeture.
    static let logoPhase: TimeInterval = 1.5
    static let identityPhase: TimeInterval = 2.0
    /// L'identité entre en fondu sur cette fenêtre au début de la 2ᵉ phase.
    static let identityFadeIn: TimeInterval = 0.4
    /// Durée du clip outro quand une identité est peinte : logo PUIS identité.
    static var authorClipDuration: TimeInterval { logoPhase + identityPhase }
    /// Opacité du logo réduit en filigrane derrière l'identité (2ᵉ phase).
    private static let watermarkOpacity: CGFloat = 0.22

    // MARK: - Géométrie du logo (miroir de `StoryExportWatermark.dashes`)

    /// Trois traits en espace 1024 (`MeeshyDashesShape`) : longueurs décroissantes,
    /// alignés à gauche. Dupliqué du watermark plutôt que d'exposer sa méthode
    /// `@MainActor private` — l'outro rend off-main comme l'intro.
    private static let dashes: [(from: CGPoint, to: CGPoint)] = [
        (CGPoint(x: 262, y: 384), CGPoint(x: 762, y: 384)),
        (CGPoint(x: 262, y: 512), CGPoint(x: 662, y: 512)),
        (CGPoint(x: 262, y: 640), CGPoint(x: 562, y: 640)),
    ]
    private static let dashLineWidth: CGFloat = 112
    /// Indigo500 (#6366F1) — même teinte que le logo animé du watermark.
    private static let logoColor = UIColor(red: 99.0 / 255.0, green: 102.0 / 255.0,
                                           blue: 241.0 / 255.0, alpha: 1)

    // MARK: - Rendu

    /// Rend UNE frame de la carte de fin à l'instant `t` (0…`duration`). Opaque.
    public static func renderFrame(at t: TimeInterval, size: CGSize) -> CGImage? {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1                        // même impératif d'échelle que l'intro
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { ctx in
            let cg = ctx.cgContext
            drawBackground(in: cg, size: size)
            drawLogo(in: cg, size: size, t: t)
            drawWordmark(in: size)
        }.cgImage
    }

    /// Rend UNE frame de la carte de fin d'AUTEUR à l'instant `t`
    /// (0…`authorClipDuration`). Opaque. Deux phases (Part D) :
    ///  - `t < logoPhase` : le logo animé se forme, plein — comme la carte logo.
    ///  - `t ≥ logoPhase` : le logo passe en filigrane dimmé (il REMPLACE la
    ///    bannière), un voile de lisibilité s'applique, et l'identité de l'auteur
    ///    (avatar + nom + @username + mood) entre en fondu — réutilise EXACTEMENT
    ///    le rendu d'identité de `StoryExportIntro`.
    public static func renderFrame(at t: TimeInterval, size: CGSize,
                                   content: StoryExportIntroContent) -> CGImage? {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { ctx in
            let cg = ctx.cgContext
            drawBackground(in: cg, size: size)
            if t < logoPhase {
                drawLogo(in: cg, size: size, t: t)
                drawWordmark(in: size)
            } else {
                // Fond = le logo animé DIMMÉ en filigrane (remplace la bannière).
                drawLogo(in: cg, size: size, t: t, opacityScale: watermarkOpacity)
                StoryExportIntro.drawScrim(in: cg, size: size)
                // Identité en fondu d'entrée sur `identityFadeIn`.
                let localT = t - logoPhase
                let alpha = CGFloat(max(0, min(1, localT / identityFadeIn)))
                cg.saveGState()
                cg.setAlpha(alpha)
                StoryExportIntro.drawIdentity(content, in: cg, size: size)
                cg.restoreGState()
            }
        }.cgImage
    }

    /// Fond de marque plein : indigo profond → noir (traitement logo « dark mode »).
    private static func drawBackground(in cg: CGContext, size: CGSize) {
        let rect = CGRect(origin: .zero, size: size)
        let space = CGColorSpaceCreateDeviceRGB()
        let indigo950 = UIColor(red: 30.0 / 255.0, green: 27.0 / 255.0, blue: 75.0 / 255.0, alpha: 1)
        let colors = [indigo950.cgColor, UIColor.black.cgColor] as CFArray
        if let gradient = CGGradient(colorsSpace: space, colors: colors, locations: [0, 1]) {
            cg.drawLinearGradient(gradient,
                                  start: CGPoint(x: rect.midX, y: rect.minY),
                                  end: CGPoint(x: rect.midX, y: rect.maxY),
                                  options: [])
        } else {
            cg.setFillColor(UIColor.black.cgColor)
            cg.fill(rect)
        }
    }

    /// Draw-on accéléré (easeOut) + respiration douce — miroir de la logique du
    /// watermark, mais calé sur `traceDuration`. `opacityScale < 1` réduit le logo
    /// en filigrane derrière l'identité (2ᵉ phase de la carte de fin d'auteur).
    private static func drawLogo(in cg: CGContext, size: CGSize, t: TimeInterval,
                                 opacityScale: CGFloat = 1) {
        let side = size.width * 0.44
        let rect = CGRect(x: (size.width - side) / 2,
                          y: size.height * 0.40 - side / 2,
                          width: side, height: side)

        let breathe = (1 - cos(2 * Double.pi * t / 3.0)) / 2          // 0…1, doux
        let scale = CGFloat(1.0 + 0.05 * breathe)
        let opacities: [CGFloat] = [
            0.82 + 0.18 * CGFloat(breathe),
            1.0,
            0.82 + 0.18 * CGFloat(breathe),
        ]

        let s = min(rect.width, rect.height) / 1024.0
        cg.saveGState()
        // Respiration : léger scale autour du centre du logo.
        cg.translateBy(x: rect.midX, y: rect.midY)
        cg.scaleBy(x: scale, y: scale)
        cg.translateBy(x: -rect.midX, y: -rect.midY)
        // Place le glyphe 1024 dans le rect.
        cg.translateBy(x: rect.minX, y: rect.minY)
        cg.scaleBy(x: s, y: s)

        cg.setLineCap(.round)
        cg.setLineWidth(dashLineWidth)
        for (index, dash) in dashes.enumerated() {
            let progress = traceProgress(t: t, barIndex: index)
            guard progress > 0.001 else { continue }
            cg.setStrokeColor(logoColor.withAlphaComponent(opacities[index] * opacityScale).cgColor)
            let xEnd = dash.from.x + (dash.to.x - dash.from.x) * progress
            cg.move(to: dash.from)
            cg.addLine(to: CGPoint(x: xEnd, y: dash.from.y))
            cg.strokePath()
        }
        cg.restoreGState()
    }

    /// Progression du trait `barIndex` (easeOut, 0…1), le trace complet calé sur
    /// `traceDuration` : on remappe `t` sur l'échelle 3 s du motif d'origine.
    static func traceProgress(t: TimeInterval, barIndex: Int) -> CGFloat {
        let elapsed = t * (3.0 / traceDuration)      // accélération
        let delay = Double(barIndex) * 0.6           // stagger d'origine
        let raw = max(0, min(1, (elapsed - delay) / 1.8))
        return CGFloat(1 - pow(1 - raw, 2))          // easeOut
    }

    /// Wordmark « meeshy » centré sous le logo (blanc, gras).
    private static func drawWordmark(in size: CGSize) {
        let fontSize = size.width * 0.072
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: fontSize, weight: .bold),
            .foregroundColor: UIColor.white
        ]
        let string = NSAttributedString(string: "meeshy", attributes: attributes)
        let bounds = string.size()
        let logoBottom = size.height * 0.40 + (size.width * 0.44) / 2
        string.draw(at: CGPoint(x: (size.width - bounds.width) / 2,
                                y: logoBottom + fontSize * 0.7))
    }

    // MARK: - Encodage (multi-frames — la carte s'anime sur les 2 s)

    /// Encode la carte de fin animée en un clip MP4 muet. La signature sonore de
    /// fermeture est mixée par la composition, pas ici. Sans `content`, c'est la
    /// carte logo-seule de `duration` (comportement historique — chemins sans
    /// identité). Avec `content`, c'est la carte d'AUTEUR en 2 temps (Part D), de
    /// `authorClipDuration`.
    public static func makeClip(size: CGSize,
                                content: StoryExportIntroContent? = nil) async throws -> URL {
        let clipDuration = content != nil ? authorClipDuration : duration
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-outro-\(UUID().uuidString).mp4")
        let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height)
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32ARGB),
                kCVPixelBufferWidthKey as String: Int(size.width),
                kCVPixelBufferHeightKey as String: Int(size.height)
            ]
        )
        guard writer.canAdd(input) else { throw OutroError.writerRejectedInput }
        writer.add(input)
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)

        let frameCount = max(1, Int(clipDuration * fps))
        let timescale: CMTimeScale = 600
        for index in 0..<frameCount {
            let t = Double(index) / fps
            let frame = content.map { renderFrame(at: t, size: size, content: $0) }
                ?? renderFrame(at: t, size: size)
            guard let image = frame,
                  let buffer = pixelBuffer(from: image, size: size) else {
                writer.cancelWriting()
                throw OutroError.pixelBufferCreationFailed
            }
            while !input.isReadyForMoreMediaData {
                try await Task.sleep(nanoseconds: 5_000_000)   // 5 ms — écriture offline, rare
            }
            adaptor.append(buffer, withPresentationTime: CMTime(seconds: t, preferredTimescale: timescale))
        }
        input.markAsFinished()
        writer.endSession(atSourceTime: CMTime(seconds: clipDuration, preferredTimescale: timescale))
        await writer.finishWriting()
        guard writer.status == .completed else {
            throw OutroError.encodingFailed(writer.error)
        }
        return url
    }

    // MARK: - Composition (crossfade sur la fin de la story)

    /// Compose la carte de fin SUR la fin du MP4 fourni : elle entre en fondu par
    /// crossfade pendant les 1,5 dernières secondes de la story, puis tient 0,5 s
    /// (2 s au total ; la vidéo finale est allongée de 0,5 s). L'audio de la story
    /// s'estompe en même temps que l'image et la signature sonore de fermeture est
    /// mixée par-dessus.
    ///
    /// Crossfade SYMÉTRIQUE (sortant 1→0 + entrant 0→1) — même approche que
    /// `VideoCompositor`, dont le résultat aux deux bornes ne dépend pas de l'ordre
    /// des couches.
    ///
    /// Sans `content` : carte logo-seule + jingle mixé dès le crossfade (chemins
    /// SANS identité résolue — parité `TimelineExportFlow`, comportement inchangé,
    /// vidéo allongée de 0,5 s). Avec `content` (Part D) : fermeture en 2 temps —
    /// le logo TERMINE la vidéo pendant le crossfade (muet, `logoPhase`), PUIS la
    /// carte d'auteur (identité sur fond-logo dimmé) porte le jingle décalé à sa
    /// 2ᵉ phase ; la vidéo est alors allongée de `identityPhase - overlap` (+0,5 s).
    public static func append(to storyURL: URL, renderSize: CGSize,
                              content: StoryExportIntroContent? = nil) async throws -> URL {
        let base = AVURLAsset(url: storyURL)
        let baseDuration = try await base.load(.duration)
        let overlap = CMTime(seconds: 1.5, preferredTimescale: 600)
        // Story < 1,5 s : un départ négatif est impossible — on cale le fondu au
        // tout début plutôt que de sortir du temps.
        let rawStart = CMTimeSubtract(baseDuration, overlap)
        let outroStart = CMTimeGetSeconds(rawStart) < 0 ? .zero : rawStart
        let fadeRange = CMTimeRange(start: outroStart,
                                    duration: CMTimeSubtract(baseDuration, outroStart))
        // Le jingle démarre avec le logo (carte logo-seule) OU à la 2ᵉ phase quand
        // une identité est peinte — le logo TERMINE alors la vidéo en silence.
        let jingleStart = content != nil
            ? CMTimeAdd(outroStart, CMTime(seconds: logoPhase, preferredTimescale: 600))
            : outroStart

        let outroURL = try await makeClip(size: renderSize, content: content)
        let jingleURL = try MeeshyBrandJingle.renderOutroToTemporaryFile()
        defer {
            try? FileManager.default.removeItem(at: outroURL)
            try? FileManager.default.removeItem(at: jingleURL)
        }

        let composition = AVMutableComposition()
        guard let baseVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let outroVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let baseAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid),
              let jingleAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { throw OutroError.writerRejectedInput }

        if let v = try await base.loadTracks(withMediaType: .video).first {
            try baseVideo.insertTimeRange(CMTimeRange(start: .zero, duration: baseDuration), of: v, at: .zero)
        }
        if let a = try await base.loadTracks(withMediaType: .audio).first {
            try baseAudio.insertTimeRange(CMTimeRange(start: .zero, duration: baseDuration), of: a, at: .zero)
        }

        let outroAsset = AVURLAsset(url: outroURL)
        let outroDur = try await outroAsset.load(.duration)
        if let ov = try await outroAsset.loadTracks(withMediaType: .video).first {
            try outroVideo.insertTimeRange(CMTimeRange(start: .zero, duration: outroDur), of: ov, at: outroStart)
        }
        let jingleAsset = AVURLAsset(url: jingleURL)
        let jingleDur = try await jingleAsset.load(.duration)
        if let ja = try await jingleAsset.loadTracks(withMediaType: .audio).first {
            try jingleAudio.insertTimeRange(CMTimeRange(start: .zero, duration: jingleDur), of: ja, at: jingleStart)
        }

        let totalDuration = CMTimeAdd(outroStart, outroDur)      // logo-seule : D+0,5 · auteur : D+2,0

        // Composition vidéo — crossfade symétrique sur `fadeRange`, l'outro reste
        // ensuite opaque (dernière opacité tenue) le temps de la queue de 0,5 s.
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: totalDuration)
        let baseLayer = AVMutableVideoCompositionLayerInstruction(assetTrack: baseVideo)
        baseLayer.setOpacityRamp(fromStartOpacity: 1, toEndOpacity: 0, timeRange: fadeRange)
        let outroLayer = AVMutableVideoCompositionLayerInstruction(assetTrack: outroVideo)
        outroLayer.setOpacityRamp(fromStartOpacity: 0, toEndOpacity: 1, timeRange: fadeRange)
        instruction.layerInstructions = [outroLayer, baseLayer]

        let videoComposition = AVMutableVideoComposition()
        videoComposition.instructions = [instruction]
        videoComposition.frameDuration = StoryExportFrameRate.frameDuration
        videoComposition.renderSize = renderSize

        // Audio — la story s'estompe pendant que la signature de fermeture entre.
        let audioMix = AVMutableAudioMix()
        let baseParams = AVMutableAudioMixInputParameters(track: baseAudio)
        baseParams.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0, timeRange: fadeRange)
        audioMix.inputParameters = [baseParams]

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-story-\(UUID().uuidString).mp4")
        guard let session = AVAssetExportSession(asset: composition,
                                                 presetName: AVAssetExportPresetHighestQuality)
        else { throw OutroError.writerRejectedInput }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.videoComposition = videoComposition
        session.audioMix = audioMix
        // `export()` sans argument — le `export(to:as:)` d'iOS 18 tombe en SIGSEGV
        // combiné à outputURL/outputFileType (même piège que StoryExportIntro).
        await session.export()
        guard session.status == .completed else {
            throw OutroError.encodingFailed(session.error)
        }
        return outputURL
    }

    private static func pixelBuffer(from image: CGImage, size: CGSize) -> CVPixelBuffer? {
        var buffer: CVPixelBuffer?
        let attributes: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
        ]
        guard CVPixelBufferCreate(kCFAllocatorDefault,
                                  Int(size.width), Int(size.height),
                                  kCVPixelFormatType_32ARGB,
                                  attributes as CFDictionary,
                                  &buffer) == kCVReturnSuccess,
              let pixelBuffer = buffer else { return nil }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(pixelBuffer),
            width: Int(size.width), height: Int(size.height),
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
        ) else { return nil }
        context.draw(image, in: CGRect(origin: .zero, size: size))
        return pixelBuffer
    }

    public enum OutroError: Error {
        case writerRejectedInput
        case pixelBufferCreationFailed
        case encodingFailed(Error?)
    }
}
