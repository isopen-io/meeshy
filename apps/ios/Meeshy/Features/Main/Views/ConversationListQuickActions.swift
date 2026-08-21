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
        case newMessage, story, mood, post, invite, shortcutLink

        var icon: String {
            switch self {
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
            case .newMessage: return String(localized: "conversations.quick.newMessage", defaultValue: "Nouveau message", bundle: .main)
            case .story: return String(localized: "conversations.quick.story", defaultValue: "Créer une story", bundle: .main)
            case .mood: return String(localized: "conversations.quick.mood", defaultValue: "Poser un mood", bundle: .main)
            case .post: return String(localized: "conversations.quick.post", defaultValue: "Publier un post", bundle: .main)
            case .invite: return String(localized: "conversations.quick.invite", defaultValue: "Inviter des amis", bundle: .main)
            case .shortcutLink: return String(localized: "conversations.quick.shortcutLink", defaultValue: "Lien raccourci", bundle: .main)
            }
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

            LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.sm) {
                ForEach(Action.allCases, id: \.self) { action in
                    tile(action)
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
        .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .top)
        .accessibilityElement(children: .contain)
    }

    private func tile(_ action: Action) -> some View {
        Button {
            HapticFeedback.light()
            onAction(action)
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                Image(systemName: action.icon)
                    .font(MeeshyFont.relative(20, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo500)
                    .frame(height: 28)
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
