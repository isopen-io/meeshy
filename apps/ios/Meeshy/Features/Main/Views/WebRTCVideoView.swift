import SwiftUI
import os

private let videoLogger = MeeshyLog.logger(.calls)

#if canImport(WebRTC)
import WebRTC
import MeeshySDK

// MARK: - WebRTC Video View (SwiftUI wrapper for RTCMTLVideoView)

struct WebRTCVideoView: UIViewRepresentable {
    let track: RTCVideoTrack?
    var mirror: Bool = false
    var contentMode: UIView.ContentMode = .scaleAspectFill

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView(frame: .zero)
        view.videoContentMode = contentMode
        view.clipsToBounds = true
        if let track {
            context.coordinator.attach(track, to: view)
        }
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        uiView.videoContentMode = contentMode

        if let newTrack = track, newTrack !== context.coordinator.currentTrack {
            context.coordinator.attach(newTrack, to: uiView)
        } else if track == nil {
            context.coordinator.detach()
        }

        if mirror {
            uiView.transform = CGAffineTransform(scaleX: -1, y: 1)
        } else {
            uiView.transform = .identity
        }
    }

    static func dismantleUIView(_ uiView: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.detach()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    class Coordinator {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        private(set) var currentTrack: RTCVideoTrack?
        private var gate: CallVideoRendererGate?

        /// #17039 — la piste ne voit jamais la vue, seulement une porte : son
        /// ajout et son retrait attendent le fil de travail de libwebrtc et
        /// partent sur la file du moteur (`CallVideoRendererGate`).
        func attach(_ track: RTCVideoTrack, to view: RTCMTLVideoView) {
            detach()
            gate = CallVideoRendererGate.attach(track, to: view)
            currentTrack = track
        }

        /// Ferme la porte sur place (plus aucune image vers la vue), puis la
        /// retire de la piste hors du fil principal.
        func detach() {
            gate?.detach()
            gate = nil
            currentTrack = nil
        }
    }
}

// MARK: - Track-agnostic wrapper (accepts Any from CallManager)

struct CallVideoView: View {
    let track: Any?
    var mirror: Bool = false
    var contentMode: UIView.ContentMode = .scaleAspectFill

    var body: some View {
        if let rtcTrack = track as? RTCVideoTrack {
            WebRTCVideoView(track: rtcTrack, mirror: mirror, contentMode: contentMode)
                .accessibilityLabel(String(localized: "call.video.active", defaultValue: "Vidéo en direct", bundle: .main))
        } else {
            if let unexpected = track {
                let _ = videoLogger.error("CallVideoView: unexpected track type \(type(of: unexpected)) — expected RTCVideoTrack")
            }
            Color.black
                .overlay(
                    Image(systemName: "video.slash")
                        .font(.system(size: 32))
                        .foregroundStyle(Color.white.opacity(0.3))
                )
                .accessibilityLabel(String(localized: "call.video.unavailable", defaultValue: "Vidéo non disponible", bundle: .main))
        }
    }
}

#else

// MARK: - Fallback (no WebRTC)

struct CallVideoView: View {
    let track: Any?
    var mirror: Bool = false
    var contentMode: UIView.ContentMode = .scaleAspectFill

    var body: some View {
        Color.black
            .overlay(
                Text(String(localized: "call.video.unavailable", defaultValue: "Vidéo non disponible", bundle: .main))
                    .foregroundStyle(Color.white.opacity(0.4))
                    .font(.footnote.weight(.medium))
            )
    }
}

#endif
