import SwiftUI
import Combine
import MeeshySDK

struct StatusBarView: View {
    @ObservedObject var viewModel: StatusViewModel
    var onAddStatus: () -> Void
    var onTapStatus: ((StatusEntry) -> Void)?

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @State private var selectedPopover: StatusEntry?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                // My status / Add button
                if let my = viewModel.myStatus {
                    myStatusPill(my)
                } else {
                    addStatusPill
                }

                // Error indicator
                if viewModel.error != nil, viewModel.statuses.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundStyle(MeeshyColors.warning)
                            .accessibilityHidden(true)
                        Text(String(localized: "status.bar.load_error", defaultValue: "Erreur de chargement", bundle: .main))
                            .font(.caption2.weight(.medium))
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .glassCard(cornerRadius: 20)
                    .accessibilityElement(children: .combine)
                    .onTapGesture {
                        Task { await viewModel.loadStatuses() }
                    }
                }

                // Other statuses
                ForEach(viewModel.statuses.filter { $0.id != viewModel.myStatus?.id }) { status in
                    statusPill(status)
                        .onAppear {
                            Task { await viewModel.loadMoreIfNeeded(currentStatus: status) }
                        }
                }

                // Loading indicator
                if viewModel.isLoadingMore {
                    ProgressView()
                        .tint(MeeshyColors.indigo300)
                        .frame(width: 30)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
        .frame(height: 50)
        .popover(item: $selectedPopover) { entry in
            statusPopover(entry)
        }
    }

    // MARK: - My Status Pill

    private func myStatusPill(_ status: StatusEntry) -> some View {
        Button {
            HapticFeedback.light()
            selectedPopover = status
        } label: {
            HStack(spacing: 6) {
                Text(status.moodEmoji)
                    .font(.title2)
                Text(String(localized: "status.bar.me", defaultValue: "Moi", bundle: .main))
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .glassCard(cornerRadius: 20)
            .breathingGlow(color: Color(hex: status.avatarColor), intensity: 0.4)
        }
        .accessibilityLabel(String(localized: "status.bar.my_status_label", defaultValue: "Mon statut \(status.moodEmoji)", bundle: .main))
        .accessibilityHint(String(localized: "status.bar.my_status_hint", defaultValue: "Voir les détails de votre statut", bundle: .main))
    }

    // MARK: - Add Status Pill

    private var addStatusPill: some View {
        Button {
            HapticFeedback.light()
            onAddStatus()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "plus")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(MeeshyColors.avatarRingGradient)
                Text(String(localized: "status.bar.status", defaultValue: "Status", bundle: .main))
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .glassCard(cornerRadius: 20)
        }
        .accessibilityLabel(String(localized: "status.bar.add_label", defaultValue: "Ajouter un statut", bundle: .main))
        .accessibilityHint(String(localized: "status.bar.add_hint", defaultValue: "Publie un statut visible par vos contacts", bundle: .main))
        .breathingGlow(color: MeeshyColors.indigo500, intensity: 0.3)
    }

    // MARK: - Status Pill

    private func statusPill(_ status: StatusEntry) -> some View {
        Button {
            HapticFeedback.light()
            selectedPopover = status
        } label: {
            HStack(spacing: 6) {
                Text(status.moodEmoji)
                    .font(.title2)
                Text(status.username)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .glassCard(cornerRadius: 20)
        }
        .accessibilityLabel("\(status.moodEmoji) \(status.username)")
        .accessibilityHint(String(localized: "status.bar.status_hint", defaultValue: "Voir le statut", bundle: .main))
    }

    // MARK: - Status Popover

    private func statusPopover(_ entry: StatusEntry) -> some View {
        VStack(spacing: 8) {
            Text(entry.moodEmoji)
                .font(.system(size: 36))

            Text(entry.username)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(theme.textPrimary)

            if let content = entry.content {
                Text(content)
                    .font(.footnote)
                    .foregroundColor(theme.textSecondary)
                    .multilineTextAlignment(.center)
            }

            if let via = entry.viaUsername {
                Text("\(String(localized: "status.bar.via", defaultValue: "via", bundle: .main)) @\(via)")
                    .font(.caption2)
                    .foregroundColor(theme.textMuted)
            }

            Text(entry.timeRemaining)
                .font(.caption2.weight(.medium))
                .foregroundColor(theme.textMuted)
        }
        .padding(16)
        .frame(minWidth: 160)
    }
}

// Make StatusEntry conform to Identifiable for popover binding (already does)
