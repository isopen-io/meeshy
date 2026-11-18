import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// La fiche d'un lien de partage (planche `Lien-Partage`, #18871 ; détails et édition depuis #7797).
///
/// De haut en bas : le billet héros et ses gestes, l'interrupteur Actif, la jauge des entrées, « Qui peut entrer »,
/// les chiffres, les arrivées, les arrivées par pays et leurs langues, puis Désactiver. « Modifier » ouvre le
/// formulaire dans une feuille. Fait du kit : rien n'y est redessiné. Le lien s'affiche depuis la ligne de liste
/// qui l'a ouvert (cache d'abord) ; les statistiques arrivent ensuite, sans jamais bloquer la fiche.
struct ShareLinkDetailView: View {
    @StateObject var viewModel: ShareLinkDetailViewModel
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteConfirm = false
    @State private var showsMore = false
    @State private var isEditing = false
    @State private var qrShareImage: QRShareImage?
    @State private var sharedLink: ShareableLink?
    @State var arrivalToRemove: ShareLinkArrivalStats.Arrival?

    init(
        link: MyShareLink,
        onLinkChanged: @escaping @MainActor (MyShareLink) -> Void = { _ in },
        onLinkDeleted: @escaping @MainActor (String) -> Void = { _ in }
    ) {
        _viewModel = StateObject(wrappedValue: ShareLinkDetailViewModel(
            link: link,
            removeParticipant: { conversationId, key in
                try await ConversationService.shared.removeParticipant(conversationId: conversationId, key: key)
            },
            onLinkChanged: onLinkChanged,
            onLinkDeleted: onLinkDeleted
        ))
    }

    var isDark: Bool { colorScheme == .dark }
    var link: MyShareLink { viewModel.link }

    var body: some View {
        LinksPage(title: ShareLinkDetailCopy.pageTitle, accent: MeeshyColors.brandPrimary,
                  action: LinksPageAction(label: ShareLinkDetailCopy.more, systemImage: "ellipsis") { showsMore = true }) {
            VStack(spacing: MeeshySpacing.xl) {
                heroTicket
                activeRow
                entriesMeter
                entryRules
                figuresBand
                arrivalsSection
                countriesSection
                languagesSection
                disableButton
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.lg)
            .padding(.bottom, 60)
        }
        .task { await viewModel.loadStats() }
        .confirmationDialog(link.displayName, isPresented: $showsMore, titleVisibility: .visible) {
            Button(ShareLinkDetailCopy.edit) { isEditing = true }
            Button(TrackingDetailCopy.deleteLink, role: .destructive) { showDeleteConfirm = true }
            Button(ShareLinkDetailCopy.cancel, role: .cancel) {}
        }
        .confirmationDialog(ShareLinkDetailCopy.deleteTitle, isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button(ShareLinkDetailCopy.delete, role: .destructive) { deleteLink() }
            Button(ShareLinkDetailCopy.cancel, role: .cancel) {}
        } message: {
            Text(ShareLinkDetailCopy.deleteConfirmation)
        }
        .confirmationDialog(arrivalToRemove.map { ShareLinkDetailCopy.removeArrivalTitle($0.displayName) } ?? "",
                            isPresented: removalBinding, titleVisibility: .visible,
                            presenting: arrivalToRemove) { arrival in
            Button(ShareLinkDetailCopy.removeArrival, role: .destructive) { removeArrival(arrival) }
            Button(ShareLinkDetailCopy.cancel, role: .cancel) {}
        }
        .sheet(isPresented: $isEditing, onDismiss: { viewModel.discardChanges() }) { editSheet }
        .sheet(item: $qrShareImage) { qr in ShareSheet(activityItems: [qr.image]) }
        .sheet(item: $sharedLink) { shared in ShareSheet(activityItems: shared.activityItems) }
    }

    private var removalBinding: Binding<Bool> {
        Binding(get: { arrivalToRemove != nil }, set: { if !$0 { arrivalToRemove = nil } })
    }

    // MARK: - Le billet héros (K30)

    private var groupName: String {
        link.conversation?.title ?? link.conversationTitle ?? link.displayName
    }

    private var heroTicket: some View {
        MeeshyTicket(
            title: link.displayName,
            code: link.address.displayString,
            tint: MeeshyColors.brandPrimary,
            systemImage: "bubble.left.and.bubble.right.fill",
            size: .hero,
            label: "\(link.displayName), \(link.address.displayString)",
            statusLabel: link.isActive ? ShareLinkDetailCopy.active : ShareLinkDetailCopy.inactive,
            stub: { heroStub },
            leading: { EmptyView() },
            trailing: { EmptyView() },
            status: { EmptyView() },
            back: { EmptyView() }
        )
        .accessibilityIdentifier("shareLink.detail.hero")
    }

    /// « Mène à Studio » : la pile des dernières arrivées (K48) quand elles sont lues, sinon l'avatar du groupe.
    private var heroStub: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            let faces = viewModel.headFaces
            if faces.isEmpty {
                MeeshyPersonRow(title: ShareLinkDetailCopy.leadsTo(groupName), size: .inline, showsDivider: false) {
                    MeeshyAvatar(name: groupName, context: .custom(26), kind: .entity,
                                 avatarURL: link.conversation?.avatar, isDark: isDark)
                }
            } else {
                LinksFaceStack(members: faces, summary: ShareLinkDetailCopy.leadsTo(groupName),
                               label: ProfileLinksCopy.facesLabel(ShareLinkDetailCopy.leadsTo(groupName), faces: faces),
                               tint: MeeshyColors.brandPrimary)
                    .accessibilityIdentifier("shareLink.detail.faces")
            }
            heroActions
        }
    }

    private var heroActions: some View {
        MeeshyActionGrid(columns: .fixed(4)) {
            MeeshyLabeledAction(title: TrackingDetailCopy.copy, systemImage: "doc.on.doc", tint: MeeshyColors.brandPrimary,
                                hint: link.address.displayString, action: {
                LinksClipboard.copy(link.address.absoluteString, confirmation: .inline, message: ShareLinkDetailCopy.copied)
            })
            MeeshyLabeledAction(title: TrackingDetailCopy.qr, systemImage: "qrcode", tint: MeeshyColors.brandPrimary,
                                action: { qrShareImage = LinkQRCode.shareImage(for: link.address.absoluteString) })
                .disabled(link.address.url == nil)
            MeeshyLabeledAction(title: ShareLinkDetailCopy.share, systemImage: "square.and.arrow.up",
                                tint: MeeshyColors.brandPrimary, action: {
                sharedLink = link.address.url.map { ShareableLink(url: $0) }
            })
            .disabled(link.address.url == nil)
            MeeshyLabeledAction(title: ShareLinkDetailCopy.edit, systemImage: "pencil", tint: MeeshyColors.brandPrimary,
                                action: { isEditing = true })
        }
    }

    // MARK: - Actif

    /// L'interrupteur répond au toucher ; le serveur confirme ensuite, et l'état revient s'il refuse.
    private var activeRow: some View {
        MeeshyToggleRow(ShareLinkDetailCopy.active,
                        subtitle: link.isActive ? nil : ShareLinkDetailCopy.inactiveHint,
                        accessory: .toggle(isOn: link.isActive),
                        tint: MeeshyColors.brandPrimary,
                        action: { toggleActive() })
            .accessibilityIdentifier("shareLink.detail.active")
    }

    // MARK: - Désactiver

    private var disableButton: some View {
        MeeshyButton(link.isActive ? ShareLinkDetailCopy.disableLink : ShareLinkDetailCopy.enableLink,
                     systemImage: link.isActive ? "nosign" : "link", kind: .outline, width: .fill,
                     isDestructive: link.isActive, action: { toggleActive() })
            .accessibilityIdentifier("shareLink.detail.disable")
    }

    // MARK: - Modifier (feuille)

    private var editSheet: some View {
        LinksPage(title: ShareLinkDetailCopy.editTitle, accent: MeeshyColors.brandPrimary, glyph: .close,
                  onBack: { isEditing = false }) {
            ShareLinkEditForm(
                draft: $viewModel.draft,
                isActive: link.isActive,
                canSave: viewModel.canSave,
                isSaving: viewModel.isSaving,
                isDark: isDark,
                onSave: save,
                onToggleActive: toggleActive,
                onDelete: {
                    isEditing = false
                    showDeleteConfirm = true
                }
            )
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    // MARK: - Actions

    private func save() {
        HapticFeedback.light()
        Task {
            if await viewModel.save() {
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(ShareLinkDetailCopy.saved)
                isEditing = false
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

    private func removeArrival(_ arrival: ShareLinkArrivalStats.Arrival) {
        HapticFeedback.light()
        Task {
            guard await viewModel.removeArrival(participantId: arrival.participantId) else {
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
