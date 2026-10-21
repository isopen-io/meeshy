import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une humeur sans un mot se confirme** (#10527, demande du porteur du
/// 2026-10-13) — à la validation sans texte, prévenir et proposer d'ajouter un
/// mot ou de publier quand même.
///
/// La règle est PURE, comme `ComposerMoodPolicy` : elle se lit, elle ne
/// s'exécute pas. Miroir web : `moodPublishStep`
/// (`apps/web/src/lib/view/mood-bare-publish.ts`).
nonisolated enum ComposerMoodBarePublish {

    enum Step: Equatable {
        case publish
        case askForAWord
    }

    /// Le mot se mesure APRÈS rognage : une saisie d'espaces ne dit rien à
    /// personne, donc elle se confirme comme une saisie vide.
    ///
    /// Une REPUBLICATION ne demande rien : elle porte déjà le status de sa
    /// source, et le bandeau « Status de @X » dit ce qui part.
    static func step(text: String, isRepublication: Bool) -> Step {
        guard !isRepublication else { return .publish }
        return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .askForAWord : .publish
    }

    /// Le délai avant de rendre le focus au champ : l'alerte doit avoir fini
    /// de se retirer, sinon elle reprend le premier répondeur au clavier.
    static let refocusDelay: UInt64 = 350_000_000
}

/// **L'emoji choisi HORS de la grille** (#10527) — celui que la feuille
/// complète a rendu. `nil` tant que l'humeur vient des emojis proposés : la
/// grille le montre déjà, et une cellule de plus le peindrait deux fois.
nonisolated enum ComposerMoodEmojiChoice {

    static func custom(_ emoji: String?, offered: [String]) -> String? {
        guard let emoji, !emoji.isEmpty, !offered.contains(emoji) else { return nil }
        return emoji
    }
}

/// Les libellés de ce lot. Ils vivent ICI et non dans `ComposerMoodCopy` :
/// `test_lesLibelles_reutilisentLesClesDejaTraduites` tient l'ensemble des clés
/// de la surface, et ces quatre-là appartiennent à la question et à la feuille.
nonisolated enum ComposerMoodBareCopy {

    static var question: String {
        String(localized: "status.composer.bare.title",
               defaultValue: "Publier ton humeur sans un petit mot ?", bundle: .main)
    }

    static var addWord: String {
        String(localized: "status.composer.bare.add",
               defaultValue: "Ajouter un mot", bundle: .main)
    }

    static var publishAnyway: String {
        String(localized: "status.composer.bare.publish",
               defaultValue: "Publier quand même", bundle: .main)
    }

    static var moreEmojis: String {
        String(localized: "status.composer.emoji.more",
               defaultValue: "Autres emojis", bundle: .main)
    }
}

/// **Comment revenir au champ du mot.** La surface possède le focus, le
/// meuble possède la flèche : la surface confie ce geste à la flèche par
/// l'environnement, sans que le meuble ait à tenir un état de plus.
struct ComposerMoodWordFocus {
    let focus: () -> Void
}

private struct ComposerMoodWordFocusKey: EnvironmentKey {
    static let defaultValue: ComposerMoodWordFocus? = nil
}

extension EnvironmentValues {
    var composerMoodWordFocus: ComposerMoodWordFocus? {
        get { self[ComposerMoodWordFocusKey.self] }
        set { self[ComposerMoodWordFocusKey.self] = newValue }
    }
}

/// **La flèche PUBLIER du mood, avec sa question.** Elle ne publie rien
/// elle-même : `publish` est le geste du meuble (`publishDocument`), reçu tel
/// quel. Elle décide seulement s'il part tout de suite ou après la question.
///
/// Une ALERTE et non un dialogue de confirmation : ses deux réponses sont
/// toujours peintes, sur iOS 16 comme sur iOS 26 où un dialogue ancré masque
/// son bouton d'annulation.
struct ComposerMoodPublishGate<Label: View>: View {

    let text: String
    let isRepublication: Bool
    let publish: () -> Void
    @ViewBuilder let label: () -> Label

    @Environment(\.composerMoodWordFocus) private var wordFocus
    @State private var isAsking = false

    var body: some View {
        Button {
            switch ComposerMoodBarePublish.step(text: text, isRepublication: isRepublication) {
            case .publish: publish()
            case .askForAWord: isAsking = true
            }
        } label: {
            label()
        }
        .buttonStyle(.plain)
        .alert(ComposerMoodBareCopy.question, isPresented: $isAsking) {
            Button(ComposerMoodBareCopy.addWord) { returnToWord() }
                .keyboardShortcut(.defaultAction)
            Button(ComposerMoodBareCopy.publishAnyway) { publish() }
        }
    }

    private func returnToWord() {
        let focus = wordFocus
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: ComposerMoodBarePublish.refocusDelay)
            focus?.focus()
        }
    }
}

/// **La porte vers la feuille complète des emojis** — une cellule de la
/// grille, aux mesures des autres (56 pt, au-delà du plancher de 44).
struct ComposerMoodMoreEmojiCell: View {

    let side: CGFloat
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "face.smiling")
                .font(MeeshyFont.relative(26))
                .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: "plus.circle.fill")
                        .font(MeeshyFont.relative(13, weight: .bold))
                        .foregroundColor(MeeshyColors.indigo400)
                        .offset(x: 6, y: 4)
                }
                .frame(width: side, height: side)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .fill(Color.white.opacity(0.06))
                )
                .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerMoodBareCopy.moreEmojis))
    }
}

/// **La feuille complète**, et c'est celle du dépôt : `EmojiPickerSheet`
/// (réactions, préférences, meuble). Les emojis proposés y tiennent lieu de
/// récents — l'auteur retrouve en tête ceux qu'il vient de quitter.
struct ComposerMoodEmojiSheet: View {

    let offered: [String]
    let onSelect: (String) -> Void

    var body: some View {
        EmojiPickerSheet(
            quickReactions: offered,
            title: LocalizedStringResource("status.composer.emoji.more", defaultValue: "Autres emojis"),
            onSelect: onSelect
        )
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
