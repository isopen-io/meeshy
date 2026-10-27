import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA PLAQUE VIVANTE (#10816) — la plaque fixe, et par-dessus l'animation Lottie de son fini
/// (`GamePhotoAuthorPlateMotion`), jouée une fois par le moteur unique de l'app (`LottieLayerView`).
/// Sous « Réduire les animations » — celui du système ou celui de Meeshy —, ou si le film ne se lit pas,
/// rien ne monte : la plaque fixe est l'état final, jamais un nom caché.
struct GameAuthorPlateLive: View {
    let plate: AuthorPlate
    let width: CGFloat
    var showsAvatar: Bool = true

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion

    var body: some View {
        GameAuthorPlateView(plate: plate, width: width, showsAvatar: showsAvatar)
            .overlay {
                if !MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion),
                   let film = GameAuthorPlateFilms.film(plate.finish) {
                    LottieLayerView(film: film, contentMode: .fit, loops: false)
                }
            }
    }
}

/// Les films des trois finis, générés et lus UNE fois chacun.
@MainActor
enum GameAuthorPlateFilms {
    private static var films: [PlateFinish: LottieFilmSource] = [:]

    static func film(_ finish: PlateFinish) -> LottieFilmSource? {
        if let film = films[finish] { return film }
        let film = LottieLayerSource.film(data: GamePhotoAuthorPlateMotion.data(finish))
        films[finish] = film
        return film
    }
}

/// LA CARTE POSÉE (#10816) — constat porteur : « le cadre du premier achievement est moche, prend tout
/// l'écran et ne dit rien sur l'auteur ». La proposition de photo d'un succès, d'un rang ou d'une fin de
/// mission est une CARTE bornée (300 pt), inclinée d'un degré et demi, une ombre de table : l'emblème au
/// métal de l'étape, le moment, la date, et la plaque gravée au pseudo de l'auteur, sa photo de profil dans
/// le médaillon. Miroir de `apps/web/src/components/game-author-card.tsx`.
///
/// Elle se dit en UNE phrase : le moment et son auteur ; les dessins dessous sont décoratifs.
struct GameAuthorCardView: View {
    let moment: PhotoMoment
    let plate: AuthorPlate
    let dateLabel: String

    static let maxWidth: CGFloat = 300

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            GamePhotoEmblem(moment: moment)
                .frame(width: 96, height: 96)
            Text(moment.kicker.uppercased())
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(MeeshyColors.indigo200)
            Text(moment.title)
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                .foregroundStyle(Color.white)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text(dateLabel)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundStyle(MeeshyColors.indigo200)
            GameAuthorPlateLive(plate: plate, width: Self.maxWidth - 2 * MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.xs)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.md)
        .frame(maxWidth: Self.maxWidth)
        .background(GameAuthorCardBackdrop())
        .rotationEffect(.degrees(-1.5))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(moment.kicker) : \(moment.title) — \(plate.label)")
        .accessibilityAddTraits(.isImage)
        .accessibilityIdentifier("game.photo.author.card")
    }
}

/// Le fond de la carte posée : le dégradé de la marque, une ombre de table.
struct GameAuthorCardBackdrop: View {
    var body: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
            .fill(LinearGradient(colors: [MeeshyColors.indigo950, MeeshyColors.indigo500], startPoint: .top, endPoint: .bottom))
            .shadow(color: MeeshyColors.indigo950.opacity(0.55), radius: 20, y: 16)
    }
}
