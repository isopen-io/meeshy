import SwiftUI
import MeeshySDK
import MeeshyUI

/// La base de la carte de focus : tout ce qu'on fait d'un message, sur une
/// seule rangée, DANS le cadre.
///
/// Ordre de lecture, de gauche à droite :
/// `[réactions posées] (+) [emojis à émettre] … [drapeaux] [⋯]`
///
/// Les réactions POSÉES viennent en premier parce qu'elles sont un FAIT du
/// message — ce qui a déjà été dit. Le `(+)` fait la césure, et ce qui suit
/// est une PROPOSITION : les emojis qu'on peut ajouter d'un tap. Mélanger les
/// deux (ce que fait la barre flottante du long-press) oblige à relire pour
/// distinguer l'existant du proposé.
///
/// **Aucun chrome propre.** Ni capsule, ni bordure, ni ombre : le cadre de la
/// carte (`FocalFocusDecoration`) fait le tour de la rangée ET de cette
/// barre, d'un seul trait continu. Une capsule ici découperait ce trait en
/// deux et donnerait deux cadres concentriques là où le design en demande un.
/// C'est la raison pour laquelle cette barre n'utilise PAS
/// `EmojiReactionPicker` — ce composant embarque son propre chrome verre,
/// impossible à retirer, et c'est lui qui cassait la continuité du cadre.
///
/// **Ce composant ne décide de rien.** Les emojis récents sont classés par
/// `EmojiUsageTracker`, les résumés de réaction par
/// `BubbleContentBuilder.summarizeReactions`, les drapeaux par
/// `buildAvailableFlags`, les actions par `MessageActionResolver`. Aucune
/// seconde source.
struct FocalFocusControlBar: View, Equatable {
    let messageId: String
    let accentHex: String
    let isDark: Bool
    /// Réactions DÉJÀ posées — `content.reactions`, déjà agrégées et triées
    /// (ordre d'apparition, départage par emoji) en amont.
    let reactions: [ReactionSummary]
    let isMe: Bool
    /// Langues disponibles — `translation.availableFlags`, jamais recalculées.
    let availableFlags: [String]
    let activeFlagCode: String?

    var onToggleReaction: ((String) -> Void)? = nil
    var onOpenReactPicker: (() -> Void)? = nil
    var onShowReactions: (() -> Void)? = nil
    var onFlagTap: ((String) -> Void)? = nil
    var onMore: (() -> Void)? = nil

    /// Callbacks exclus — ils ne changent pas le rendu (même règle que
    /// `BubbleReactionsOverlay`). `ReactionSummary` n'étant pas `Equatable`
    /// côté SDK, il est projeté champ par champ, comme le fait déjà
    /// `BubbleReactionsOverlay.SummarySlice`.
    static func == (lhs: FocalFocusControlBar, rhs: FocalFocusControlBar) -> Bool {
        lhs.messageId == rhs.messageId
            && lhs.accentHex == rhs.accentHex
            && lhs.isDark == rhs.isDark
            && lhs.isMe == rhs.isMe
            && lhs.availableFlags == rhs.availableFlags
            && lhs.activeFlagCode == rhs.activeFlagCode
            && lhs.reactions.map { [$0.emoji, String($0.count), String($0.includesMe)] }
                == rhs.reactions.map { [$0.emoji, String($0.count), String($0.includesMe)] }
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            if !reactions.isEmpty {
                postedReactions
            }
            plusButton
            quickEmojiStrip

            Spacer(minLength: 0)

            if !availableFlags.isEmpty {
                flagCluster
            }
            moreButton
        }
        .frame(height: Self.rowHeight)
    }

    static let rowHeight: CGFloat = 28

    // MARK: - Réactions posées

    /// `BubbleReactionsOverlay` TEL QUEL — c'est lui qui porte déjà la pilule,
    /// le compteur au-delà de 1, la différenciation forte de « ma » réaction,
    /// l'ordre chronologique, le débordement `+N` et l'animation d'arrivée.
    /// En réécrire une version ici produirait deux rendus de réaction à
    /// maintenir, exactement ce que ce chantier corrige ailleurs.
    ///
    /// `isLastReceivedMessage: false` : son bouton `(+)` intégré resterait
    /// muet ici, puisque cette barre a le sien, juste après — et deux `(+)`
    /// côte à côte ne veulent rien dire.
    private var postedReactions: some View {
        BubbleReactionsOverlay(
            messageId: messageId,
            summaries: reactions,
            isMe: isMe,
            isDark: isDark,
            isLastReceivedMessage: false,
            accentHex: accentHex,
            onToggleReaction: { emoji in onToggleReaction?(emoji) },
            onShowReactions: { _ in onShowReactions?() }
        )
        .equatable()
    }

    // MARK: - La césure

    /// Sépare le FAIT (ce qui est posé) de la PROPOSITION (ce qu'on peut
    /// poser), et ouvre le picker complet pour qui ne trouve pas son bonheur
    /// dans les quatre suggestions.
    private var plusButton: some View {
        Button {
            HapticFeedback.light()
            onOpenReactPicker?()
        } label: {
            Image(systemName: "plus")
                .font(MeeshyFont.relative(11, weight: .bold))
                .foregroundColor(Color(hex: accentHex))
                .frame(width: Self.tileSize, height: Self.tileSize)
                .background(Circle().fill(Color(hex: accentHex).opacity(0.12)))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("message.reaction.open_picker", bundle: .main))
    }

    // MARK: - Emojis à émettre

    /// Classement `EmojiUsageTracker` (usage décroissant, puis rang canonique,
    /// puis la chaîne elle-même) — la MÊME source que les trois autres
    /// surfaces de réaction de l'app, donc le même ordre partout.
    private var quickEmojiStrip: some View {
        HStack(spacing: 2) {
            ForEach(quickEmojis, id: \.self) { emoji in
                Button {
                    HapticFeedback.light()
                    EmojiUsageTracker.recordUsage(emoji: emoji)
                    onToggleReaction?(emoji)
                } label: {
                    Text(emoji)
                        .font(MeeshyFont.relative(15))
                        .frame(width: Self.tileSize, height: Self.tileSize)
                        .contentShape(Rectangle())
                }
                // `.plain` OBLIGATOIRE : le style par défaut laisse le
                // long-press du `BubbleSwipeContainer` parent avaler le tap
                // (contrainte dure de `FocalRow` sur ses contrôles internes).
                .buttonStyle(.plain)
                .accessibilityLabel(Text(verbatim: emoji))
            }
        }
    }

    private var quickEmojis: [String] {
        EmojiUsageTracker.topEmojis(count: Self.quickEmojiCount, defaults: Self.defaultEmojis)
    }

    private static let quickEmojiCount = 4
    private static let tileSize: CGFloat = 24
    /// Reprise VERBATIM de `ConversationView.nativeQuickReactionEmojis` — le
    /// jeu déjà retenu pour une barre horizontale contrainte. Ne pas
    /// réordonner : `EmojiUsageTracker` s'en sert comme rang canonique de
    /// départage, deux ordres produiraient deux classements.
    private static let defaultEmojis = ["😂", "❤️", "👍", "😮", "😢", "🔥"]

    // MARK: - Drapeaux de traduction

    /// Le mode Focal ne montrait qu'un `globe` **non interactif**
    /// (`FocalRow.translationChip`, `.accessibilityHidden(true)`) : il
    /// SIGNALAIT qu'une traduction était affichée sans donner aucun moyen d'en
    /// changer, alors que `availableFlags` était déjà calculé et
    /// `onSetSecondaryLanguage` déjà câblé jusqu'à la rangée. Le chaînon
    /// manquant était l'affordance.
    private var flagCluster: some View {
        HStack(spacing: 1) {
            ForEach(availableFlags, id: \.self) { code in
                flagPill(code)
            }
        }
    }

    private func flagPill(_ code: String) -> some View {
        let isActive = code == activeFlagCode
        let display = LanguageDisplay.from(code: code)
        return Button {
            HapticFeedback.light()
            onFlagTap?(code)
        } label: {
            VStack(spacing: 1) {
                Text(display?.flag ?? code.uppercased())
                    .font(MeeshyFont.relative(12))
                Capsule()
                    .fill(isActive ? Color(hex: accentHex) : .clear)
                    .frame(width: 9, height: 1.5)
            }
            .frame(width: Self.tileSize, height: Self.tileSize)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(display?.name ?? code))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    // MARK: - Le reste des actions

    /// Ouvre le menu complet — édition, suppression, signalement, traduction
    /// détaillée, transfert… Ces actions vivent déjà dans
    /// `MessageActionResolver`/`MessageMoreSheet` ; les recopier ici en ferait
    /// une seconde liste à maintenir. La barre donne l'accès, pas une
    /// réimplémentation.
    private var moreButton: some View {
        Button {
            HapticFeedback.light()
            onMore?()
        } label: {
            Image(systemName: "ellipsis")
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(Color(hex: accentHex))
                .frame(width: Self.tileSize, height: Self.tileSize)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("message.actions.more", bundle: .main))
    }
}
