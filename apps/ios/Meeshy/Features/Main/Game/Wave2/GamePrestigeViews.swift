import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE PRESTIGE (#9389, conception II.2 et II.9) — la vie après le niveau 100 : la proposition, l'explication
/// par Mee et Meo, la CONFIRMATION qui dit ce qui repart, ce qui reste, ce qu'on gagne — et la perte d'accès à
/// la ligue (10) et au duo (20) qui suit, parce que le niveau record repart à 1 (conformité G-5) —, puis le
/// passage en chorégraphie : l'anneau se vide, le trophée tombe, les étoiles s'allument. Miroir de
/// `apps/web/src/components/game-prestige.tsx`.
///
/// Aucun passage sans confirmation : l'écran ne propose que « Passer en Prestige » (qui ouvre la confirmation)
/// et « Rester au sommet ». Le geste est optimiste (le niveau repart tout de suite) avec retour arrière, la
/// loi est celle de la passerelle (`GamePrestige.transition`). Fermé : sous le niveau 100 il dit où l'on en est ;
/// au maximum (cinq étoiles) il le fête, sans rien proposer.
struct GamePrestigePage: View {
    var body: some View {
        GamePageShell(title: GameText.prestigeTitle, identifier: "game.prestige.page") {
            GameWave2Host { model, game in
                GamePrestigeScreen(model: model, game: game)
            }
        }
    }
}

struct GamePrestigeScreen: View {
    @ObservedObject var model: GameWave2Model
    let game: GameBlock

    @State private var confirming = false
    @State private var playKey = 0
    @State private var passed: Int?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        if let prestige = game.prestige {
            summary(prestige)
            if prestige.canPrestige && prestige.stars < prestige.max { offer(prestige) }
        } else {
            GameNote(text: GameText.unavailable)
        }
    }

    // MARK: Où j'en suis

    private func summary(_ prestige: GamePrestigeBlock) -> some View {
        GameCard(tint: MeeshyColors.brandPrimary, title: GameText.prestigeTitle) {
            GamePrestigeScene(
                level: game.level.level, tier: game.level.tier, progress: game.level.progress, stars: prestige.stars,
                plate: GameTrophyPresentation.of(key: GameTrophies.key(of: .prestige(number: max(1, prestige.stars))))?.plate ?? "",
                playKey: playKey, reduceMotion: reduceMotion
            )
            .frame(maxWidth: .infinity)
            // L'étoile de Prestige SE TOUCHE (#9564) : la scène rebondit et ouvre les précisions de la prochaine étoile.
            .gameElement(GameElementDetails.prestigeStar(min(prestige.stars + 1, prestige.max), in: prestige))
            Text(GameText.prestigeStars(stars: GameCopy.formatCount(prestige.stars), max: GameCopy.formatCount(prestige.max)))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity)
            if let passed {
                Text(GameText.prestigeDone(number: GameCopy.formatCount(passed)))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .foregroundColor(MeeshyColors.success)
                    .frame(maxWidth: .infinity)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            if prestige.stars >= prestige.max {
                GameNote(text: GameText.prestigeMax)
            } else if !prestige.canPrestige && passed == nil {
                GameNote(text: GameText.prestigeLocked(level: GameCopy.formatCount(game.level.level)))
            }
        }
        .accessibilityIdentifier("game.prestige")
    }

    // MARK: La proposition

    private func offer(_ prestige: GamePrestigeBlock) -> some View {
        GameCard(title: GameText.prestigeGo) {
            guide(film: "mee-sourire", text: GameText.prestigeMee, mirrored: false)
            guide(film: "meo-salut", text: GameText.prestigeMeo(glory: GameCopy.formatCount(prestige.gloryOnPass)), mirrored: true)
            if confirming {
                confirmation(next: prestige.stars + 1)
            } else {
                GameActionButton(
                    title: GameText.prestigeGo, busy: false, disabled: !model.isOnline || model.pending.prestige,
                    tint: MeeshyColors.brandPrimary, identifier: "game.prestige.go"
                ) {
                    confirming = true
                }
                GameNote(text: GameText.prestigeConfirmKeeps)
            }
            GameErrorLine(message: model.errors.prestige, identifier: "game.prestige.error")
            GameOfflineNote(online: model.isOnline)
        }
        .accessibilityIdentifier("game.prestige.offer")
        .adaptiveOnChange(of: model.errors.prestige) { _, message in
            if message != nil { passed = nil }
        }
    }

    private func guide(film: String, text: String, mirrored: Bool) -> some View {
        HStack(alignment: .bottom, spacing: MeeshySpacing.sm) {
            if !mirrored { figure(film, mirrored: false) }
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: mirrored ? .regular : .bold))
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            if mirrored { figure(film, mirrored: true) }
        }
    }

    private func figure(_ film: String, mirrored: Bool) -> some View {
        MeeStickerFilmView(filmID: film, animated: !reduceMotion, side: 64, animates: !reduceMotion, pixelCap: 240)
            .scaleEffect(x: mirrored ? -1 : 1, y: 1)
            .frame(width: 64, height: 64)
            .accessibilityHidden(true)
    }

    /// La CONFIRMATION : ce qui repart, ce qui reste, la porte de la ligue et du duo qui se referme, et le
    /// consentement à la ligue publique qui, lui, reste enregistré — dit AVANT le geste, jamais découvert après.
    private func confirmation(next: Int) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(GameText.prestigeConfirmTitle(number: GameCopy.formatCount(next)))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ForEach(GameText.prestigeConfirmationLines, id: \.self) { line in
                GameNote(text: line)
            }
            GameActionButton(
                title: GameText.prestigeGo, busy: model.pending.prestige, disabled: !model.isOnline,
                tint: MeeshyColors.brandPrimary, identifier: "game.prestige.confirm.go"
            ) {
                confirming = false
                passed = next
                playKey += 1
                Task {
                    let ok = await model.passPrestige()
                    if ok { HapticFeedback.success() }
                }
            }
            GameQuietButton(title: GameText.prestigeStay, identifier: "game.prestige.confirm.stay") {
                confirming = false
            }
        }
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(theme.textMuted.opacity(MeeshyOpacity.subtle)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.prestige.confirm")
    }
}

// MARK: - La scène du passage

/// LA SCÈNE DU PRESTIGE : l'anneau de niveau (avec ses étoiles) et le trophée de Prestige. Au passage
/// (`playKey` qui change), l'anneau se VIDE calmement, le trophée tombe sur son socle et l'étoile s'allume ;
/// sous « réduire les animations », tout se résume à un fondu. Aucune minuterie ni aucun lien d'affichage :
/// des animations SwiftUI à valeur d'arrivée, que le système suspend hors écran.
struct GamePrestigeScene: View {
    let level: Int
    let tier: LevelTierKey
    let progress: Double
    let stars: Int
    let plate: String
    let playKey: Int
    let reduceMotion: Bool

    @State private var shownProgress: Double
    @State private var trophyDrop: CGFloat = 0
    @State private var trophyOpacity: Double = 1

    init(level: Int, tier: LevelTierKey, progress: Double, stars: Int, plate: String, playKey: Int, reduceMotion: Bool) {
        self.level = level
        self.tier = tier
        self.progress = progress
        self.stars = stars
        self.plate = plate
        self.playKey = playKey
        self.reduceMotion = reduceMotion
        _shownProgress = State(initialValue: progress)
    }

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(alignment: .bottom, spacing: MeeshySpacing.xl) {
            LevelRingView(
                level: level, progress: shownProgress, tier: tier, prestige: stars,
                trackColor: theme.textMuted.opacity(MeeshyOpacity.light), inkColor: theme.textPrimary,
                accessibilityLabel: GameCopy.levelRingAccessibility(level: level, tier: tier)
            )
            .frame(width: 88, height: stars > 0 ? 104 : 88)
            if stars > 0 {
                TrophyView(material: .prism, label: plate, figures: GameFigures.standard)
                    .frame(height: 88)
                    .offset(y: trophyDrop)
                    .opacity(trophyOpacity)
                    .accessibilityHidden(true)
            }
        }
        .adaptiveOnChange(of: playKey) { _, _ in play() }
        .adaptiveOnChange(of: progress) { _, value in shownProgress = value }
    }

    private func play() {
        if reduceMotion {
            trophyOpacity = 0
            withAnimation(.easeIn(duration: 0.4)) { trophyOpacity = 1 }
            return
        }
        withAnimation(.easeInOut(duration: 1.0)) { shownProgress = 0 }
        trophyDrop = -60
        trophyOpacity = 0
        withAnimation(.spring(response: 0.6, dampingFraction: 0.6).delay(0.5)) {
            trophyDrop = 0
            trophyOpacity = 1
        }
    }
}
