import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce que l'hôte pose DERRIÈRE la bande** (#4122). La bande n'a pas de fond
/// à elle (directive porteur 2026-09-05) : son encre et ses capsules dépendent
/// donc entièrement de ce qu'il y a dessous, et seul l'hôte le sait.
///
/// - `plateau` — le champ du document, l'éditeur d'objet : les trois teintes
///   de `PlateauTint` sont sombres par doctrine ;
/// - `scene` — le calque de description, posé sur la carte (#6126) ou
///   flottant sur elle : une couleur que l'AUTEUR choisit, avec le schéma que
///   l'hôte épingle pour elle (`CanvasChromeScheme`).
nonisolated enum ComposerMentionStripBackdrop: Equatable, Sendable {
    case plateau
    case scene(ColorScheme)
}

/// **La bande de mentions du composer (#3904)** — une variante horizontale,
/// pleine largeur, ancrée en bas de l'écran de publication.
///
/// Distincte de `MentionSuggestionPanel` (liste VERTICALE utilisée par
/// `PostDetailView`/`FeedCommentsSheet`, ancrée en haut du composer) : le
/// résultat attendu par #3904 (« en bas de l'écran, sur toute la largeur,
/// défilable horizontalement ») est un patron d'affichage DIFFÉRENT, pas une
/// option de plus sur le composant partagé — y ajouter une branche
/// conditionnelle aurait risqué de régresser les deux écrans qui en
/// dépendent déjà. Le composer a donc son PROPRE fichier.
struct ComposerMentionStrip: View {
    @ObservedObject var controller: MentionComposerController
    var accentColor: String = MeeshyColors.brandPrimaryHex
    let currentText: String
    /// Sans valeur par défaut : un hôte qui ne le déclare pas ne compile pas.
    let backdrop: ComposerMentionStripBackdrop
    let onSelect: (String) -> Void

    /// Le plateau est sombre par construction ; sur la scène, l'encre suit le
    /// schéma que l'hôte épingle. Suivre le thème de l'APP peindrait du texte
    /// sombre sur un plateau sombre en thème clair.
    nonisolated static func inkIsDark(on backdrop: ComposerMentionStripBackdrop) -> Bool {
        switch backdrop {
        case .plateau: return true
        case .scene(let schema): return schema == .dark
        }
    }

    /// **La capsule d'une entrée — le fond RÉEL sous le pseudo.**
    ///
    /// Sur le plateau, un voile : le fond est connu et sombre, le pseudo y
    /// tient 6,31:1 au pire cas (violet profond). Sur la scène, le fond est
    /// INCONNU — une scène blanche, une photo aux zones claires — et ce même
    /// voile y rendait 1,98:1 : le défaut de l'issue, revenu sur l'hôte qu'elle
    /// ne mesurait pas. La capsule y devient le fond PRIMAIRE du schéma,
    /// opaque : la seule base qui tient sur une couleur qu'on ne connaît pas.
    /// Verrouillé par `ComposerMentionStripContrastTests`.
    nonisolated static func capsuleFill(on backdrop: ComposerMentionStripBackdrop) -> Color {
        let isDark = inkIsDark(on: backdrop)
        switch backdrop {
        case .plateau:
            return MeeshyColors.textPrimary(isDark: isDark).opacity(MeeshyOpacity.subtle)
        case .scene:
            return MeeshyColors.backgroundPrimary(isDark: isDark)
        }
    }

    nonisolated static func nameColor(on backdrop: ComposerMentionStripBackdrop) -> Color {
        MeeshyColors.textPrimary(isDark: inkIsDark(on: backdrop))
    }

    nonisolated static func pseudoColor(on backdrop: ComposerMentionStripBackdrop) -> Color {
        MeeshyColors.textSecondary(isDark: inkIsDark(on: backdrop))
    }

    private var capsule: some View {
        Capsule().fill(Self.capsuleFill(on: backdrop))
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.mdPlus) {
                // **Une bande vide DIT « personne », elle ne disparaît pas.**
                //
                // Le montage était gaté sur `!suggestions.isEmpty` — donc un
                // `@` sans correspondance ne peignait RIEN, et l'auteur ne
                // pouvait pas distinguer « cette personne n'existe pas » de
                // « la fonction ne marche pas ». Mesuré au simulateur le
                // 2026-09-05 : la route des amis rendait 404 en production, la
                // liste tombait à vide par un `catch { return [] }`, et le
                // symptôme visible était l'ABSENCE de la bande — exactement ce
                // qu'un utilisateur a rapporté comme « les mentions inline ne
                // fonctionnent pas ».
                //
                // Une erreur avalée en liste vide ressemble à un vide
                // légitime ; c'est la vue qui doit rendre le vide LISIBLE, et
                // `MentionSuggestionList` (SDK) le faisait déjà pour la
                // surface mood du même composer.
                if controller.suggestions.isEmpty {
                    //
                    // Sur sa capsule, comme une entrée : posé nu sur une scène
                    // claire, « personne » disparaîtrait comme le pseudo.
                    Text(ComposerDocumentCopy.mentionEmpty)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundColor(Self.pseudoColor(on: backdrop))
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .frame(minHeight: MeeshyControlSize.tapTarget, alignment: .leading)
                        .background(capsule)
                }
                ForEach(controller.suggestions) { candidate in
                    Button {
                        let updated = controller.insertMention(candidate, into: currentText)
                        onSelect(updated)
                    } label: {
                        // Chaque entrée : avatar + nom d'affichage (au-dessus)
                        // + @pseudo (en dessous) — retour porteur 2026-08-27.
                        HStack(spacing: MeeshySpacing.sm) {
                            MeeshyAvatar(
                                name: candidate.displayName,
                                context: .userListItem,
                                accentColor: accentColor,
                                avatarURL: candidate.avatarURL
                            )
                            // L'encre et la capsule viennent du FOND que l'hôte
                            // déclare (#4122) — voir `capsuleFill(on:)`. Un
                            // token plus discret (`textMuted`) tomberait SOUS
                            // AA sur le plateau (3,88:1) : le pseudo garde
                            // `textSecondary`.
                            VStack(alignment: .leading, spacing: 1) {
                                Text(candidate.displayName)
                                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                                    .foregroundColor(Self.nameColor(on: backdrop))
                                    .lineLimit(1)
                                Text("@\(candidate.username)")
                                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                                    .foregroundColor(Self.pseudoColor(on: backdrop))
                                    .lineLimit(1)
                            }
                            .frame(maxWidth: 140, alignment: .leading)
                        }
                        .padding(.vertical, MeeshySpacing.xsPlus)
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .background(capsule)
                    }
                    .accessibilityLabel(
                        "\(String(localized: "composer.mention.label", defaultValue: "Mention", bundle: .main)) \(candidate.displayName)"
                    )
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.smPlus)
        }
        .frame(maxWidth: .infinity)
        // **Fond TRANSPARENT** (directive porteur 2026-09-05).
        //
        // La bande portait `.adaptiveGlass(in: Rectangle())` — « même chrome
        // neutre que `MentionSuggestionPanel` ». Ce chrome vient d'un écran
        // CLAIR (le composer de commentaires) ; posé sur le plateau, dont les
        // trois teintes sont sombres par doctrine, il peint une barre pâle en
        // travers de la scène au moment précis où l'auteur regarde ce qu'il
        // écrit.
        //
        // Les capsules des entrées portent leur propre fond
        // (`capsuleFill(on:)`) : c'est LUI que
        // `ComposerMentionStripContrastTests` mesure, sur le fond que l'hôte
        // déclare — jamais sur un verre de bande.
        //
        // > Un chrome hérité d'un écran voisin arrive avec les hypothèses de
        // > CET écran-là. « Même chrome que X » n'est une raison que si X a le
        // > même fond.
        // Même patron que `mediaStrip`/`toolRow` (revue Opus 2026-08-27) :
        // sans le groupe, le rotor VoiceOver ne trouve la bande qu'élément
        // par élément, jamais comme un groupe nommé.
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerDocumentCopy.mentionStrip))
    }
}
