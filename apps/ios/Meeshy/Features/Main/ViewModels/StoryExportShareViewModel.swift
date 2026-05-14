import Foundation
import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// MARK: - StoryExportShareViewModel
//
// Drives the author-only "Export to share" flow :
//   - Take a `StoryItem` (published story) + an export language code
//   - Reconstruct a `StorySlide` honouring the Prisme Linguistique
//   - Bake an MP4 via `StoryVideoExportService`
//   - Surface the file URL so the view can present `UIActivityViewController`
//   - Clean up the temp file after the share sheet completes or is cancelled
//
// The export is NEVER uploaded to the Meeshy backend — stories publish RAW
// (assets + JSON effects). The MP4 is for partage hors-Meeshy (Photos,
// Messages, WhatsApp, AirDrop, etc.).

/// Lifecycle phase observed by the share UI.
enum StoryExportSharePhase: Equatable, Sendable {
    case idle
    case exporting
    case ready          // MP4 baked, share sheet should be presented
    case sharing        // Share sheet is on screen
    case failed(String)
}

@MainActor
final class StoryExportShareViewModel: ObservableObject {
    @Published private(set) var phase: StoryExportSharePhase = .idle
    @Published private(set) var progress: Double = 0
    @Published private(set) var sharedURL: URL? = nil
    @Published var errorMessage: String? = nil

    /// Languages available for export. Computed from the story's
    /// `translations` and `originalLanguage` so the picker reflects what
    /// the backend actually carries.
    @Published private(set) var availableLanguages: [String] = []

    /// Language the next export will bake into. `nil` means "original
    /// source text" (the renderer falls back to the slide content when no
    /// translation matches).
    @Published var selectedLanguage: String? = nil

    private let exporter: StoryVideoExportServiceProviding
    private let logger = Logger(subsystem: "me.meeshy.app", category: "story-export-share")

    init(exporter: StoryVideoExportServiceProviding? = nil) {
        // `StoryVideoExportService.shared` is `@MainActor`-isolated so it
        // can't be a default arg expression; resolve inside the body.
        self.exporter = exporter ?? StoryVideoExportService.shared
    }

    // MARK: - Public API

    /// Inspects the story and seeds `availableLanguages` from the
    /// `translations` array. The caller picks one (or leaves nil for
    /// "original") before `startExport`.
    func prepare(story: StoryItem) {
        var langs: [String] = []
        if let translations = story.translations {
            for t in translations where !langs.contains(t.language) {
                langs.append(t.language)
            }
        }
        availableLanguages = langs
        if let preferred = AuthManager.shared.currentUser?.preferredContentLanguages.first,
           langs.contains(preferred) {
            selectedLanguage = preferred
        } else {
            selectedLanguage = nil
        }
    }

    /// Bakes an MP4 from `story` honouring `selectedLanguage` (Prisme
    /// Linguistique). The story is reconstructed into a `StorySlide` via
    /// `toRenderableSlide(preferredLanguages:)` so text overlays + content
    /// resolve through the same pipeline the live viewer uses.
    ///
    /// - Returns: nothing — observe `phase` / `sharedURL` to drive the UI.
    func startExport(story: StoryItem) async {
        guard phase != .exporting && phase != .sharing else { return }
        let langs: [String] = selectedLanguage.map { [$0] } ?? []
        let slide = story.toRenderableSlide(preferredLanguages: langs)

        guard slide.needsVideoExport else {
            errorMessage = String(
                localized: "story.export.share.nothingToExport",
                defaultValue: "Cette story n'a pas de contenu animé à exporter."
            )
            phase = .failed("nothingToExport")
            return
        }

        phase = .exporting
        progress = 0
        errorMessage = nil

        let url = await exporter.prepareExport(
            slide: slide,
            languages: langs,
            onProgress: { [weak self] fraction in
                self?.progress = fraction
            },
            onPhaseChange: nil
        )

        if let url {
            sharedURL = url
            phase = .ready
        } else {
            errorMessage = String(
                localized: "story.export.share.failed",
                defaultValue: "L'export de la story a échoué. Réessayez."
            )
            phase = .failed("exporterReturnedNil")
        }
    }

    /// Called by the view when the `UIActivityViewController` is actually
    /// on screen so internal state reflects "share in progress".
    func markSharingPresented() {
        if phase == .ready {
            phase = .sharing
        }
    }

    /// Called by the view when the share sheet finishes (success OR
    /// cancellation). Cleans up the temp MP4 in both cases — the user
    /// already has the file in Photos/Messages if they completed the share,
    /// and a cancelled share means we don't need the file at all.
    func finishSharing(success: Bool) {
        if let url = sharedURL {
            exporter.cleanupExport(at: url)
            logger.debug("Cleaned up export temp at \(url.path, privacy: .public)")
        }
        sharedURL = nil
        phase = success ? .idle : .idle
        progress = 0
    }

    /// Resets all state. Used when the sheet is dismissed before the bake
    /// completes (user cancels the export itself).
    func cancel() {
        if let url = sharedURL {
            exporter.cleanupExport(at: url)
        }
        sharedURL = nil
        phase = .idle
        progress = 0
        errorMessage = nil
    }
}
