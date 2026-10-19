import CoreGraphics
import Foundation
import MeeshySDK

/// Pure ordering/labeling of the camera list — kept free of AVFoundation so it
/// is unit-testable from plain descriptors. The live enumeration
/// (`RTCCameraVideoCapturer.captureDevices()`) maps into `Descriptor`.
enum CameraCatalog {
    struct Descriptor: Equatable, Sendable {
        let uniqueID: String
        let localizedName: String
        let facing: CameraFacing
    }

    /// Build a stable, de-duplicated, human-ordered camera list. Ordering:
    /// front → back → external/Continuity → unspecified, then by name, so the
    /// most-expected camera leads the picker. Identically-named externals get a
    /// "(2)" suffix so two same-model cameras stay distinguishable.
    static func options(from descriptors: [Descriptor]) -> [CameraDeviceOption] {
        let order: [CameraFacing: Int] = [.front: 0, .back: 1, .external: 2, .unspecified: 3]
        var seen = Set<String>()
        let unique = descriptors.filter { seen.insert($0.uniqueID).inserted }
        let sorted = unique.sorted {
            let a = order[$0.facing] ?? 9
            let b = order[$1.facing] ?? 9
            if a != b { return a < b }
            let byName = $0.localizedName.localizedCaseInsensitiveCompare($1.localizedName)
            if byName != .orderedSame { return byName == .orderedAscending }
            // Deterministic tiebreaker (Swift's sort isn't stable) so two
            // identically-named cameras keep a fixed order in the picker.
            return $0.uniqueID < $1.uniqueID
        }
        var nameCounts: [String: Int] = [:]
        return sorted.map { d in
            let count = (nameCounts[d.localizedName] ?? 0) + 1
            nameCounts[d.localizedName] = count
            let display = count > 1 ? "\(d.localizedName) (\(count))" : d.localizedName
            return CameraDeviceOption(id: d.uniqueID, displayName: display, facing: d.facing)
        }
    }
}
