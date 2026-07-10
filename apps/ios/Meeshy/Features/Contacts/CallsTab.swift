import SwiftUI
import MeeshySDK
import MeeshyUI

/// People hub **Calls** tab: the call journal. Cache-first list of recent calls
/// (received / missed / outgoing) over a 3-month window. Tap a row for details;
/// use the trailing call button to redial. Missed calls read in red.
struct CallsTab: View {
    @ObservedObject var viewModel: CallsViewModel
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }

    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }
    @State private var selectedCall: APICallRecord?

    var body: some View {
        VStack(spacing: 0) {
            filterChips
            content
        }
        .task { await viewModel.loadCalls() }
        .sheet(item: $selectedCall) { record in
            CallDetailSheet(record: record)
        }
    }

    // MARK: - Filter Chips

    private var filterChips: some View {
        HStack(spacing: 8) {
            chip(.all, label: String(localized: "calls.filter.all", defaultValue: "Tous", bundle: .main))
            chip(.missed, label: String(localized: "calls.filter.missed", defaultValue: "Manques", bundle: .main))
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func chip(_ filter: CallHistoryFilter, label: String) -> some View {
        let isSelected = viewModel.filter == filter
        return Button {
            viewModel.setFilter(filter)
            HapticFeedback.light()
        } label: {
            Text(label)
                .font(.footnote.weight(.semibold))
                .foregroundColor(isSelected ? .white : MeeshyColors.indigo500)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(Capsule().fill(isSelected ? MeeshyColors.indigo500 : Color.clear))
                .overlay(Capsule().stroke(isSelected ? Color.clear : MeeshyColors.indigo900.opacity(0.3), lineWidth: 1))
        }
        .accessibilityLabel(label)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.loadState == .loading && viewModel.calls.isEmpty {
            VStack {
                Spacer()
                ProgressView().tint(MeeshyColors.indigo500)
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if viewModel.calls.isEmpty {
            EmptyStateView(
                icon: "phone.arrow.up.right",
                title: String(localized: "calls.empty.title", defaultValue: "Aucun appel recent", bundle: .main),
                subtitle: String(localized: "calls.empty.subtitle", defaultValue: "Vos appels recus, manques, annules et emis apparaitront ici.", bundle: .main)
            )
        } else {
            list
        }
    }

    private var list: some View {
        ScrollView(.vertical, showsIndicators: false) {
            ContactsScrollSentinel()
            LazyVStack(spacing: 0) {
                ForEach(viewModel.calls) { record in
                    CallJournalRow(record: record, onTap: { selectedCall = record })
                        .equatable()
                    Divider().opacity(0.15).padding(.leading, 70)
                }
            }
            .padding(.top, 4)
        }
        .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
    }
}

// MARK: - Journal Row

/// One call-journal row. A leaf cell: primitive inputs only, `Equatable` so the
/// list skips re-evaluating unchanged rows.
private struct CallJournalRow: View, Equatable {
    let record: APICallRecord
    let onTap: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }

    static func == (lhs: CallJournalRow, rhs: CallJournalRow) -> Bool {
        lhs.record == rhs.record
    }

    var body: some View {
        let name = record.displayName
        let color = DynamicColorGenerator.colorForName(name)
        let isOnline = record.peer?.isOnline ?? false

        HStack(spacing: 14) {
            Button(action: onTap) {
                HStack(spacing: 14) {
                    MeeshyAvatar(
                        name: name,
                        context: .userListItem,
                        accentColor: color,
                        avatarURL: record.avatarURL,
                        presenceState: isOnline ? .online : .offline
                    )

                    VStack(alignment: .leading, spacing: 3) {
                        Text(name)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(record.isMissed ? MeeshyColors.error : theme.textPrimary)
                            .lineLimit(1)

                        HStack(spacing: 5) {
                            Image(systemName: directionIcon)
                                .font(.caption2.weight(.bold))
                                .foregroundColor(record.isMissed ? MeeshyColors.error : theme.textMuted)
                            if record.isVideo {
                                Image(systemName: "video.fill")
                                    .font(.caption2)
                                    .foregroundColor(theme.textMuted)
                            }
                            Text(record.startedAt.relativeTimeString)
                                .font(.caption.weight(.medium))
                                .foregroundColor(theme.textMuted)
                            if !record.durationLabel.isEmpty {
                                Text("· \(record.durationLabel)")
                                    .font(.caption.weight(.medium))
                                    .foregroundColor(theme.textMuted)
                            }
                        }
                    }

                    Spacer()
                }
            }
            .buttonStyle(.plain)

            if let peer = record.peer {
                CallRowDialButton(
                    userId: peer.userId,
                    displayName: name,
                    conversationId: record.conversationId,
                    defaultIsVideo: record.isVideo
                )
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(accessibilityDirection)")
    }

    private var directionIcon: String {
        switch record.directionKind {
        case .outgoing: return "arrow.up.right"
        case .incoming, .missed: return "arrow.down.left"
        }
    }

    private var accessibilityDirection: String {
        switch record.directionKind {
        case .outgoing: return String(localized: "calls.direction.outgoing", defaultValue: "appel emis", bundle: .main)
        case .incoming: return String(localized: "calls.direction.incoming", defaultValue: "appel recu", bundle: .main)
        case .missed: return String(localized: "calls.direction.missed", defaultValue: "appel manque", bundle: .main)
        }
    }
}

// MARK: - Dial Button (audio / video menu)

private struct CallRowDialButton: View {
    let userId: String
    let displayName: String
    let conversationId: String
    let defaultIsVideo: Bool

    var body: some View {
        Menu {
            Button {
                CallStarter.start(userId: userId, displayName: displayName, isVideo: false, conversationId: conversationId)
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "call.start.audio", defaultValue: "Appel vocal", bundle: .main), systemImage: "phone.fill")
            }
            Button {
                CallStarter.start(userId: userId, displayName: displayName, isVideo: true, conversationId: conversationId)
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "call.start.video", defaultValue: "Appel video", bundle: .main), systemImage: "video.fill")
            }
        } label: {
            Image(systemName: defaultIsVideo ? "video.fill" : "phone.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(MeeshyColors.indigo500)
                .frame(width: 40, height: 40)
                .background(Circle().fill(MeeshyColors.indigo500.opacity(0.12)))
        }
        .accessibilityLabel(String(localized: "calls.redial", defaultValue: "Rappeler", bundle: .main))
    }
}
