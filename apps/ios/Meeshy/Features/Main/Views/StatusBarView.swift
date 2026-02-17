import SwiftUI

struct StatusBarView: View {
    @ObservedObject var viewModel: StatusViewModel
    var onAddStatus: () -> Void
    var onTapStatus: ((StatusEntry) -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
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
                        .tint(Color(hex: "4ECDC4"))
                        .frame(width: 30)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
        .frame(height: 50)
    }

    // MARK: - My Status Pill

    private func myStatusPill(_ status: StatusEntry) -> some View {
        Button {
            HapticFeedback.light()
            selectedPopover = status
        } label: {
            HStack(spacing: 6) {
                Text(status.moodEmoji)
                    .font(.system(size: 22))
                Text("Moi")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .glassCard(cornerRadius: 20)
            .breathingGlow(color: Color(hex: status.avatarColor), intensity: 0.4)
        }
        .popover(item: $selectedPopover) { entry in
            statusPopover(entry)
        }
    }

    // MARK: - Add Status Pill

    private var addStatusPill: some View {
        Button {
            HapticFeedback.light()
            onAddStatus()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(MeeshyColors.avatarRingGradient)
                Text("Status")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .glassCard(cornerRadius: 20)
        }
        .breathingGlow(color: Color(hex: "08D9D6"), intensity: 0.3)
    }

    // MARK: - Status Pill

    private func statusPill(_ status: StatusEntry) -> some View {
        Button {
            HapticFeedback.light()
            selectedPopover = status
        } label: {
            HStack(spacing: 6) {
                Text(status.moodEmoji)
                    .font(.system(size: 22))
                Text(status.username)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .glassCard(cornerRadius: 20)
        }
        .popover(item: $selectedPopover) { entry in
            statusPopover(entry)
        }
    }

    // MARK: - Status Popover

    private func statusPopover(_ entry: StatusEntry) -> some View {
        VStack(spacing: 8) {
            Text(entry.moodEmoji)
                .font(.system(size: 36))

            Text(entry.username)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            if let content = entry.content {
                Text(content)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                    .multilineTextAlignment(.center)
            }

            Text(entry.timeRemaining)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .padding(16)
        .frame(minWidth: 160)
    }
}

// Make StatusEntry conform to Identifiable for popover binding (already does)
