import Foundation
import AVFoundation
import CoreGraphics
import CoreText
import UIKit
import SwiftUI
import MeeshySDK

/// Identité d'auteur telle qu'elle est peinte en tête d'un export de story.
///
/// Type volontairement plat et opaque : le SDK n'a pas à connaître le modèle
/// `StoryGroupIntro` de l'app, et l'app garde la main sur la résolution des
/// images (cache, réseau, fallback). Cf. la règle SDK Purity.
public struct StoryExportIntroContent: Sendable {
    public let displayName: String
    public let username: String
    public let avatar: CGImage?
    /// Background image (author banner, or the avatar's decoded thumbHash) —
    /// drawn aspectFill. `nil` falls back to a vibrant accent gradient.
    public let banner: CGImage?
    /// Mood emoji (from the author's ephemeral status), drawn in a capsule under
    /// the @username. `nil` hides the mood row entirely.
    public let moodEmoji: String?
    /// Optional mood message shown next to the emoji.
    public let moodMessage: String?
    /// Hex "RRGGBB" — teinte de repli quand aucune bannière n'est fournie.
    public let accentColorHex: String

    public init(displayName: String,
                username: String,
                avatar: CGImage? = nil,
                banner: CGImage? = nil,
                moodEmoji: String? = nil,
                moodMessage: String? = nil,
                accentColorHex: String) {
        self.displayName = displayName
        self.username = username
        self.avatar = avatar
        self.banner = banner
        self.moodEmoji = moodEmoji
        self.moodMessage = moodMessage
        self.accentColorHex = accentColorHex
    }
}

/// Gabarit du préambule — il doit être IDENTIQUE à celui de la story, sinon la
/// concaténation produit un MP4 qui change de dimensions en cours de route.
/// Miroir de la taille de rendu choisie par `StoryExporter`.
public enum StoryExportIntroSizing {
    public static func renderSize(for slide: StorySlide) -> CGSize {
        switch slide.effects.canvasAspect {
        case .portrait:
            return CanvasGeometry.designSize                       // 1080×1920
        case .landscape:
            return CGSize(width: CanvasGeometry.designHeight,
                          height: CanvasGeometry.designWidth)      // 1920×1080
        }
    }
}

/// Fabrique le préambule d'un export de story : l'interlude d'identité de
/// l'auteur, tenu pendant la durée de la signature sonore Meeshy.
///
/// L'interlude n'appartient PAS à la story — c'est l'emballage de marque, au
/// même titre que le filigrane. Il est donc composé ici, en amont, et la story
/// commence après lui.
public enum StoryExportIntro {

    /// L'interlude tient à PLEINE opacité pendant `holdDuration`, puis se fond
    /// vers la story sur `crossfadeDuration` — la story se RÉVÈLE, jamais une
    /// coupure brutale (directive user 2026-07-26). La story démarre donc à
    /// `holdDuration`, et le fondu chevauche ses `crossfadeDuration` premières
    /// secondes sans jamais la rallonger.
    public static let holdDuration: TimeInterval = 1.2
    public static let crossfadeDuration: TimeInterval = 0.5

    /// Décalage de départ de la story dans la composition finale (= `holdDuration`).
    /// Conservé sous le nom `duration` : l'invariant `total = duration + storyDuration`
    /// (assertions d'export bout-en-bout) reste vrai, seule sa valeur change.
    public static var duration: TimeInterval { holdDuration }

    /// Longueur du CLIP d'interlude encodé : la tenue PLUS la queue de fondu — il
    /// faut des frames à faire disparaître pendant le crossfade.
    static var clipDuration: TimeInterval { holdDuration + crossfadeDuration }

    /// Peint la carte d'identité : bannière (ou aplat de la couleur d'accent)
    /// assombrie, avatar rond centré, nom et @username dessous.
    ///
    /// Miroir de `StoryAuthorIdentityCard` côté lecture — le spectateur qui
    /// reçoit le MP4 doit reconnaître l'écran qu'il voit dans l'app.
    public static func render(_ content: StoryExportIntroContent,
                              size: CGSize) -> CGImage? {
        // `scale = 1` IMPÉRATIF : par défaut le renderer applique l'échelle de
        // l'écran, donc un export 1080×1920 sortirait en 3240×5760 sur un
        // appareil @3x — hors gabarit de la composition et trois fois trop lourd.
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { context in
            let cg = context.cgContext
            drawBackdrop(content, in: cg, size: size)
            drawScrim(in: cg, size: size)
            drawIdentity(content, in: cg, size: size)
        }
        return image.cgImage
    }

    private static func drawBackdrop(_ content: StoryExportIntroContent,
                                     in cg: CGContext,
                                     size: CGSize) {
        let rect = CGRect(origin: .zero, size: size)
        if let banner = content.banner {
            // `aspectFill` : la bannière couvre sans jamais laisser de bande.
            let scale = max(size.width / CGFloat(banner.width),
                            size.height / CGFloat(banner.height))
            let drawn = CGSize(width: CGFloat(banner.width) * scale,
                               height: CGFloat(banner.height) * scale)
            // `UIImage.draw` et NON `cg.draw` : le contexte du renderer est en
            // repère UIKit (origine haut-gauche). L'API Core Graphics bas-niveau
            // suppose l'origine bas-gauche et sortirait la bannière retournée
            // verticalement (le texte, lui, resterait droit) — le bug d'export.
            UIImage(cgImage: banner).draw(in: CGRect(x: (size.width - drawn.width) / 2,
                                                     y: (size.height - drawn.height) / 2,
                                                     width: drawn.width,
                                                     height: drawn.height))
        } else {
            // Vibrant fallback mirroring the viewer's StoryAuthorIdentityCard:
            // accent colour → black, top-leading to bottom-trailing.
            let accent = UIColor(Color(hex: content.accentColorHex))
            drawLinearGradient(in: cg, rect: rect,
                               colors: [accent, .black],
                               start: CGPoint(x: rect.minX, y: rect.minY),
                               end: CGPoint(x: rect.maxX, y: rect.maxY))
        }
    }

    /// Readability scrim — a 3-stop vertical gradient matching
    /// `StoryAuthorIdentityCard` (top 0.62, mid 0.28, bottom 0.72) so the name
    /// stays legible over any banner.
    ///
    /// Package-internal (pas `private`) : `StoryExportOutro` réutilise le MÊME
    /// voile + la MÊME carte d'identité pour la carte de fin d'auteur (Part D
    /// 2026-07-26), garantissant qu'ouverture et fermeture montrent une identité
    /// peinte à l'identique.
    static func drawScrim(in cg: CGContext, size: CGSize) {
        let rect = CGRect(origin: .zero, size: size)
        drawLinearGradient(
            in: cg, rect: rect,
            colors: [UIColor.black.withAlphaComponent(0.62),
                     UIColor.black.withAlphaComponent(0.28),
                     UIColor.black.withAlphaComponent(0.72)],
            locations: [0, 0.5, 1],
            start: CGPoint(x: rect.midX, y: rect.minY),
            end: CGPoint(x: rect.midX, y: rect.maxY))
    }

    /// Package-internal (pas `private`) : réutilisée par `StoryExportOutro` pour
    /// la carte de fin d'auteur (Part D). Peint avatar + nom + @username + mood
    /// dans le contexte courant — l'appelant pose le fond (bannière OU logo de
    /// marque) et l'alpha (fondu d'entrée) avant d'appeler.
    static func drawIdentity(_ content: StoryExportIntroContent,
                                     in cg: CGContext,
                                     size: CGSize) {
        let avatarSide = size.width * 0.28
        let avatarRect = CGRect(x: (size.width - avatarSide) / 2,
                                y: size.height * 0.5 - avatarSide * 0.9,
                                width: avatarSide,
                                height: avatarSide)
        cg.saveGState()
        cg.addEllipse(in: avatarRect)
        cg.clip()
        if let avatar = content.avatar {
            // Même raison que la bannière : passer par UIKit pour respecter le
            // repère haut-gauche du renderer. Le clip circulaire posé sur `cg`
            // reste actif — `UIImage.draw` peint dans le contexte courant.
            UIImage(cgImage: avatar).draw(in: avatarRect)
        } else {
            cg.setFillColor(UIColor(Color(hex: content.accentColorHex)).cgColor)
            cg.fill(avatarRect)
        }
        cg.restoreGState()

        // Fallback initials, centred in the vibrant disc when no avatar image.
        if content.avatar == nil {
            drawCentredInRect(makeInitials(content.displayName),
                              fontSize: avatarSide * 0.38, weight: .bold,
                              color: .white, in: avatarRect)
        }

        let nameSize = size.width * 0.058
        let handleSize = size.width * 0.036
        drawCentred(content.displayName,
                    fontSize: nameSize, weight: .bold,
                    color: .white, alpha: 1,
                    y: avatarRect.maxY + nameSize * 0.9, in: size)
        let handleY = avatarRect.maxY + nameSize * 0.9 + nameSize * 1.4
        drawCentred("@\(content.username)",
                    fontSize: handleSize, weight: .regular,
                    color: .white, alpha: 0.75,
                    y: handleY, in: size)

        if let emoji = content.moodEmoji, !emoji.isEmpty {
            drawMoodCapsule(emoji: emoji, message: content.moodMessage,
                            centreY: handleY + handleSize * 2.6, in: cg, size: size)
        }
    }

    /// First letter of up to two words, uppercased — mirrors `MeeshyAvatar`.
    static func makeInitials(_ name: String) -> String {
        let words = name.split(separator: " ").prefix(2)
        let letters = words.compactMap { $0.first }.map(String.init)
        return letters.joined().uppercased()
    }

    private static func drawCentredInRect(_ text: String,
                                          fontSize: CGFloat,
                                          weight: UIFont.Weight,
                                          color: UIColor,
                                          in rect: CGRect) {
        guard !text.isEmpty else { return }
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: fontSize, weight: weight),
            .foregroundColor: color
        ]
        let string = NSAttributedString(string: text, attributes: attributes)
        let bounds = string.size()
        string.draw(at: CGPoint(x: rect.midX - bounds.width / 2,
                                y: rect.midY - bounds.height / 2))
    }

    private static func drawLinearGradient(in cg: CGContext,
                                           rect: CGRect,
                                           colors: [UIColor],
                                           locations: [CGFloat]? = nil,
                                           start: CGPoint,
                                           end: CGPoint) {
        let space = CGColorSpaceCreateDeviceRGB()
        let cgColors = colors.map { $0.cgColor } as CFArray
        guard let gradient = CGGradient(colorsSpace: space,
                                        colors: cgColors,
                                        locations: locations) else {
            if let first = colors.first {
                cg.setFillColor(first.cgColor)
                cg.fill(rect)
            }
            return
        }
        cg.saveGState()
        cg.addRect(rect)
        cg.clip()
        cg.drawLinearGradient(gradient, start: start, end: end, options: [])
        cg.restoreGState()
    }

    /// Mood row — emoji (+ optional message) inside a translucent capsule,
    /// mirroring the `.ultraThinMaterial` capsule of `StoryAuthorIdentityCard`.
    private static func drawMoodCapsule(emoji: String,
                                        message: String?,
                                        centreY: CGFloat,
                                        in cg: CGContext,
                                        size: CGSize) {
        let emojiFont = UIFont.systemFont(ofSize: size.width * 0.040)
        let emojiString = NSAttributedString(string: emoji, attributes: [.font: emojiFont])
        let emojiBounds = emojiString.size()

        var messageString: NSAttributedString?
        var messageBounds = CGSize.zero
        if let message, !message.isEmpty {
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: size.width * 0.032, weight: .regular),
                .foregroundColor: UIColor.white.withAlphaComponent(0.9)
            ]
            messageString = NSAttributedString(string: message, attributes: attrs)
            messageBounds = messageString!.size()
        }

        let spacing: CGFloat = messageString != nil ? size.width * 0.02 : 0
        let contentWidth = emojiBounds.width + spacing + messageBounds.width
        let contentHeight = max(emojiBounds.height, messageBounds.height)
        let padH = size.width * 0.03
        let padV = size.width * 0.016
        let capsuleWidth = contentWidth + padH * 2
        let capsuleHeight = contentHeight + padV * 2
        let capsuleRect = CGRect(x: (size.width - capsuleWidth) / 2,
                                 y: centreY - capsuleHeight / 2,
                                 width: capsuleWidth,
                                 height: capsuleHeight)

        cg.saveGState()
        let path = UIBezierPath(roundedRect: capsuleRect, cornerRadius: capsuleHeight / 2)
        cg.addPath(path.cgPath)
        cg.setFillColor(UIColor.white.withAlphaComponent(0.16).cgColor)
        cg.fillPath()
        cg.restoreGState()

        let contentX = capsuleRect.minX + padH
        emojiString.draw(at: CGPoint(x: contentX,
                                     y: capsuleRect.midY - emojiBounds.height / 2))
        if let messageString {
            messageString.draw(at: CGPoint(x: contentX + emojiBounds.width + spacing,
                                           y: capsuleRect.midY - messageBounds.height / 2))
        }
    }

    private static func drawCentred(_ text: String,
                                    fontSize: CGFloat,
                                    weight: UIFont.Weight,
                                    color: UIColor,
                                    alpha: CGFloat,
                                    y: CGFloat,
                                    in size: CGSize) {
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: fontSize, weight: weight),
            .foregroundColor: color.withAlphaComponent(alpha)
        ]
        let string = NSAttributedString(string: text, attributes: attributes)
        let bounds = string.size()
        string.draw(at: CGPoint(x: (size.width - bounds.width) / 2, y: y))
    }

    /// Encode l'image en un clip vidéo muet de `duration`, prêt à être inséré
    /// en tête d'une composition. Deux images suffisent — première et dernière —
    /// l'image étant fixe : inutile d'encoder 66 frames identiques.
    public static func makeClip(image: CGImage,
                                duration: TimeInterval,
                                size: CGSize) async throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-intro-\(UUID().uuidString).mp4")
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
        guard writer.canAdd(input) else { throw IntroError.writerRejectedInput }
        writer.add(input)
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)

        guard let buffer = pixelBuffer(from: image, size: size) else {
            writer.cancelWriting()
            throw IntroError.pixelBufferCreationFailed
        }
        // UNE seule frame, et c'est `endSession` qui fixe la durée. Poser une
        // seconde frame à `duration` la ferait au contraire TENIR à partir de
        // là, et le clip durait le double (mesuré 4,4 s pour 2,2 s demandées).
        let end = CMTime(seconds: duration, preferredTimescale: 600)
        adaptor.append(buffer, withPresentationTime: .zero)
        input.markAsFinished()
        writer.endSession(atSourceTime: end)
        await writer.finishWriting()
        guard writer.status == .completed else {
            throw IntroError.encodingFailed(writer.error)
        }
        return url
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

    /// Assemble le MP4 final : l'interlude d'identité et sa signature sonore,
    /// PUIS la story — reliés par un FONDU CROISÉ de `crossfadeDuration`, jamais
    /// une coupure sèche (directive user 2026-07-26 : la story se révèle).
    ///
    /// La story n'est PAS insérée dans la composition datée de `StoryExporter`
    /// (y glisser l'intro obligerait à décaler chaque instruction, keyframe et
    /// piste audio) : on part de son MP4 déjà baké et on le pose à `holdDuration`
    /// dans une composition neuve. Le fondu est un crossfade SYMÉTRIQUE (intro
    /// 1→0 + story 0→1) — même approche que `VideoCompositor`/`StoryExportOutro`,
    /// dont le résultat aux bornes ne dépend pas de l'ordre des couches. Coût :
    /// une seconde passe d'encodage, acceptable pour un export ponctuel auteur.
    ///
    /// - Parameters:
    ///   - storyURL: le MP4 de la story, tel que produit par `StoryExporter`.
    ///   - content: identité à peindre sur l'interlude.
    ///   - renderSize: gabarit du MP4 final — celui de la story.
    /// - Returns: l'URL du MP4 assemblé. L'appelant en est propriétaire.
    public static func prepend(to storyURL: URL,
                               content: StoryExportIntroContent,
                               renderSize: CGSize) async throws -> URL {
        guard let image = render(content, size: renderSize) else {
            throw IntroError.pixelBufferCreationFailed
        }
        // Le clip d'interlude dure la tenue PLUS la queue de fondu : il lui faut
        // des frames à faire disparaître pendant le crossfade.
        let introURL = try await makeClip(image: image, duration: clipDuration, size: renderSize)
        let jingleURL = try MeeshyBrandJingle.renderToTemporaryFile()
        defer {
            try? FileManager.default.removeItem(at: introURL)
            try? FileManager.default.removeItem(at: jingleURL)
        }

        let storyAsset = AVURLAsset(url: storyURL)
        let storyDuration = try await storyAsset.load(.duration)

        let storyStart = CMTime(seconds: holdDuration, preferredTimescale: 600)
        // Fenêtre du fondu : les `crossfadeDuration` premières secondes de la
        // story, pendant lesquelles l'interlude s'efface et la story se lève.
        let fadeRange = CMTimeRange(start: storyStart,
                                    duration: CMTime(seconds: crossfadeDuration, preferredTimescale: 600))

        let composition = AVMutableComposition()
        guard let introVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let storyVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let jingleAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid),
              let storyAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { throw IntroError.writerRejectedInput }

        let introAsset = AVURLAsset(url: introURL)
        let introDuration = try await introAsset.load(.duration)
        if let iv = try await introAsset.loadTracks(withMediaType: .video).first {
            try introVideo.insertTimeRange(CMTimeRange(start: .zero, duration: introDuration), of: iv, at: .zero)
        }
        let jingleAsset = AVURLAsset(url: jingleURL)
        let jingleDuration = try await jingleAsset.load(.duration)
        if let ja = try await jingleAsset.loadTracks(withMediaType: .audio).first {
            try jingleAudio.insertTimeRange(CMTimeRange(start: .zero, duration: jingleDuration), of: ja, at: .zero)
        }

        let storyRange = CMTimeRange(start: .zero, duration: storyDuration)
        if let sv = try await storyAsset.loadTracks(withMediaType: .video).first {
            try storyVideo.insertTimeRange(storyRange, of: sv, at: storyStart)
        }
        if let sa = try await storyAsset.loadTracks(withMediaType: .audio).first {
            try storyAudio.insertTimeRange(storyRange, of: sa, at: storyStart)
        } else {
            // Story muette : sans ce silence explicite, la piste audio s'arrête
            // avec le jingle et certains lecteurs tronquent la vidéo à cette durée.
            storyAudio.insertEmptyTimeRange(CMTimeRange(start: storyStart, duration: storyDuration))
        }

        let totalDuration = CMTimeAdd(storyStart, storyDuration)   // holdDuration + storyDuration

        // Vidéo — crossfade symétrique sur `fadeRange` : l'interlude s'efface
        // tandis que la story se révèle ; la story reste ensuite opaque.
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: totalDuration)
        let introLayer = AVMutableVideoCompositionLayerInstruction(assetTrack: introVideo)
        introLayer.setOpacityRamp(fromStartOpacity: 1, toEndOpacity: 0, timeRange: fadeRange)
        let storyLayer = AVMutableVideoCompositionLayerInstruction(assetTrack: storyVideo)
        storyLayer.setOpacityRamp(fromStartOpacity: 0, toEndOpacity: 1, timeRange: fadeRange)
        instruction.layerInstructions = [storyLayer, introLayer]

        let videoComposition = AVMutableVideoComposition()
        videoComposition.instructions = [instruction]
        videoComposition.frameDuration = StoryExportFrameRate.frameDuration
        videoComposition.renderSize = renderSize

        // Audio — la signature sonore s'estompe sur le fondu (pas de bascule
        // sonore brutale) ; le son PROPRE de la story démarre plein à `holdDuration`
        // (jamais atténué — c'est le contenu de l'auteur).
        let audioMix = AVMutableAudioMix()
        let jingleParams = AVMutableAudioMixInputParameters(track: jingleAudio)
        jingleParams.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0, timeRange: fadeRange)
        audioMix.inputParameters = [jingleParams]

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-story-\(UUID().uuidString).mp4")
        guard let session = AVAssetExportSession(asset: composition,
                                                 presetName: AVAssetExportPresetHighestQuality)
        else { throw IntroError.writerRejectedInput }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.videoComposition = videoComposition
        session.audioMix = audioMix

        // MÊME appel que `StoryExporter` : `export()` sans argument, qui lit
        // `outputURL`/`outputFileType` posés ci-dessus. Le `export(to:as:)`
        // d'iOS 18 est proscrit ici — combiné à ces deux propriétés il fait
        // tomber le process en SIGSEGV (constaté sur iOS 18.2), ce qui
        // emportait toute la suite de tests avec lui.
        await session.export()
        guard session.status == .completed else {
            throw IntroError.encodingFailed(session.error)
        }
        return outputURL
    }

    public enum IntroError: Error {
        case writerRejectedInput
        case pixelBufferCreationFailed
        case encodingFailed(Error?)
    }
}
