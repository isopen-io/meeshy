import SwiftUI
import Combine
import MapKit
import CoreLocation
import MeeshySDK
import MeeshyUI
import os

/// La carte du bas du sélecteur de lieu : titre du lieu, coordonnées, niveau de
/// précision et bouton « Confirmer ».
///
/// Extraite de `LocationPickerView.bottomCard` à l'identique : elle ne lit rien
/// d'autre que ce qu'on lui passe, et rend ce que le destinataire recevra.
struct LocationPickerBottomCard: View {
    let accentColor: String
    let secondaryAccent: String
    /// Teinte d'accent lisible sur la carte (`OnMapColors.accent`).
    let onMapAccent: String
    let title: String?
    let isGeocoding: Bool
    let place: SharedPlace?
    let precision: LocationPrecision
    /// Reçoit le lieu confirmé. Le retour haptique et la fermeture restent à
    /// l'appelant, qui possède la sheet.
    let onConfirm: (SharedPlace) -> Void

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            summaryRow
            confirmButton
        }
        .padding(MeeshySpacing.lg)
        // iOS 26 Liquid Glass — floating bottom action card over the map. Neutral
        // glass; the inner accent CTA + secondary button stay as fills ON the glass.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
        .shadow(color: .black.opacity(MeeshyOpacity.subtle), radius: 12, y: -4)
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.bottom, MeeshySpacing.sm)
    }

    private var summaryRow: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Image(systemName: "location.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                .foregroundStyle(Color(hex: accentColor))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                // Couleurs SÉMANTIQUES, pas les tokens du thème : cette
                // carte est du verre posé sur la carte, dont le fond est
                // devenu imprévisible avec les styles satellite et hybride.
                // `theme.textMuted` (indigo à 40 %) disparaissait sur une
                // imagerie satellite sombre. `.primary`/`.secondary`
                // s'adaptent à la vibrance du matériau — c'est déjà ce que
                // fait `LocationFullscreenView` sur sa propre carte du bas.
                if let title = title {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundStyle(Color.primary)
                        .lineLimit(2)
                } else if isGeocoding {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        ProgressView()
                            .scaleEffect(0.7)
                        Text(String(localized: "location.geocoding", defaultValue: "Recherche de l'adresse…", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize))
                            .foregroundStyle(Color.secondary)
                    }
                } else {
                    Text(String(localized: "location.move-prompt", defaultValue: "Déplacez la carte pour choisir", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.smallSize))
                        .foregroundStyle(Color.secondary)
                }

                if let place = place {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        // Une paire de coordonnées est une valeur ATOMIQUE :
                        // coupée en plusieurs lignes elle devient illisible.
                        // Vérifié au simulateur en taille accessibilité XXXL
                        // « 20.00000, −0.00000 » se cassait
                        // sur QUATRE lignes et faisait doubler la carte.
                        // Elle rétrécit donc au lieu de passer à la ligne, et
                        // sa croissance est plafonnée — le reste de la carte
                        // continue de suivre le Dynamic Type normalement.
                        Text(formattedCoordinates(of: place))
                            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium, design: .monospaced))
                            .foregroundStyle(Color.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Text(verbatim: "·")
                            .font(MeeshyFont.relative(MeeshyFont.captionSize))
                            .foregroundStyle(Color.secondary)
                        Text(LocationSharingLabels.precisionBadge(precision))
                            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                            .foregroundStyle(Color(hex: onMapAccent))
                            .lineLimit(1)
                    }
                    // Plafond de croissance sur CETTE ligne seulement : une
                    // lecture technique n'a pas besoin d'atteindre les
                    // tailles accessibilité pour rester exploitable, alors
                    // que le titre du lieu juste au-dessus, lui, doit
                    // continuer de grossir.
                    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
                }
            }

            Spacer()
        }
        // VoiceOver reads the selected-location summary (address + coordinates)
        // as a single element instead of three disjoint fragments.
        .accessibilityElement(children: .combine)
    }

    private var confirmButton: some View {
        Button {
            guard let place = place else { return }
            MeeshyLog.logger(.location)
                .info("breadcrumb.selection hasName=\(place.name != nil, privacy: .public) precision=\(self.precision.rawValue, privacy: .public)")
            onConfirm(place)
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: "checkmark")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .bold))
                Text(String(localized: "common.confirm", defaultValue: "Confirmer", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(
                        // Le dégradé de la CONVERSATION : primaire vers
                        // accent, pas primaire vers lui-même atténué.
                        LinearGradient(
                            colors: [Color(hex: accentColor), Color(hex: secondaryAccent)],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                    .shadow(color: Color(hex: accentColor).opacity(MeeshyOpacity.medium), radius: 6, y: 3)
            )
        }
        .disabled(place == nil)
        .opacity(place == nil ? 0.5 : 1)
    }

    /// Le nombre de décimales suit le niveau : afficher `20.00000` pour une
    /// valeur arrondie au degré près suggérerait une précision disparue.
    private func formattedCoordinates(of place: SharedPlace) -> String {
        let places = precision.decimalPlaces ?? 5
        return String(format: "%.\(places)f, %.\(places)f", place.latitude, place.longitude)
    }
}
