import SwiftUI
import MeeshySDK
import MeeshyUI

/// Accès rapides en QUEUE de la liste de conversations — et état vide quand
/// il n'y a aucune conversation (2026-08-21, directive user) : partager
/// l'application par un lien de parrainage, publier un post, écrire un
/// message, créer une story, poser un mood, créer un lien raccourci `/l/…`.
///
/// Deux rôles : des portes utiles quand le fil des conversations s'arrête,
/// et une HAUTEUR de queue (`minHeight`, une demi-région visible) qui laisse
/// la dernière conversation rejoindre la bande de focus au centre de l'écran
/// — sans elle, la magnificence ne pouvait jamais toucher la fin de la liste.
///
/// Vue PURE : elle publie l'action choisie, l'appelant (la liste) la route
/// vers les portes EXISTANTES (composeurs, feuilles de création) — aucune
/// navigation réinventée ici.
struct ConversationListQuickActions: View, Equatable {

    enum Action: CaseIterable, Equatable {
        case findMembers, myContacts, newMessage, story, mood, post, invite, shortcutLink

        var icon: String {
            switch self {
            case .findMembers: return "magnifyingglass"
            case .myContacts: return "person.crop.circle.badge.checkmark"
            case .newMessage: return "square.and.pencil"
            case .story: return "plus.circle.fill"
            case .mood: return "face.smiling"
            case .post: return "megaphone.fill"
            case .invite: return "person.badge.plus"
            case .shortcutLink: return "link.badge.plus"
            }
        }

        var title: String {
            switch self {
            case .findMembers: return String(localized: "conversations.quick.find_members", defaultValue: "Chercher des membres à qui écrire", bundle: .main)
            case .myContacts: return String(localized: "conversations.quick.my_contacts", defaultValue: "Voir mes contacts sur Meeshy", bundle: .main)
            case .newMessage: return String(localized: "conversations.quick.newMessage", defaultValue: "Nouveau message", bundle: .main)
            case .story: return String(localized: "conversations.quick.story", defaultValue: "Créer une story", bundle: .main)
            case .mood: return String(localized: "conversations.quick.mood", defaultValue: "Poser un mood", bundle: .main)
            case .post: return String(localized: "conversations.quick.post", defaultValue: "Publier un post", bundle: .main)
            case .invite: return String(localized: "conversations.quick.invite", defaultValue: "Inviter des amis", bundle: .main)
            case .shortcutLink: return String(localized: "conversations.quick.shortcutLink", defaultValue: "Lien raccourci", bundle: .main)
            }
        }

        /// Boîtes COLORÉES comme le Dashboard (`WidgetPreviewView.quickActionButton`) :
        /// une icône blanche sur un dégradé, ombre teintée.
        @MainActor var gradient: [Color] {
            switch self {
            case .findMembers: return [MeeshyColors.indigo500, MeeshyColors.indigo700]
            case .myContacts: return [MeeshyColors.success, MeeshyColors.indigo500]
            case .newMessage: return [MeeshyColors.indigo500, MeeshyColors.indigo700]
            case .story: return [MeeshyColors.purple500, MeeshyColors.purple700]
            case .mood: return [MeeshyColors.warning, MeeshyColors.purple500]
            case .post: return [MeeshyColors.purple500, MeeshyColors.indigo500]
            case .invite: return [MeeshyColors.info, MeeshyColors.indigo500]
            case .shortcutLink: return [MeeshyColors.shareAccent, MeeshyColors.indigo500]
            }
        }

        /// Les deux GROS boutons de l'état vide (directive 2026-08-21) :
        /// chercher des membres à qui écrire, retrouver ses contacts sur
        /// Meeshy (synchronisation du carnet). En queue de liste, ils
        /// redeviennent des tuiles ordinaires.
        nonisolated static let heroes: [Action] = [.findMembers, .myContacts]

        nonisolated static func tiles(isEmptyState: Bool) -> [Action] {
            isEmptyState ? allCases.filter { !heroes.contains($0) } : allCases
        }
    }

    let isDark: Bool
    /// Vrai quand la liste est VIDE : le titre le dit, sinon le bloc se
    /// présente comme la suite naturelle de la liste.
    var isEmptyState: Bool = false
    var minHeight: CGFloat = 0
    var onAction: (Action) -> Void = { _ in }

    static func == (lhs: ConversationListQuickActions, rhs: ConversationListQuickActions) -> Bool {
        lhs.isDark == rhs.isDark && lhs.isEmptyState == rhs.isEmptyState && lhs.minHeight == rhs.minHeight
    }

    private static let columns = [GridItem(.flexible(), spacing: MeeshySpacing.sm), GridItem(.flexible(), spacing: MeeshySpacing.sm), GridItem(.flexible(), spacing: MeeshySpacing.sm)]

    private var title: String {
        isEmptyState
            ? String(localized: "conversations.empty.title", bundle: .main)
            : String(localized: "conversations.quick.title", defaultValue: "Et maintenant ?", bundle: .main)
    }

    private var subtitle: String {
        String(localized: "conversations.quick.subtitle", defaultValue: "Un message, une story, un mood, un post — ou invitez vos amis.", bundle: .main)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(title)
                    .font(MeeshyFont.relative(17, weight: .bold))
                    .foregroundColor(MeeshyColors.textPrimary(isDark: isDark))
                Text(subtitle)
                    .font(MeeshyFont.relative(13))
                    .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
                    .fixedSize(horizontal: false, vertical: true)
            }

            if isEmptyState {
                VStack(spacing: MeeshySpacing.sm) {
                    ForEach(Action.heroes, id: \.self) { action in
                        hero(action)
                    }
                }
            }

            LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.sm) {
                ForEach(Action.tiles(isEmptyState: isEmptyState), id: \.self) { action in
                    tile(action)
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
        .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .top)
        .accessibilityElement(children: .contain)
    }

    /// Gros bouton pleine largeur, dégradé du Dashboard, texte blanc.
    private func hero(_ action: Action) -> some View {
        Button {
            HapticFeedback.medium()
            onAction(action)
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: action.icon)
                    .font(MeeshyFont.relative(22, weight: .semibold))
                    .frame(width: 28)
                Text(action.title)
                    .font(MeeshyFont.relative(16, weight: .bold))
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(MeeshyFont.relative(14, weight: .bold))
                    .opacity(0.8)
            }
            .foregroundColor(.white)
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.lg)
            .frame(maxWidth: .infinity)
            .background(gradientBox(action.gradient, radius: MeeshyRadius.lg))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(action.title)
    }

    private func gradientBox(_ gradient: [Color], radius: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
            .shadow(color: gradient.first?.opacity(0.3) ?? .clear, radius: 8, y: 4)
    }

    private func tile(_ action: Action) -> some View {
        Button {
            HapticFeedback.light()
            onAction(action)
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                Image(systemName: action.icon)
                    .font(MeeshyFont.relative(20, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(gradientBox(action.gradient, radius: 14))
                Text(action.title)
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(MeeshyColors.textPrimary(isDark: isDark))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md)
            .padding(.horizontal, MeeshySpacing.xs)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                    .fill(MeeshyColors.backgroundSecondary(isDark: isDark))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                            .stroke(MeeshyColors.glassBorderGradient(isDark: isDark), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(action.title)
    }
}
