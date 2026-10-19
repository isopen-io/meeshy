import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Share Link Picker Sheet

struct ShareLinkPickerSheet: View {
    let conversations: [Conversation]
    let onSelect: (Conversation) -> Void
    @Environment(\.dismiss) private var dismiss

    private var theme: ThemeManager { .shared }

    var body: some View {
        NavigationStack {
            Group {
                if conversations.isEmpty {
                    VStack(spacing: MeeshySpacing.lg) {
                        Image(systemName: "link.badge.plus")
                            .font(MeeshyFont.relative(MeeshyIconSize.hero))
                            .foregroundStyle(MeeshyColors.indigo300)
                        Text(String(localized: "conversation.list.no_eligible_conversation", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(conversations) { conversation in
                        Button {
                            onSelect(conversation)
                        } label: {
                            HStack(spacing: MeeshySpacing.md) {
                                Image(systemName: conversation.type == .group ? "person.3.fill" : "globe")
                                    .font(MeeshyFont.relative(MeeshyIconSize.md))
                                    .foregroundColor(MeeshyColors.indigo500)
                                    .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
                                    .accessibilityHidden(true)

                                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                                    Text(conversation.name)
                                        .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .medium))
                                        .foregroundColor(theme.textPrimary)
                                        .lineLimit(1)

                                    Text(conversation.type.rawValue.capitalized)
                                        .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                                        .foregroundColor(theme.textSecondary)
                                }

                                Spacer()

                                Image(systemName: "link")
                                    .font(MeeshyFont.relative(MeeshyIconSize.sm))
                                    .foregroundColor(MeeshyColors.indigo400)
                                    .accessibilityHidden(true)
                            }
                            .padding(.vertical, MeeshySpacing.xs)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(String(localized: "conversation.list.create_share_link.title", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", bundle: .main)) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
