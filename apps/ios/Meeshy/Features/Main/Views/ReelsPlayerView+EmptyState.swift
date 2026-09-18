import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ce que le pager rend quand il n'a aucun réel
//
// Extrait de `ReelsPlayerView.swift` (#7007) : le fichier hôte est hors budget
// (1 200 lignes dures), et la directive interdit d'y AJOUTER avant d'en avoir
// extrait. Trois états vivent ici, et c'est leur distinction qui est le
// correctif — l'ancien code n'en connaissait que deux, si bien qu'une PANNE
// réseau se rendait « Aucun réel pour le moment » : le lecteur croyait qu'il
// n'existait rien, et n'avait aucun chemin pour réessayer.

extension ReelsPlayerView {

    @ViewBuilder
    var emptyState: some View {
        if let failure = viewModel.loadFailure, viewModel.reels.isEmpty {
            loadFailureState(message: failure)
        } else if viewModel.hasLoadedOnce {
            noReelsState
        } else {
            // Instant App cold-start: a shimmering full-bleed placeholder (same
            // treatment as `ReelPoster`'s own loading state) instead of a bare
            // spinner — `hasLoadedOnce` only ever stays `false` for the instant
            // between `seed()`/`coldStart()` being called and their (cache-first,
            // synchronous) first `apply(reels:startId:)`.
            Color.black.shimmer()
                .ignoresSafeArea()
                .accessibilityHidden(true)
        }
    }

    private var noReelsState: some View {
        VStack(spacing: 14) {
            // Glyphe héros décoratif, masqué à VoiceOver (le texte porte le
            // sens). La taille SCALE : rien ne l'entoure qui déborderait, et un
            // fichier neuf n'a pas droit à une taille figée — la garde
            // `FixedFontSizeGuardTests` ne connaît d'exception que pour la
            // dette gelée du 264i, jamais pour un arrivant.
            Image(systemName: "play.rectangle.on.rectangle")
                .font(MeeshyFont.relative(44))
                .foregroundColor(.white.opacity(0.7))
                .accessibilityHidden(true)
            Text(String(localized: "reels.empty", defaultValue: "Aucun réel pour le moment", bundle: .main))
                .font(.headline)
                .foregroundColor(.white)
        }
        .accessibilityElement(children: .combine)
    }

    /// Une panne DIT qu'elle en est une, et propose d'en sortir. Le fond du
    /// pager est noir plein écran : la palette est donc celle du viewer (blanc
    /// sur noir), pas celle du thème clair/sombre de l'app.
    private func loadFailureState(message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                .font(MeeshyFont.relative(44))
                .foregroundColor(.white.opacity(0.7))
                .accessibilityHidden(true)
            Text(message)
                .font(.headline)
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button {
                HapticFeedback.light()
                Task { await viewModel.retryLoad() }
            } label: {
                Text(String(localized: "common.retry"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.black)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Color.white))
            }
            // Cible 44 pt (HIG) : le libellé seul ne les atteint pas en
            // Dynamic Type minimal.
            .frame(minHeight: 44)
        }
        .accessibilityElement(children: .contain)
    }
}
