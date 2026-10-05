import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// LE CADRE DU MOMENT (#9382) — conception, partie VI : « cadre du moment en
/// surimpression (emblème en haut, titre et date, Mee et Meo en bas) ». UNE
/// seule vue sert l'aperçu en direct (sur la caméra, `Background.clear`) ET
/// l'image finale (`ImageRenderer`, `Background.photo` ou `.card`) : le cadre
/// qu'on voit au moment de déclencher est celui qu'on obtient.
///
/// Elle est dessinée dans l'espace en pixels de l'image finale (1080 de large) ;
/// l'aperçu la met à l'échelle. Aucune image asynchrone : Mee et Meo sont des
/// images FIXES déjà chargées (`MeeStickerCatalog.stillImage`) et les emblèmes
/// des briques sans tenants — `ImageRenderer` ne rend pas ce qui n'a pas fini de
/// se charger.
struct GamePhotoCanvasView: View {
    enum Background {
        /// Aperçu en direct : la caméra est dessous, seul le cadre se dessine.
        case clear
        /// Une photo (selfie retourné comme dans l'aperçu, ou galerie) remplit le cadre.
        case photo(UIImage, mirrored: Bool)
        /// Sans photo : une carte aux couleurs de la marque.
        case card
    }

    let moment: PhotoMoment
    let dateLabel: String
    let format: PhotoFormat
    let background: Background
    /// 0 à 1 : la frappe « en place » — l'emblème se pose et reçoit son reflet.
    var strike: Double = 1

    private var layout: PhotoLayout { GamePhotoLayout.layout(format) }

    var body: some View {
        let l = layout
        ZStack(alignment: .topLeading) {
            backgroundLayer(l)
            emblem
                .frame(width: l.emblem.width, height: l.emblem.height)
                .scaleEffect(0.82 + 0.18 * strike)
                .opacity(0.25 + 0.75 * strike)
                .offset(x: l.emblem.minX, y: l.emblem.minY)
            text(l.kicker, text: moment.kicker.uppercased(), weight: UIFont.Weight.semibold, color: MeeshyColors.indigo200)
            text(l.title, text: moment.title, weight: UIFont.Weight.bold, color: .white)
            text(l.date, text: dateLabel, weight: UIFont.Weight.medium, color: MeeshyColors.indigo200)
            figure(id: "mee-sourire", rect: l.mee, mirrored: false)
            figure(id: "meo-salut", rect: l.meo, mirrored: true)
            SignatureMark(style: .flat, color: .white)
                .frame(width: l.signature.width, height: l.signature.height)
                .offset(x: l.signature.minX, y: l.signature.minY)
        }
        .frame(width: l.width, height: l.height, alignment: .topLeading)
        .clipped()
    }

    // MARK: - Couches

    @ViewBuilder
    private func backgroundLayer(_ l: PhotoLayout) -> some View {
        switch background {
        case .clear:
            scrims(l)
        case .photo(let image, let mirrored):
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: l.width, height: l.height)
                .scaleEffect(x: mirrored ? -1 : 1, y: 1)
                .clipped()
            scrims(l)
        case .card:
            LinearGradient(
                colors: [MeeshyColors.indigo700, MeeshyColors.indigo950],
                startPoint: .top, endPoint: .bottom
            )
            .frame(width: l.width, height: l.height)
        }
    }

    /// Les voiles qui gardent le texte lisible sur une photo : jamais opaques.
    private func scrims(_ l: PhotoLayout) -> some View {
        ZStack {
            LinearGradient(colors: [MeeshyColors.indigo950.opacity(0.55), .clear], startPoint: .top, endPoint: .bottom)
                .frame(width: l.width, height: l.height * 0.4)
                .offset(y: -l.height * 0.3)
            LinearGradient(colors: [.clear, MeeshyColors.indigo950.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                .frame(width: l.width, height: l.height * 0.65)
                .offset(y: l.height * 0.175)
        }
        .frame(width: l.width, height: l.height)
    }

    @ViewBuilder
    private var emblem: some View {
        switch moment.emblem {
        case .start:
            SignatureMark(style: .struck, color: .white)
        case .rank(let rank, let division):
            RankBlasonView(rank: rank, division: division, title: GameCopy.rankName(rank), figures: nil)
        case .tier(let tier, let level):
            LevelRingView(level: level, progress: 1, tier: tier)
        case .levelHundred(let prestige):
            LevelRingView(level: 100, progress: 1, tier: .galaxie, prestige: prestige)
        case .meesh(let number, let edition):
            MeeshCoinView(face: .reverse(number: number, year: Calendar.current.component(.year, from: Date())),
                          edition: edition, figures: nil)
        case .treasury:
            MeeshCoinView(face: .obverse, edition: .silver, figures: nil)
        case .flame(let form, _):
            FlameView(form: form, flickers: false)
        }
    }

    private func text(_ line: PhotoTextLine, text value: String, weight: UIFont.Weight, color: Color) -> some View {
        Text(value)
            .font(Self.fixedFont(line.size, weight))
            .foregroundColor(color)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .shadow(color: MeeshyColors.indigo950.opacity(0.6), radius: layout.width * 0.012)
            .frame(width: layout.width * 0.9, height: line.size * 1.3)
            .position(x: line.x, y: line.y - line.size * 0.3)
    }

    /// **Un CADRE FIXE : la taille du texte est celle de l'image finale, jamais celle de Dynamic Type.**
    /// Le cadre fait 1 080 px de large et se rend en image : un texte qui grossirait avec les réglages
    /// de l'appareil sortirait du cadre, et deux appareils ne produiraient pas la même photo.
    private static func fixedFont(_ size: CGFloat, _ weight: UIFont.Weight) -> Font {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        let rounded = base.fontDescriptor.withDesign(.rounded).map { UIFont(descriptor: $0, size: size) } ?? base
        return Font(rounded as CTFont)
    }

    @ViewBuilder
    private func figure(id: String, rect: CGRect, mirrored: Bool) -> some View {
        if let image = MeeStickerCatalog.stillImage(id: id) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .scaleEffect(x: mirrored ? -1 : 1, y: 1)
                .frame(width: rect.width, height: rect.height)
                .offset(x: rect.minX, y: rect.minY)
        }
    }
}
