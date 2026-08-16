import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les contrôles de la rangée ÉLUE, posés SUR le bord de la carte de focus.
///
/// « Les éléments de contrôle par-dessus le cadre » : la carte
/// (`FocalFocusDecoration`, un `CALayer` derrière le contenu hébergé) dessine
/// l'anneau ; cette barre vit dans le contenu SwiftUI, donc AU-DESSUS de lui,
/// et chevauche son bord bas. C'est aussi ce qui la rend interactive — un
/// `CALayer` ne reçoit pas de touches, la barre ne pouvait pas y vivre.
///
/// **Pourquoi dans la rangée et non dans un overlay flottant.** Un overlay
/// ancré au rectangle de la cellule élue aurait exigé de resynchroniser sa
/// position à chaque passe du pass (120 Hz) et de refaire, à la main, le
/// test de touche que SwiftUI donne gratuitement. Rendue DANS la rangée, la
/// barre se place toute seule, reçoit ses taps toute seule, et n'apparaît
/// que lorsque l'hôte reconfigure la cellule élue — c'est-à-dire à l'arrêt
/// du défilement, jamais pendant.
///
/// **Ce composant ne décide de rien.** Il reçoit des primitifs déjà résolus
/// et rend des callbacks — les emojis récents sont classés par
/// `EmojiUsageTracker`, les drapeaux viennent de
/// `BubbleContent.Translation.availableFlags` (déjà calculés par
/// `BubbleContentBuilder.buildAvailableFlags`), les actions sont celles de
/// `MessageActionResolver`. Aucune seconde source.
struct FocalFocusControlBar: View, Equatable {
    let accentHex: String
    let isDark: Bool
    /// Langues disponibles pour ce message — `translation.availableFlags`,
    /// jamais recalculées ici.
    let availableFlags: [String]
    /// Langue secondaire actuellement ouverte, s'il y en a une.
    let activeFlagCode: String?

    var onReact: ((String) -> Void)? = nil
    var onExpandPicker: (() -> Void)? = nil
    var onFlagTap: ((String) -> Void)? = nil
    var onMore: (() -> Void)? = nil

    /// Callbacks exclus — ils ne changent pas le rendu (même règle que
    /// `BubbleReactionsOverlay`).
    static func == (lhs: FocalFocusControlBar, rhs: FocalFocusControlBar) -> Bool {
        lhs.accentHex == rhs.accentHex
            && lhs.isDark == rhs.isDark
            && lhs.availableFlags == rhs.availableFlags
            && lhs.activeFlagCode == rhs.activeFlagCode
    }

    /// Emojis proposés — classement `EmojiUsageTracker` (usage décroissant
    /// puis rang canonique), la MÊME source que les trois autres surfaces de
    /// réaction de l'app. `4` : au-delà, la barre concurrence la largeur du
    /// message sur un iPhone compact ; le bouton `+` ouvre le picker complet.
    private var quickEmojis: [String] {
        EmojiUsageTracker.topEmojis(count: Self.quickEmojiCount, defaults: Self.defaultEmojis)
    }

    private static let quickEmojiCount = 4
    /// Reprise VERBATIM de `ConversationView.nativeQuickReactionEmojis` — le
    /// jeu déjà retenu pour une barre horizontale contrainte. Ne pas
    /// réordonner : `EmojiUsageTracker` s'en sert comme rang canonique de
    /// départage, deux ordres différents produiraient deux classements.
    private static let defaultEmojis = ["😂", "❤️", "👍", "😮", "😢", "🔥"]

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            EmojiReactionPicker(
                quickEmojis: quickEmojis,
                style: isDark ? .dark : .light,
                scale: Self.pickerScale,
                onReact: { emoji in
                    EmojiUsageTracker.recordUsage(emoji: emoji)
                    onReact?(emoji)
                },
                onExpandFullPicker: { onExpandPicker?() }
            )

            if !availableFlags.isEmpty {
                flagCluster
            }

            moreButton
        }
    }

    /// Le picker embarque son propre chrome (capsule verre + ombre) et sa
    /// cascade d'entrée. Réduit : la barre partage la largeur avec les
    /// drapeaux et le bouton « … ».
    private static let pickerScale: CGFloat = 0.78

    /// Drapeaux des traductions disponibles.
    ///
    /// Le mode Focal ne montrait jusqu'ici qu'un `globe` **non interactif**
    /// (`FocalRow.translationChip`, `.accessibilityHidden(true)`) : il
    /// SIGNALAIT qu'une traduction était affichée sans donner aucun moyen
    /// d'en changer, alors que `availableFlags` était déjà calculé et que
    /// `onSetSecondaryLanguage` était déjà câblé jusqu'à la rangée. Le
    /// chaînon manquant était l'affordance.
    private var flagCluster: some View {
        HStack(spacing: 2) {
            ForEach(availableFlags, id: \.self) { code in
                flagPill(code)
            }
        }
        .padding(.horizontal, MeeshySpacing.xs)
        .frame(height: Self.clusterHeight)
        .background(clusterChrome)
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
                    .font(MeeshyFont.relative(13))
                Capsule()
                    .fill(isActive ? Color(hex: accentHex) : .clear)
                    .frame(width: 10, height: 1.5)
            }
            .frame(width: 22, height: 22)
            .contentShape(Rectangle())
        }
        // `.plain` OBLIGATOIRE : le style par défaut laisse le long-press du
        // `BubbleSwipeContainer` parent avaler le tap (même piège que
        // `BubbleFooter.footerFlagPill`, et que la contrainte dure de
        // `FocalRow` sur ses contrôles internes).
        .buttonStyle(.plain)
        .accessibilityLabel(Text(display?.name ?? code))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    /// Ouvre le menu complet — édition, suppression, signalement, traduction
    /// détaillée, transfert… Toutes ces actions vivent déjà dans
    /// `MessageActionResolver`/`MessageMoreSheet` ; les recopier ici en
    /// ferait une seconde liste à maintenir. La barre donne l'accès, pas une
    /// réimplémentation.
    private var moreButton: some View {
        Button {
            HapticFeedback.light()
            onMore?()
        } label: {
            Image(systemName: "ellipsis")
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(Color(hex: accentHex))
                .frame(width: Self.clusterHeight, height: Self.clusterHeight)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(clusterChrome)
        .accessibilityLabel(Text("message.actions.more", bundle: .main))
    }

    private static let clusterHeight: CGFloat = 30

    /// Même vocabulaire visuel que la capsule du picker (verre + liseré
    /// accent très dilué), pour que les trois grappes de la barre se lisent
    /// comme un seul objet.
    private var clusterChrome: some View {
        Capsule()
            .fill(.ultraThinMaterial)
            .overlay(
                Capsule().strokeBorder(Color(hex: accentHex).opacity(0.22), lineWidth: 0.5)
            )
    }
}
