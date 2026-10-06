import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'ENTRÉE MEESH de l'en-tête « Progression » (#5839) — le solde et son icône,
/// là où un trophée DÉCORATIF occupait le coin depuis #5698.
///
/// Ce que le trophée avait de faux n'était pas son dessin : il était
/// `accessibilityHidden(true)`, ne réagissait à rien et n'annonçait rien. Un
/// ornement à l'endroit où l'œil cherche un contrôle coûte plus qu'un vide.
///
/// **Le sous-menu ne propose la frappe QUE si les points la permettent.** La
/// directive du porteur est une NÉGATION — et une négation se prouve par un
/// témoin qui cherche l'ABSENCE, jamais par une capture qui montre le cas
/// heureux (`ProgressionMeeshEntryTests`).
///
/// Jumelle de `MeeshEntry` / `MeeshDetail` (`apps/web/src/routes/progression.tsx`) :
/// mêmes mots, même ordre, même règle sur la seconde borne.
///
/// **La frappe s'y JOUE (#9537)** : la feuille montre Mee et Meo qui frappent une Meesh, et le compteur ne
/// s'incrémente qu'APRÈS la fin de l'animation — la mise à jour reste optimiste, c'est ce que l'écran montre qui est
/// séquencé (`GameMintSequence`). Un refus du serveur restaure l'état, le compteur ne bouge jamais.
struct ProgressionMeeshEntry: View {
    let meesh: EngagementMeeshProgress
    let isMinting: Bool
    var mintError: String? = nil
    /// La prochaine pièce (numéro, édition) que la scène frappe ; `nil` devant un ancien serveur : pas de scène.
    var next: GameMintNext? = nil
    let onMint: () -> Void
    var haptics: GameHapticsProviding = GameHaptics.shared

    @State private var ouvert = false
    @State private var sequence = GameMintSequence<GameMintFrame>()
    @State private var strikePlay = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let tint = MeeshyColors.warning

    /// Ce que le compteur et la feuille montrent : l'image d'AVANT le toucher pendant la scène, le vivant ensuite.
    private var shown: GameMintFrame {
        sequence.shown(live: GameMintFrame(meesh: meesh, next: next))
    }

    /// La scène : seulement quand une frappe est possible (ou en train de se jouer) et que la pièce suivante est connue.
    private var strike: GameMintStrike? {
        let frame = shown
        guard let next = frame.next, frame.meesh.canMint || sequence.isStriking else { return nil }
        return GameMintStrike(
            number: next.number, edition: next.edition, play: strikePlay,
            restsReversed: strikePlay > 0 && mintError == nil && !sequence.isStriking
        )
    }

    private func startStrike() {
        guard sequence.begin(holding: GameMintFrame(meesh: meesh, next: next)) else { return }
        strikePlay += 1
        haptics.play(GameHapticPattern.strike)
        onMint()
    }

    /// La forme de la pièce : plus RECTANGLE qu'une capsule (directive porteur 2026-09-14, #6466).
    private static let forme = RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)

    var body: some View {
        Button {
            HapticFeedback.light()
            ouvert.toggle()
        } label: {
            // `N` puis la PIÈCE — UNE seule pièce de verre (#6466).
            //
            // Le porteur a d'abord demandé « le nombre comme dans sa bulle, les
            // deux dans le même composant » ; il a vu deux bulles séparées au
            // simulateur et a tranché (2026-09-14) : « les deux éléments
            // associés en un seul, pas de séparation visuelle ». Le verre porte
            // donc les deux ensemble, sans conteneur ni écart, à la hauteur des
            // chromes ronds de l'en-tête dont l'entrée est l'action (#6480).
            //
            // Le glyphe a changé deux fois, et pour la même raison. `medal.fill`
            // disait « récompense » en général ; le logo Meeshy (2026-09-09)
            // disait « marque ». Une Meesh est une MONNAIE : la pièce d'argent
            // (#6427) est le premier glyphe qui dit ce qu'est la chose.
            HStack(spacing: MeeshySpacing.xsPlus) {
                Text("\(shown.meesh.balance)")
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(tint)
                    .modifier(MeeshCounterRoll())
                MeeshCoinGlyph(size: 20)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .frame(minHeight: CollapsibleHeaderMetrics.roundChromeDiameter)
            .adaptiveGlass(in: Self.forme, tint: tint.opacity(0.14), interactive: true)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("progression.meesh.entry")
        .accessibilityLabel(ProgressionCopy.meeshEntryA11y(shown.meesh.balance))
        .accessibilityAddTraits(.isButton)
        // La scène finie, le compteur lâche la valeur vivante : il monte alors, et seulement alors (#9537).
        .task(id: sequence.generation) { @MainActor in
            guard sequence.isStriking else { return }
            let seconds = GameMintSequence<GameMintFrame>.duration(reduceMotion: reduceMotion)
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.35)) { sequence.finish() }
        }
        .popover(isPresented: $ouvert) {
            ProgressionMeeshDetail(
                meesh: shown.meesh, isMinting: isMinting || sequence.isStriking, mintError: mintError,
                strike: strike, onMint: startStrike
            )
                .frame(idealWidth: 300)
                .padding(MeeshySpacing.lg)
                // **Verre NEUTRE, jamais teinté** (directive porteur
                // 2026-09-09 : « le menu affiché au touché doit être bien
                // travaillé »). Le `tint: tint` peignait le panneau en aplat
                // ORANGE plein : le titre teinté devenait jaune sur jaune —
                // illisible — et le solde perdait le contraste que le thème lui
                // donne. Une teinte sert à SIGNALER, elle ne peut pas servir de
                // fond à ce qu'elle signale.
                .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                        .fill(ThemeManager.shared.backgroundSecondary)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                        .stroke(tint.opacity(MeeshyOpacity.medium), lineWidth: 1)
                )
                .presentationCompactAdaptationPopoverIfAvailable()
        }
    }
}

/// LA PIÈCE D'ARGENT des Meeshes (#6427).
///
/// Même tracé que le web (`coin-fill` de Phosphor, `PROGRESSION_GLYPHS.coinFill`) :
/// même geste, même icône sur les deux plateformes. L'actif est un VECTEUR en
/// GABARIT. Le logo qu'il remplace était un PNG opaque, qu'on ne pouvait pas
/// teinter sans le changer en carré plein ; la pièce, elle, prend l'argent de
/// `MeeshyColors.meeshSilver`, et sa couleur propre l'emporte sur l'ambre que
/// la capsule donne à son contenu.
///
/// Décoratif : le solde est dit par le libellé de l'entrée qui la porte.
struct MeeshCoinGlyph: View {
    static let assetName = "MeeshCoin"
    let size: CGFloat

    var body: some View {
        Image(Self.assetName)
            .renderingMode(.template)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: size, height: size)
            .foregroundColor(MeeshyColors.meeshSilver)
            .accessibilityHidden(true)
    }
}

/// Ce que la scène de frappe de la feuille grave : la prochaine pièce, et où en est la scène.
struct GameMintStrike: Equatable {
    let number: Int
    let edition: MeeshEdition
    /// Incrémenté à chaque frappe commencée : c'est ce qui rejoue la scène.
    let play: Int
    /// Frappée avec succès, la pièce reste sur son revers numéroté.
    let restsReversed: Bool
}

/// Le chiffre « roule » quand le solde change (iOS 17+) ; sur iOS 16 il change net.
private struct MeeshCounterRoll: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.contentTransition(.numericText())
        } else {
            content
        }
    }
}

/// LE CONTENU du sous-menu, séparé de son bouton.
///
/// Deux raisons, et la seconde compte plus : l'état d'OUVERTURE est une affaire
/// de bouton, pas de contenu ; et un contenu qui n'existe qu'à l'intérieur d'un
/// `@State` ne se mesure qu'en simulant un tap — ce qui fait tester le GESTE
/// quand on voulait tester ce qui est DIT.
struct ProgressionMeeshDetail: View {
    let meesh: EngagementMeeshProgress
    let isMinting: Bool
    var mintError: String? = nil
    /// La scène de frappe — Mee et Meo qui frappent la pièce — au-dessus du solde ; `nil` : pas de scène.
    var strike: GameMintStrike? = nil
    let onMint: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    private let tint = MeeshyColors.warning

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            // L'EN-TÊTE du menu — la pièce et le mot. Le panneau s'ouvrait sur un
            // solde nu : hors du bouton qui l'a ouvert, plus rien ne disait de
            // quelle monnaie on parlait, et « 3 Meesh » devait porter seul à la
            // fois le nom et le chiffre.
            HStack(spacing: MeeshySpacing.xsPlus) {
                MeeshCoinGlyph(size: 16)
                Text(ProgressionCopy.meeshEntryTitle)
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                Spacer(minLength: 0)
            }
            .foregroundColor(tint)

            if let strike {
                MintStrikeScene(
                    edition: strike.edition, number: strike.number,
                    year: Calendar.current.component(.year, from: Date()), play: strike.play,
                    coinSide: 48, restsReversed: strike.restsReversed
                )
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("progression.meesh.strike")
            }

            // Les formulations viennent du hero d'origine : « Aucune Meesh »
            // plutôt que « 0 Meesh », « Convertir » plutôt que « Frapper ». Une
            // refonte de DISPOSITION ne réécrit pas la langue en passant —
            // l'utilisateur reconnaît les mots, c'est à ça qu'il sait que c'est
            // la même chose.
            Text(ProgressionCopy.meeshBalance(meesh.balance))
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if meesh.mintedLifetime > 0 {
                Text(ProgressionCopy.meeshMintedLifetime(meesh.mintedLifetime))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            bornes

            ProgressionBar(
                progress: meesh.progress,
                tint: tint,
                label: String(
                    localized: "progression.a11y.bar.meesh",
                    defaultValue: "Vers la prochaine Meesh",
                    bundle: .main
                )
            )
            .padding(.top, MeeshySpacing.xs)

            if meesh.canMint {
                // Le bouton RESTE pendant la frappe, avec son état dit : le
                // faire disparaître au moment du tap donnerait l'impression que
                // l'action a échoué, alors qu'elle est en cours.
                //
                // **Et il MONTRE qu'il travaille** (#6467, retour porteur
                // 2026-09-14) : une opacité seule, sur un aller-retour court, ne
                // se voyait pas. L'indicateur d'activité tourne à côté du mot, et
                // l'identifiant change avec l'état pour que le témoin le lise.
                Button {
                    HapticFeedback.light()
                    onMint()
                } label: {
                    HStack(spacing: MeeshySpacing.sm) {
                        if isMinting {
                            ProgressView()
                                .tint(theme.backgroundPrimary)
                        }
                        Text(
                            isMinting
                                ? String(localized: "progression.meesh.minting", defaultValue: "Frappe en cours…", bundle: .main)
                                : ProgressionCopy.meeshMintAction(meesh.mintCost)
                        )
                        .multilineTextAlignment(.center)
                    }
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                    .foregroundColor(theme.backgroundPrimary)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(tint))
                }
                .buttonStyle(.plain)
                .disabled(isMinting)
                .opacity(isMinting ? 0.8 : 1)
                .accessibilityIdentifier(isMinting ? "progression.meesh.minting" : "progression.meesh.mint")
                .padding(.top, MeeshySpacing.xs)

                // L'ÉCHEC se lit ICI, sous l'action qu'on peut retenter — et non
                // en haut de l'écran, sous le détail qui le cache.
                if let mintError, !isMinting {
                    HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xsPlus) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .accessibilityHidden(true)
                        Text(mintError)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("progression.meesh.mint.error")
                }
            } else {
                Text(ProgressionCopy.meeshMissing(missing: meesh.missingPoints, floor: meesh.floorPoints))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("progression.meesh.detail")
    }

    /// Les deux BORNES du registre de frappe.
    ///
    /// **Une frappe unique a la même date des deux côtés** : la répéter
    /// n'apprend rien et fait douter de la seconde ligne — d'où la comparaison,
    /// et non un simple `if let`.
    @ViewBuilder
    private var bornes: some View {
        if let premiere = meesh.firstMintedAt {
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                borne(
                    String(localized: "progression.meesh.first_mint", defaultValue: "Première frappe", bundle: .main),
                    premiere
                )
                if let derniere = meesh.lastMintedAt, derniere != premiere {
                    borne(
                        String(localized: "progression.meesh.last_mint", defaultValue: "Dernière frappe", bundle: .main),
                        derniere
                    )
                }
            }
        } else {
            Text(String(
                localized: "progression.meesh.never_minted",
                defaultValue: "Aucune frappe pour l’instant.",
                bundle: .main
            ))
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            .foregroundColor(theme.textMuted)
        }
    }

    private func borne(_ titre: String, _ date: Date) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Text(titre)
                .foregroundColor(theme.textMuted)
            Spacer(minLength: MeeshySpacing.xs)
            Text(date.formatted(date: .abbreviated, time: .omitted))
                .foregroundColor(theme.textPrimary)
        }
        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
        .accessibilityElement(children: .combine)
    }
}

private extension View {
    /// Le sous-menu reste un POPOVER sur iPhone plutôt que de devenir une
    /// feuille pleine hauteur — l'adaptation compacte n'existe qu'à partir
    /// d'iOS 16.4, et l'app sert iOS 16.0.
    @ViewBuilder
    func presentationCompactAdaptationPopoverIfAvailable() -> some View {
        if #available(iOS 16.4, *) {
            presentationCompactAdaptation(.popover)
        } else {
            self
        }
    }
}
