import SwiftUI
import AVFoundation
import MeeshySDK

struct CameraPreviewLayer: UIViewRepresentable {
    let session: AVCaptureSession
    /// La file qui configure la session (#17041) : la couche s'y rattache, et sa
    /// connexion s'y règle, dans l'ordre des configurations — jamais sur le fil
    /// principal, qui attendrait la fin de ce que la file exécute.
    let sessionQueue: any CameraSessionPerforming
    /// Le pont qui convertit un toucher en point du capteur (#9295) — `nil`
    /// pour un aperçu qui ne vise pas.
    var focusPoints: CameraPreviewFocusPoints? = nil
    /// Avec un effet, la vue Metal peint seule (#9349) : la couche système se
    /// détache — un passage par image, jamais deux. Elle reste montée, le pont
    /// des touchers y convertit toujours ses points.
    var mirrorsFrames = true
    /// Le rang de la dernière entrée vidéo posée (`CameraModel.inputEpoch`) :
    /// une bascule refait la connexion de la couche, qu'il faut alors régler.
    var connectionEpoch = 0

    /// **La couche d'aperçu EST la couche de la vue** (#4080).
    ///
    /// Elle était un SOUS-CALQUE dont la frame se posait dans un
    /// `Task { @MainActor }` depuis `updateUIView`. Deux défauts que la feuille
    /// ne montrait pas et que la scène a révélés sur appareil :
    ///
    /// - la frame arrivait une passe de layout APRÈS la vue, donc l'aperçu
    ///   naissait à `.zero` — un rectangle NOIR de la taille de la carte, qui
    ///   ressemble exactement à une caméra qui ne rend rien ;
    /// - un sous-calque ne suit pas son parent : toute reprise de disposition
    ///   (rotation, clavier, changement de ratio) le laissait à l'ancienne
    ///   taille jusqu'au prochain `updateUIView`.
    ///
    /// `layerClass` supprime les deux : le système redimensionne la couche avec
    /// la vue, à chaque passe, sans qu'aucun code ne s'en charge.
    final class PreviewHost: UIView {
        nonisolated deinit {}
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeCoordinator() -> CameraPreviewConnectionHolder {
        CameraPreviewConnectionHolder()
    }

    func makeUIView(context: Context) -> PreviewHost {
        let view = PreviewHost()
        view.backgroundColor = .black
        view.previewLayer.videoGravity = .resizeAspectFill
        context.coordinator.bind(view.previewLayer, to: session, on: sessionQueue)
        focusPoints?.attach(view)
        applyConnection(to: view, holder: context.coordinator)
        return view
    }

    func updateUIView(_ uiView: PreviewHost, context: Context) {
        // La SESSION peut changer (le meuble en remet une au ré-armement) ;
        // la frame, elle, n'a plus à être posée — `layerClass` s'en charge.
        context.coordinator.bind(uiView.previewLayer, to: session, on: sessionQueue)
        focusPoints?.attach(uiView)
        applyConnection(to: uiView, holder: context.coordinator)
    }

    /// Le viseur se ferme : la couche quitte la session sur la file, pas dans
    /// la libération de la vue sur le fil principal (#17041).
    static func dismantleUIView(_ uiView: PreviewHost, coordinator: CameraPreviewConnectionHolder) {
        coordinator.unbind(uiView.previewLayer)
    }

    /// **La connexion ne se touche que quand elle change** (#10308), et
    /// **jamais depuis le fil principal** (#17041) : une écriture sur une
    /// session en marche la reconfigure, et le fil qui écrit attend la fin de
    /// la reconfiguration — 9 s mesurées sur l'iPhone du porteur.
    private func applyConnection(to view: PreviewHost, holder: CameraPreviewConnectionHolder) {
        view.isHidden = !mirrorsFrames
        holder.applyConnection(to: view.previewLayer, enabled: mirrorsFrames, epoch: connectionEpoch)
    }
}

/// **Ce que la couche d'aperçu a déjà reçu** (#10308) : la connexion ne
/// s'écrit qu'à un changement de vœu ou d'entrée vidéo.
nonisolated struct CameraPreviewConnectionSync: Equatable, Sendable {
    private(set) var appliedEnabled: Bool?
    private(set) var appliedEpoch: Int?

    /// `true` ⇒ écrire `isEnabled` maintenant ; l'état appliqué est retenu.
    mutating func needsWrite(enabled: Bool, epoch: Int) -> Bool {
        guard appliedEnabled != enabled || appliedEpoch != epoch else { return false }
        appliedEnabled = enabled
        appliedEpoch = epoch
        return true
    }
}

/// Ce qui rattache la couche d'aperçu et règle sa connexion, dans l'ordre, sur
/// la file de la session de capture (#17041) — jamais sur le fil appelant.
nonisolated protocol CameraSessionPerforming: AnyObject, Sendable {
    func attach(_ layer: AVCaptureVideoPreviewLayer, to session: AVCaptureSession?)
    func enableConnection(of layer: AVCaptureVideoPreviewLayer, _ enabled: Bool)
}

nonisolated extension ComposerCaptureSessionQueue: CameraSessionPerforming {}

/// La mémoire de la couche d'aperçu — une référence, qu'écrire n'invalide pas.
/// Elle retient la session DEMANDÉE (la couche ne la porte qu'une fois la file
/// passée) et la file qui l'exécute.
final class CameraPreviewConnectionHolder {
    private(set) var sync = CameraPreviewConnectionSync()
    private weak var requestedSession: AVCaptureSession?
    private var sessionQueue: (any CameraSessionPerforming)?
    nonisolated deinit {}

    /// Une session neuve se rattache sur sa file ; la même ne relance rien.
    func bind(_ layer: AVCaptureVideoPreviewLayer, to session: AVCaptureSession,
              on queue: any CameraSessionPerforming) {
        guard requestedSession !== session || sessionQueue !== queue else { return }
        requestedSession = session
        sessionQueue = queue
        sync = CameraPreviewConnectionSync()
        queue.attach(layer, to: session)
    }

    /// La connexion s'écrit à un changement de vœu ou d'entrée, sur la file.
    func applyConnection(to layer: AVCaptureVideoPreviewLayer, enabled: Bool, epoch: Int) {
        guard let queue = sessionQueue, sync.needsWrite(enabled: enabled, epoch: epoch) else { return }
        queue.enableConnection(of: layer, enabled)
    }

    /// Le viseur se ferme : la couche se détache sur la file.
    func unbind(_ layer: AVCaptureVideoPreviewLayer) {
        guard let queue = sessionQueue else { return }
        requestedSession = nil
        sessionQueue = nil
        sync = CameraPreviewConnectionSync()
        queue.attach(layer, to: nil)
    }
}

/// **Le pont entre un toucher et le capteur** (#9295).
///
/// Le toucher se pose sur le chrome du viseur, l'image vit dans la couche
/// d'aperçu, et les deux ne partagent pas le même cadre : le plein écran pose
/// son aperçu sous la zone sûre, le chrome au-dessus ; la carte de la scène les
/// déplace ensemble. Le toucher et l'aperçu se mesurent donc dans le MÊME
/// repère — le repère global de SwiftUI, quelle que soit la présentation
/// (plein écran, feuille, carte) — et seule la couche rend le point au
/// capteur : elle connaît le remplissage (`.resizeAspectFill` rogne),
/// l'orientation et le miroir de l'objectif avant.
final class CameraPreviewFocusPoints {
    private weak var host: CameraPreviewLayer.PreviewHost?
    /// Le cadre de l'aperçu dans le repère global, posé par l'aperçu lui-même.
    var previewFrame: CGRect = .zero

    nonisolated deinit {}

    func attach(_ host: CameraPreviewLayer.PreviewHost) {
        self.host = host
    }

    /// Le toucher dans le repère de l'aperçu ; `nil` quand l'aperçu n'est pas
    /// à l'écran, ou que le toucher tombe hors de lui. La conversion vers le
    /// capteur suit l'image AFFICHÉE (`ComposerCaptureFocusGeometry`, #9464) —
    /// pas la couche système, cachée quand la vue Metal peint.
    func localPoint(fromGlobalPoint point: CGPoint) -> CGPoint? {
        guard let host, host.window != nil else { return nil }
        return Self.layerPoint(global: point, previewFrame: previewFrame)
    }

    /// Le toucher, ramené au repère de la couche — `nil` hors de l'aperçu.
    nonisolated static func layerPoint(global point: CGPoint, previewFrame: CGRect) -> CGPoint? {
        guard !previewFrame.isEmpty, previewFrame.contains(point) else { return nil }
        return CGPoint(x: point.x - previewFrame.minX, y: point.y - previewFrame.minY)
    }
}

/// **Ce que la couche d'aperçu doit montrer, connu de la bascule** (#10308).
///
/// Une bascule refait la connexion de la couche, qui renaît ACTIVÉE. Quand la
/// vue Metal peint, il fallait la désactiver après coup, depuis le fil
/// principal : une écriture sur une session en marche, qui la reconfigure une
/// seconde fois — l'aperçu gèle, noircit, juste après chaque retournement.
/// La bascule la règle désormais DANS sa transaction, d'après ce vœu.
nonisolated final class ComposerPreviewMirroring: @unchecked Sendable {
    private let wanted = Locked(true)

    var isWanted: Bool {
        get { wanted.read { $0 } }
        set { wanted.mutate { $0 = newValue } }
    }

    /// Dans la configuration ouverte par l'appelant : les connexions de couche
    /// d'aperçu prennent le vœu, les autres ne sont pas touchées.
    static func align(_ connections: [AVCaptureConnection], wanted: Bool) {
        for connexion in connections where connexion.videoPreviewLayer != nil && connexion.isEnabled != wanted {
            connexion.isEnabled = wanted
        }
    }
}
