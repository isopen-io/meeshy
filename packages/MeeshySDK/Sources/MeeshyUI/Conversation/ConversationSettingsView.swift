import SwiftUI
import Combine
import PhotosUI
import MeeshySDK

public struct ConversationSettingsView: View {
    @StateObject private var viewModel: ConversationSettingsViewModel
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }
    @Environment(\.dismiss) private var dismiss
    @Environment(\.meeshyPresenceResolver) private var presenceResolver

    @State private var avatarItem: PhotosPickerItem? = nil
    @State private var bannerItem: PhotosPickerItem? = nil
    @State private var showDeleteForMeAlert = false
    /// Les gestes rares (supprimer, quitter) sont rangés derrière « Plus » (épure #18078, règle 6).
    @State private var showMoreActions = false
    @State private var openNoteID: String?

    public var onUpdated: ((MeeshyConversation) -> Void)? = nil
    public var onLeft: (() -> Void)? = nil

    public init(
        conversation: MeeshyConversation,
        currentUserRole: MemberRole = .member,
        onUpdated: ((MeeshyConversation) -> Void)? = nil,
        onLeft: (() -> Void)? = nil
    ) {
        _viewModel = StateObject(wrappedValue: ConversationSettingsViewModel(
            conversation: conversation,
            currentUserRole: currentUserRole,
            imageUploader: UserService.shared,
            conversationService: ConversationService.shared
        ))
        self.onUpdated = onUpdated
        self.onLeft = onLeft
    }

    public var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                settingsHeader

                ScrollView {
                    VStack(spacing: MeeshySpacing.xl) {
                        visualSection
                        editSection

                        if viewModel.currentUserRole.hasMinimumRole(.admin) {
                            permissionsSection
                        }

                        membersSection

                        dangerSection
                    }
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.vertical, MeeshySpacing.lg)
                }
            }
        }
        .alert(String(localized: "conversation.settings.error.title", defaultValue: "Erreur", bundle: .module), isPresented: $viewModel.showError) {
            Button(String(localized: "common.ok", defaultValue: "OK", bundle: .module)) {}
        } message: {
            Text(viewModel.errorMessage ?? String(localized: "conversation.settings.error.default", defaultValue: "Une erreur s'est produite", bundle: .module))
        }
        .alert(String(localized: "conversation.settings.leave.confirm.title", defaultValue: "Quitter la conversation", bundle: .module), isPresented: $viewModel.showLeaveConfirm) {
            Button(String(localized: "conversation.settings.leave.button", defaultValue: "Quitter", bundle: .module), role: .destructive) {
                Task {
                    await viewModel.leaveConversation()
                    onLeft?()
                    dismiss()
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
        } message: {
            Text(String(localized: "conversation.settings.leave.confirm.message", defaultValue: "Vous ne recevrez plus de messages ; votre historique reste lisible.", bundle: .module))
        }
        .alert(String(localized: "conversation.settings.deleteForMe.confirm.title", defaultValue: "Supprimer pour moi ?", bundle: .module), isPresented: $showDeleteForMeAlert) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
            Button(String(localized: "conversation.settings.delete.button", defaultValue: "Supprimer", bundle: .module), role: .destructive) {
                Task {
                    try? await ConversationService.shared.deleteForMe(conversationId: viewModel.conversationId)
                    NotificationCoordinator.shared.removeConversation(viewModel.conversationId)
                    await CacheCoordinator.shared.conversations.invalidateAll()
                    onLeft?()
                    dismiss()
                }
            }
        } message: {
            Text(String(localized: "conversation.settings.deleteForMe.confirm.message", defaultValue: "Retirée définitivement de votre liste ; les autres membres ne sont pas affectés.", bundle: .module))
        }
        .alert(String(localized: "conversation.settings.delete.confirm.title", defaultValue: "Supprimer la conversation", bundle: .module), isPresented: $viewModel.showDeleteConversation) {
            Button(String(localized: "conversation.settings.delete.button", defaultValue: "Supprimer", bundle: .module), role: .destructive) {
                Task {
                    await viewModel.deleteConversationForAll()
                    onLeft?()
                    dismiss()
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
        } message: {
            Text(String(localized: "conversation.settings.delete.confirm.message", defaultValue: "Cette conversation sera fermée pour tous les membres. Plus personne ne pourra écrire.", bundle: .module))
        }
        .entityImagePickerFlow(pickerItem: $avatarItem, format: .avatar, accentColor: viewModel.accentColor, maxSizeKB: 500) { data in
            Task { await viewModel.uploadCompressedAvatar(data) }
        }
        .entityImagePickerFlow(pickerItem: $bannerItem, format: .banner, accentColor: viewModel.accentColor, maxSizeKB: 800) { data in
            Task { await viewModel.uploadCompressedBanner(data) }
        }
        .task {
            await viewModel.loadMembers()
        }
    }

    // MARK: - Header

    private var settingsHeader: some View {
        HStack {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module)) { dismiss() }
                .font(.system(size: 16, design: .rounded))
                .foregroundStyle(theme.textSecondary)

            Spacer()

            Text(String(localized: "conversation.settings.title", defaultValue: "Réglages", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold, design: .rounded))
                .foregroundStyle(theme.textPrimary)

            Spacer()

            Button {
                Task {
                    let updated = await viewModel.save()
                    if let updated {
                        onUpdated?(updated)
                        dismiss()
                    }
                }
            } label: {
                if viewModel.isSaving {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(MeeshyColors.indigo500)
                } else {
                    Text(String(localized: "common.save", defaultValue: "Enregistrer", bundle: .module))
                        .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold, design: .rounded))
                        .foregroundStyle(viewModel.hasChanges ? MeeshyColors.indigo500 : theme.textMuted)
                }
            }
            .disabled(!viewModel.hasChanges || viewModel.isSaving)
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.mdPlus)
        .background(theme.backgroundPrimary)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(theme.textMuted.opacity(0.2))
                .frame(height: 0.5)
        }
    }

    // MARK: - Visual Section (Hero Banner + Avatar)

    private var visualSection: some View {
        // Valeurs `@MainActor` (bundle localisé, couleurs theme/viewModel) hissées
        // hors des closures de label `PhotosPicker` (inférées `@Sendable`) : on les
        // capture en constantes Sendable pour éviter « main actor-isolated property
        // can not be referenced from a Sendable closure ».
        let bannerEditLabel = String(localized: "conversation.settings.banner.edit", defaultValue: "Modifier", bundle: .module)
        let avatarPencilColor = Color(hex: viewModel.accentColor)
        let avatarPencilBackground = theme.backgroundPrimary
        return VStack(spacing: 0) {
            ZStack(alignment: .bottomTrailing) {
                bannerView
                    .frame(height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))

                PhotosPicker(selection: $bannerItem, matching: .images) {
                    Label(bannerEditLabel, systemImage: "photo.fill")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .padding(.vertical, MeeshySpacing.xsPlus)
                        .background(Capsule().fill(Color.black.opacity(0.5)))
                }
                .disabled(viewModel.isUploadingBanner)
                .padding(MeeshySpacing.sm)

                if viewModel.isUploadingBanner {
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .fill(Color.black.opacity(0.4))
                        .frame(height: 120)
                        .overlay(ProgressView().tint(.white))
                }
            }

            ZStack(alignment: .bottomTrailing) {
                MeeshyAvatar(
                    name: viewModel.title.isEmpty ? viewModel.conversationName : viewModel.title,
                    context: .profileSheet,
                    kind: .entity,
                    accentColor: viewModel.accentColor,
                    avatarURL: viewModel.avatarUrl.isEmpty ? nil : viewModel.avatarUrl
                )
                .overlay(
                    Circle()
                        .stroke(theme.backgroundPrimary, lineWidth: 4)
                )

                PhotosPicker(selection: $avatarItem, matching: .images) {
                    Image(systemName: "pencil.circle.fill")
                        .font(.system(size: MeeshyIconSize.xxxl))
                        .foregroundColor(avatarPencilColor)
                        .background(Circle().fill(avatarPencilBackground))
                }
                .disabled(viewModel.isUploadingAvatar)
                .offset(x: 4, y: 4)

                if viewModel.isUploadingAvatar {
                    Circle()
                        .fill(Color.black.opacity(0.4))
                        .frame(width: 80, height: 80)
                        .overlay(ProgressView().tint(.white))
                }
            }
            .offset(y: -40)
            .padding(.bottom, -40)

            Text(viewModel.title.isEmpty ? viewModel.conversationName : viewModel.title)
                .meeshyScaledFont(MeeshyFont.subtitleSize, weight: .bold, design: .rounded)
                .foregroundStyle(theme.textPrimary)
                .padding(.top, MeeshySpacing.sm)
        }
    }

    @ViewBuilder
    private var bannerView: some View {
        if !viewModel.bannerUrl.isEmpty {
            // CachedAsyncImage (DiskCacheStore persistant) plutôt qu'AsyncImage :
            // la bannière n'est téléchargée qu'une fois par installation.
            // showsStatusOverlays: false — echec silencieux vers le gradient
            // deja fourni ; pas de bouton retry sur une banniere decorative.
            CachedAsyncImage(url: viewModel.bannerUrl, showsStatusOverlays: false) {
                bannerPlaceholder
            }
            .scaledToFill()
        } else {
            bannerPlaceholder
        }
    }

    private var bannerPlaceholder: some View {
        LinearGradient(
            colors: [Color(hex: viewModel.accentColor).opacity(0.6), Color(hex: viewModel.accentColor).opacity(0.2)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Edit Section

    private var editSection: some View {
        VStack(spacing: MeeshySpacing.lg) {
            sectionHeader(String(localized: "conversation.settings.section.info", defaultValue: "Infos", bundle: .module))

            VStack(spacing: MeeshySpacing.md) {
                settingsField(label: String(localized: "conversation.settings.field.title", defaultValue: "Titre", bundle: .module)) {
                    TextField(String(localized: "conversation.settings.field.title.placeholder", defaultValue: "Titre de la conversation", bundle: .module), text: $viewModel.title)
                        .font(MeeshyFont.relative(MeeshyFont.calloutSize, design: .rounded))
                        .foregroundStyle(theme.textPrimary)
                }

                settingsField(label: String(localized: "conversation.settings.field.description", defaultValue: "Description", bundle: .module)) {
                    TextField(String(localized: "conversation.settings.field.description", defaultValue: "Description", bundle: .module), text: $viewModel.descriptionText, axis: .vertical)
                        .font(MeeshyFont.relative(MeeshyFont.calloutSize, design: .rounded))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(3...6)
                }
            }
        }
    }

    // MARK: - Permissions Section

    private var permissionsSection: some View {
        VStack(spacing: MeeshySpacing.lg) {
            sectionHeader(String(localized: "conversation.settings.section.permissions", defaultValue: "Permissions", bundle: .module))

            VStack(spacing: MeeshySpacing.md) {
                settingsField(label: String(localized: "conversation.settings.permissions.writeRole", defaultValue: "Qui peut écrire", bundle: .module)) {
                    Picker("", selection: $viewModel.defaultWriteRole) {
                        Text(String(localized: "conversation.settings.permissions.writeRole.everyone", defaultValue: "Tout le monde", bundle: .module)).tag("everyone")
                        Text(String(localized: "conversation.settings.permissions.writeRole.members", defaultValue: "Membres", bundle: .module)).tag("member")
                        Text(String(localized: "conversation.settings.permissions.writeRole.moderators", defaultValue: "Modérateurs", bundle: .module)).tag("moderator")
                        Text(String(localized: "conversation.settings.permissions.writeRole.admins", defaultValue: "Admins", bundle: .module)).tag("admin")
                    }
                    .pickerStyle(.segmented)
                    .disabled(viewModel.isAnnouncementChannel)
                }

                HStack {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        MeeshyInfoNoted(note: ConversationSettingsNotes.announcement, openNoteID: $openNoteID, tint: theme.textMuted) {
                            Text(String(localized: "conversation.settings.permissions.announcement", defaultValue: "Mode annonce", bundle: .module))
                                .meeshyScaledFont(MeeshyFont.labelSize, weight: .medium, design: .rounded)
                                .foregroundStyle(theme.textPrimary)
                        }
                        Text(String(localized: "conversation.settings.permissions.announcement.rule", defaultValue: "Seuls les admins écrivent.", bundle: .module))
                            .meeshyScaledFont(MeeshyFont.footnoteSize, weight: .regular, design: .rounded)
                            .foregroundStyle(theme.textMuted)
                    }
                    Spacer()
                    Toggle(String(localized: "conversation.settings.permissions.announcement", defaultValue: "Mode annonce", bundle: .module), isOn: $viewModel.isAnnouncementChannel)
                        .labelsHidden()
                        .tint(Color(hex: viewModel.accentColor))
                }
                .padding(MeeshySpacing.md)
                .background(theme.backgroundSecondary.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))

                settingsField(
                    label: String(localized: "conversation.settings.permissions.slowMode", defaultValue: "Mode lent", bundle: .module),
                    note: ConversationSettingsNotes.slowMode
                ) {
                    Picker("", selection: $viewModel.slowModeSeconds) {
                        Text(String(localized: "conversation.settings.permissions.slowMode.off", defaultValue: "Désactivé", bundle: .module)).tag(0)
                        Text("10s").tag(10)
                        Text("30s").tag(30)
                        Text(String(localized: "conversation.settings.slowmode.1min", defaultValue: "1 min", bundle: .module)).tag(60)
                        Text(String(localized: "conversation.settings.slowmode.5min", defaultValue: "5 min", bundle: .module)).tag(300)
                    }
                    .pickerStyle(.segmented)
                }

                HStack {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(String(localized: "conversation.settings.permissions.autoTranslate", defaultValue: "Traduction automatique", bundle: .module))
                            .meeshyScaledFont(MeeshyFont.labelSize, weight: .medium, design: .rounded)
                            .foregroundStyle(theme.textPrimary)
                        Text(String(localized: "conversation.settings.permissions.autoTranslate.subtitle", defaultValue: "Chacun lit les messages dans sa langue.", bundle: .module))
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, design: .rounded))
                            .foregroundStyle(theme.textMuted)
                    }
                    Spacer()
                    Toggle("", isOn: $viewModel.autoTranslateEnabled)
                        .labelsHidden()
                        .tint(Color(hex: viewModel.accentColor))
                }
                .padding(MeeshySpacing.md)
                .background(theme.backgroundSecondary.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
            }
        }
    }

    // MARK: - Members Section

    private var membersSection: some View {
        VStack(spacing: MeeshySpacing.lg) {
            sectionHeader(String(format: String(localized: "conversation.settings.section.members", defaultValue: "Membres (%d)", bundle: .module), viewModel.totalMemberCount))

            VStack(spacing: 0) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: MeeshyIconSize.xs, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                    TextField(String(localized: "conversation.settings.members.search.placeholder", defaultValue: "Rechercher un membre...", bundle: .module), text: $viewModel.memberSearchText)
                        .meeshyScaledFont(MeeshyFont.labelSize, design: .rounded)
                        .foregroundStyle(theme.textPrimary)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    if !viewModel.memberSearchText.isEmpty {
                        Button { viewModel.memberSearchText = "" } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: MeeshyIconSize.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                        .accessibilityLabel(String(localized: "common.clear_input", bundle: .module))
                    }
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.smPlus)

                if viewModel.isLoadingMembers && viewModel.participants.isEmpty {
                    ProgressView()
                        .padding(.vertical, MeeshySpacing.xl)
                } else {
                    let filtered = filteredMembers
                    if filtered.isEmpty {
                        Text(String(localized: "conversation.settings.members.empty", defaultValue: "Aucun membre trouvé", bundle: .module))
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium, design: .rounded))
                            .foregroundStyle(theme.textMuted)
                            .padding(.vertical, MeeshySpacing.xl)
                    } else {
                        ForEach(Array(filtered.enumerated()), id: \.element.id) { index, participant in
                            memberRow(participant)
                            if index < filtered.count - 1 {
                                Divider().padding(.leading, 60).opacity(0.4)
                            }
                        }
                    }
                }
            }
            .background(theme.backgroundSecondary.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        }
    }

    private var filteredMembers: [APIParticipant] {
        let query = viewModel.memberSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return viewModel.participants }
        return viewModel.participants.filter { $0.name.lowercased().contains(query) }
    }

    private func memberRow(_ participant: APIParticipant) -> some View {
        let displayName = participant.name
        let role = MemberRole(rawValue: participant.effectiveRole) ?? .member

        return HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(
                name: displayName,
                context: .userListItem,
                accentColor: DynamicColorGenerator.colorForName(displayName),
                avatarURL: participant.resolvedAvatar,
                presenceState: presenceResolver?(participant.userId ?? participant.id)
                    ?? participant.isOnline.map { UserPresence(isOnline: $0, lastActiveAt: participant.lastActiveAt).state },
                ring: participant.avatarRing
            )
            .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
            .clipShape(Circle())

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(displayName)
                    .meeshyScaledFont(MeeshyFont.labelSize, weight: .semibold, design: .rounded)
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                memberRoleBadge(role)
            }

            Spacer()

            if viewModel.currentUserRole > role {
                Menu {
                    memberActions(for: participant, targetRole: role)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: MeeshyIconSize.xs, weight: .semibold))
                        .foregroundStyle(theme.textMuted)
                        .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
                        .contentShape(Circle())
                        .meeshyTapTarget()
                        .padding(-MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.compact))
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    @ViewBuilder
    private func memberRoleBadge(_ role: MemberRole) -> some View {
        switch role {
        case .creator:
            HStack(spacing: MeeshySpacing.xxs) {
                Image(systemName: "crown.fill").meeshyScaledFont(MeeshyIconSize.xxs)
                Text(String(localized: "conversation.role.creator", defaultValue: "Créateur", bundle: .module)).font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            }.foregroundStyle(MeeshyColors.tileSaffron)
        case .admin:
            HStack(spacing: MeeshySpacing.xxs) {
                Image(systemName: "shield.fill").meeshyScaledFont(MeeshyIconSize.xxs)
                Text(String(localized: "conversation.role.admin", defaultValue: "Admin", bundle: .module)).font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            }.foregroundStyle(MeeshyColors.blue500)
        case .moderator:
            HStack(spacing: MeeshySpacing.xxs) {
                Image(systemName: "checkmark.shield.fill").meeshyScaledFont(MeeshyIconSize.xxs)
                Text(String(localized: "conversation.role.moderator", defaultValue: "Modérateur", bundle: .module)).font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            }.foregroundStyle(MeeshyColors.success)
        case .member:
            EmptyView()
        }
    }

    /// Les trois routes de gestion (`…/role`, `DELETE …/participants/:userId`,
    /// `…/ban`) filtrent sur la colonne `userId`. Ce menu passait
    /// `participant.id` — un `Participant.id` — aux deux premières : promouvoir
    /// répondait 404, retirer répondait 200 **sans rien faire**.
    ///
    /// Un visiteur SANS COMPTE n'a pas de `User.id` : aucune des trois ne peut
    /// l'atteindre, donc aucune ne lui est proposée. Ses droits se pilotent par
    /// `/participants/:participantId/rights`, qui attend l'AUTRE identifiant.
    @ViewBuilder
    private func memberActions(for participant: APIParticipant, targetRole: MemberRole) -> some View {
        // Expulser et bannir visent une CLÉ : `User.id` pour un compte,
        // `Participant.id` pour un visiteur venu par un lien partagé. Le gateway
        // résout la cible sous les deux colonnes, donc les deux gestes sont
        // offerts à tout le monde.
        //
        // Changer un RANG, non : cette route-là n'est adressée que par `User.id`,
        // et promouvoir un visiteur de passage n'a pas de sens produit — ses
        // droits d'écriture se pilotent par `…/participants/:participantId/rights`.
        let targetKey = participant.userId ?? participant.id
        if let accountId = participant.userId {
            if viewModel.currentUserRole == .creator && targetRole < .admin {
                Button { Task { await viewModel.updateRole(userId: accountId, newRole: "ADMIN") } } label: {
                    Label(String(localized: "conversation.settings.member.promoteAdmin", defaultValue: "Promouvoir admin", bundle: .module), systemImage: "shield.fill")
                }
            }
            if viewModel.currentUserRole.hasMinimumRole(.admin) && targetRole == .member {
                Button { Task { await viewModel.updateRole(userId: accountId, newRole: "MODERATOR") } } label: {
                    Label(String(localized: "conversation.settings.member.promoteModerator", defaultValue: "Promouvoir modérateur", bundle: .module), systemImage: "checkmark.shield.fill")
                }
            }
            if viewModel.currentUserRole > targetRole && targetRole > .member {
                Button { Task { await viewModel.updateRole(userId: accountId, newRole: "MEMBER") } } label: {
                    Label(String(localized: "conversation.settings.member.demoteMember", defaultValue: "Rétrograder en membre", bundle: .module), systemImage: "person.fill")
                }
            }
        }
        Button(role: .destructive) { Task { await viewModel.expelParticipant(key: targetKey) } } label: {
            Label(String(localized: "conversation.settings.member.expel", defaultValue: "Expulser", bundle: .module), systemImage: "person.fill.xmark")
        }
        // Bannir ET lever, sous la MÊME condition de rang : depuis #4176 la
        // passerelle applique une seule loi aux deux sens. Offrir l'un sans
        // l'autre laissait un geste sans marche arrière.
        if viewModel.currentUserRole.hasMinimumRole(.moderator) {
            if participant.bannedAt == nil {
                Button(role: .destructive) { Task { await viewModel.banParticipant(key: targetKey) } } label: {
                    Label(String(localized: "conversation.settings.member.ban", defaultValue: "Bannir", bundle: .module), systemImage: "hand.raised.fill")
                }
            } else {
                Button { Task { await viewModel.unbanParticipant(key: targetKey) } } label: {
                    Label(String(localized: "conversation.settings.member.unban", defaultValue: "Lever le bannissement", bundle: .module), systemImage: "hand.raised.slash.fill")
                }
            }
        }
    }

    // MARK: - Danger Section

    private var dangerSection: some View {
        VStack(spacing: MeeshySpacing.md) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showMoreActions.toggle() }
            } label: {
                HStack {
                    Text(String(localized: "conversation.settings.more", defaultValue: "Plus", bundle: .module))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold, design: .rounded))
                        .foregroundStyle(theme.textMuted)
                    Spacer()
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundStyle(theme.textMuted)
                        .rotationEffect(.degrees(showMoreActions ? 90 : 0))
                        .accessibilityHidden(true)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(showMoreActions ? [.isButton, .isSelected] : .isButton)

            if showMoreActions {
                moreActions
            }
        }
    }

    @ViewBuilder
    private var moreActions: some View {
            Button(role: .destructive) {
                showDeleteForMeAlert = true
            } label: {
                HStack {
                    Image(systemName: "eye.slash")
                    Text(String(localized: "conversation.settings.deleteForMe.label", defaultValue: "Supprimer pour moi", bundle: .module))
                }
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(MeeshyColors.error)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.mdPlus)
                .background(MeeshyColors.error.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
            }

            if viewModel.currentUserRole == .creator {
                Button {
                    viewModel.showDeleteConversation = true
                } label: {
                    HStack {
                        Image(systemName: "trash.fill")
                        Text(String(localized: "conversation.settings.deleteForAll.label", defaultValue: "Supprimer pour tous", bundle: .module))
                    }
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(MeeshyColors.error)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.mdPlus)
                    .background(MeeshyColors.error.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
                }
            } else {
                Button {
                    viewModel.showLeaveConfirm = true
                } label: {
                    HStack {
                        Image(systemName: "arrow.forward.square.fill")
                        Text(String(localized: "conversation.settings.leave.label", defaultValue: "Quitter la conversation", bundle: .module))
                    }
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.orange)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.mdPlus)
                    .background(Color.orange.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
                }
            }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold, design: .rounded))
            .foregroundStyle(theme.textMuted)
            .textCase(.uppercase)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func settingsField<Content: View>(label: String, note: MeeshyInfoNote? = nil, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            MeeshyInfoNoted(note: note, openNoteID: $openNoteID, tint: theme.textSecondary) {
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold, design: .rounded))
                    .foregroundStyle(theme.textSecondary)
            }
            content()
                .textFieldStyle(.plain)
                .padding(MeeshySpacing.md)
                .background(theme.backgroundSecondary.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
        }
    }
}
