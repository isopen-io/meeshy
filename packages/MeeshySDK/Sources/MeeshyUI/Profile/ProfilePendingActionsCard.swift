import SwiftUI
import MeeshySDK

// MARK: - « 2 actions en attente » sur la Vitrine d'un autre, hors ligne (#19465, planche `Etat-HorsLigne`)
//
// Fait du kit : la carte de groupe (K43), son en-tête (K44), les rangées (K06) séparées par leurs filets, « Annuler »
// (K40), la note d'ordre (K46), puis « Réessayer » (K40). Rien ne se pose quand la file ne garde rien pour lui.

/// Le bloc et sa lecture de la file : il s'abonne à la personne, jamais à chaque rendu de la fiche.
struct ProfilePendingSection: View {
    let userId: String
    let name: String
    let queue: any ProfilePendingQueueProviding
    let tint: Color
    let onRetry: () -> Void

    @StateObject private var model = ProfilePendingModel()

    /// Hors ligne seulement, sur la fiche d'un autre, quand l'app fournit la file ; en ligne, rien.
    @ViewBuilder
    static func of(_ sheet: UserProfileSheet) -> some View {
        if sheet.showsRelationBlocks, sheet.talksOffline,
           let queue = sheet.dependencies.pendingQueue, let userId = sheet.resolvedUserId {
            ProfilePendingSection(userId: userId, name: sheet.displayUser.resolvedDisplayName, queue: queue,
                                  tint: sheet.accentTint, onRetry: { sheet.retryFromState() })
                .padding(.horizontal, MeeshySpacing.xl)
        }
    }

    var body: some View {
        // Un `ZStack` et son ancre, jamais un `Group` vide : sans enfant, la lecture de la file ne démarrerait pas.
        ZStack {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            if !model.actions.isEmpty {
                ProfilePendingActionsCard(
                    actions: model.actions, name: name, tint: tint,
                    onCancel: { action in Task { await model.cancel(action, queue: queue) } },
                    onRetry: {
                        onRetry()
                        Task { await model.retry(queue: queue) }
                    }
                )
            }
        }
        .task(id: userId) { await model.observe(userId: userId, queue: queue) }
    }
}

/// La carte : l'en-tête et son sablier, une rangée par action, la note d'ordre, puis « Réessayer » sous la carte.
struct ProfilePendingActionsCard: View {
    let actions: [ProfilePendingAction]
    let name: String
    let tint: Color
    let onCancel: (ProfilePendingAction) -> Void
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            MeeshyGroupCard {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    MeeshySectionHeader(title: ProfilePendingCopy.title(actions.count), size: .sheet,
                                        lead: { EmptyView() },
                                        accessory: {
                                            Image(systemName: "hourglass")
                                                .foregroundStyle(MeeshyColors.warning)
                                                .accessibilityHidden(true)
                                        })
                    MeeshyGroupCardRows(actions) { action in row(action) }
                    MeeshyNote(ProfilePendingCopy.order, lead: .systemImage("list.number"))
                }
                .padding(.vertical, MeeshySpacing.md)
            }
            MeeshyButton(ProfilePendingCopy.retry, systemImage: "arrow.clockwise", kind: .outline, width: .fill,
                         tint: tint, action: onRetry)
                .accessibilityIdentifier("profile.vitrine.pending.retry")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.vitrine.pending")
    }

    private func row(_ action: ProfilePendingAction) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            MeeshyToggleRowFace(
                content: MeeshyToggleRowContent(title: ProfilePendingCopy.messageTo(name),
                                                subtitle: ProfilePendingCopy.detail(action)),
                leading: { ProfilePendingGlyph(isFailed: action.isFailed) },
                titleAccessory: { MeeshyToggleRowNoSlot() },
                trailing: { MeeshyToggleRowNoSlot() }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ProfilePendingCopy.spoken(action, name: name))
            if action.isCancellable {
                MeeshyButton(ProfilePendingCopy.cancel, kind: .outline, size: .s44, action: { onCancel(action) })
                    .accessibilityHint(ProfilePendingCopy.cancelHint)
                    .accessibilityIdentifier("profile.vitrine.pending.cancel")
            }
        }
    }
}

/// La pastille d'attente de la rangée : l'horloge sur un disque d'avertissement, le triangle quand l'envoi a renoncé.
private struct ProfilePendingGlyph: View {
    let isFailed: Bool

    var body: some View {
        let color = isFailed ? MeeshyColors.error : MeeshyColors.warning
        Image(systemName: isFailed ? "exclamationmark.triangle" : "clock")
            .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: MeeshySpacing.xxl + MeeshySpacing.lg, height: MeeshySpacing.xxl + MeeshySpacing.lg)
            .background(Circle().fill(color.opacity(MeeshyOpacity.light)))
            .padding(.trailing, MeeshySpacing.md)
    }
}

/// Les mots du bloc.
enum ProfilePendingCopy {

    static func title(_ count: Int, locale: Locale = .current) -> String {
        let format = count == 1
            ? String(localized: "profile.vitrine.pending.title.one", defaultValue: "%@ action en attente", bundle: .module)
            : String(localized: "profile.vitrine.pending.title.other", defaultValue: "%@ actions en attente", bundle: .module)
        return String(format: format, count.formatted(.number.locale(locale)))
    }

    static func messageTo(_ name: String) -> String {
        String(format: String(localized: "profile.vitrine.pending.message", defaultValue: "Message à %@", bundle: .module),
               ProfileVitrineCopy.firstName(name))
    }

    /// Ce qui partira, cité ; à défaut le rang dans la file ; un envoi qui a renoncé le dit.
    static func detail(_ action: ProfilePendingAction, locale: Locale = .current) -> String? {
        if action.isFailed { return notSent }
        if let preview = action.preview {
            return action.isWrittenText ? quoted(preview) : preview
        }
        return action.rank.map { rank($0, locale: locale) }
    }

    static func rank(_ rank: Int, locale: Locale = .current) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .ordinal
        let ordinal = formatter.string(from: NSNumber(value: rank)) ?? String(rank)
        return String(format: String(localized: "profile.vitrine.pending.rank", defaultValue: "En %@ dans la file",
                                     bundle: .module), ordinal)
    }

    static func quoted(_ text: String) -> String {
        String(format: String(localized: "profile.vitrine.pending.quote", defaultValue: "« %@ »", bundle: .module), text)
    }

    /// « Message à Léo, « Tu es encore à Alfama ce soir ? », En 1er dans la file ».
    static func spoken(_ action: ProfilePendingAction, name: String, locale: Locale = .current) -> String {
        let rankText = action.isFailed || action.preview == nil ? nil : action.rank.map { rank($0, locale: locale) }
        return [messageTo(name), detail(action, locale: locale), rankText].compactMap { $0 }.joined(separator: ", ")
    }

    static var notSent: String {
        String(localized: "profile.vitrine.pending.notSent", defaultValue: "Pas parti · à réessayer", bundle: .module)
    }

    static var cancel: String {
        String(localized: "profile.vitrine.pending.cancel", defaultValue: "Annuler", bundle: .module)
    }

    static var cancelHint: String {
        String(localized: "profile.vitrine.pending.cancel.a11y", defaultValue: "Retire ce message de la file et du fil",
               bundle: .module)
    }

    static var order: String {
        String(localized: "profile.vitrine.pending.order",
               defaultValue: "Elles partiront au retour du réseau, dans l'ordre.", bundle: .module)
    }

    static var retry: String {
        String(localized: "profile.vitrine.pending.retry", defaultValue: "Réessayer", bundle: .module)
    }
}
