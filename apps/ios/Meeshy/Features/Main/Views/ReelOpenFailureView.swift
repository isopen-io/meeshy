import SwiftUI
import MeeshyUI

/// **L'état d'échec du lecteur de réels (#6508).**
///
/// Ouvert depuis une notification, le lecteur n'avait aucun état d'échec : la
/// route retombait sur le détail du post, qui refaisait la requête. Il s'ouvre
/// désormais sur la cause, avec la phrase que partagent le détail et la cible
/// story (`ContentFetchFailure+Copy`). Réessayer n'est proposé que si réessayer
/// peut aboutir, et remplit le lecteur déjà ouvert (`ReelsPresenter`).
struct ReelOpenFailureView: View {
    let failure: ContentFetchFailure
    let onRetry: () async -> Void
    let onClose: () -> Void

    @State private var isRetrying = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 12) {
                Image(systemName: failure.symbolName)
                    .font(MeeshyFont.relative(40))
                    .foregroundStyle(.white.opacity(0.7))
                    .accessibilityHidden(true)
                Text(failure.title)
                    .font(MeeshyFont.relative(17, weight: .semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                Text(failure.message)
                    .font(MeeshyFont.relative(14))
                    .foregroundStyle(.white.opacity(0.75))
                    .multilineTextAlignment(.center)
                if failure.offersRetry {
                    retryButton
                }
                Button {
                    HapticFeedback.light()
                    onClose()
                } label: {
                    Text(String(localized: "feed.post.detail.unavailable.back", defaultValue: "Retour", bundle: .main))
                        .font(MeeshyFont.relative(15))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white.opacity(0.75))
            }
            .padding(.horizontal, 32)
            .accessibilityElement(children: .contain)
        }
    }

    private var retryButton: some View {
        Button {
            HapticFeedback.light()
            Task {
                isRetrying = true
                await onRetry()
                isRetrying = false
            }
        } label: {
            ZStack {
                Text(String(localized: "feed.post.detail.loadFailed.retry", defaultValue: "Réessayer", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .opacity(isRetrying ? 0 : 1)
                if isRetrying {
                    ProgressView()
                }
            }
        }
        .buttonStyle(.borderedProminent)
        .disabled(isRetrying)
        .padding(.top, 4)
    }
}
