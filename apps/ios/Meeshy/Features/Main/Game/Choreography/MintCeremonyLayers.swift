import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ce que la scène écrit (`game.frappe.*`, les mêmes clés et les mêmes mots que le web)

enum MintCeremonyCopy {
    static var light: String { String(localized: "game.frappe.light", defaultValue: "ta lumière", bundle: .main) }
    static var tchak: String { String(localized: "game.frappe.tchak", defaultValue: "Tchak\u{00A0}!", bundle: .main) }
    static var tchakFinal: String { String(localized: "game.frappe.tchak_final", defaultValue: "TCHAK\u{00A0}!", bundle: .main) }
    static var skip: String { String(localized: "game.frappe.skip", defaultValue: "Toucher pour passer", bundle: .main) }
    static var ancestors: String {
        String(localized: "game.frappe.ancestors.title", defaultValue: "Tes aïeux se manifestent", bundle: .main)
    }

    static func ancestorsLine(_ edition: MeeshEdition) -> String {
        edition == .prism
            ? String(localized: "game.frappe.ancestors.prism", defaultValue: "chaque millième pièce réunit toutes les langues", bundle: .main)
            : String(localized: "game.frappe.ancestors.gold", defaultValue: "chaque centième pièce porte leur lumière", bundle: .main)
    }

    static func say(_ edition: MeeshEdition, number: Int) -> String {
        let shown = GameCopy.formatCount(number)
        switch edition {
        case .silver: return String(localized: "game.frappe.say.silver", defaultValue: "La n° \(shown) rejoint ton Héritage.", bundle: .main)
        case .gold: return String(localized: "game.frappe.say.gold", defaultValue: "La n° \(shown) est d’or. Tes aïeux l’ont vue.", bundle: .main)
        case .prism:
            return String(localized: "game.frappe.say.prism", defaultValue: "La n° \(shown) est de prisme\u{00A0}: toutes les langues y brillent.", bundle: .main)
        }
    }

    static func glory(_ amount: Int) -> String {
        let shown = GameCopy.formatCount(amount)
        return String(localized: "game.frappe.glory", defaultValue: "+\(shown) de gloire", bundle: .main)
    }

    static func refused(_ reason: MintRefusalReason) -> String {
        switch reason {
        case .shadow:
            String(localized: "game.frappe.refused.shadow",
                   defaultValue: "Une ombre voile ta lumière. Tes prochaines étincelles la dissiperont, et on frappera.", bundle: .main)
        case .locked:
            String(localized: "game.frappe.refused.locked",
                   defaultValue: "Ton Héritage attend un rang plus haut. Ta gloire l’ouvrira, et on frappera.", bundle: .main)
        case .light:
            String(localized: "game.frappe.refused.light",
                   defaultValue: "Ta lumière ne suffit pas encore. Tes prochaines étincelles la nourriront.", bundle: .main)
        case .offline:
            String(localized: "game.frappe.refused.offline",
                   defaultValue: "Pas de connexion pour l’instant. Dès qu’elle revient, on frappe.", bundle: .main)
        case .other:
            String(localized: "game.frappe.refused.unknown",
                   defaultValue: "La frappe n’a pas eu lieu. Rien n’est perdu\u{00A0}: ta lumière est intacte.", bundle: .main)
        }
    }
}

// MARK: - Les couleurs : une forge de nuit, la même en clair et en sombre (`apps/web/src/styles/game-ceremony.css`)

struct MintCeremonyPalette {
    let bg: [Color]
    let orb: [Color]
    let weave: [Color]
    let glow: [Color]
    let sign: Color
    let iris = ["ff8fb1", "ffb36b", "ffd36b", "8ff0c4", "8fc8ff", "a99bff", "e39bff"].map(Color.init(hex:))
    let silver = ["eef1f6", "c9cfda", "ffffff", "dfe4ec"].map(Color.init(hex:))
    let gold = ["ffd36b", "f2b136", "ffe7a3"].map(Color.init(hex:))
    let diamond = ["f4fbff", "dff3ff"].map(Color.init(hex:))
    let spark = ["ffe3a0", "ffffff"].map(Color.init(hex:))
    let ash = Color(hex: "9aa0ad")
    let orbInk = Color(hex: "e9d9b0")
    let steel = [Color(hex: "d6dbe5"), Color(hex: "7d8392")]
    let anvil = [Color(hex: "70778a"), Color(hex: "2c2f37")]
    let anvilTop = [Color(hex: "a9afbd"), Color(hex: "5b6070")]
    let die = [Color(hex: "5d6270"), Color(hex: "c9cfdb"), Color(hex: "6d7280")]
    let wood = [Color(hex: "6b4423"), Color(hex: "a8743f")]
    let flash = [Color.white, Color(red: 1, green: 250 / 255, blue: 230 / 255, opacity: 0.85), Color(red: 1, green: 240 / 255, blue: 200 / 255, opacity: 0)]
    let ring = Color(red: 1, green: 236 / 255, blue: 180 / 255, opacity: 0.95)
    let ray = Color(red: 1, green: 214 / 255, blue: 107 / 255, opacity: 0.55)
    let tchak = Color(hex: "ffcf5c")
    let signSub = Color(hex: "cdbd8e")
    let say = Color(hex: "f3eaff")
    let hint = Color.white.opacity(0.42)
    let gloryInk = Color(hex: "8ff0bd")
    let shade = Color.black.opacity(0.45)
    let ombre = [Color(red: 8 / 255, green: 6 / 255, blue: 18 / 255, opacity: 0.97),
                 Color(red: 8 / 255, green: 6 / 255, blue: 18 / 255, opacity: 0.86),
                 Color(red: 8 / 255, green: 6 / 255, blue: 18 / 255, opacity: 0)]

    init(edition: MeeshEdition) {
        let night = edition == .prism
        bg = (night ? ["211b42", "0b0918", "040309"] : ["2a2014", "120d09", "06050a"]).map(Color.init(hex:))
        orb = night
            ? [Color.white, Color(hex: "d9c8ff"), Color(red: 160 / 255, green: 120 / 255, blue: 1, opacity: 0)]
            : [Color(hex: "fffbe6"), Color(hex: "ffd27a"), Color(red: 1, green: 190 / 255, blue: 90 / 255, opacity: 0)]
        weave = (edition == .gold ? ["fff1c2", "ffd96b", "ffc24d"] : ["fff6dc", "ffe6a6", "ffd27a"]).map(Color.init(hex:))
        switch edition {
        case .silver:
            glow = [Color(red: 1, green: 240 / 255, blue: 200 / 255, opacity: 0.75), Color(red: 1, green: 214 / 255, blue: 140 / 255, opacity: 0.3),
                    Color(red: 1, green: 200 / 255, blue: 120 / 255, opacity: 0)]
        case .gold:
            glow = [Color(red: 1, green: 226 / 255, blue: 140 / 255, opacity: 0.85), Color(red: 1, green: 190 / 255, blue: 70 / 255, opacity: 0.35),
                    Color(red: 1, green: 170 / 255, blue: 40 / 255, opacity: 0)]
        case .prism:
            glow = [Color.white.opacity(0.8), Color(red: 195 / 255, green: 160 / 255, blue: 1, opacity: 0.35),
                    Color(red: 140 / 255, green: 200 / 255, blue: 1, opacity: 0)]
        }
        sign = Color(hex: night ? "efe4ff" : "ffe7a8")
    }

    func color(_ ink: MintCeremonyInk) -> Color {
        switch ink {
        case .weave(let i): weave[i % weave.count]
        case .iris(let i): iris[i % iris.count]
        case .silver(let i): silver[i % silver.count]
        case .gold(let i): gold[i % gold.count]
        case .diamond(let i): diamond[i % diamond.count]
        case .spark(let i): spark[i % spark.count]
        case .ash: ash
        }
    }
}

// MARK: - Les calques de la forge : lumière, enclume, particules, Mee et Meo, coin, marteaux, éclats, phrases

struct MintCeremonyStageLayers: View {
    let edition: MeeshEdition
    let number: Int
    let refusal: MintRefusalReason?
    let batches: [MintCeremonyBatch]
    let reduced: Bool
    let frame: MintCeremonyFrame
    let stage: MintCeremonyFit
    let palette: MintCeremonyPalette

    private typealias Stage = MintCeremonyStage

    var body: some View {
        ZStack(alignment: .topLeading) {
            MintCeremonyRays(prism: edition == .prism, palette: palette)
                .rotationEffect(.degrees(frame.rays.rotate))
                .scaleEffect(frame.rays.scale)
                .opacity(frame.rays.opacity)
                .modifier(MintCeremonyStageBox(stage: stage, x: frame.coin.x - 165, y: frame.coin.y - 165, w: 330, h: 330))
            sign
            if !reduced { forge }
            actor(.mee, frame.mee)
            actor(.meo, frame.meo)
            tools
            impacts
            Text(refusal.map(MintCeremonyCopy.refused) ?? MintCeremonyCopy.say(edition, number: number))
                .font(stage.font(14).italic())
                .foregroundStyle(palette.say)
                .multilineTextAlignment(.center)
                .lineSpacing(3 * stage.k)
                .opacity(frame.say)
                .modifier(MintCeremonyStageBox(stage: stage, x: 16, y: 600, w: 328, h: 40))
        }
        .allowsHitTesting(false)
    }

    private var sign: some View {
        VStack(spacing: 3 * stage.k) {
            Text(MintCeremonyCopy.ancestors)
                .font(stage.font(15, weight: .semibold))
                .foregroundStyle(palette.sign)
            Text(MintCeremonyCopy.ancestorsLine(edition))
                .font(stage.font(11.5, weight: .medium))
                .foregroundStyle(palette.signSub)
        }
        .multilineTextAlignment(.center)
        .opacity(frame.sign)
        .modifier(MintCeremonyStageBox(stage: stage, x: 20, y: 150, w: 320, h: 40))
    }

    @ViewBuilder
    private var forge: some View {
        Circle()
            .fill(RadialGradient(stops: [.init(color: palette.orb[0], location: 0), .init(color: palette.orb[1], location: 0.36),
                                         .init(color: palette.orb[2], location: 0.7)],
                                 center: .center, startRadius: 0, endRadius: 42.4 * stage.k))
            .scaleEffect(frame.orb)
            .modifier(MintCeremonyStageBox(stage: stage, x: 150, y: 66, w: 60, h: 60))
        Text(MintCeremonyCopy.light)
            .font(stage.font(11, weight: .semibold))
            .tracking(0.66 * stage.k)
            .foregroundStyle(palette.orbInk)
            .modifier(MintCeremonyStageBox(stage: stage, x: 100, y: 128, w: 160, h: 16))
        RoundedRectangle(cornerRadius: 4 * stage.k)
            .fill(LinearGradient(colors: palette.anvilTop, startPoint: .top, endPoint: .bottom))
            .modifier(MintCeremonyStageBox(stage: stage, x: 104, y: 543, w: 152, h: 10))
        MintCeremonyAnvil()
            .fill(LinearGradient(colors: palette.anvil, startPoint: .top, endPoint: .bottom))
            .modifier(MintCeremonyStageBox(stage: stage, x: 112, y: 550, w: 136, h: 46))
        MintCeremonyParticleCanvas(batches: batches, stage: stage, palette: palette)
        Circle()
            .fill(RadialGradient(stops: [.init(color: palette.ombre[0], location: 0), .init(color: palette.ombre[1], location: 0.42),
                                         .init(color: palette.ombre[2], location: 0.72)],
                                 center: .center, startRadius: 0, endRadius: 162.6 * stage.k))
            .scaleEffect(frame.shadow.scale)
            .opacity(frame.shadow.opacity)
            .modifier(MintCeremonyStageBox(stage: stage, x: Stage.circle.x - 115, y: Stage.circle.y - 115, w: 230, h: 230))
    }

    private func actor(_ bird: MintCeremonyHitter, _ pose: MintCeremonyFrame.Actor) -> some View {
        MintCeremonyActor(bird: bird, edition: edition, pose: pose.pose, side: Stage.bird * stage.k)
            .rotationEffect(.degrees(pose.rotate))
            .scaleEffect(pose.scale)
            .modifier(MintCeremonyStageBox(stage: stage, x: pose.x, y: pose.y, w: Stage.bird, h: Stage.bird))
    }

    @ViewBuilder
    private var tools: some View {
        RoundedRectangle(cornerRadius: 4 * stage.k)
            .fill(LinearGradient(stops: [.init(color: palette.die[0], location: 0), .init(color: palette.die[1], location: 0.45),
                                         .init(color: palette.die[2], location: 1)],
                                 startPoint: .leading, endPoint: .trailing))
            .shadow(color: palette.shade, radius: 2.5 * stage.k, y: 2 * stage.k)
            .scaleEffect(x: 1, y: frame.die.squash, anchor: .bottom)
            .opacity(frame.die.opacity)
            .modifier(MintCeremonyStageBox(stage: stage, x: frame.die.x, y: frame.die.y, w: 26, h: 50))
        hammer(frame.hammerMeo)
        hammer(frame.hammerMee)
    }

    private func hammer(_ h: MintCeremonyFrame.Hammer) -> some View {
        MintCeremonyHammer(stage: stage, palette: palette)
            .rotationEffect(.degrees(h.angle), anchor: .bottom)
            .opacity(h.opacity)
            .modifier(MintCeremonyStageBox(stage: stage, x: h.x, y: h.y, w: 8, h: 100))
    }

    @ViewBuilder
    private var impacts: some View {
        Circle()
            .strokeBorder(palette.ring, lineWidth: 3 * stage.k)
            .scaleEffect(frame.ring.scale)
            .opacity(frame.ring.opacity)
            .modifier(MintCeremonyStageBox(stage: stage, x: 150, y: Stage.anvilCenter.y - 70, w: 60, h: 60))
        // Les deux « tchak » restent montés : passer de l'un à l'autre ne recompose aucun texte pendant le coup.
        ZStack {
            tchak(MintCeremonyCopy.tchak).opacity(frame.tchak.isFinal ? 0 : 1)
            tchak(MintCeremonyCopy.tchakFinal).opacity(frame.tchak.isFinal ? 1 : 0)
        }
            .scaleEffect(frame.tchak.scale)
            .opacity(frame.tchak.opacity)
            .modifier(MintCeremonyStageBox(stage: stage, x: 60, y: 318, w: 240, h: 36))
        Rectangle()
            .fill(RadialGradient(stops: [.init(color: palette.flash[0], location: 0), .init(color: palette.flash[1], location: 0.355),
                                         .init(color: palette.flash[2], location: 1)],
                                 center: .center, startRadius: 0, endRadius: 270 * stage.k))
            .opacity(frame.flash)
            .modifier(MintCeremonyStageBox(stage: stage, x: -180, y: 448 - 640, w: 720, h: 1280))
    }

    private func tchak(_ text: String) -> some View {
        Text(text)
            .font(stage.font(28, weight: .black))
            .foregroundStyle(palette.tchak)
            .shadow(color: palette.shade, radius: 0, y: 2 * stage.k)
    }
}

/// L'enclume : un trapèze, plus large en haut.
nonisolated private struct MintCeremonyAnvil: Shape {
    func path(in rect: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: rect.minX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.minX + rect.width * 0.82, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.minX + rect.width * 0.18, y: rect.maxY))
            p.closeSubpath()
        }
    }
}

/// Le marteau : un manche de bois, une tête d'acier qui déborde en haut.
private struct MintCeremonyHammer: View {
    let stage: MintCeremonyFit
    let palette: MintCeremonyPalette

    var body: some View {
        RoundedRectangle(cornerRadius: 3 * stage.k)
            .fill(LinearGradient(colors: [palette.wood[0], palette.wood[1], palette.wood[0]], startPoint: .leading, endPoint: .trailing))
            .overlay(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 5 * stage.k)
                    .fill(LinearGradient(colors: palette.steel, startPoint: .top, endPoint: .bottom))
                    .frame(width: 42 * stage.k, height: 22 * stage.k)
                    .offset(x: -17 * stage.k, y: -14 * stage.k)
            }
    }
}

/// Les rayons de l'or et du prisme : des pans d'une roue, qui s'effacent vers le bord.
private struct MintCeremonyRays: View {
    let prism: Bool
    let palette: MintCeremonyPalette

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = size.width / 2 * 1.42
            func wedge(_ from: Double, _ to: Double) -> Path {
                Path { p in
                    p.move(to: center)
                    p.addArc(center: center, radius: radius, startAngle: .degrees(from - 90), endAngle: .degrees(to - 90), clockwise: false)
                    p.closeSubpath()
                }
            }
            if prism {
                let tints = [palette.iris[0], palette.iris[2], palette.iris[3], palette.iris[4], palette.iris[5]]
                for turn in 0..<8 {
                    for (index, tint) in tints.enumerated() {
                        let from = Double(turn * 45 + index * 7)
                        context.fill(wedge(from, from + 7), with: .color(tint))
                    }
                }
            } else {
                for turn in 0..<18 { context.fill(wedge(Double(turn * 20), Double(turn * 20 + 8)), with: .color(palette.ray)) }
            }
        }
        .mask(RadialGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.26), .init(color: .clear, location: 0.7)],
                             center: .center, startRadius: 0, endRadius: 233))
        .clipShape(Circle())
    }
}

/// Mee ou Meo, par leurs figures dessinées : au repos, à la fête (une pose par édition), ou Mee qui encourage au refus.
private struct MintCeremonyActor: View {
    let bird: MintCeremonyHitter
    let edition: MeeshEdition
    let pose: MintCeremonyPose
    let side: CGFloat

    private static let party: [MeeshEdition: (mee: String, meo: String)] = [
        .silver: ("mee-bravo", "meo-trophee"), .gold: ("mee-jackpot", "meo-roi"), .prism: ("mee-wow", "meo-feu-artifice"),
    ]

    private var films: [(id: String, pose: MintCeremonyPose)] {
        let party = Self.party[edition] ?? ("mee-bravo", "meo-trophee")
        return bird == .mee
            ? [("mee-sourire", .rest), (party.mee, .party), ("mee-courage", .courage)]
            : [("meo-salut", .rest), (party.meo, .party)]
    }

    var body: some View {
        ZStack {
            ForEach(films, id: \.id) { film in
                MeeStickerFilmView(filmID: film.id, animated: false, side: side, animates: false, pixelCap: 360)
                    .opacity(film.pose == pose ? 1 : 0)
            }
        }
        .scaleEffect(x: bird == .meo ? -1 : 1, y: 1)
        .accessibilityHidden(true)
    }
}

/// Les particules d'une image, peintes en lots sur le GPU : une encre et une opacité par trait.
private struct MintCeremonyParticleCanvas: View {
    let batches: [MintCeremonyBatch]
    let stage: MintCeremonyFit
    let palette: MintCeremonyPalette

    var body: some View {
        Canvas { context, _ in
            context.translateBy(x: stage.offX, y: stage.offY)
            context.scaleBy(x: stage.k, y: stage.k)
            for batch in batches {
                var layer = context
                layer.blendMode = batch.additive ? .plusLighter : .normal
                layer.opacity = batch.opacity
                let shading = GraphicsContext.Shading.color(palette.color(batch.ink))
                if !batch.rects.isEmpty {
                    var path = Path()
                    path.addRects(batch.rects)
                    layer.fill(path, with: shading)
                }
                if !batch.circles.isEmpty {
                    var path = Path()
                    batch.circles.forEach { path.addEllipse(in: $0) }
                    layer.fill(path, with: shading)
                }
            }
        }
        .frame(width: stage.size.width, height: stage.size.height)
        .allowsHitTesting(false)
    }
}

// MARK: - La pièce : le flan qui se fige, la gravure sous le marteau, le revers, le vol vers l'Héritage

struct MintCeremonyCoinLayers: View {
    let edition: MeeshEdition
    let number: Int
    let frame: MintCeremonyFrame
    let stage: MintCeremonyFit
    let palette: MintCeremonyPalette
    var target: MintCeremonyTarget = MintCeremonyStage.defaultTarget

    private var year: Int { Calendar.current.component(.year, from: Date()) }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Circle()
                .fill(RadialGradient(stops: [.init(color: palette.glow[0], location: 0), .init(color: palette.glow[1], location: 0.35),
                                             .init(color: palette.glow[2], location: 0.68)],
                                     center: .center, startRadius: 0, endRadius: 169.7 * stage.k))
                .scaleEffect(frame.glow.scale)
                .opacity(frame.glow.opacity)
                .modifier(MintCeremonyStageBox(stage: stage, x: frame.glow.x - 120, y: frame.glow.y - 120, w: 240, h: 240))
            coin
                .scaleEffect(x: frame.coin.scale, y: frame.coin.scale * frame.coin.squash)
                .opacity(frame.coin.opacity)
                .modifier(MintCeremonyStageBox(stage: stage, x: frame.coin.x - 75, y: frame.coin.y - 75, w: 150, h: 150))
            Text(MintCeremonyCopy.glory(GameGlory.points.mint))
                .font(stage.font(13, weight: .heavy))
                .foregroundStyle(palette.gloryInk)
                .lineLimit(1)
                .opacity(frame.glory.opacity)
                .modifier(MintCeremonyStageBox(stage: stage, x: target.x - 80, y: target.y - 24 - 40 * frame.glory.rise, w: 160, h: 18))
        }
        .allowsHitTesting(false)
    }

    /// Une face cachée n'est jamais tout à fait transparente : dessinée dès l'ouverture, elle ne coûte rien quand elle
    /// paraît (sous le coup, puis au retournement) — une face dessinée à son premier regard perdait une image.
    private static let hidden = 0.001

    /// Les deux faces, chacune visible quand elle regarde l'écran : le flan qui devient l'avers frappé, puis le revers.
    private var coin: some View {
        let angle = frame.coin.rotateY
        let turned = (angle.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
        let showsReverse = turned > 90 && turned < 270
        return ZStack {
            ZStack {
                MintCeremonyCoinFace(face: .blank, edition: edition).opacity(max(Self.hidden, 1 - frame.coin.engraved))
                MintCeremonyCoinFace(face: .obverse, edition: edition).opacity(max(Self.hidden, frame.coin.engraved))
            }
            .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0), perspective: 0.35)
            .opacity(showsReverse ? Self.hidden : 1)
            MintCeremonyCoinFace(face: .reverse(number: number, year: year), edition: edition)
                .rotation3DEffect(.degrees(angle + 180), axis: (x: 0, y: 1, z: 0), perspective: 0.35)
                .opacity(showsReverse ? 1 : Self.hidden)
        }
    }
}

/// Une face de la Meesh, qui ne se redessine que si sa face ou son édition changent — pas à chaque image.
private struct MintCeremonyCoinFace: View, Equatable {
    let face: MeeshCoinView.Face
    let edition: MeeshEdition

    var body: some View {
        MeeshCoinView(face: face, edition: edition, figures: nil)
    }
}
