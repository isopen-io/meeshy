import ActivityKit
import WidgetKit
import SwiftUI

/// **La position qu'une personne me partage, dans l'îlot et sur l'écran verrouillé** (planche `Hors-App`, vues 1 et 2,
/// #19524).
///
/// Compacte : l'avatar et le compte à rebours. Étendue : « Partage sa position », le nom, le compte à rebours, le lieu à
/// la précision servie et « Carte ». Un appui ouvre la vitrine de la personne, d'où « voir sur la carte » part. Le
/// compte à rebours est celui du système (`Text(timerInterval:)`) : il descend sans qu'aucune mise à jour ne parte.
struct LocationShareLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LocationShareActivityAttributes.self) { context in
            LocationShareLockScreenView(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(LiveActivityStyle.brand)
                .widgetURL(WidgetDeepLink.profile(context.attributes.username))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    LocationShareAvatar(attributes: context.attributes, size: 44)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    LocationShareTitle(name: context.attributes.name)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    LocationShareCountdown(deadline: context.state.deadline)
                        .font(.title3.weight(.bold))
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    LocationShareFooter(attributes: context.attributes, state: context.state, showsCity: false)
                }
            } compactLeading: {
                LocationShareAvatar(attributes: context.attributes, size: 22)
            } compactTrailing: {
                LocationShareCountdown(deadline: context.state.deadline)
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: 48)
            } minimal: {
                LocationShareAvatar(attributes: context.attributes, size: 22)
            }
            .widgetURL(WidgetDeepLink.profile(context.attributes.username))
            .keylineTint(LiveActivityStyle.color(hex: context.attributes.accentHex))
        }
    }
}

enum LocationShareWording {
    static func sharing(_ name: String) -> String {
        String(format: String(localized: "widget.locationShare.sharing", defaultValue: "%@ is sharing their location"), name)
    }

    static var sharingCaption: String { String(localized: "widget.locationShare.caption", defaultValue: "Sharing their location") }
    static var map: String { String(localized: "widget.locationShare.map", defaultValue: "Map") }
    static var remaining: String { String(localized: "widget.locationShare.remaining", defaultValue: "Time left") }

    /// « Alfama · quartier » dans l'îlot ; « Alfama · Lisbonne » sur l'écran verrouillé ; le mot de la précision seul
    /// tant que le lieu n'est pas nommé.
    static func place(_ state: LocationShareActivitySnapshot, showsCity: Bool) -> String {
        guard let place = state.place else { return state.precision }
        let second = showsCity ? (state.city ?? state.precision) : state.precision
        return second.isEmpty ? place : "\(place) · \(second)"
    }
}

private struct LocationShareAvatar: View {
    let attributes: LocationShareActivityAttributes
    let size: CGFloat

    var body: some View {
        LiveActivityAvatar(initials: attributes.initials, accentHex: attributes.accentHex,
                           fallbackSymbol: "location.fill", size: size)
    }
}

private struct LocationShareTitle: View {
    let name: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(LocationShareWording.sharingCaption)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white.opacity(0.7))
            Text(name)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(LocationShareWording.sharing(name))
    }
}

/// Le compte à rebours jusqu'à l'échéance du partage, tenu par le système.
private struct LocationShareCountdown: View {
    let deadline: Date

    var body: some View {
        Text(timerInterval: Date()...max(Date(), deadline), countsDown: true)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
            .foregroundStyle(.white)
            .accessibilityLabel(LocationShareWording.remaining)
    }
}

private struct LocationShareFooter: View {
    let attributes: LocationShareActivityAttributes
    let state: LocationShareActivitySnapshot
    let showsCity: Bool

    var body: some View {
        HStack(spacing: 8) {
            Label(LocationShareWording.place(state, showsCity: showsCity), systemImage: "mappin.and.ellipse")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(Capsule().fill(.white.opacity(0.14)))
            Spacer(minLength: 0)
            if let url = WidgetDeepLink.profile(attributes.username) {
                Link(destination: url) {
                    Label(LocationShareWording.map, systemImage: "map.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .background(Capsule().fill(LiveActivityStyle.color(hex: attributes.accentHex)))
                }
            }
        }
    }
}

private struct LocationShareLockScreenView: View {
    let attributes: LocationShareActivityAttributes
    let state: LocationShareActivitySnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                LocationShareAvatar(attributes: attributes, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(LocationShareWording.sharing(attributes.name))
                        .font(.headline)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(LocationShareWording.place(state, showsCity: true))
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.75))
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                LocationShareCountdown(deadline: state.deadline)
                    .font(.title3.weight(.bold))
                    .frame(maxWidth: 80)
            }
            .accessibilityElement(children: .combine)
            LocationShareFooter(attributes: attributes, state: state, showsCity: false)
        }
        .padding(16)
    }
}
