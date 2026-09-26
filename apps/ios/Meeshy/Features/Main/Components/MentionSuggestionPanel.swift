import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - MentionSuggestionPanel

/// Reusable autocomplete panel rendered above any composer when
/// `MentionComposerController.activeQuery` is non-nil.
/// Callers pass the controller and either the current text + an `onSelect`
/// closure that receives the updated text, or a `pick` closure that inserts
/// the candidate itself (hosts that must not read their text in `body`).
struct MentionSuggestionPanel: View {
    @ObservedObject var controller: MentionComposerController
    let accentColor: String
    let pick: (MentionCandidate) -> Void

    init(controller: MentionComposerController,
         accentColor: String,
         currentText: String,
         onSelect: @escaping (String) -> Void) {
        self.controller = controller
        self.accentColor = accentColor
        self.pick = { candidate in onSelect(controller.insertMention(candidate, into: currentText)) }
    }

    init(controller: MentionComposerController,
         accentColor: String,
         pick: @escaping (MentionCandidate) -> Void) {
        self.controller = controller
        self.accentColor = accentColor
        self.pick = pick
    }

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 0) {
                // Le squelette ne dit « on cherche » que pendant qu'une
                // recherche est EN VOL ; sinon une liste vide est la réponse
                // « personne », écrite en toutes lettres (#7847 : à `@` et à
                // une lettre aucune recherche ne part, un squelette y mentirait).
                if controller.suggestions.isEmpty && controller.isResolving {
                    mentionSkeletonRows
                } else if controller.suggestions.isEmpty {
                    Text(ComposerDocumentCopy.mentionEmpty)
                        .font(MeeshyFont.relative(13, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                } else {
                    ForEach(controller.suggestions) { candidate in
                        Button {
                            pick(candidate)
                        } label: {
                            HStack(spacing: 10) {
                                MeeshyAvatar(
                                    name: candidate.displayName,
                                    context: .userListItem,
                                    accentColor: accentColor,
                                    avatarURL: candidate.avatarURL
                                )
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(candidate.displayName)
                                        .font(MeeshyFont.relative(14, weight: .semibold))
                                        .foregroundColor(theme.textPrimary)
                                    Text("@\(candidate.username)")
                                        .font(MeeshyFont.relative(12))
                                        .foregroundColor(theme.textSecondary)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .frame(minHeight: 44)
                        }
                        .accessibilityLabel("\(String(localized: "composer.mention.label", defaultValue: "Mention", bundle: .main)) \(candidate.displayName)")

                        if candidate.id != controller.suggestions.last?.id {
                            Divider()
                                .padding(.leading, 58)
                        }
                    }
                }
            }
        }
        .frame(maxHeight: 200)
        // Neutral Liquid Glass (no accent tint): an autocomplete bar floating
        // above the composer is input-assistance chrome (like the QuickType
        // bar), not conversation content — an accent tint would read as content.
        // Accent tint stays reserved for message-content surfaces (e.g. the
        // long-press MessageActionsMenu).
        .adaptiveGlass(in: Rectangle())
    }

    /// Three shimmering placeholder rows shown while waiting for API results.
    /// Decorative — hidden from VoiceOver so the rotor never stops on empty
    /// shimmer shapes while results stream in.
    private var mentionSkeletonRows: some View {
        VStack(spacing: 0) {
            ForEach(0..<3, id: \.self) { _ in
                HStack(spacing: 10) {
                    Circle()
                        .fill(theme.inputBackground)
                        .frame(width: 36, height: 36)
                        .shimmer()
                    VStack(alignment: .leading, spacing: 4) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(theme.inputBackground)
                            .frame(width: 100, height: 12)
                            .shimmer()
                        RoundedRectangle(cornerRadius: 4)
                            .fill(theme.inputBackground)
                            .frame(width: 70, height: 10)
                            .shimmer()
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(minHeight: 44)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "composer.mention.loading", defaultValue: "Chargement des mentions", bundle: .main))
    }
}

// MARK: - MentionSuggestionOverlay

/// **Le panneau, monté par la seule requête `@` active** (#7847).
///
/// L'hôte n'a pas à observer le contrôleur : cette vue le fait, donc la liste
/// se recompose quand les contacts arrivent du cache ou du réseau APRÈS la
/// frappe — un hôte qui lit `controller.suggestions` dans son propre `body`
/// ne se ré-évalue pas sur un changement d'un `ObservableObject` imbriqué.
struct MentionSuggestionOverlay: View {
    @ObservedObject var controller: MentionComposerController
    let accentColor: String
    let pick: (MentionCandidate) -> Void

    var body: some View {
        VStack(spacing: 0) {
            if controller.activeQuery != nil {
                MentionSuggestionPanel(controller: controller, accentColor: accentColor, pick: pick)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: controller.activeQuery != nil)
    }
}
