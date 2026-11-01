import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mes cercles » (#13938) — l'onglet du hub People qui montre mes liens par niveau, ce qui manque pour monter et
/// mes demandes de montée. Cache d'abord (squelette seulement sur cache vide), états vide / chargement / erreur /
/// hors ligne dessinés.
struct CirclesTab: View {
    @ObservedObject var viewModel: CirclesViewModel
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }
    var onFindContacts: () -> Void = {}
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var openedRow: CirclesViewModel.Row?

    var body: some View {
        Group {
            if viewModel.showsSkeleton {
                ContactsSkeletonList()
            } else if viewModel.isEmptyState {
                emptyState(
                    icon: "circle.circle.fill",
                    title: String(localized: "circles.empty.title", defaultValue: "Tes liens apparaîtront ici", bundle: .main),
                    subtitle: String(localized: "circles.empty.subtitle", defaultValue: "À mesure que tu échanges avec des personnes, elles rejoignent tes cercles", bundle: .main),
                    actionTitle: String(localized: "circles.empty.action", defaultValue: "Trouver des contacts", bundle: .main),
                    action: onFindContacts
                )
            } else if viewModel.visibleLinks.isEmpty, let message = viewModel.errorMessage {
                emptyState(
                    icon: "exclamationmark.triangle",
                    title: message,
                    subtitle: "",
                    actionTitle: String(localized: "circles.error.retry", defaultValue: "Réessayer", bundle: .main),
                    action: { Task { await viewModel.load(forceNetwork: true) } }
                )
            } else if viewModel.visibleLinks.isEmpty, viewModel.isOffline {
                emptyState(
                    icon: "wifi.slash",
                    title: String(localized: "circles.offline.empty", defaultValue: "Hors ligne — tes cercles s'afficheront dès le retour du réseau", bundle: .main),
                    subtitle: "",
                    actionTitle: nil,
                    action: {}
                )
            } else {
                circlesList
            }
        }
        .task(id: isActive) {
            if isActive { await viewModel.load() }
        }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
        .sheet(item: $openedRow) { row in
            CircleLinkSheet(viewModel: viewModel, row: row)
        }
        .sheet(item: $viewModel.ritualTarget) { target in
            BloodRitualView(
                target: target,
                onFinished: { Task { await viewModel.ritualFinished() } }
            )
        }
    }

    // MARK: - Liste

    private var circlesList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            ContactsScrollSentinel()
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
                banner
                requestsBlock
                ForEach(viewModel.sections) { section in
                    sectionHeader(section)
                    ForEach(section.rows) { row in
                        CircleRowView(viewModel: viewModel, row: row) { openedRow = row }
                    }
                }
            }
            .padding(.top, MeeshySpacing.xs)
        }
        .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
        .refreshable { await viewModel.load(forceNetwork: true) }
    }

    /// Le cache reste affiché ; l'état se dit discrètement au-dessus.
    @ViewBuilder
    private var banner: some View {
        if let message = viewModel.errorMessage {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(MeeshyColors.warning)
                Text(message).font(.footnote).foregroundStyle(theme.textSecondary)
                Spacer()
                Button(String(localized: "circles.error.retry", defaultValue: "Réessayer", bundle: .main)) {
                    Task { await viewModel.load(forceNetwork: true) }
                }
                .font(.footnote.weight(.semibold))
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.vertical, MeeshySpacing.sm)
            .accessibilityElement(children: .combine)
        } else if viewModel.isOffline {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "wifi.slash").foregroundStyle(theme.textMuted)
                Text(String(localized: "circles.offline.banner", defaultValue: "Hors ligne — voici tes derniers cercles connus", bundle: .main))
                    .font(.footnote)
                    .foregroundStyle(theme.textSecondary)
                Spacer()
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.vertical, MeeshySpacing.sm)
            .accessibilityElement(children: .combine)
        }
    }

    private func sectionHeader(_ section: CirclesViewModel.Section) -> some View {
        let title = viewModel.title(of: section.level)
        return HStack(spacing: MeeshySpacing.sm) {
            Text(viewModel.icon(of: section.level)).accessibilityHidden(true)
            Text(title).font(.subheadline.weight(.bold)).foregroundStyle(CircleLevelColor.color(for: section.level))
            Text("\(section.rows.count)").font(.caption.weight(.semibold)).foregroundStyle(theme.textMuted)
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityLabel("\(title), \(section.rows.count)")
    }

    // MARK: - Demandes de montée

    @ViewBuilder
    private var requestsBlock: some View {
        if !viewModel.incomingRaises.isEmpty || !viewModel.outgoingRaises.isEmpty {
            Text(String(localized: "circles.section.requests", defaultValue: "Demandes de montée", bundle: .main))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(theme.textPrimary)
                .padding(.horizontal, MeeshySpacing.xl)
                .padding(.top, MeeshySpacing.md)
                .padding(.bottom, MeeshySpacing.xs)
                .accessibilityAddTraits(.isHeader)
            ForEach(viewModel.incomingRaises) { request in
                CircleRequestRow(viewModel: viewModel, request: request, direction: .incoming)
            }
            ForEach(viewModel.outgoingRaises) { request in
                CircleRequestRow(viewModel: viewModel, request: request, direction: .outgoing)
            }
        }
    }

    // MARK: - États

    private func emptyState(icon: String, title: String, subtitle: String, actionTitle: String?, action: @escaping () -> Void) -> some View {
        VStack(spacing: MeeshySpacing.lg) {
            AdaptiveContentUnavailableView(
                title,
                systemImage: icon,
                description: subtitle.isEmpty ? nil : Text(subtitle)
            )
            if let actionTitle {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .tint(MeeshyColors.indigo500)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Couleur d'un niveau

/// Une couleur par niveau, tirée des jetons `MeeshyColors` (aucune teinte codée en dur).
enum CircleLevelColor {
    static func color(for level: RelationLevel) -> Color {
        switch level {
        case .blood: return MeeshyColors.error
        case .close: return MeeshyColors.warning
        case .friend: return MeeshyColors.success
        case .acquaintance: return MeeshyColors.info
        case .community, .public: return MeeshyColors.neutral500
        }
    }
}
