import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - Canvas Element Protocol

enum CanvasElementType {
    case text, image, video, audio
}

// Protocol is @MainActor to match the module's defaultIsolation(MainActor).
// Identifiable is intentionally NOT inherited here — inheriting a non-isolated
// stdlib protocol would cause the conformance to "cross" actor boundaries.
// AnyCanvasElement conforms to Identifiable directly as a @MainActor type.
@MainActor
protocol CanvasElement {
    var id: String { get }
    var elementType: CanvasElementType { get }
    var zIndex: Int { get set }
}

// Explicit @MainActor matches the protocol's isolation and the module default.
// Separate Identifiable conformance avoids the stdlib witness-mismatch issue.
@MainActor
struct AnyCanvasElement: CanvasElement, Identifiable {
    var id: String
    var elementType: CanvasElementType
    var zIndex: Int
}
