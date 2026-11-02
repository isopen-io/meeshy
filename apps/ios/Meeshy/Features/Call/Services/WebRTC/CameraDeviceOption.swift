import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Camera device catalog (§7.1 — Continuity / external camera picker)

/// Framework-agnostic facing of a capture device. On iOS-app-on-Mac and iPad,
/// Continuity / USB cameras report no front/back position, so we surface them as
/// `.external` (named) rather than a meaningless front/back flip.
enum CameraFacing: String, Sendable, Equatable {
    case front, back, external, unspecified
}

/// A selectable capture camera, surfaced to the call UI's device picker.
struct CameraDeviceOption: Identifiable, Equatable, Sendable {
    let id: String          // AVCaptureDevice.uniqueID
    let displayName: String
    let facing: CameraFacing

    var isExternal: Bool { facing == .external }
}
