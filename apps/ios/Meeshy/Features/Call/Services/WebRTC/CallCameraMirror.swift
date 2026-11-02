//
//  CallCameraMirror.swift
//  Meeshy
//
//  #8696 — la symétrie de l'image caméra pendant un appel, décidée en UN
//  endroit. RTCCameraVideoCapturer envoie les trames telles que le capteur
//  les voit : le flux envoyé n'est donc jamais retourné, et seul l'aperçu de
//  sa propre caméra AVANT l'est (on se voit comme dans un miroir). Une capture
//  montre ce que l'autre voit : jamais retournée.
//

import Combine
import Foundation

enum CallVideoRole: Sendable {
    case localPreview
    case sent
    case capture
}

enum CallCameraMirror {
    static func isMirrored(facing: CameraFacing, role: CallVideoRole) -> Bool {
        switch (facing, role) {
        case (.front, .localPreview): return true
        default: return false
        }
    }

    /// La caméra dont viennent les trames affichées : celle que la capture a
    /// CONFIRMÉE, sinon l'intention. Pendant une bascule, l'ancienne caméra
    /// livre encore ses trames (puis sa dernière reste à l'écran) : suivre
    /// l'intention retournerait cette image un instant.
    static func displayedFacing(live: CameraFacing?, intendedFront: Bool) -> CameraFacing {
        live ?? (intendedFront ? .front : .back)
    }
}

@MainActor
protocol CallLiveCameraProviding: AnyObject {
    var facing: CameraFacing? { get }
    func confirm(_ facing: CameraFacing)
    func reset()
}

/// La caméra qui livre réellement les trames, confirmée après chaque
/// `startCapture` réussi (`P2PWebRTCClient.attachLiveCamera`). Une seule
/// capture caméra d'appel vit dans le process, comme `CameraZoomController`.
@MainActor
final class CallLiveCamera: ObservableObject, CallLiveCameraProviding {
    static let shared = CallLiveCamera()

    @Published private(set) var facing: CameraFacing?

    // Sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor, la deinit synthétisée
    // est isolée et double-libère sur iOS 26.1.
    nonisolated deinit {}

    init() {}

    func confirm(_ facing: CameraFacing) {
        guard self.facing != facing else { return }
        self.facing = facing
    }

    func reset() {
        guard facing != nil else { return }
        facing = nil
    }
}
