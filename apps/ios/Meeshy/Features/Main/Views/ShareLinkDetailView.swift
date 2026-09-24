import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// La fiche d'un lien de conversation, détails ET édition (#7797) — Liens ›
/// Liens de conversation › le lien.
///
/// De haut en bas : la carte du lien (dégradé de la marque), ce qu'il a fait
/// venir, sa configuration en lecture, puis le formulaire qui la modifie.
/// Le lien s'affiche depuis la ligne de liste qui l'a ouvert (cache-first) ;
/// les statistiques arrivent ensuite, sans jamais bloquer la fiche.
struct ShareLinkDetailView: View {
    @StateObject private var viewModel: ShareLinkDetailViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteConfirm = false
    @State private var copiedFeedback = false

    private static let formAnchor = "share-link-edit-form"

    init(
        link: MyShareLink,
        onLinkChanged: @escaping @MainActor (MyShareLink) -> Void = { _ in },
        onLinkDeleted: @escaping @MainActor (String) -> Void = { _ in }
    ) {
        _viewModel = StateObject(wrappedValue: ShareLinkDetailViewModel(
            link: link,
            onLinkChanged: onLinkChanged,
            onLinkDeleted: onLinkDeleted
        ))
    }

    private var isDark: Bool { colorScheme == .dark }
    private var link: MyShareLink { viewModel.link }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: MeeshySpacing.lg) {
                    heroCard
                    ShareLinkArrivalsSection(state: viewModel.stats, isDark: isDark)
                    ShareLinkConfigurationCard(link: link, isDark: isDark) {
                        withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(Self.formAnchor, anchor: .top) }
                    }
                    ShareLinkEditForm(
                        draft: $viewModel.draft,
                        isActive: link.isActive,
                        canSave: viewModel.canSave,
                        isSaving: viewModel.isSaving,
                        isDark: isDark,
                        onSave: save,
                        onToggleActive: toggleActive,
                        onDelete: { showDeleteConfirm = true }
                    )
                    .id(Self.formAnchor)
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.lg)
                .padding(.bottom, 60)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(ThemeManager.shared.backgroundGradient.ignoresSafeArea())
        .navigationTitle(link.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadStats() }
        .confirmationDialog(ShareLinkDetailCopy.deleteTitle, isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button(ShareLinkDetailCopy.delete, role: .destructive) { deleteLink() }
            Button(ShareLinkDetailCopy.cancel, role: .cancel) {}
        } message: {
            Text(ShareLinkDetailCopy.deleteConfirmation)
        }
    }

    // MARK: - Hero card

    private var groupName: String {
        link.conversation?.title ?? link.conversationTitle ?? link.displayName
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: MeeshySpacing.md) {
                groupLogo
                VStack(alignment: .leading, spacing: 2) {
                    Text(groupName)
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .heavy, design: .rounded))
                        .lineLimit(2)
                    Text(ShareLinkDetailCopy.createdOn(link.createdAt))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .opacity(0.85)
                }
                Spacer(minLength: 0)
                statusBadge
            }
            .accessibilityElement(children: .combine)

            Text(verbatim: link.address.displayString)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, design: .monospaced))
                .lineLimit(1)
                .truncationMode(.middle)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm).fill(Color.white.opacity(0.16)))
                .environment(\.layoutDirection, .leftToRight)
                .textSelection(.enabled)

            if let message = link.description, !message.isEmpty {
                Text(verbatim: "« \(message) »")
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
                    .italic()
                    .opacity(0.92)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                shareActionButton
                Button(action: copyLink) {
                    heroButtonLabel(copiedFeedback ? ShareLinkDetailCopy.copied : ShareLinkDetailCopy.copyLink,
                                    icon: copiedFeedback ? "checkmark" : "doc.on.doc", filled: false)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ShareLinkDetailCopy.copyLink)
            }
        }
        .foregroundColor(.white)
        .padding(MeeshySpacing.xl)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo700, MeeshyColors.purple600],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
        )
        .shadow(color: MeeshyColors.indigo600.opacity(isDark ? 0.15 : 0.3), radius: 16, y: 10)
    }

    private var groupLogo: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(Color.white.opacity(0.2))
            .overlay(
                CachedAsyncImage(url: link.conversation?.avatar, targetSize: CGSize(width: 48, height: 48), showsStatusOverlays: false) {
                    Text(MeeshyAvatar.initials(for: groupName))
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                }
                .scaledToFill()
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .frame(width: 48, height: 48)
            .accessibilityHidden(true)
    }

    private var statusBadge: some View {
        Text(link.isActive ? ShareLinkDetailCopy.active : ShareLinkDetailCopy.inactive)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .heavy))
            .textCase(.uppercase)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(link.isActive ? MeeshyColors.success.opacity(0.9) : Color.white.opacity(0.25)))
            .foregroundColor(link.isActive ? MeeshyColors.indigo950 : .white)
    }

    /// Native share: `ShareLink` gives the activity sheet, the iPad popover
    /// anchor and top-VC presentation for free — no manual
    /// `UIActivityViewController` / window-hierarchy traversal. The
    /// `presentSheet(_:)` helper it replaced resolved its presenter from
    /// `connectedScenes.first`, an unordered `Set`.
    ///
    /// The address shared is `/chat/<linkId>` (#7795) — never `/l/<token>`.
    @ViewBuilder
    private var shareActionButton: some View {
        if let url = link.address.url {
            ShareLink(item: url) {
                heroButtonLabel(ShareLinkDetailCopy.share, icon: "square.and.arrow.up", filled: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(ShareLinkDetailCopy.share)
        } else {
            // Malformed join URL: a dimmed, VoiceOver-hidden label rather than
            // a dead control.
            heroButtonLabel(ShareLinkDetailCopy.share, icon: "square.and.arrow.up", filled: true)
                .opacity(0.4)
                .accessibilityHidden(true)
        }
    }

    private func heroButtonLabel(_ text: String, icon: String, filled: Bool) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: icon).accessibilityHidden(true)
            Text(text).lineLimit(1).minimumScaleFactor(0.8)
        }
        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
        .foregroundColor(filled ? MeeshyColors.indigo700 : .white)
        .frame(maxWidth: .infinity, minHeight: 46)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                .fill(filled ? Color.white : Color.white.opacity(0.14))
        )
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                .stroke(Color.white.opacity(filled ? 0 : 0.45), lineWidth: 1.5)
        )
        .contentShape(Rectangle())
    }

    // MARK: - Actions

    private func copyLink() {
        UIPasteboard.general.string = link.address.absoluteString
        HapticFeedback.success()
        UIAccessibility.post(notification: .announcement, argument: ShareLinkDetailCopy.copied)
        withAnimation { copiedFeedback = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation { copiedFeedback = false }
        }
    }

    private func save() {
        HapticFeedback.light()
        Task {
            if await viewModel.save() {
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(ShareLinkDetailCopy.saved)
            } else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(ShareLinkDetailCopy.saveFailed)
            }
        }
    }

    private func toggleActive() {
        HapticFeedback.light()
        Task {
            guard await viewModel.toggleActive() else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(ShareLinkDetailCopy.actionFailed)
                return
            }
        }
    }

    private func deleteLink() {
        Task {
            guard await viewModel.delete() else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(ShareLinkDetailCopy.actionFailed)
                return
            }
            dismiss()
        }
    }
}
