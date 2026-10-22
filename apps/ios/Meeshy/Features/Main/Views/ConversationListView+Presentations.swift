import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Présentations de la liste

/// Les feuilles que la liste ouvre vers d'AUTRES écrans : informations de la
/// conversation, invitation, composeur de mood, parrainage, lien raccourci.
/// Les cibles et les booléens de présentation restent à la liste, qui les
/// arme ; ce modificateur ne fait que les monter.
struct ConversationListCreationSheets: ViewModifier {
    @Binding var sheetTargets: ConversationListSheetTargets
    @Binding var showStatusComposer: Bool
    @Binding var showCreateAffiliate: Bool
    @Binding var showCreateTrackingLink: Bool
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @Environment(\.routerCommands) private var router

    func body(content: Content) -> some View {
        content
            .sheet(item: $sheetTargets.info) { conversation in
                ConversationInfoSheet(
                    conversation: conversation,
                    accentColor: conversation.accentColor, messages: [],
                    mediaHubActions: ConversationMediaHubActions(goToMessage: { sheetTargets.info = nil; router.navigateToConversation(conversation, highlightMessageId: $0) }))
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .sheet(item: $sheetTargets.inviteSheet) { conversation in
                InviteFriendsSheet(conversation: conversation)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            // Lot 4.6 — LA feuille des trois déclencheurs de cette vue (le rail
            // Lentille, le tray classique, l'accès rapide « Poser un mood ») monte
            // le MEUBLE. Une seule feuille pour les trois, comme avant : c'est le
            // booléen de présentation que `ScrollPillStateTests` compte à trois
            // écritures — le nommer ici en toutes lettres l'aurait fait quatre pour
            // toute garde qui ne retire pas les commentaires.
            .sheet(isPresented: $showStatusComposer) {
                MoodComposerDoor(
                    intent: ComposerIntent(origin: .moodChip),
                    seed: nil,
                    viewModel: statusViewModel
                )
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showCreateAffiliate) {
                AffiliateCreateView { _ in }
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showCreateTrackingLink) {
                CreateTrackingLinkView { _ in }
            }
    }
}

/// Le verrou, le code maître, le renommage, l'aperçu du widget et la
/// recherche globale : les présentations modales qui suivent le menu
/// contextuel de la liste.
struct ConversationListModalPresentations: ViewModifier {
    @Binding var sheetTargets: ConversationListSheetTargets
    @Binding var lockSheetMode: ConversationLockSheet.Mode
    @Binding var showNoMasterPinAlert: Bool
    @Binding var renameText: String
    @Binding var showWidgetPreview: Bool
    @Binding var showGlobalSearch: Bool
    let onSelect: (Conversation) -> Void
    let onNewConversation: (() -> Void)?
    @EnvironmentObject private var conversationViewModel: ConversationListViewModel
    @EnvironmentObject private var router: Router

    private var theme: ThemeManager { ThemeManager.shared }

    func body(content: Content) -> some View {
        content
            .sheet(item: $sheetTargets.lockSheet) { conversation in
                ConversationLockSheet(
                    mode: lockSheetMode,
                    conversationId: conversation.id,
                    conversationName: conversation.name,
                    onSuccess: {
                        guard case .openConversation = lockSheetMode else { return }
                        if sheetTargets.searchAfterUnlock { router.pendingOpenSearch = true }
                        sheetTargets.searchAfterUnlock = false
                        onSelect(conversation)
                    }
                )
                .environmentObject(theme)
            }
            .alert(String(localized: "conversation.list.master_pin_required.title", bundle: .main), isPresented: $showNoMasterPinAlert) {
                Button(String(localized: "conversation.list.master_pin_required.configure", bundle: .main), role: .none) { router.push(.settings) }
                Button(String(localized: "common.cancel", bundle: .main), role: .cancel) {}
            } message: {
                Text(String(localized: "conversation.list.master_pin_required.message", bundle: .main))
            }
            .alert(
                String(localized: "conversation.rename.title", defaultValue: "Renommer la conversation", bundle: .main),
                isPresented: Binding(
                    get: { sheetTargets.rename != nil },
                    set: { if !$0 { sheetTargets.rename = nil } }
                )
            ) {
                TextField(String(localized: "conversation.rename.placeholder", defaultValue: "Nom", bundle: .main), text: $renameText)
                Button(String(localized: "common.save", defaultValue: "Enregistrer", bundle: .main)) {
                    if let target = sheetTargets.rename {
                        Task { await conversationViewModel.renameConversation(conversationId: target.id, title: renameText) }
                    }
                    sheetTargets.rename = nil
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {
                    sheetTargets.rename = nil
                }
            }
            // Quitter — confirmé, comme depuis la fiche de la conversation ; le
            // départ suit le flux existant (`ConversationStore`, `.leave`).
            .alert(
                String(localized: "conversation.info.leave.title", defaultValue: "Quitter la conversation", bundle: .main),
                isPresented: Binding(
                    get: { sheetTargets.leaveTarget != nil },
                    set: { if !$0 { sheetTargets.leaveTarget = nil } }
                ),
                presenting: sheetTargets.leaveTarget
            ) { conversation in
                Button(String(localized: "conversation.info.leave.confirm", defaultValue: "Quitter", bundle: .main), role: .destructive) {
                    HapticFeedback.heavy()
                    leave(conversation)
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            } message: { _ in
                Text(String(localized: "conversation.info.leave.message", defaultValue: "Vous ne recevrez plus de messages. Votre historique restera lisible.", bundle: .main))
            }
            .sheet(item: $sheetTargets.reportTarget) { conversation in
                ReportMessageSheet(
                    accentColor: conversation.accentColor,
                    title: String(localized: "report.conversation.title", defaultValue: "Pourquoi signalez-vous cette conversation ?", bundle: .main)
                ) { type, reason in
                    report(conversation, type: type, reason: reason)
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showWidgetPreview) {
                WidgetPreviewView(onNewConversation: onNewConversation)
                    .environmentObject(conversationViewModel)
                    .modifier(MeeshyRouterInjection(router: router))
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .modifier(GlobalSearchCoverHost(isPresented: $showGlobalSearch, conversationViewModel: conversationViewModel, router: router))
    }

    private func leave(_ conversation: Conversation) {
        let viewModel = conversationViewModel
        Task {
            do {
                try await viewModel.store.apply(.leave, for: conversation.id)
                viewModel.conversationLeavesDetail.send(conversation.id)
            } catch {
                FeedbackToastManager.shared.showError(String(localized: "conversation.info.leave.error", defaultValue: "Erreur lors du départ de la conversation", bundle: .main))
            }
        }
    }

    private func report(_ conversation: Conversation, type: String, reason: String?) {
        Task { @MainActor in
            do {
                try await ReportService.shared.reportConversation(conversationId: conversation.id, reportType: type, reason: reason)
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "conversation.report.success", defaultValue: "Conversation signalée", bundle: .main))
            } catch {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "conversation.report.error", defaultValue: "Erreur lors du signalement", bundle: .main))
            }
            sheetTargets.reportTarget = nil
        }
    }
}
