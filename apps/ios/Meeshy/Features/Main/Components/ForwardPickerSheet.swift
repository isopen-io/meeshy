import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - ForwardPickerSheet

/// Picker de transfert hybride (spec 2026-08-19, Volet A.6/A.8) :
/// - toucher une LIGNE = sélectionner (mode multi) → barre basse « Envoyer (N) » ;
/// - le bouton en fin de ligne = envoi IMMÉDIAT à cette seule cible (et retire
///   la ligne de la sélection si elle y était — jamais de doublon au batch) ;
/// - une cible servie n'est plus sélectionnable ; un échec affiche sa RAISON
///   et se réessaie.
///
/// La liste est pilotée par `ForwardPickerViewModel` (pagination par curseur
/// + recherche serveur conversations/contacts, `ForwardTarget` fusionnés) —
/// une cible peut donc être une conversation existante OU un contact SANS
/// conversation encore ouverte. L'envoi passe par `MessageForwardService`
/// (chemin unique, offline compris) ; c'est LUI qui résout — et au besoin crée
/// — la conversation directe d'un contact, à l'envoi et jamais à la sélection.
struct ForwardPickerSheet: View {
    let message: Message
    let sourceConversationId: String
    let accentColor: String
    var onOpenConversation: ((Conversation) -> Void)? = nil
    let onDismiss: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel

    @StateObject private var pickerModel = ForwardPickerViewModel()
    /// Machine à états PAR LIGNE (idle/selected/sending/sent/failed), keyée
    /// sur `ForwardTarget.id` — distincte de `pickerModel`, qui pilote la
    /// LISTE (pagination/recherche).
    @State private var sendState = ForwardPickerModel()
    /// Première cible servie — retenue pour que la confirmation posée À LA
    /// FERMETURE sache quelle conversation ouvrir. Construite depuis l'id
    /// RÉSOLU que `ForwardOutcome` transporte (`perform(_:)`), donc peuplée
    /// même pour un contact dont la conversation vient d'être créée.
    @State private var firstServedConversation: Conversation?
    @State private var successToastFired = false

    private var forwardService: MessageForwardServiceProviding { MessageForwardService.shared }

    /// La conversation SOURCE du message ne doit jamais apparaître comme
    /// cible — transférer un message dans sa propre conversation n'a pas de
    /// sens. Un contact (pas encore de conversation) n'est jamais concerné.
    private var visibleTargets: [ForwardTarget] {
        pickerModel.targets.filter { $0.conversationId != sourceConversationId }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                messagePreview

                Divider()
                    .overlay(theme.textMuted.opacity(0.2))

                if isColdStartLoading {
                    Spacer()
                    ProgressView()
                        .tint(Color(hex: accentColor))
                    Spacer()
                } else if visibleTargets.isEmpty && loadFailed {
                    // Cold-start load failure — distinct from a genuinely empty
                    // list so the user gets a recoverable Retry rather than a
                    // misleading "no conversations". Reuses the conversation-list
                    // error copy (identical operation), already localized.
                    EmptyStateView(
                        icon: "wifi.slash",
                        title: String(localized: "conversations.error.title", defaultValue: "Une erreur est survenue", bundle: .main),
                        subtitle: String(localized: "conversations.error.subtitle", defaultValue: "Impossible de charger vos conversations.", bundle: .main),
                        actionLabel: String(localized: "conversations.error.retry", defaultValue: "Réessayer", bundle: .main),
                        accentColor: accentColor,
                        compact: true,
                        onAction: { Task { await pickerModel.loadInitial() } }
                    )
                } else if visibleTargets.isEmpty {
                    EmptyStateView(
                        icon: "bubble.left.and.bubble.right",
                        title: String(localized: "forward.empty", defaultValue: "Aucune conversation", bundle: .main),
                        subtitle: String(localized: "forward.empty.subtitle", defaultValue: "Rejoignez ou démarrez une conversation pour y transférer des messages.", bundle: .main),
                        accentColor: accentColor,
                        compact: true
                    )
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(visibleTargets) { target in
                                targetRow(target)
                            }

                            // Sentinelle de pagination — inactive pendant une
                            // recherche : `pickerModel.targets` y contient des
                            // résultats fusionnés (conversations + contacts),
                            // pas la page en cours, et enchaîner `loadMore()`
                            // par-dessus viderait/écraserait le filtre.
                            if pickerModel.hasMore, pickerModel.paginationState == .idle, pickerModel.searchText.isEmpty {
                                Color.clear
                                    .frame(height: 1)
                                    .onAppear { Task { await pickerModel.loadMore() } }
                            }
                        }
                    }
                }
            }
            .background(theme.backgroundPrimary)
            .safeAreaInset(edge: .bottom) { batchSendBar }
            .navigationTitle(String(localized: "forward.title", defaultValue: "Forward", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Close", bundle: .main)) {
                        dismiss()
                        onDismiss()
                    }
                }
            }
            .searchable(text: $pickerModel.searchText, prompt: String(localized: "forward.search-placeholder", defaultValue: "Search a conversation", bundle: .main))
            .adaptiveOnChange(of: pickerModel.searchText) { _, newValue in
                Task { await pickerModel.search(newValue) }
            }
        }
        .task {
            await pickerModel.loadInitial()
        }
        .withStatusBubble()
        // Seul site d'émission du toast succès : la feuille est PARTIE, donc
        // le toast racine est visible et tappable. Couvre les deux sorties —
        // bouton « Fermer » et glissé vers le bas.
        .onDisappear { fireDeferredSuccessToast() }
    }

    // MARK: - Message Preview (thin, like reply banner)

    private var messagePreview: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color(hex: accentColor))
                .frame(width: 3, height: 28)

            if let firstAttachment = message.attachments.first {
                attachmentThumbnail(firstAttachment)
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(message.senderName ?? "?")
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .lineLimit(1)

                Text(previewText)
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)

            Spacer(minLength: 0)

            Button {
                dismiss()
                onDismiss()
            } label: {
                // Chrome close glyph in a thin preview banner — kept fixed per chrome doctrine 82i.
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.02))
    }

    /// Aperçu digne d'un média : type localisé + compteur, plus jamais « [Media] ».
    private var previewText: String {
        if !message.content.isEmpty { return message.content }
        guard let first = message.attachments.first else {
            return String(localized: "forward.media-placeholder", defaultValue: "[Media]", bundle: .main)
        }
        let kindLabel: String
        switch first.kind {
        case .image:
            kindLabel = String(localized: "forward.preview.image", defaultValue: "Photo", bundle: .main)
        case .video:
            kindLabel = String(localized: "forward.preview.video", defaultValue: "Vidéo", bundle: .main)
        case .audio:
            kindLabel = String(localized: "forward.preview.audio", defaultValue: "Audio", bundle: .main)
        default:
            kindLabel = String(localized: "forward.preview.file", defaultValue: "Fichier", bundle: .main)
        }
        let count = message.attachments.count
        return count > 1 ? "\(kindLabel) · \(count)" : kindLabel
    }

    @ViewBuilder
    private func attachmentThumbnail(_ attachment: MessageAttachment) -> some View {
        let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
        let fullUrl = attachment.type == .image && !attachment.fileUrl.isEmpty ? attachment.fileUrl : nil
        if thumbUrl != nil || fullUrl != nil || attachment.thumbHash != nil {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: thumbUrl,
                fullUrl: fullUrl ?? thumbUrl
            ) {
                Color(hex: accentColor).opacity(0.3)
            }
            .aspectRatio(contentMode: .fill)
            .frame(width: 28, height: 28)
            .clipShape(RoundedRectangle(cornerRadius: 5))
        }
    }

    // MARK: - Loading state

    private var isColdStartLoading: Bool {
        pickerModel.targets.isEmpty && pickerModel.paginationState == .loadingMore
    }

    private var loadFailed: Bool {
        if case .error = pickerModel.paginationState { return true }
        return false
    }

    // MARK: - Target Row

    /// Les lectures de singleton (thème via `ForwardPickerRow`, statuts via
    /// `statusViewModel`) restent ICI : la rangée ne reçoit que des VALEURS,
    /// condition de son portillon `.equatable()`.
    private func targetRow(_ target: ForwardTarget) -> some View {
        ForwardPickerRow(
            id: target.id,
            name: target.title,
            typeLabel: target.subtitle ?? "",
            memberCount: 0,
            avatarURL: target.avatarURL,
            avatarAccentHex: DynamicColorGenerator.colorForName(target.title),
            favoriteEmoji: nil,
            moodEmoji: target.userId.flatMap { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
            accentHex: accentColor,
            isDark: isDark,
            state: sendState.state(of: target.id),
            onTap: {
                // Tap de LIGNE = sélection (no-op sur une cible servie/en cours).
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    sendState.tapRow(target.id)
                }
                HapticFeedback.light()
            },
            onSend: { send(target) },
            onMoodTap: target.userId.flatMap { statusViewModel.moodTapHandler(for: $0) }
        )
        .equatable()
    }

    // MARK: - Batch Send Bar

    @ViewBuilder
    private var batchSendBar: some View {
        if sendState.hasSelection {
            Button {
                batchSend()
            } label: {
                Text(String(format: String(localized: "forward.send-selected", defaultValue: "Envoyer (%d)", bundle: .main), sendState.selectedIds.count))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(Color(hex: accentColor)))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    // MARK: - Actions

    /// Envoi immédiat à UNE cible (bouton par-ligne, ou une étape du batch).
    private func send(_ target: ForwardTarget) {
        guard sendState.beginSend(target.id) else { return }
        Task { await perform(target) }
    }

    /// Envoi groupé aux cibles sélectionnées, en séquence — les cibles déjà
    /// servies en sont exclues par construction (`ForwardPickerModel`).
    private func batchSend() {
        let ids = withAnimation { sendState.beginBatch() }
        let targets = ids.compactMap { id in visibleTargets.first(where: { $0.id == id }) }
        Task {
            for target in targets { await perform(target) }
        }
    }

    /// Résolution ET envoi passent tous les deux par `MessageForwardService` —
    /// une conversation déjà connue (`target.conversationId`) part
    /// directement ; un contact sans conversation en obtient une, créée par
    /// le service AU MOMENT DE CET APPEL, jamais avant (invariant produit :
    /// sélectionner un contact puis fermer la feuille ne crée rien).
    ///
    /// `.sent`/`.queuedOffline` transportent le `conversationId` RÉSOLU (round
    /// 1 code review) — celui qui existait déjà, ou celui que le service vient
    /// de créer pour un contact. `firstServedConversation` se construit donc
    /// TOUJOURS à partir de cet id renvoyé, jamais de `target.conversationId`
    /// (`nil` pour un contact) : sans ça, le toast n'aurait jamais été
    /// actionnable pour une conversation tout juste créée.
    private func perform(_ target: ForwardTarget) async {
        let outcome = await forwardService.forward(
            message: message,
            sourceConversationId: sourceConversationId,
            to: target
        )
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            sendState.finishSend(target.id, succeeded: outcome.succeeded, reason: outcome.failureReason)
        }
        switch outcome {
        case .sent(let conversationId), .queuedOffline(let conversationId):
            HapticFeedback.success()
            if firstServedConversation == nil {
                firstServedConversation = Conversation(
                    id: conversationId,
                    identifier: conversationId,
                    type: .direct,
                    title: target.title,
                    avatar: target.avatarURL,
                    participantUserId: target.userId
                )
            }
        case .failed:
            HapticFeedback.error()
        }
    }

    /// Confirmation succès DIFFÉRÉE à la fermeture de la feuille.
    ///
    /// Le toast est rendu par l'overlay RACINE (`MeeshyApp`), qu'une feuille
    /// présentée RECOUVRE : au détent `.large` il est invisible, au détent
    /// `.medium` il tombe dans la zone assombrie où un tap referme la feuille
    /// au lieu d'invoquer l'action — c'est déjà la raison pour laquelle les
    /// ÉCHECS s'affichent in-sheet (cf. `sendControl`). Le succès se voit donc
    /// in-sheet, ligne par ligne, via la pastille « Transféré » ; le toast
    /// tappable — seul chemin vers « ouvrir la cible » (spec A.5), y compris
    /// une conversation tout juste créée pour un contact — n'est émis qu'une
    /// fois la feuille partie. Un seul toast par ouverture, sur la PREMIÈRE
    /// cible servie.
    private func fireDeferredSuccessToast() {
        guard !successToastFired, let conv = firstServedConversation else { return }
        successToastFired = true
        let title = String(localized: "forward.success", defaultValue: "Message transféré", bundle: .main)
        guard let onOpenConversation else {
            FeedbackToastManager.shared.showSuccess(title)
            return
        }
        FeedbackToastManager.shared.show(title, type: .success) {
            onOpenConversation(conv)
        }
    }
}

// MARK: - ForwardPickerRow

/// Rangée du picker, sous-vue `Equatable` à entrées de VALEUR.
///
/// Sans elle, un seul changement d'état — une cible qui passe `sending` →
/// `sent` — réévaluait le corps de TOUTES les lignes matérialisées : le
/// `@State model` vit dans le parent, et l'envoi groupé enchaîne autant de
/// mutations qu'il y a de cibles. Doctrine « Zero Unnecessary Re-render »
/// (apps/ios/CLAUDE.md).
///
/// Les closures sont exclues de `==` : recréées à chaque passe du parent,
/// elles rendraient toute comparaison fausse et le portillon inopérant.
/// `isDark` en fait partie à l'inverse — sinon un basculement de thème
/// laisserait la ligne figée dans les couleurs de l'ancien mode. Même idiome
/// que `DirectoryPersonRow`.
struct ForwardPickerRow: View, Equatable {
    let id: String
    let name: String
    let typeLabel: String
    let memberCount: Int
    let avatarURL: String?
    let avatarAccentHex: String
    let favoriteEmoji: String?
    let moodEmoji: String?
    let accentHex: String
    let isDark: Bool
    let state: ForwardPickerModel.TargetState
    let onTap: () -> Void
    let onSend: () -> Void
    let onMoodTap: ((CGPoint) -> Void)?

    private var theme: ThemeManager { ThemeManager.shared }

    static func == (lhs: ForwardPickerRow, rhs: ForwardPickerRow) -> Bool {
        lhs.id == rhs.id
            && lhs.name == rhs.name
            && lhs.typeLabel == rhs.typeLabel
            && lhs.memberCount == rhs.memberCount
            && lhs.avatarURL == rhs.avatarURL
            && lhs.avatarAccentHex == rhs.avatarAccentHex
            && lhs.favoriteEmoji == rhs.favoriteEmoji
            && lhs.moodEmoji == rhs.moodEmoji
            && lhs.accentHex == rhs.accentHex
            && lhs.isDark == rhs.isDark
            && lhs.state == rhs.state
    }

    /// Le nom PRONONCÉ est celui qui est AFFICHÉ (`name`), jamais une autre
    /// source : c'est le contrat « Label in Name » (WCAG 2.5.3), qui fait de
    /// « Transférer à Maman » une commande Voice Control valide.
    ///
    /// Ces deux libellés se composaient auparavant depuis une entrée distincte
    /// repliée sur « cette conversation ». Toutes les conversations directes —
    /// l'essentiel d'un picker de transfert — y tombaient : leurs boutons
    /// d'envoi annonçaient TOUS la même chose, et VoiceOver ne permettait plus
    /// de distinguer la cible qu'on s'apprêtait à servir.
    static func sendAccessibilityLabel(name: String) -> String {
        String(format: String(localized: "forward.send-a11y", defaultValue: "Transférer à %@", bundle: .main), name)
    }

    static func retrySendAccessibilityLabel(name: String) -> String {
        String(format: String(localized: "forward.retry-send-a11y", defaultValue: "Réessayer le transfert à %@", bundle: .main), name)
    }

    /// Compteur pluralisé « • N membres » — le pluriel est choisi par le
    /// catalogue (`variations.plural`), pas gravé dans la chaîne. La ligne
    /// n'affichait le compteur qu'à `memberCount > 0`, or le français range
    /// N = 1 dans le SINGULIER : sans variation, une conversation à un seul
    /// membre lisait « • 1 membres ». Défaut mineur en apparence, mais lu par
    /// VoiceOver sur chaque ligne du picker (élément combiné) — c'est-à-dire
    /// répété autant de fois qu'il y a de cibles.
    ///
    /// `bundle` et `locale` vont par PAIRE (idiome `PostStatAccessibility`) :
    /// le bundle choisit la TABLE (`fr.lproj` / `en.lproj`), le locale choisit
    /// la RÈGLE plurielle. Fixer l'un sans l'autre rendrait le test vert en
    /// local (simu français) et rouge en CI (simu anglais).
    static func membersCountLabel(_ count: Int,
                                  bundle: Bundle = .main,
                                  locale: Locale = .current) -> String {
        String(
            format: String(
                localized: "forward.members-count",
                defaultValue: "\u{2022} %d membres",
                bundle: bundle,
                locale: locale
            ),
            locale: locale,
            count
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: name,
                    context: .conversationList,
                    accentColor: avatarAccentHex,
                    avatarURL: avatarURL,
                    moodEmoji: moodEmoji,
                    onMoodTap: onMoodTap
                )

                VStack(alignment: .leading, spacing: 2) {
                    ConversationTitleLabel(
                        name: name,
                        favoriteEmoji: favoriteEmoji,
                        font: MeeshyFont.relative(15, weight: .medium),
                        color: theme.textPrimary
                    )

                    HStack(spacing: 4) {
                        Text(typeLabel)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textMuted)

                        if memberCount > 0 {
                            Text(Self.membersCountLabel(memberCount))
                                .font(MeeshyFont.relative(12))
                                .foregroundColor(theme.textMuted)
                        }
                    }
                }
                .accessibilityElement(children: .combine)

                Spacer()

                if state == .selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(MeeshyFont.relative(18))
                        .foregroundColor(Color(hex: accentHex))
                        .transition(.scale.combined(with: .opacity))
                        .accessibilityHidden(true)
                }

                sendControl
            }

            if case .failed(let reason) = state {
                // La RAISON du refus (ex. vue unique) — plus jamais un glyphe muet.
                Text(reason)
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(MeeshyColors.error)
                    .lineLimit(2)
                    .padding(.leading, 52)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(state == .selected ? Color(hex: accentHex).opacity(0.10) : Color.clear)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .accessibilityAddTraits(state == .selected ? .isSelected : [])
    }

    @ViewBuilder
    private var sendControl: some View {
        switch state {
        case .sent:
            Image(systemName: "checkmark.circle.fill")
                .font(.title2)
                .foregroundColor(MeeshyColors.success)
                .accessibilityLabel(String(localized: "forward.sent", defaultValue: "Transféré", bundle: .main))
        case .sending:
            ProgressView()
                .scaleEffect(0.8)
                .frame(width: 24, height: 24)
                .accessibilityLabel(String(localized: "forward.sending", defaultValue: "Envoi en cours", bundle: .main))
        case .failed:
            // Send failed — surface it in-sheet (a root toast renders behind the
            // sheet) as a tappable, recoverable retry. Error is signalled by the
            // glyph shape, not colour alone.
            Button(action: onSend) {
                Image(systemName: "exclamationmark.arrow.circlepath")
                    .font(MeeshyFont.relative(24))
                    .foregroundColor(MeeshyColors.error)
            }
            .accessibilityLabel(Self.retrySendAccessibilityLabel(name: name))
        case .idle, .selected:
            Button(action: onSend) {
                Image(systemName: "paperplane.circle.fill")
                    .font(MeeshyFont.relative(24))
                    .foregroundColor(Color(hex: accentHex))
            }
            .accessibilityLabel(Self.sendAccessibilityLabel(name: name))
        }
    }
}
