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
    @Environment(\.meeshyRouter) var router
    @State private var showDeleteConfirm = false
    /// « Supprimer » touché dans le formulaire : la confirmation attend que sa feuille soit partie, UIKit refusant de
    /// présenter pendant une fermeture.
    @State private var deleteAfterEdit = false
    @State private var showResetConfirm = false
    @State private var showsMore = false
    @State private var isEditing = false
    @State private var enlargedQR: LinkQRPresentation?
    @State private var sharedLink: ShareableLink?
    @State var arrivalToRemove: ShareLinkArrivalStats.Arrival?
    /// L'arrivée dépliée au toucher, qui montre « Voir la fiche » et « Retirer » (planche `Lien-Partage`).
    @State var openedArrivalId: String?
    @State var showsAllArrivals = false

    /// La teinte de la famille « partage » (`--l-share`), la même que son billet et son filtre sur la face Liens.
    static let tint = MeeshyColors.shareAccent

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
        LinksPage(title: ShareLinkDetailCopy.pageTitle, accent: Self.tint,
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
                VStack(spacing: MeeshySpacing.md) {
                    resetUsesButton
                    disableButton
                }
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
        .confirmationDialog(ShareLinkDetailCopy.resetUses, isPresented: $showResetConfirm, titleVisibility: .visible) {
            Button(ShareLinkDetailCopy.resetUses) { resetUses() }
            Button(ShareLinkDetailCopy.cancel, role: .cancel) {}
        } message: {
            Text(ShareLinkDetailCopy.resetUsesMessage)
        }
        .confirmationDialog(arrivalToRemove.map { ShareLinkDetailCopy.removeArrivalTitle($0.displayName) } ?? "",
                            isPresented: removalBinding, titleVisibility: .visible,
                            presenting: arrivalToRemove) { arrival in
            Button(ShareLinkDetailCopy.removeArrival, role: .destructive) { removeArrival(arrival) }
            Button(ShareLinkDetailCopy.cancel, role: .cancel) {}
        }
        .sheet(isPresented: $isEditing, onDismiss: { editSheetDismissed() }) { editSheet }
        .sheet(item: $enlargedQR) { qr in LinkQRSheet(presentation: qr, tint: Self.tint) }
        .sheet(item: $sharedLink) { shared in ShareSheet(activityItems: shared.activityItems) }
        .navigationDestination(isPresented: $showsAllArrivals) { allArrivals }
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
            tint: Self.tint,
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

    /// « Mène à Studio › » : la pile des dernières arrivées (K48) quand elles sont lues, sinon l'avatar du groupe ;
    /// le toucher ouvre la conversation, quand la fiche la connaît.
    private var heroStub: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            let faces = viewModel.headFaces
            let open = openConversation
            if faces.isEmpty {
                MeeshyPersonRow(title: ShareLinkDetailCopy.leadsTo(groupName), size: .inline, showsDivider: false,
                                onPress: open) {
                    MeeshyAvatar(name: groupName, context: .custom(26), kind: .entity,
                                 avatarURL: link.conversation?.avatar, isDark: isDark)
                } trailing: {
                    if open != nil {
                        Image(systemName: "chevron.right")
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                    }
                }
                .accessibilityHint(open == nil ? "" : ShareLinkDetailCopy.openConversationHint)
            } else {
                LinksFaceStack(members: faces, summary: ShareLinkDetailCopy.leadsTo(groupName),
                               label: ProfileLinksCopy.facesLabel(ShareLinkDetailCopy.leadsTo(groupName), faces: faces),
                               tint: Self.tint, hint: ShareLinkDetailCopy.openConversationHint, onPress: open)
                    .accessibilityIdentifier("shareLink.detail.faces")
            }
            heroActions
        }
    }

    /// Ouvre la conversation que le lien ouvre ; `nil` tant que la fiche ne la connaît pas.
    private var openConversation: (() -> Void)? {
        guard let conversationId = link.conversation?.id else { return nil }
        return { DeepLinkRouter.shared.pendingDeepLink = .conversation(id: conversationId) }
    }

    private var heroActions: some View {
        MeeshyActionGrid(columns: .fixed(4)) {
            MeeshyLabeledAction(title: TrackingDetailCopy.copy, systemImage: "doc.on.doc", tint: Self.tint,
                                hint: link.address.displayString, action: {
                LinksClipboard.copy(link.address.absoluteString, confirmation: .inline, message: ShareLinkDetailCopy.copied)
            })
            MeeshyLabeledAction(title: TrackingDetailCopy.qr, systemImage: "qrcode", tint: Self.tint,
                                action: { enlargeQR() })
                .disabled(link.address.url == nil)
            MeeshyLabeledAction(title: ShareLinkDetailCopy.share, systemImage: "square.and.arrow.up",
                                tint: Self.tint, action: {
                sharedLink = link.address.url.map { ShareableLink(url: $0) }
            })
            .disabled(link.address.url == nil)
            MeeshyLabeledAction(title: ShareLinkDetailCopy.edit, systemImage: "pencil", tint: Self.tint,
                                action: { isEditing = true })
        }
    }

    // MARK: - Actif

    /// L'interrupteur répond au toucher ; le serveur confirme ensuite, et l'état revient s'il refuse.
    private var activeRow: some View {
        MeeshyToggleRow(ShareLinkDetailCopy.active,
                        subtitle: link.isActive ? nil : ShareLinkDetailCopy.inactiveHint,
                        accessory: .toggle(isOn: link.isActive),
                        tint: Self.tint,
                        action: { toggleActive() })
            .accessibilityIdentifier("shareLink.detail.active")
    }

    // MARK: - Remettre le compteur à zéro (#19505)

    /// Offert dès qu'une entrée a été comptée ; le compteur repart de zéro sitôt confirmé, et revient si le serveur
    /// refuse ou ne connaît pas la remise.
    @ViewBuilder
    private var resetUsesButton: some View {
        if viewModel.canResetUses {
            MeeshyButton(ShareLinkDetailCopy.resetUses, systemImage: "arrow.counterclockwise", kind: .outline,
                         width: .fill, action: { showResetConfirm = true })
                .accessibilityIdentifier("shareLink.detail.resetUses")
        }
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
        LinksPage(title: ShareLinkDetailCopy.editTitle, accent: Self.tint, glyph: .close,
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
                    deleteAfterEdit = true
                    isEditing = false
                }
            )
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    // MARK: - Actions

    /// La feuille « Modifier » est partie : le brouillon non enregistré s'efface, puis la suppression demandée depuis
    /// le formulaire se confirme, maintenant que plus rien ne se présente.
    private func editSheetDismissed() {
        viewModel.discardChanges()
        guard deleteAfterEdit else { return }
        deleteAfterEdit = false
        showDeleteConfirm = true
    }

    private func enlargeQR() {
        enlargedQR = LinkQRPresentation(address: link.address.absoluteString, title: link.displayName)
    }

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

    private func resetUses() {
        HapticFeedback.light()
        Task {
            guard await viewModel.resetUses() else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(ShareLinkDetailCopy.actionFailed)
                return
            }
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(ShareLinkDetailCopy.resetUsesDone)
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
