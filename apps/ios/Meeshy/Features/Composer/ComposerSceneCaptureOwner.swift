import Combine
import SwiftUI
import UIKit

/// **Ce que le meuble lit de la capture, et rien d'autre** (#17469) : l'étape, la retouche,
/// les segments en attente et la tenue. Le zoom au glissé, le chrono, le cadenas et le
/// rangement changent à chaque image ; le viseur les lit seul.
nonisolated struct ComposerSceneCaptureFacts: Equatable, Sendable {
    var stage: ComposerSceneCameraStage
    var editing: Bool
    var pendingSegments: Int
    var holding: Bool
}

/// **Le composer détient la machine de capture sans l'observer** (#17469). La machine relaie
/// chaque publication de la caméra : déclarée en `@StateObject` par le meuble, elle
/// re-rendait le composer entier à chaque image d'un zoom. Le meuble observe ce gardien,
/// qui ne publie qu'un changement de `facts`.
///
/// Le gardien rend aussi la caméra quand le composer part (`release()`, posé par
/// `ComposerCaptureTeardown`) : la remise de la prise retient le composer, qui retient la
/// machine, et sans ce geste l'objectif restait allumé derrière un composer fermé.
@MainActor
final class ComposerSceneCaptureOwner: ObservableObject {
    let session: ComposerCaptureSession
    @Published private(set) var facts: ComposerSceneCaptureFacts
    private var relay: AnyCancellable?

    init(session: ComposerCaptureSession = ComposerWarmCapture.session()) {
        self.session = session
        facts = ComposerSceneCaptureFacts(stage: session.stage, editing: session.phase.isEditing,
                                          pendingSegments: session.segments.count,
                                          holding: session.holdStartedAt != nil)
        relay = Publishers.CombineLatest4(session.$stage,
                                          session.$phase.map(\.isEditing),
                                          session.$segments.map(\.count),
                                          session.$holdStartedAt.map { $0 != nil })
            .map(ComposerSceneCaptureFacts.init)
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self] faits in self?.facts = faits }
    }

    nonisolated deinit {}

    /// Le composer part : le viseur armé se désarme, une caméra seulement lancée s'arrête,
    /// et la remise qui retenait le composer tombe.
    func release() {
        session.onDeliver = nil
        guard session.stage == .off else { return session.disarm() }
        session.camera.stopIfRunning()
    }
}

/// **Le signal du départ du composer** (#17469). Une `fullScreenCover` posée par-dessus fait
/// disparaître le meuble sans le démonter, et le viseur doit survivre aux feuilles (#17432) :
/// `onDisappear` couperait la caméra à tort. Seul le DÉMONTAGE de la vue rend la caméra,
/// une fois, et la libération du coordinateur le rattrape s'il n'a pas eu lieu.
struct ComposerCaptureTeardown: UIViewRepresentable {
    let release: @MainActor () -> Void

    final class Coordinator {
        var release: @MainActor () -> Void
        private var released = false

        init(release: @escaping @MainActor () -> Void) {
            self.release = release
        }

        @MainActor func fire() {
            guard !released else { return }
            released = true
            release()
        }

        nonisolated deinit {
            Task { @MainActor [release, released] in
                guard !released else { return }
                release()
            }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(release: release) }

    func makeUIView(context: Context) -> UIView {
        let vue = UIView()
        vue.isHidden = true
        vue.isUserInteractionEnabled = false
        return vue
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.release = release
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.fire()
    }
}
