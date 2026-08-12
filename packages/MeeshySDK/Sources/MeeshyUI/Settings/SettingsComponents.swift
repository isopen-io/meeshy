//
//  SettingsComponents.swift
//  MeeshyUI
//
//  Trame commune des écrans de réglages : carte groupée, ligne, en-tête de
//  section, bouton (i) et sa fiche en verre.
//
//  Ces composants vivent dans le SDK parce qu'ils sont des ATOMES : ils ne
//  prennent que des paramètres opaques (titre, icône, teinte hexadécimale,
//  contenu de fin) et n'encodent aucune règle produit. Ils remplacent des
//  helpers `settingsSection` / `settingsRow` qui étaient recopiés à
//  l'identique dans chaque écran de réglages de l'app — une refonte visuelle
//  s'y payait autant de fois qu'il y avait d'écrans.
//

import SwiftUI

// MARK: - Métriques

/// Constantes de la trame, et les deux valeurs qu'on en DÉRIVE.
///
/// Dériver plutôt que régler : le filet séparateur doit commencer au texte, pas
/// au bord de la carte. Le fixer à la main le désaligne à la première retouche
/// de la pastille d'icône.
public enum SettingsRowMetrics {
    public static let iconSize: CGFloat = 34
    public static let iconTextSpacing: CGFloat = 14
    public static let horizontalPadding: CGFloat = 16
    public static let verticalPadding: CGFloat = 15
    /// Cible tactile minimale (Apple HIG).
    public static let minimumHeight: CGFloat = 44

    /// Décalage gauche du filet séparateur — aligné sur le titre.
    public static var separatorInset: CGFloat {
        horizontalPadding + iconSize + iconTextSpacing
    }

    /// « Titre, Valeur » — ou le titre seul quand il n'y a rien à annoncer.
    /// Une valeur vide produirait une virgule orpheline, que VoiceOver marque
    /// par une pause sur du vide.
    public static func accessibilityLabel(title: String, value: String?) -> String {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return title
        }
        return "\(title), \(value)"
    }
}

// MARK: - Fiche d'information

/// Contenu d'une fiche « (i) ».
///
/// `id` est la clé de la LIGNE, pas son titre : deux écrans peuvent
/// légitimement afficher « Analytics » sans parler de la même chose.
public struct SettingsInfo: Identifiable, Equatable, Sendable {
    public let id: String
    public let title: String
    public let message: String

    public init(id: String, title: String, message: String) {
        self.id = id
        self.title = title
        self.message = message
    }
}

// MARK: - En-tête de section

public struct SettingsSectionHeader: View {
    private let title: String
    private let icon: String
    private let color: String

    public init(title: String, icon: String, color: String) {
        self.title = title
        self.icon = icon
        self.color = color
    }

    public var body: some View {
        HStack(spacing: 7) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(12, weight: .semibold))
            Text(title.uppercased())
                .font(MeeshyFont.relative(12, weight: .bold, design: .rounded))
                .tracking(1.1)
        }
        .foregroundColor(Color(hex: color))
        .padding(.leading, MeeshySpacing.sm)
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - Carte groupée

/// Conteneur d'un groupe de lignes.
///
/// Les filets sont posés EXPLICITEMENT par l'appelant, via `SettingsSeparator`,
/// plutôt que dérivés de la position des enfants. Intercaler automatiquement
/// suppose de savoir quel enfant est le dernier, ce que SwiftUI n'expose qu'à
/// travers `_VariadicView` — de la SPI, sans aucun précédent dans le dépôt. Le
/// filet explicite se lit dans le code, se grep, et ne peut pas apparaître sous
/// la dernière ligne (qui donnerait une carte visuellement coupée).
public struct SettingsCard<Content: View>: View {
    private let tint: String
    private let content: Content
    private var theme: ThemeManager { ThemeManager.shared }

    public init(tint: String, @ViewBuilder content: () -> Content) {
        self.tint = tint
        self.content = content()
    }

    public var body: some View {
        VStack(spacing: 0) { content }
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous)
                    .fill(theme.surfaceGradient(tint: tint))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous)
                            .stroke(theme.border(tint: tint), lineWidth: 1)
                    )
            )
    }
}

/// Filet entre deux lignes, aligné sur le titre — pas sur le bord de la carte.
/// Un filet pleine largeur redonne à la carte l'aspect « tableau » dense qu'on
/// cherche à quitter.
public struct SettingsSeparator: View {
    private let tint: String

    public init(tint: String) {
        self.tint = tint
    }

    public var body: some View {
        Rectangle()
            .fill(Color(hex: tint).opacity(0.16))
            .frame(height: 0.5)
            .padding(.leading, SettingsRowMetrics.separatorInset)
            .accessibilityHidden(true)
    }
}

// MARK: - Ligne

/// Une ligne de réglage : pastille d'icône teintée, titre, sous-titre
/// optionnel, bouton (i) optionnel, contenu de fin libre (valeur, chevron,
/// interrupteur).
public struct SettingsRow<Trailing: View>: View {
    private let icon: String
    private let title: String
    private let subtitle: String?
    private let color: String
    private let info: SettingsInfo?
    private let onInfo: ((SettingsInfo) -> Void)?
    private let trailing: Trailing

    private var theme: ThemeManager { ThemeManager.shared }

    public init(
        icon: String,
        title: String,
        subtitle: String? = nil,
        color: String,
        info: SettingsInfo? = nil,
        onInfo: ((SettingsInfo) -> Void)? = nil,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.color = color
        self.info = info
        self.onInfo = onInfo
        self.trailing = trailing()
    }

    public var body: some View {
        HStack(spacing: SettingsRowMetrics.iconTextSpacing) {
            iconTile

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(title)
                        .font(MeeshyFont.relative(16, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let info, let onInfo {
                        SettingsInfoButton(info: info, color: color, action: onInfo)
                    }
                }
                if let subtitle {
                    Text(subtitle)
                        .font(MeeshyFont.relative(13, weight: .regular))
                        .foregroundColor(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: MeeshySpacing.sm)

            trailing
        }
        .padding(.horizontal, SettingsRowMetrics.horizontalPadding)
        .padding(.vertical, SettingsRowMetrics.verticalPadding)
        .frame(minHeight: SettingsRowMetrics.minimumHeight)
        .contentShape(Rectangle())
    }

    private var iconTile: some View {
        Image(systemName: icon)
            .font(MeeshyFont.relative(15, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: SettingsRowMetrics.iconSize, height: SettingsRowMetrics.iconSize)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .fill(Color(hex: color).opacity(0.14))
            )
            .accessibilityHidden(true)
    }
}

// MARK: - Bouton (i)

/// Petit `info.circle` accolé au titre. Élément d'accessibilité DISTINCT de la
/// ligne : fusionné avec elle, VoiceOver n'offrirait aucun moyen de l'atteindre
/// et l'explication serait inaccessible.
public struct SettingsInfoButton: View {
    private let info: SettingsInfo
    private let color: String
    private let action: (SettingsInfo) -> Void

    public init(info: SettingsInfo, color: String, action: @escaping (SettingsInfo) -> Void) {
        self.info = info
        self.color = color
        self.action = action
    }

    public var body: some View {
        Button {
            HapticFeedback.light()
            action(info)
        } label: {
            Image(systemName: "info.circle")
                .font(MeeshyFont.relative(14, weight: .regular))
                .foregroundColor(Color(hex: color).opacity(0.85))
                // La cible tactile atteint 44 pt sans que l'icône grossisse.
                .frame(width: SettingsRowMetrics.minimumHeight,
                       height: SettingsRowMetrics.minimumHeight)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Format et non interpolation dans `defaultValue` : une valeur par
        // défaut interpolée ne laisse aucun emplacement au traducteur, et
        // l'ordre des mots n'est pas le même dans toutes les langues.
        .accessibilityLabel(String(
            format: String(
                localized: "settings.info.button.label",
                defaultValue: "En savoir plus sur %@",
                bundle: .module
            ),
            info.title
        ))
    }
}

// MARK: - Fiche d'info en verre

extension View {
    /// Présente la fiche d'information en surimpression, sur un fond assombri.
    ///
    /// Surimpression et non `.sheet` : une feuille modale monte depuis le bas,
    /// occupe la moitié de l'écran et fait perdre le contexte de la ligne qu'on
    /// interrogeait. La fiche, elle, se pose PAR-DESSUS la ligne, en verre, et
    /// se referme d'un tap n'importe où.
    public func settingsInfoOverlay(_ info: Binding<SettingsInfo?>) -> some View {
        modifier(SettingsInfoOverlay(info: info))
    }
}

private struct SettingsInfoOverlay: ViewModifier {
    @Binding var info: SettingsInfo?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var theme: ThemeManager { ThemeManager.shared }

    func body(content: Content) -> some View {
        content
            .overlay {
                if let presented = info {
                    ZStack {
                        Color.black.opacity(0.45)
                            .ignoresSafeArea()
                            .contentShape(Rectangle())
                            .onTapGesture { dismiss() }
                            .accessibilityLabel(String(
                                localized: "common.close",
                                defaultValue: "Fermer",
                                bundle: .module
                            ))
                            .accessibilityAddTraits(.isButton)

                        card(presented)
                            .padding(.horizontal, MeeshySpacing.xxl)
                    }
                    .transition(reduceMotion
                                ? .opacity
                                : .opacity.combined(with: .scale(scale: 0.96)))
                    .zIndex(1000)
                }
            }
            .animation(reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.86),
                       value: info)
    }

    private func card(_ presented: SettingsInfo) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Text(presented.title)
                .font(MeeshyFont.relative(18, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Text(presented.message)
                .font(MeeshyFont.relative(15, weight: .regular))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                dismiss()
            } label: {
                Text(String(localized: "common.close", defaultValue: "Fermer", bundle: .module))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(Color(hex: MeeshyColors.brandPrimaryHex))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.md)
            }
            .buttonStyle(.plain)
        }
        .padding(MeeshySpacing.xl)
        .frame(maxWidth: 420)
        // Verre iOS 26 quand il existe, `.ultraThinMaterial` sinon — la
        // bascule est portée par `AdaptiveGlass`, pas dupliquée ici.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous)
                .stroke(MeeshyColors.glassBorderGradient(isDark: true), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.35), radius: 24, y: 12)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }

    private func dismiss() {
        HapticFeedback.light()
        info = nil
    }
}
