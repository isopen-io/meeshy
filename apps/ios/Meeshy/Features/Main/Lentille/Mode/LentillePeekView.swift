import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Modèle — pur, testable sans vue (contrat LWS-8/I-072)

/// Ce que l'aperçu (long press) affiche — TROISIÈME point d'entrée du menu
/// de mode (avec l'encoche, I-071, et le sous-menu contextuel, ci-dessous
/// dans `ConversationListView+Overlays.swift`) : « trois points d'entrée,
/// une préférence » (contrat LWS-8).
///
/// Pur, `nonisolated`, dérivé de la MÊME glue que la carte
/// (`LentilleReadingModeContext`) et du MÊME modèle de menu
/// (`LentilleModeMenuModel`) — la raison Rivière que l'aperçu montre est
/// donc, par construction, celle que l'encoche et le sous-menu montrent.
///
/// **Suite PARTIELLE** : `PeekViewModelTests` (I-072) verrouille la
/// construction du modèle ; I-073 complète (timings du geste d'appui long,
/// intégration bout en bout des deux chemins OS).
///
/// @see tasks/lentille-implementation-contract.md LWS-8
/// @see tasks/lentille-workshop-execution.md I-072
nonisolated struct LentillePeekViewModel: Equatable {
    let title: String
    /// Prisme appliqué (`resolvedLastMessagePreview`, SDK gelé) — jamais un
    /// texte original brut quand une traduction préférée existe (règle 3).
    let previewText: String
    let modeMenu: LentilleModeMenuModel

    static func build(
        conversation: Conversation,
        preference: ReadingModeOrchestrator.ReadingModePreference,
        isAnonymous: Bool,
        isLentilleFlagEnabled: Bool,
        preferredLanguages: [String]
    ) -> LentillePeekViewModel {
        let capabilities = LentilleReadingModeContext.capabilities(
            for: conversation, isAnonymous: isAnonymous, isLentilleFlagEnabled: isLentilleFlagEnabled
        )
        return LentillePeekViewModel(
            title: conversation.displayName,
            previewText: conversation.resolvedLastMessagePreview(preferredLanguages: preferredLanguages)
                ?? conversation.lastMessagePreview
                ?? "",
            modeMenu: LentilleModeMenuModel.build(capabilities: capabilities, currentPreference: preference)
        )
    }
}

// MARK: - Vue

/// L'aperçu de la Lentille (contrat LWS-8/I-072) — en `preview:` du menu
/// contextuel.
///
/// **Les DEUX chemins OS.** Le chemin < iOS 26
/// (`conversationContextMenuOverlay`, `+Overlays.swift`, possédé par LWS-8)
/// est interactif et embarque `LentilleModeMenu` ci-dessous — c'est là que
/// « l'aperçu, troisième point d'entrée » a son sens fonctionnel. Le chemin
/// natif iOS 26+ (`.contextMenu(menuItems:preview:)`,
/// `ConversationListView+Rows.swift`, propriété LWS-7) rend AUSSI cette vue
/// sous drapeau depuis I-067ter — en aperçu statique (un `preview:` natif
/// n'est pas interactif), le changement de mode y passe par les items du
/// menu, pas par l'aperçu.
struct LentillePeekView: View {
    let conversation: Conversation
    var isDark: Bool = false
    var isAnonymous: Bool = false
    var preferredContentLanguages: [String] = []
    var presenceState: PresenceState? = nil
    var storyState: StoryRingState = .none
    var moodEmoji: String? = nil
    var preferenceStore: ReadingModePreferenceStoring = LentilleReadingModePreferenceCenter.shared
    var onSelectMode: (ReadingModeOrchestrator.ReadingModePreference) -> Void = { _ in }

    /// Chargée à l'ouverture (M-048) — même patron que
    /// `LentilleReadingModeSubmenu` : `UserDefaults` est synchrone en
    /// pratique, `.auto` reste un défaut SÛR le temps du premier tick.
    @State private var preference: ReadingModeOrchestrator.ReadingModePreference = .auto

    /// Largeur de la carte — reprend LA MÊME cote que `ConversationPreviewView`
    /// aux deux sites d'appel existants (`340`, `ConversationListView+Overlays
    /// .swift`/`+Rows.swift`) : pas une cote de LOI (absente de §4.3, absente
    /// de `lentille-tokens.json`), une continuité visuelle avec la carte
    /// qu'elle remplace dans le MÊME emplacement d'écran.
    private static let width: CGFloat = 340

    private var model: LentillePeekViewModel {
        LentillePeekViewModel.build(
            conversation: conversation,
            preference: preference,
            isAnonymous: isAnonymous,
            isLentilleFlagEnabled: true,
            preferredLanguages: preferredContentLanguages
        )
    }

    private var accent: Color { Color(hex: conversation.accentColor) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            header
            if !model.previewText.isEmpty {
                Text(model.previewText)
                    .font(LentilleMetrics.Line2.font)
                    .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
                    .lineLimit(3)
            }
            Divider()
            VStack(alignment: .leading, spacing: 0) {
                // Écrit dans le MÊME magasin que l'encoche (I-071) et le
                // sous-menu contextuel (`LentilleReadingModeSubmenu`) — puis
                // notifie `onSelectMode` pour que l'appelant réagisse (ex.
                // fermer l'overlay qui héberge cet aperçu).
                LentilleModeMenu(model: model.modeMenu) { selected in
                    LentilleModeMenuActions.select(selected, conversationId: conversation.id, store: preferenceStore)
                    onSelectMode(selected)
                }
            }
        }
        .padding(MeeshySpacing.md)
        .frame(width: Self.width)
        .background(MeeshyColors.backgroundSecondary(isDark: isDark))
        .clipShape(RoundedRectangle(cornerRadius: LentilleMetrics.FocusCard.radius, style: .continuous))
        .task(id: conversation.id) {
            preference = await preferenceStore.get(conversationId: conversation.id)
        }
    }

    private var header: some View {
        HStack(spacing: MeeshySpacing.md) {
            ZStack {
                Circle()
                    .strokeBorder(accent.opacity(LentilleMetrics.Avatar.ringOpacity), lineWidth: LentilleMetrics.Avatar.ringWidth)
                    .frame(
                        width: LentilleMetrics.Avatar.size + LentilleMetrics.Avatar.ringWidth * 2,
                        height: LentilleMetrics.Avatar.size + LentilleMetrics.Avatar.ringWidth * 2
                    )
                MeeshyAvatar(
                    name: conversation.name,
                    context: LentilleMetrics.Avatar.context,
                    accentColor: conversation.accentColor,
                    secondaryColor: conversation.colorPalette.secondary,
                    avatarURL: conversation.type == .direct ? conversation.participantAvatarURL : conversation.avatar,
                    storyState: storyState,
                    moodEmoji: moodEmoji,
                    presenceState: presenceState,
                    isDark: isDark
                )
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(model.title)
                    .font(LentilleMetrics.Name.font)
                    .foregroundColor(MeeshyColors.textPrimary(isDark: isDark))
                    .lineLimit(1)
                Text(conversation.lastMessageAt, style: .relative)
                    .font(LentilleMetrics.Time.font)
                    .foregroundColor(MeeshyColors.textMuted(isDark: isDark))
            }
            Spacer(minLength: 0)
        }
    }
}
