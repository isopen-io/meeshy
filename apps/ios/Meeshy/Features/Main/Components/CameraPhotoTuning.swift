import AVFoundation
import CoreMedia
import MeeshySDK

/// Une définition en pixels — `CMVideoDimensions` n'est pas `Equatable`.
nonisolated struct CameraPhotoDimensions: Equatable, Sendable {
    let width: Int32
    let height: Int32

    init(width: Int32, height: Int32) {
        self.width = width
        self.height = height
    }

    init(_ dimensions: CMVideoDimensions) {
        self.init(width: dimensions.width, height: dimensions.height)
    }

    var video: CMVideoDimensions { CMVideoDimensions(width: width, height: height) }
    var longestSide: CGFloat { CGFloat(max(width, height)) }
    var area: Int64 { Int64(width) * Int64(height) }
}

/// Ce que la sortie photo de l'objectif en place sait faire — lu sur la file de
/// la session, une fois l'entrée installée : avant, rien n'est « pris en charge ».
nonisolated struct CameraPhotoCapabilities: Equatable, Sendable {
    var supportsZeroShutterLag = false
    var supportsResponsiveCapture = false
    var supportsFastCapturePrioritization = false
    /// Les dimensions de la trame vidéo du format actif : la photo garde ses proportions.
    var formatDimensions = CameraPhotoDimensions(width: 0, height: 0)
    var supportedMaxPhotoDimensions: [CameraPhotoDimensions] = []
}

/// Ce que la sortie photo reçoit, une fois par objectif installé (#16482).
nonisolated struct CameraPhotoTuningPlan: Equatable, Sendable {
    let zeroShutterLag: Bool
    let responsiveCapture: Bool
    let fastCapturePrioritization: Bool
    let qualityPrioritization: AVCapturePhotoOutput.QualityPrioritization
    /// `nil` ⇒ l'objectif n'annonce aucune dimension : on ne touche à rien.
    let maxPhotoDimensions: CameraPhotoDimensions?
}

/// **La prise part vite, et la photo garde ce que l'aperçu montrait** (#16482).
///
/// L'état de l'art d'AVFoundation (WWDC23 « Create a more responsive camera
/// experience ») : l'obturateur sans latence (`isZeroShutterLagEnabled`), la
/// prise qui chevauche le traitement de la précédente (`isResponsiveCaptureEnabled`)
/// et la priorité à la vitesse sur les rafales (`isFastCapturePrioritizationEnabled`),
/// chacun seulement si l'objectif le sert ; une qualité ÉQUILIBRÉE, jamais
/// `.quality`, dont la fusion multi-images retient l'image des centaines de ms.
///
/// La définition : la plus petite que le format sert aux MÊMES proportions que
/// son aperçu, et qui couvre ce que le traitement unique garde
/// (`PhotoCaptureSettings.capture`) — jamais une photo 4:3 sous un aperçu 16:9,
/// ni douze mégapixels qu'on réduira aussitôt.
nonisolated enum CameraPhotoTuning {

    static let qualityPrioritization: AVCapturePhotoOutput.QualityPrioritization = .balanced

    static func plan(for capabilities: CameraPhotoCapabilities,
                     coveringLongestSide target: CGFloat = PhotoCaptureSettings.capture.maxPixelDimension)
        -> CameraPhotoTuningPlan {
        let zsl = capabilities.supportsZeroShutterLag
        let responsive = zsl && capabilities.supportsResponsiveCapture
        return CameraPhotoTuningPlan(
            zeroShutterLag: zsl,
            responsiveCapture: responsive,
            fastCapturePrioritization: responsive && capabilities.supportsFastCapturePrioritization,
            qualityPrioritization: qualityPrioritization,
            maxPhotoDimensions: dimensions(capabilities, coveringLongestSide: target))
    }

    /// Les réglages d'UNE prise : le flash seulement s'il est servi, la qualité
    /// équilibrée et la définition que la sortie a RETENUE — lue sur elle, jamais
    /// sur un plan qu'une bascule aurait périmé : une prise qui demande plus que
    /// la sortie lève une exception Objective-C.
    static func settings(flash: AVCaptureDevice.FlashMode,
                         supportedFlashModes: [AVCaptureDevice.FlashMode],
                         outputMaxPhotoDimensions: CameraPhotoDimensions) -> AVCapturePhotoSettings {
        let reglages = AVCapturePhotoSettings()
        reglages.flashMode = supportedFlashModes.contains(flash) ? flash : .off
        reglages.photoQualityPrioritization = qualityPrioritization
        if outputMaxPhotoDimensions.area > 0 { reglages.maxPhotoDimensions = outputMaxPhotoDimensions.video }
        return reglages
    }

    /// **Sur la file de la session, après le commit qui a installé `device`** :
    /// ce n'est qu'alors que la sortie dit ce qu'elle sert. Une seconde
    /// transaction n'est ouverte que si le plan change quelque chose — la
    /// bascule vers un objectif qui sert la même chose ne reconfigure rien.
    /// Les réglages préparés font naître les ressources de la première prise
    /// avant le premier toucher.
    static func tune(_ output: AVCapturePhotoOutput, in session: AVCaptureSession, for device: AVCaptureDevice) {
        let cible = Self.plan(for: output.photoCapabilities(of: device))
        if !output.hasAdopted(cible) {
            session.beginConfiguration()
            output.adopt(cible)
            session.commitConfiguration()
        }
        let prepares = settings(flash: .off, supportedFlashModes: output.supportedFlashModes,
                                outputMaxPhotoDimensions: CameraPhotoDimensions(output.maxPhotoDimensions))
        output.setPreparedPhotoSettingsArray([prepares], completionHandler: nil)
    }

    private static func dimensions(_ capabilities: CameraPhotoCapabilities,
                                   coveringLongestSide target: CGFloat) -> CameraPhotoDimensions? {
        let format = capabilities.formatDimensions
        let memes = capabilities.supportedMaxPhotoDimensions.filter { sameAspect($0, format) }
        let candidats = (memes.isEmpty ? capabilities.supportedMaxPhotoDimensions : memes)
            .sorted { $0.area < $1.area }
        return candidats.first { $0.longestSide >= target } ?? candidats.last
    }

    private static func sameAspect(_ a: CameraPhotoDimensions, _ b: CameraPhotoDimensions) -> Bool {
        guard a.height > 0, b.height > 0 else { return false }
        return abs(Double(a.width) / Double(a.height) - Double(b.width) / Double(b.height)) < 0.02
    }
}

// MARK: - La sortie réelle

nonisolated extension AVCapturePhotoOutput {

    /// Ce que la sortie sert avec l'objectif `device` — sur la file de la session.
    func photoCapabilities(of device: AVCaptureDevice) -> CameraPhotoCapabilities {
        var capacites = CameraPhotoCapabilities(
            formatDimensions: CameraPhotoDimensions(
                CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)),
            supportedMaxPhotoDimensions: device.activeFormat.supportedMaxPhotoDimensions.map(CameraPhotoDimensions.init))
        if #available(iOS 17.0, *) {
            capacites.supportsZeroShutterLag = isZeroShutterLagSupported
            capacites.supportsResponsiveCapture = isResponsiveCaptureSupported
            capacites.supportsFastCapturePrioritization = isFastCapturePrioritizationSupported
        }
        return capacites
    }

    func hasAdopted(_ plan: CameraPhotoTuningPlan) -> Bool {
        guard plan.maxPhotoDimensions.map({ $0 == CameraPhotoDimensions(maxPhotoDimensions) }) ?? true,
              maxPhotoQualityPrioritization == plan.qualityPrioritization else { return false }
        guard #available(iOS 17.0, *) else { return true }
        return (!isZeroShutterLagSupported || isZeroShutterLagEnabled == plan.zeroShutterLag)
            && (!isResponsiveCaptureSupported || isResponsiveCaptureEnabled == plan.responsiveCapture)
            && (!isFastCapturePrioritizationSupported || isFastCapturePrioritizationEnabled == plan.fastCapturePrioritization)
    }

    /// Le plan, posé dans la configuration ouverte par l'appelant.
    func adopt(_ plan: CameraPhotoTuningPlan) {
        if let dimensions = plan.maxPhotoDimensions { maxPhotoDimensions = dimensions.video }
        maxPhotoQualityPrioritization = plan.qualityPrioritization
        guard #available(iOS 17.0, *) else { return }
        if isZeroShutterLagSupported { isZeroShutterLagEnabled = plan.zeroShutterLag }
        if isResponsiveCaptureSupported { isResponsiveCaptureEnabled = plan.responsiveCapture }
        if isFastCapturePrioritizationSupported { isFastCapturePrioritizationEnabled = plan.fastCapturePrioritization }
    }
}
