import SwiftUI
import MeeshySDK
import MeeshyUI

/// #8072 — branche la note d'après-appel sur la pile d'appel. Monté par
/// `CallPresentationLayer` (seul conteneur partagé par les racines iPhone et
/// iPad) ; la carte n'apparaît qu'une fois l'appel rendu au repos, jamais
/// par-dessus l'écran de fin ni pendant un nouvel appel.
struct CallFeedbackLayer: ViewModifier {
    let callManager: CallManager?

    @StateObject private var viewModel = CallFeedbackViewModel()

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let prompt = viewModel.prompt, isAtRest {
                    CallFeedbackCard(viewModel: viewModel, prompt: prompt)
                        .padding(.bottom, 88)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .adaptiveOnChange(of: callManager?.callState) { oldValue, newValue in
                observe(from: oldValue, to: newValue)
            }
            .adaptiveOnChange(of: callManager?.isLinkQualityDegraded ?? false) { _, degraded in
                if degraded { viewModel.noteTrouble() }
            }
    }

    private var isAtRest: Bool {
        guard let callManager else { return true }
        return callManager.callState == .idle
    }

    private func observe(from oldValue: CallState?, to newValue: CallState?) {
        guard let newValue, let callManager else { return }
        switch newValue {
        case .reconnecting:
            viewModel.noteTrouble()
        case .ended(let reason):
            viewModel.callEnded(
                callId: callManager.currentCallId,
                peerName: callManager.remoteUsername,
                duration: callManager.callDuration,
                reason: reason,
                isVideo: callManager.isVideoEnabled
            )
        case .idle:
            return
        default:
            guard !(oldValue?.isActive ?? false) else { return }
            viewModel.callStarted()
        }
    }
}
