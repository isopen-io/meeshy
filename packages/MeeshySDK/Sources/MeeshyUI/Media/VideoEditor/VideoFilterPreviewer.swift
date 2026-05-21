import SwiftUI
import CoreImage
import UIKit
import MeeshySDK

/// Generates filter previews for the video editor's filter tile grid.
///
/// **Why a dedicated cache** — re-applying 7 `CIFilter`s on every body
/// re-evaluation of `FilterController` would burn CPU at 60 fps. The cache
/// runs the photo-effect pipeline ONCE per source frame (when the user
/// opens the Filter tool) and keeps the resulting `UIImage`s in memory.
///
/// **Source frame** — a single representative thumbnail picked from
/// `VideoEditorViewModel.filmstrip` (typically the middle one, since the
/// user is browsing the file rather than scrubbed to a specific spot).
/// Updating the source frame retriggers the whole pipeline, so the call
/// site should debounce / gate this (we populate once on appear).
///
/// **Memoisation** — keyed on a coarse `sourceVersion: Int` rather than
/// `UIImage` identity: a parent ViewModel that swaps the same frame for an
/// equal-content one (uploaded thumbnails, etc.) won't pointlessly refresh.
@MainActor
final class VideoFilterPreviewCache: ObservableObject {

    /// One filtered `UIImage` per preset. Read by `FilterController` tiles.
    @Published private(set) var previews: [VideoFilterPreset: UIImage] = [:]

    /// Increment to force `populate(from:)` to recompute even if the input
    /// `UIImage` is `===` to the previous one. Used when filmstrip changes.
    private var sourceVersion: Int = -1

    /// Shared CoreImage context — `useSoftwareRenderer: false` routes to
    /// Metal, which is essentially free for 8 tiny ≤120×120 invocations.
    private let context = CIContext(options: [
        CIContextOption.useSoftwareRenderer: false
    ])

    /// Builds (or refreshes) the preview dictionary from `source`. No-op if
    /// already populated for this `version` — pass a fresh `version` (e.g.
    /// `viewModel.filmstrip.count`) to trigger a recompute.
    func populate(from source: UIImage, version: Int) {
        guard version != sourceVersion else { return }
        sourceVersion = version

        guard let ciInput = CIImage(image: source) else {
            // Couldn't decode source — fall back to original for every tile so
            // the grid still renders something rather than a black hole.
            previews = Dictionary(uniqueKeysWithValues: VideoFilterPreset.allCases.map { ($0, source) })
            return
        }

        var result: [VideoFilterPreset: UIImage] = [.none: source]
        for preset in VideoFilterPreset.allCases where preset != .none {
            if let filtered = apply(preset, to: ciInput) {
                result[preset] = filtered
            } else {
                result[preset] = source
            }
        }
        previews = result
    }

    /// Returns a previewed UIImage if available, else `nil` (the tile will
    /// fall back to its SF icon placeholder).
    func preview(for preset: VideoFilterPreset) -> UIImage? {
        previews[preset]
    }

    private func apply(_ preset: VideoFilterPreset, to input: CIImage) -> UIImage? {
        guard let filterName = preset.ciFilterName,
              let filter = CIFilter(name: filterName) else { return nil }
        filter.setValue(input, forKey: kCIInputImageKey)
        guard let output = filter.outputImage,
              let cgImage = context.createCGImage(output, from: output.extent) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}
