import Combine
import Foundation
import UIKit

/// Ce qu'une caméra doit savoir faire pour passer d'un viseur au suivant.
@MainActor
protocol CameraWarmable: AnyObject, Sendable {
    /// Aucune prise en vol : rien ne peut arriver au viseur suivant.
    var isIdle: Bool { get }
    func stopIfRunning()
    func rewindForNewHolder()
}

/// **Un viseur tient l'objectif le temps de sa vie** (#16504). Libéré, le prêt rend
/// la caméra à son gardien, qu'elle ait été arrêtée ou non.
@MainActor
final class CameraWarmLease<Camera: CameraWarmable> {
    let camera: Camera
    private let keeper: CameraWarmKeeper<Camera>

    init(camera: Camera, keeper: CameraWarmKeeper<Camera>) {
        self.camera = camera
        self.keeper = keeper
    }

    nonisolated deinit {
        Task { @MainActor [keeper, camera] in keeper.handBack(camera) }
    }
}

/// **La réouverture du viseur ne reconfigure rien** (#16504) : le gardien garde
/// UNE caméra configurée et arrêtée, sans voyant, pour le viseur suivant. Une
/// caméra n'a qu'un viseur à la fois : le second ouvert en reçoit une neuve,
/// qui n'est gardée que si la place est libre. Une prise en vol ne passe jamais
/// au viseur suivant, et une alerte mémoire vide la place. Le retour à neuf se
/// fait à la remise, jamais à l'ouverture : la dernière prise ne reste pas en
/// mémoire, et le viseur suivant ne paie aucune transaction.
@MainActor
final class CameraWarmKeeper<Camera: CameraWarmable> {
    private let make: () -> Camera
    private var idle: Camera?
    private var memoryWarning: AnyCancellable?

    init(make: @escaping () -> Camera) {
        self.make = make
        memoryWarning = NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.dropWarmCamera() } }
    }

    nonisolated deinit {}

    var hasWarmCamera: Bool { idle != nil }

    func lease() -> CameraWarmLease<Camera> {
        guard let camera = idle else { return CameraWarmLease(camera: make(), keeper: self) }
        idle = nil
        return CameraWarmLease(camera: camera, keeper: self)
    }

    func handBack(_ camera: Camera) {
        camera.stopIfRunning()
        guard idle == nil, camera.isIdle else { return }
        camera.rewindForNewHolder()
        idle = camera
    }

    func dropWarmCamera() {
        idle = nil
    }
}

/// La session de capture d'un viseur, sur la caméra gardée au chaud.
@MainActor
enum ComposerWarmCapture {
    static func session(stage: ComposerSceneCameraStage = .off, mode: ComposerSceneCameraMode? = nil,
                        keeper: CameraWarmKeeper<CameraModel> = CameraModel.warmKeeper) -> ComposerCaptureSession {
        let pret = keeper.lease()
        let session = ComposerCaptureSession(stage: stage, mode: mode, camera: pret.camera)
        session.cameraLease = pret
        return session
    }
}
