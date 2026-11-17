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

// MARK: - U1.11 — le rendu d'une personne survit au passage grille ↔ une

/// Le rendu d'une personne, prêté par le `CallVideoRendererPool` : sa vue Metal, sa piste et sa porte.
final class CallPooledVideoRenderer {
    nonisolated deinit {}

    static let pool = CallVideoRendererPool<CallPooledVideoRenderer>(view: { $0.view })

    let view = RTCMTLVideoView(frame: .zero)
    private(set) var track: RTCVideoTrack?
    private var gate: CallVideoRendererGate?

    init() {
        view.clipsToBounds = true
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    }

    /// La piste passe par la porte (#17039), jamais par la vue : même chemin que `WebRTCVideoView`.
    func show(_ newTrack: RTCVideoTrack?) {
        guard newTrack !== track else { return }
        release()
        guard let newTrack else { return }
        gate = CallVideoRendererGate.attach(newTrack, to: view)
        track = newTrack
    }

    func release() {
        gate?.detach()
        gate = nil
        track = nil
    }
}

/// U1.11 — la vignette d'un appel de groupe garde SON rendu quand elle passe de la grille à la une
/// et retour : grille et une sont deux branches, leurs hôtes se recréent, mais le rendu (vue Metal
/// déjà alimentée) passe de l'un à l'autre au lieu de renaître noir. Le dernier hôte qui part le rend
/// au tour suivant de la boucle, s'il n'a pas été repris entre-temps.
struct PooledWebRTCVideoView: UIViewRepresentable {
    let key: String
    let track: RTCVideoTrack?
    var mirror: Bool = false
    var contentMode: UIView.ContentMode = .scaleAspectFill

    func makeUIView(context: Context) -> UIView {
        let host = UIView(frame: .zero)
        host.clipsToBounds = true
        adopt(CallPooledVideoRenderer.pool.lend(key) { CallPooledVideoRenderer() }, into: host)
        return host
    }

    func updateUIView(_ host: UIView, context: Context) {
        let renderer = CallPooledVideoRenderer.pool.lend(key) { CallPooledVideoRenderer() }
        if renderer.view.superview == nil { adopt(renderer, into: host) }
        host.transform = mirror ? CGAffineTransform(scaleX: -1, y: 1) : .identity
        guard renderer.view.superview === host else { return }
        renderer.view.videoContentMode = contentMode
        renderer.show(track)
    }

    static func dismantleUIView(_ host: UIView, coordinator: Coordinator) {
        coordinator.leave(host)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(key: key)
    }

    private func adopt(_ renderer: CallPooledVideoRenderer, into host: UIView) {
        renderer.view.frame = host.bounds
        host.addSubview(renderer.view)
    }

    final class Coordinator {
        nonisolated deinit {}

        let key: String

        init(key: String) {
            self.key = key
        }

        func leave(_ host: UIView) {
            let pool = CallPooledVideoRenderer.pool
            let key = key
            guard pool.isOrphaned(key, leaving: host) else { return }
            host.subviews.forEach { $0.removeFromSuperview() }
            Task { @MainActor in
                guard pool.isOrphaned(key, leaving: host) else { return }
                pool.evict(key)?.release()
            }
        }
    }
}

// MARK: - Track-agnostic wrapper (accepts Any from CallManager)

struct CallVideoView: View {
    let track: Any?
    var mirror: Bool = false
    var contentMode: UIView.ContentMode = .scaleAspectFill
    /// U1.11 — la personne dont le rendu se garde d'une disposition à l'autre ; `nil` : un rendu à soi.
    var rendererKey: String? = nil

    var body: some View {
        if let rtcTrack = track as? RTCVideoTrack, let rendererKey {
            PooledWebRTCVideoView(key: rendererKey, track: rtcTrack, mirror: mirror, contentMode: contentMode)
                .accessibilityLabel(String(localized: "call.video.active", defaultValue: "Vidéo en direct", bundle: .main))
        } else if let rtcTrack = track as? RTCVideoTrack {
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
    var rendererKey: String? = nil

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

// MARK: - U1.11 — le prêt des rendus, sans WebRTC

/// Un rendu par personne, prêté à l'hôte qui le montre. Un hôte qui part ne le libère que s'il est
/// le dernier à le tenir : la une qui l'a déjà repris le garde.
final class CallVideoRendererPool<Renderer: AnyObject> {
    nonisolated deinit {}

    private var renderers: [String: Renderer] = [:]
    private let view: (Renderer) -> UIView

    init(view: @escaping (Renderer) -> UIView) {
        self.view = view
    }

    func lend(_ key: String, make: () -> Renderer) -> Renderer {
        if let kept = renderers[key] { return kept }
        let made = make()
        renderers[key] = made
        return made
    }

    func isOrphaned(_ key: String, leaving host: UIView) -> Bool {
        guard let renderer = renderers[key] else { return false }
        let holder = view(renderer).superview
        return holder == nil || holder === host
    }

    @discardableResult
    func evict(_ key: String) -> Renderer? {
        renderers.removeValue(forKey: key)
    }
}

extension CallVideoRendererPool where Renderer == UIView {
    convenience init() {
        self.init(view: { $0 })
    }
}
