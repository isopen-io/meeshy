import SwiftUI

/// Ce que la timeline a besoin d'ANNONCER, sans rien savoir de la façon dont
/// c'est affiché.
///
/// `TimelineViewModel` émettait déjà deux signaux — `durationDidAutoAdjust`
/// (la durée de slide vient d'être recalculée) et
/// `showOfflineQueuedConfirmation` (la publication est partie en file
/// d'attente) — mais aucune vue ne les lisait. L'utilisateur voyait la règle
/// graduée changer de longueur sans explication, et croyait sa story publiée
/// alors qu'elle attendait le réseau.
nonisolated enum TimelineBanner: Equatable {
    case durationAdjusted(from: Float, to: Float)
    case queuedOffline

    /// - Note: le hors-ligne prime quand les deux tombent sur la même frame
    ///   (publier juste après un trim). Il annonce un état DURABLE qu'aucune
    ///   autre surface ne révèle, là où l'ajustement de durée ne fait que
    ///   commenter un changement déjà visible à l'écran.
    static func resolve(durationDidAutoAdjust: (from: Float, to: Float)?,
                        isQueuedOffline: Bool) -> TimelineBanner? {
        if isQueuedOffline { return .queuedOffline }
        if let adjustment = durationDidAutoAdjust {
            return .durationAdjusted(from: adjustment.from, to: adjustment.to)
        }
        return nil
    }

    /// `@MainActor` : `Bundle.module`, généré par SwiftPM, est lui-même isolé
    /// (`defaultIsolation(MainActor.self)`, SE-0466). Seul le TEXTE l'est —
    /// `resolve` et la conformance `Equatable` restent nonisolated pour que la
    /// décision reste testable et appelable de partout.
    @MainActor var text: String {
        switch self {
        case let .durationAdjusted(from, to):
            let format = String(localized: "story.timeline.toast.durationAdjusted",
                                defaultValue: "Durée recalculée : %1$@ → %2$@",
                                bundle: .module)
            return String(format: format,
                          TrackBarView<Color>.formatTrackDuration(from),
                          TrackBarView<Color>.formatTrackDuration(to))
        case .queuedOffline:
            return String(localized: "story.timeline.toast.queuedOffline",
                          defaultValue: "Story en attente — elle partira au retour du réseau",
                          bundle: .module)
        }
    }

    var systemImage: String {
        switch self {
        case .durationAdjusted: return "ruler"
        case .queuedOffline:    return "clock.arrow.circlepath"
        }
    }

    /// Le bandeau hors-ligne porte une information qu'on ne peut relire nulle
    /// part : il reste plus longtemps que le commentaire de durée, dont
    /// l'effet est déjà sous les yeux de l'utilisateur.
    var displayDuration: TimeInterval {
        switch self {
        case .durationAdjusted: return 2.5
        case .queuedOffline:    return 4
        }
    }
}

/// Bandeau éphémère posé au-dessus de la timeline. Se retire tout seul après
/// `banner.displayDuration`, puis acquitte le signal auprès du view model pour
/// qu'il ne re-déclenche pas au prochain rendu.
struct TimelineBannerOverlay: View {

    @ObservedObject var viewModel: TimelineViewModel

    private var banner: TimelineBanner? {
        TimelineBanner.resolve(durationDidAutoAdjust: viewModel.durationDidAutoAdjust,
                               isQueuedOffline: viewModel.showOfflineQueuedConfirmation)
    }

    var body: some View {
        // `banner` est optionnel : le `if let` suffit à faire disparaître la
        // vue dès que les deux signaux sont acquittés.
        if let banner {
            HStack(spacing: 8) {
                Image(systemName: banner.systemImage)
                    .imageScale(.small)
                Text(banner.text)
                    .font(.footnote.weight(.medium))
                    .lineLimit(2)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(.white.opacity(0.12)))
            .shadow(color: .black.opacity(0.25), radius: 10, y: 4)
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityAddTraits(.isStaticText)
            .accessibilityLabel(banner.text)
            // `task(id:)` redémarre le compte à rebours si un SECOND bandeau
            // remplace le premier avant son expiration — sans ça le nouveau
            // message héritait du reliquat du précédent.
            .task(id: banner) {
                try? await Task.sleep(nanoseconds: UInt64(banner.displayDuration * 1_000_000_000))
                guard !Task.isCancelled else { return }
                acknowledge(banner)
            }
        }
    }

    private func acknowledge(_ banner: TimelineBanner) {
        switch banner {
        case .durationAdjusted:
            viewModel.durationDidAutoAdjust = nil
        case .queuedOffline:
            viewModel.dismissOfflineQueuedConfirmation()
        }
    }
}
