import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les pièces communes des pages de la vague 2 (#9481)
//
// Le cadre d'une page (retour, titre, défilement), l'hôte qui lit la progression CACHE-FIRST et distribue
// le bloc `game`, le choix « qui voit », la barre de progression et les petites lignes que les cartes
// partagent. Chaque écran de la vague 2 est une page POUSSÉE dans la pile (`Route.gamePage`) — jamais
// une feuille : le glissement depuis le bord et l'historique lui reviennent gratuitement.

// MARK: - Le cadre d'une page

struct GamePageShell<Content: View>: View {
    let title: String
    let identifier: String
    @ViewBuilder let content: () -> Content

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            VStack(spacing: 0) {
                GamePageHeader(title: title, onBack: { dismiss() })
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                        content()
                    }
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.md)
                }
            }
        }
        .accessibilityIdentifier(identifier)
    }
}

// MARK: - L'hôte : la progression cache-first, le modèle des gestes

/// Monte le modèle de la vague 2 et lit la progression comme l'écran Progression : le cache d'abord, le
/// réseau en silence ; un squelette sur cache VIDE seulement, jamais un spinner sur un cache non vide.
/// Devant un serveur qui ne sert pas le bloc `game`, la page dit que cette partie du jeu n'est pas
/// disponible plutôt que de se peindre à moitié.
struct GameWave2Host<Content: View>: View {
    @StateObject private var model = GameWave2Model()
    private let content: (GameWave2Model, GameBlock) -> Content

    init(@ViewBuilder content: @escaping (GameWave2Model, GameBlock) -> Content) {
        self.content = content
    }

    var body: some View {
        GameWave2Frame(model: model, progression: model.progression, content: content)
    }
}

private struct GameWave2Frame<Content: View>: View {
    @ObservedObject var model: GameWave2Model
    @ObservedObject var progression: ProgressionViewModel
    let content: (GameWave2Model, GameBlock) -> Content

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            if progression.isOffline {
                ProgressionNotice(kind: .offline(hasSnapshot: progression.progress != nil))
            }
            if let message = progression.errorMessage {
                ProgressionNotice(kind: .error(message)) {
                    Task { await progression.load(forceNetwork: true) }
                }
            }
            if let game = progression.game {
                content(model, game)
            } else if progression.showsSkeleton {
                ProgressionSkeleton()
            } else if progression.progress != nil {
                GameNote(text: GameText.unavailable)
                    .padding(MeeshySpacing.lg)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.backgroundSecondary))
            }
        }
        .task { await progression.load() }
        .task { await model.loadSettings() }
    }
}

// MARK: - Qui voit

/// LE CHOIX DE QUI VOIT (#5738, #9387, #9481) — trois niveaux résolus côté serveur : tout le monde, mes
/// amis, moi seul. PENDANT L'ENREGISTREMENT le choix est SUSPENDU sans être désactivé : la pastille que le
/// doigt vient de choisir garde le focus de VoiceOver. Hors ligne, il est désactivé pour de bon.
///
/// Il ne décide rien : il pose le niveau choisi, que le geste (optimiste, avec retour arrière) envoie. Le
/// serveur reste maître — il plafonne (« caché de la recherche » ne dépasse pas « amis ») et répond avec la
/// valeur EFFECTIVE, que l'écran relit.
struct GameVisibilityPickerView: View {
    let legend: String
    let value: ShowcaseVisibility
    let disabled: Bool
    var busy = false
    let onChange: (ShowcaseVisibility) -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            Text(legend)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
            // Trois pastilles côte à côte ; aux grandes tailles de texte (au-delà de XL), elles passent l'une sous
            // l'autre plutôt que de tronquer leur nom. Le choix se fait sur la TAILLE DU TEXTE, pas par `ViewThatFits` :
            // sous iOS 26 il mesure ses candidats sur le rendu asynchrone, où la fermeture d'un `ForEach` trappe à
            // l'isolation du main actor (#9135, #9456).
            if typeSize > .xLarge {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) { pills }
            } else {
                HStack(spacing: MeeshySpacing.sm) { pills }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var pills: some View {
        ForEach(ShowcaseVisibility.allCases, id: \.self) { level in
            pill(level)
        }
    }

    private func pill(_ level: ShowcaseVisibility) -> some View {
        let selected = level == value
        return Button {
            guard !busy, !selected else { return }
            HapticFeedback.light()
            onChange(level)
        } label: {
            Text(GameText.visibilityLabel(level))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(selected ? MeeshyColors.brandPrimary : theme.textPrimary)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                .background(
                    Capsule().fill(selected ? MeeshyColors.brandPrimary.opacity(MeeshyOpacity.light) : theme.textMuted.opacity(MeeshyOpacity.subtle))
                )
                .overlay(Capsule().stroke(selected ? MeeshyColors.brandPrimary : Color.clear, lineWidth: MeeshyBorder.regular))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.6 : 1)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Barre, légendes, rangées

/// Une barre de progression ; l'information est dite par le TEXTE voisin, la barre est un renfort.
struct GameProgressBar: View {
    let value: Double
    let tint: Color
    let label: String

    var body: some View {
        ProgressionBar(progress: value, tint: tint, label: label)
    }
}

/// « Hors ligne : ce geste reprendra avec la connexion. » — dit sous un contrôle qui se tait hors ligne.
struct GameOfflineNote: View {
    let online: Bool

    var body: some View {
        if !online {
            GameNote(text: GameText.offlineAction)
        }
    }
}

/// Un bouton discret (texte seul), pour les gestes secondaires : quitter, annuler, rouvrir.
struct GameQuietButton: View {
    let title: String
    var destructive = false
    var disabled = false
    let identifier: String
    let action: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(destructive ? MeeshyColors.error : MeeshyColors.brandPrimary)
                .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget, alignment: .leading)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.6 : 1)
        .accessibilityIdentifier(identifier)
    }
}

/// Un interrupteur nommé, d'au moins 44 pt de haut.
struct GameSwitchRow: View {
    let label: String
    let isOn: Bool
    var disabled = false
    let identifier: String
    let onChange: (Bool) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Toggle(isOn: Binding(get: { isOn }, set: { onChange($0) })) {
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .tint(MeeshyColors.brandPrimary)
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .disabled(disabled)
        .accessibilityIdentifier(identifier)
    }
}

// MARK: - L'aiguilleur des pages

/// La page que `Route.gamePage` pousse.
struct GamePageView: View {
    let page: GamePage

    var body: some View {
        switch page {
        case .league: GameLeaguePage()
        case .season: GameSeasonPage()
        case .showcase: GameShowcasePage()
        case .atlas: GameAtlasPage()
        case .prestige: GamePrestigePage()
        case .settings: GameSettingsPage()
        }
    }
}
