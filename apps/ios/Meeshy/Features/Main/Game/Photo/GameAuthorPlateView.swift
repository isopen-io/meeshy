import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// LA PLAQUE D'AUTEUR (#10816) — le cartouche à bouts entaillés qui grave le pseudo de l'auteur. Miroir de
/// `apps/web/src/components/game/author-plate.tsx`, coordonnée pour coordonnée (boîte 360 × 100) : à gauche
/// le médaillon (photo de profil dans la carte posée, monogramme dans l'image exportée — `ImageRenderer` ne
/// rend pas une image qui se charge), à droite la formule de la famille en petites capitales et le
/// `@pseudo` dans le fini de l'étape :
///  - `engrave` : les lettres creusées, encre du métal et arête claire décalée ;
///  - `emboss` : la feuille d'or frappée sur un champ creusé sombre, lisible sur tout métal ;
///  - `scratch` : le nom doré sous une couche d'argent grattée en trois passes.
///
/// Un dessin pour tous, qui lit la donnée (`GamePhotoAuthorPlate.plate`) et ne décide rien. Décoratif :
/// l'hôte dit la plaque en toutes lettres (`plate.label`). Le texte est FIGÉ dans le cadre fixe du
/// cartouche (comme celui de `GamePhotoCanvasView`) : il ne grandit pas avec Dynamic Type, qui le ferait
/// sortir de la plaque.
struct GameAuthorPlateView: View {
    let plate: AuthorPlate
    let width: CGFloat
    /// La carte affichée montre la photo de profil ; l'image exportée garde le monogramme.
    var showsAvatar: Bool = false

    static let box = GamePhotoAuthorPlateMotion.box
    private static let nameX: CGFloat = 214
    private static let nameWidth: CGFloat = 212

    var body: some View {
        let scale = width / Self.box.width
        drawing
            .frame(width: Self.box.width, height: Self.box.height, alignment: .topLeading)
            .scaleEffect(scale, anchor: .topLeading)
            .frame(width: width, height: Self.box.height * scale, alignment: .topLeading)
            .environment(\.layoutDirection, .leftToRight)
            .accessibilityHidden(true)
    }

    private var paint: PlatePaint { PlatePaint(plate.metal) }

    private var drawing: some View {
        ZStack(alignment: .topLeading) {
            PlateOutline(points: Self.bodyPoints).fill(paint.gradient)
            PlateOutline(points: Self.innerPoints).stroke(paint.ink.opacity(0.35), lineWidth: 1.2)
            rivet(x: 16)
            rivet(x: 344)
            medallion
            line(plate.caption.uppercased(), size: 10.5, weight: .bold, baseline: 37)
                .tracking(2.6)
                .foregroundColor(paint.ink.opacity(0.8))
            name
        }
    }

    private func rivet(x: CGFloat) -> some View {
        Circle().fill(paint.ink.opacity(0.45))
            .frame(width: 5.2, height: 5.2)
            .position(x: x, y: 50)
    }

    // MARK: - Le médaillon

    @ViewBuilder
    private var medallion: some View {
        ZStack {
            Circle().fill(paint.gradient)
            Circle().stroke(paint.ink.opacity(0.4), lineWidth: 1.2)
            Circle().fill(Self.edge).frame(width: 62, height: 62)
            if showsAvatar, let avatar = plate.avatar {
                MeeshyAvatar(name: plate.name, context: .custom(62), avatarURL: avatar, enablePulse: false, isDark: true)
                    .frame(width: 62, height: 62)
                    .clipShape(Circle())
            } else {
                Text(plate.monogram)
                    .font(Self.fixedFont(25, .heavy))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(width: 56)
            }
        }
        .frame(width: 70, height: 70)
        .position(x: 58, y: 50)
    }

    // MARK: - Le nom, dans son fini

    @ViewBuilder
    private var name: some View {
        switch plate.finish {
        case .engrave:
            ZStack(alignment: .topLeading) {
                line(plate.name, size: 27, weight: .heavy, baseline: 71)
                    .foregroundColor((paint.isDark ? Color.black : Color.white).opacity(0.55))
                    .offset(y: 1.2)
                line(plate.name, size: 27, weight: .heavy, baseline: 71)
                    .foregroundColor(paint.ink)
            }
        case .emboss:
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(Self.edge)
                    .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(paint.ink.opacity(0.5), lineWidth: 1.2))
                    .frame(width: 220, height: 34)
                    .position(x: 104 + 110, y: 47 + 17)
                line(plate.name, size: 24, weight: .heavy, baseline: 72)
                    .foregroundColor(Color.black.opacity(0.7))
                    .offset(y: 1.4)
                line(plate.name, size: 24, weight: .heavy, baseline: 72)
                    .foregroundStyle(GameMaterial.gold.gradient)
            }
        case .scratch:
            ZStack(alignment: .topLeading) {
                line(plate.name, size: 27, weight: .heavy, baseline: 71)
                    .foregroundStyle(GameMaterial.gold.gradient)
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(GameMaterial.silver.gradient)
                    .frame(width: 204, height: 40)
                    .position(x: 112 + 102, y: 40 + 20)
                    .mask {
                        ZStack {
                            Rectangle()
                            PlatePolyline(points: Self.scratchPasses)
                                .stroke(style: StrokeStyle(lineWidth: 11, lineJoin: .round))
                                .blendMode(.destinationOut)
                        }
                        .compositingGroup()
                    }
                    .accessibilityHidden(true)
            }
        }
    }

    /// Une ligne de texte centrée sur `nameX`, posée sur sa ligne de BASE (`baseline`), comme `<text y=…>`.
    private func line(_ text: String, size: CGFloat, weight: UIFont.Weight, baseline: CGFloat) -> some View {
        Text(text)
            .font(Self.fixedFont(size, weight))
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .frame(width: Self.nameWidth, height: size * 1.3)
            .position(x: Self.nameX, y: baseline - size * 0.35)
    }

    /// Un cadre fixe : la taille est celle du cartouche, jamais celle de Dynamic Type.
    static func fixedFont(_ size: CGFloat, _ weight: UIFont.Weight) -> Font {
        Font(UIFont.systemFont(ofSize: size, weight: weight) as CTFont)
    }

    private static let edge = MeeshyColors.indigo950

    private static let bodyPoints: [CGPoint] = [
        CGPoint(x: 22, y: 8), CGPoint(x: 338, y: 8), CGPoint(x: 352, y: 50),
        CGPoint(x: 338, y: 92), CGPoint(x: 22, y: 92), CGPoint(x: 8, y: 50),
    ]
    private static let innerPoints: [CGPoint] = [
        CGPoint(x: 27, y: 15), CGPoint(x: 333, y: 15), CGPoint(x: 344, y: 50),
        CGPoint(x: 333, y: 85), CGPoint(x: 27, y: 85), CGPoint(x: 16, y: 50),
    ]
    /// Les trois passes de la pièce : ce qui en a été gratté ne cache plus le nom.
    static let scratchPasses: [CGPoint] = [
        CGPoint(x: 118, y: 46), CGPoint(x: 310, y: 50), CGPoint(x: 120, y: 58),
        CGPoint(x: 312, y: 62), CGPoint(x: 118, y: 70), CGPoint(x: 310, y: 76),
    ]
}

/// Le métal peint : les matières du jeu, et l'indigo de la plaque neutre.
private struct PlatePaint {
    let gradient: LinearGradient
    let ink: Color
    /// Sur un métal sombre, l'arête de la gravure est une ombre : la lumière y serait une tache.
    let isDark: Bool

    init(_ metal: PlateMetal) {
        if let material = GameMaterial(rawValue: metal.rawValue) {
            gradient = material.gradient
            ink = material.ink
        } else {
            gradient = LinearGradient(colors: [MeeshyColors.indigo400, MeeshyColors.indigo800], startPoint: .topLeading, endPoint: .bottomTrailing)
            ink = MeeshyColors.indigo50
        }
        isDark = metal == .indigo || metal == .obsidian
    }
}

nonisolated private struct PlateOutline: Shape {
    let points: [CGPoint]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addLines(points)
        path.closeSubpath()
        return path
    }
}

nonisolated private struct PlatePolyline: Shape {
    let points: [CGPoint]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addLines(points)
        return path
    }
}
