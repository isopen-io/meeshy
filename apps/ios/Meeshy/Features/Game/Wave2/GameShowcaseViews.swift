import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA PAGE « VITRINE » (#9387, conception II.9) — coupes de ligue, de saison, de Prestige et de Flamme, dans
/// l'ordre que la personne a rangé. Ranger = monter ou descendre d'un cran : deux boutons de 44 pt par coupe,
/// pas un glisser-déposer que ni VoiceOver ni le clavier ne savent faire. Le geste est optimiste (l'ordre
/// change tout de suite) avec retour arrière. Un trophée ne rapporte JAMAIS de points ni de Gloire : c'est un
/// objet reçu à un moment précis. La visibilité se règle ici (« amis » par défaut). Miroir de
/// `apps/web/src/components/game-showcase.tsx`.
struct GameShowcasePage: View {
    var body: some View {
        GamePageShell(title: GameText.showcaseTitle, identifier: "game.showcase.page") {
            GameWave2Host { model, game in
                GameShowcaseScreen(model: model, game: game)
            }
        }
    }
}

struct GameShowcaseScreen: View {
    @ObservedObject var model: GameWave2Model
    let game: GameBlock

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        if let fragments = game.starFragments {
            // La constellation (#10053) : le total collecté, servi par le bloc `game` — un ancien serveur n'en sert pas.
            GameConstellationCard(collected: fragments.collected)
        }
        if let trophies = game.trophies {
            let order = GameShowcaseRules.shelfOrder(trophies).filter { GameTrophyPresentation.of(key: $0) != nil }
            let awarded = Dictionary(trophies.items.map { ($0.key, $0.awardedAt) }, uniquingKeysWith: { first, _ in first })
            GameCard(title: GameText.showcaseTitle + " · " + GameText.doorShowcaseCount(count: order.count)) {
                if order.isEmpty {
                    GameNote(text: GameText.showcaseEmpty)
                } else {
                    GameNote(text: GameText.showcaseOrderHint)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: MeeshySpacing.lg) {
                        ForEach(Array(order.enumerated()), id: \.element) { index, key in
                            if let view = GameTrophyPresentation.of(key: key) {
                                trophyCell(view: view, index: index, count: order.count, awardedAt: awarded[key], order: order)
                            }
                        }
                    }
                }
                GameErrorLine(message: model.errors.order, identifier: "game.showcase.order.error")
                GameOfflineNote(online: model.isOnline)
            }
            .accessibilityIdentifier("game.showcase")

            GameCard(title: GameText.showcaseVisibility) {
                GameVisibilityPickerView(
                    legend: GameText.visibilityFieldShowcase,
                    value: game.visibility?.showcase ?? GameTrophies.defaultVisibility,
                    disabled: !model.isOnline, busy: model.pending.visibility
                ) { level in
                    Task { await model.setVisibility(showcase: level) }
                }
                GameNote(text: GameText.showcaseVisibilityHint)
                GameErrorLine(message: model.errors.visibility, identifier: "game.showcase.visibility.error")
                if model.pending.visibility { GameNote(text: GameText.visibilitySaving) }
            }
            .accessibilityIdentifier("game.showcase.visibility")
        } else {
            GameNote(text: GameText.unavailable)
        }
    }

    private func trophyCell(view: GameTrophyPresentation, index: Int, count: Int, awardedAt: String?, order: [String]) -> some View {
        VStack(spacing: MeeshySpacing.xs) {
            // Un trophée SE TOUCHE (#9564) : il rebondit et ouvre ses précisions.
            GameTrophyArt(view: view, height: 84)
                .gameElement(GameElementDetails.trophy(GameTrophyItem(key: order[index], awardedAt: awardedAt ?? "")))
            Text(view.title)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
            if let awardedAt {
                Text(GameText.showcaseAwarded(date: GameWave2Format.awardedDate(awardedAt)))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
            }
            HStack(spacing: MeeshySpacing.xs) {
                moveButton(symbol: "chevron.up", label: GameText.showcaseMoveUp(name: view.title), disabled: index == 0) {
                    Task { await model.saveOrder(GameShowcaseRules.moved(order, index: index, delta: -1)) }
                }
                moveButton(symbol: "chevron.down", label: GameText.showcaseMoveDown(name: view.title), disabled: index == count - 1) {
                    Task { await model.saveOrder(GameShowcaseRules.moved(order, index: index, delta: 1)) }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }

    /// Pendant qu'un ordre part, ranger est SUSPENDU sans être désactivé : le bouton que VoiceOver vient de
    /// presser garde le focus. Hors ligne, il est désactivé pour de bon.
    private func moveButton(symbol: String, label: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            guard !model.pending.order else { return }
            HapticFeedback.light()
            action()
        } label: {
            Image(systemName: symbol)
                .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous).fill(theme.textMuted.opacity(MeeshyOpacity.subtle)))
        }
        .buttonStyle(.plain)
        .disabled(disabled || !model.isOnline)
        .opacity(disabled || !model.isOnline || model.pending.order ? 0.5 : 1)
        .accessibilityLabel(label)
    }
}

/// Une coupe, dessinée (la brique du SDK) — DÉCORATIVE : son titre, lu à côté, dit ce qu'elle est. Le
/// Prestige y tient Mee et Meo couronnés.
struct GameTrophyArt: View {
    let view: GameTrophyPresentation
    let height: CGFloat

    var body: some View {
        TrophyView(material: view.material, label: view.plate, figures: view.kind == .prestige ? GameFigures.standard : nil)
            .frame(height: height)
            .accessibilityHidden(true)
    }
}

// MARK: - La constellation (#10053)

/// LA CONSTELLATION — une étoile tous les dix fragments d'étoile collectés (`GameConstellation`, miroir SDK de
/// `constellation.ts`), un cosmétique de profil par étoile, sans avantage de jeu. Le membre voit l'étoile suivante se
/// remplir ; la fiche d'un autre ne monte plus de constellation (#10380, comme le web depuis #10097). Le dessin est
/// décoratif et se retourne en arabe ; le texte dit tout. Miroir de `apps/web/src/components/game-constellation.tsx`.
struct GameConstellationCard: View {
    let constellation: Constellation

    init(collected: Int) {
        constellation = GameConstellation.of(collected: collected)
    }

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        GameCard(title: GameText.constellationTitle + " · " + GameText.constellationStars(constellation.stars)) {
            GameConstellationSky(stars: constellation.stars, inStar: constellation.inStar)
                .frame(height: 64)
                .accessibilityHidden(true)
            GameNote(text: GameText.constellationNext(constellation.toNextStar))
            GameNote(text: GameText.constellationHow)
            if !constellation.cosmetics.isEmpty {
                Text(GameText.constellationCosmetics)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                ForEach(constellation.cosmetics, id: \.cosmeticKey) { cosmetic in
                    HStack(spacing: MeeshySpacing.sm) {
                        GameConstellationSwatch(kind: cosmetic.kind)
                        Text(GameText.constellationCosmetic(kind: GameText.constellationKind(cosmetic.kind),
                                                            star: GameCopy.formatCount(cosmetic.star)))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("game.constellation.cosmetic")
                }
            }
            GameNote(text: GameText.constellationVisibility)
        }
        .accessibilityIdentifier("game.constellation")
    }
}

/// Le ciel : des points fixes (la même figure que le web), les étoiles allumées reliées, la suivante qui se remplit.
private struct GameConstellationSky: View {
    let stars: Int
    let inStar: Int?

    private static let points: [CGPoint] = [
        CGPoint(x: 14, y: 52), CGPoint(x: 40, y: 24), CGPoint(x: 66, y: 44), CGPoint(x: 92, y: 16), CGPoint(x: 118, y: 38),
        CGPoint(x: 144, y: 60), CGPoint(x: 170, y: 30), CGPoint(x: 196, y: 50), CGPoint(x: 222, y: 20), CGPoint(x: 248, y: 42),
        CGPoint(x: 274, y: 62), CGPoint(x: 300, y: 34),
    ]

    var body: some View {
        Canvas { context, size in
            let drawn = min(Self.points.count, max(5, stars + 1))
            let lit = min(stars, drawn)
            let points = Array(Self.points.prefix(drawn))
            let width = (points.last?.x ?? 0) + 14
            let scale = min(size.width / width, size.height / 76)
            let at = { (p: CGPoint) in CGPoint(x: p.x * scale, y: p.y * scale) }
            let brand = MeeshyColors.brandPrimary
            if lit > 1 {
                var line = Path()
                line.move(to: at(points[0]))
                for p in points[1..<lit] { line.addLine(to: at(p)) }
                context.stroke(line, with: .color(brand.opacity(0.45)), lineWidth: 1.5)
            }
            for (index, p) in points.enumerated() {
                let c = at(p)
                if index < lit {
                    context.fill(Path(ellipseIn: CGRect(x: c.x - 6, y: c.y - 6, width: 12, height: 12)), with: .color(brand))
                } else {
                    context.stroke(Path(ellipseIn: CGRect(x: c.x - 4, y: c.y - 4, width: 8, height: 8)), with: .color(.secondary.opacity(0.5)))
                    if index == lit, let inStar, inStar > 0 {
                        var arc = Path()
                        arc.addArc(center: c, radius: 8, startAngle: .degrees(-90),
                                   endAngle: .degrees(-90 + 360 * Double(inStar) / Double(GameConstellation.fragmentsPerStar)), clockwise: false)
                        context.stroke(arc, with: .color(brand), lineWidth: 2)
                    }
                }
            }
        }
        .flipsForRightToLeftLayoutDirection(true)
    }
}

/// L'aperçu d'un cosmétique : un médaillon de profil qui le porte.
private struct GameConstellationSwatch: View {
    let kind: ConstellationCosmeticKind

    var body: some View {
        let brand = MeeshyColors.brandPrimary
        ZStack {
            Circle().fill(Color.secondary.opacity(0.12))
            switch kind {
            case .halo: Circle().stroke(brand.opacity(0.4), lineWidth: 3).shadow(color: brand, radius: 4)
            case .frame: Circle().stroke(brand, lineWidth: 2)
            case .sparkle: Image(systemName: "sparkle").imageScale(.small).foregroundColor(brand)
            }
        }
        .frame(width: 28, height: 28)
        .accessibilityHidden(true)
    }
}
