import SwiftUI
import os

private let videoLogger = Logger(subsystem: "me.meeshy.app", category: "calls")

#if canImport(WebRTC)
import WebRTC

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
            track.add(view)
            context.coordinator.currentTrack = track
            context.coordinator.renderer = view
        }
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        uiView.videoContentMode = contentMode

        if let newTrack = track, newTrack !== context.coordinator.currentTrack {
            context.coordinator.currentTrack?.remove(uiView)
            newTrack.add(uiView)
            context.coordinator.currentTrack = newTrack
        } else if track == nil, let oldTrack = context.coordinator.currentTrack {
            oldTrack.remove(uiView)
            context.coordinator.currentTrack = nil
        }

        if mirror {
            uiView.transform = CGAffineTransform(scaleX: -1, y: 1)
        } else {
            uiView.transform = .identity
        }
    }

    static func dismantleUIView(_ uiView: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.currentTrack?.remove(uiView)
        coordinator.currentTrack = nil
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    class Coordinator {
        var currentTrack: RTCVideoTrack?
        var renderer: RTCMTLVideoView?
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
        } else {
            if let unexpected = track {
                let _ = videoLogger.error("CallVideoView: unexpected track type \(type(of: unexpected)) — expected RTCVideoTrack")
            }
            Color.black
                .overlay(
                    Image(systemName: "video.slash")
                        .font(MeeshyFont.relative(32))
                        .foregroundColor(.white.opacity(0.3))
                )
                .accessibilityLabel(String(localized: "call.video.unavailable", defaultValue: "Video non disponible", bundle: .main))
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
                Text(String(localized: "call.video.unavailable", defaultValue: "Video non disponible", bundle: .main))
                    .foregroundColor(.white.opacity(0.4))
                    .font(.footnote.weight(.medium))
            )
    }
}

#endif
