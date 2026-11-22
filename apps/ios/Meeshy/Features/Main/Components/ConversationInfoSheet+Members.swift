import SwiftUI
import MeeshySDK
import os
import MeeshyUI

extension ConversationInfoSheet {

    // MARK: - Members Section

    private var filteredMembers: [PaginatedParticipant] {
        let q = memberSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return participants }
        return participants.filter { p in
            p.name.lowercased().contains(q) ||
            (p.username?.lowercased().contains(q) ?? false)
        }
    }

    var membersSection: some View {
        VStack(spacing: 0) {
            if conversation.type != .direct, canManageMembers {
                manageMembersButton
            }

            // Member count
            HStack {
                Text(MembersCountLabel.text(participants.count))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold, design: .rounded))
                    .foregroundStyle(theme.textMuted)
                Spacer()
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.top, MeeshySpacing.md)
            .padding(.bottom, MeeshySpacing.xs)

            // Search field
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "magnifyingglass")
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundStyle(theme.textMuted)
                TextField(String(localized: "conversation.info.member-search", defaultValue: "Rechercher un membre…", bundle: .main), text: $memberSearchQuery)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize))
                    .foregroundStyle(theme.textPrimary)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                if !memberSearchQuery.isEmpty {
                    Button {
                        memberSearchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Effacer la recherche", bundle: .main))
                }
            }
            .padding(MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                    .fill(MeeshyColors.surfaceFill(isDark: isDark))
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                    .strokeBorder(theme.textMuted.opacity(MeeshyOpacity.light), lineWidth: 1)
            )
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.bottom, MeeshySpacing.sm)

            if isLoadingParticipants {
                VStack(spacing: MeeshySpacing.md) {
                    ForEach(0..<3, id: \.self) { _ in
                        ConversationInfoMemberSkeletonRow()
                    }
                }
                .padding(.horizontal, MeeshySpacing.xl)
                .padding(.top, MeeshySpacing.lg)
            } else if filteredMembers.isEmpty {
                emptyState(icon: "person.2.slash", text: memberSearchQuery.isEmpty ? String(localized: "conversation.info.no-members", defaultValue: "Aucun membre", bundle: .main) : String(localized: "common.no-results", defaultValue: "Aucun résultat", bundle: .main))
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(filteredMembers) { participant in
                        ConversationInfoMemberRow(participant: participant, conversationId: conversation.id)
                            .onAppear {
                                if participant.id == participants.last?.id {
                                    Task { await loadMoreParticipants() }
                                }
                            }
                    }
                    if isLoadingMoreParticipants {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, MeeshySpacing.md)
                    }
                }
                .padding(.top, MeeshySpacing.sm)
            }
        }
        .padding(.bottom, MeeshySpacing.xxxl)
    }

    private var manageMembersButton: some View {
        NavigationLink(value: "settings") {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "person.2.badge.gearshape")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                Text(String(localized: "conversation.info.manage_members", defaultValue: "Gérer les membres", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                Spacer()
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
            }
            .foregroundColor(accent)
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                    .fill(accent.opacity(isDark ? 0.12 : 0.08))
            )
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.md)
        .accessibilityLabel(String(localized: "conversation.info.manage_members.a11y", defaultValue: "Gérer les membres du groupe", bundle: .main))
    }

    // MARK: - Empty State

    private func emptyState(icon: String, text: String) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(32, weight: .light))
                .foregroundStyle(theme.textMuted.opacity(0.4))

            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - API

    func loadParticipants() async {
        isLoadingParticipants = true
        defer { isLoadingParticipants = false }

        do {
            let fetched = try await ParticipantService.shared.loadFirstPage(
                for: conversation.id
            )
            participants = fetched
            hasMoreParticipants = await ParticipantService.shared.hasMore(for: conversation.id)
        } catch {
            Self.logger.error("Failed to load participants: \(error.localizedDescription)")
        }
    }

    private func loadMoreParticipants() async {
        guard hasMoreParticipants, !isLoadingMoreParticipants else { return }
        isLoadingMoreParticipants = true
        defer { isLoadingMoreParticipants = false }

        do {
            let allFetched = try await ParticipantService.shared.loadNextPage(for: conversation.id)
            participants = allFetched
            hasMoreParticipants = await ParticipantService.shared.hasMore(for: conversation.id)
        } catch {
            Self.logger.error("Failed to load more participants: \(error.localizedDescription)")
        }
    }
}
