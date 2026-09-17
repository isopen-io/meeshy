import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - CE QU'UNE PIÈCE MONTRE DE SES RÉACTIONS — une écriture, deux surfaces
//
// **Directive porteur 2026-09-16** (#6789) : « lorsqu'on choisi la réaction, ce
// doit s'afficher sur l'attachement en plein ecran et dans la conversation ».
//
// La conversation l'affichait déjà (`reactionsBadge`, posée sur la tuile de la
// bulle depuis BUG2 A'). Le plein écran, non : `reactionSummary` et
// `currentUserReactions` y arrivaient bien — c'est le MÊME type de pièce — et
// aucun site du visualiseur ne les lisait. On réagissait, l'écran ne changeait
// pas, et il fallait refermer pour voir que le geste avait marché.
//
// **La pastille est donc EXTRAITE plutôt que recopiée.** Recopier ses quinze
// lignes aurait donné deux pastilles qui se ressemblent jusqu'au jour où l'une
// bouge — et la première divergence aurait été le renfort « j'ai réagi », que la
// tuile a mis un lot entier à gagner (le site ne lisait que `reactionSummary` :
// un ❤️ à moi parmi trois 👍 s'affichait « ❤️👍 4 », sans rien qui le distingue).
//
// Deux types, parce que ce sont deux questions : ce qu'il y a à DIRE (pur,
// jouable en XCTest) et comment on le PEINT.

/// **Ce qu'une pastille de réactions a à dire.** `nil` ⇒ elle n'existe pas
/// (loi 4 : une pastille sans réaction n'est pas une pastille vide).
///
/// `nonisolated` : le target app compile en `defaultIsolation MainActor` et le
/// bundle de tests est nonisolated — sans ce modificateur la loi est inappelable
/// depuis XCTest (cf. `AttachmentReactionOffer`).
nonisolated struct AttachmentReactionBadgeModel: Equatable {

    /// Au plus TROIS émojis. Le quatrième ne tiendrait pas sur une tuile de
    /// grille, et une pastille qui déborde son coin est pire qu'une pastille qui
    /// en dit moins : le total, lui, ne ment jamais.
    static let maxEmojis = 3

    /// Les émojis montrés, triés — un ordre STABLE, pour que la pastille ne
    /// change pas de contenu d'un rendu à l'autre à réactions égales.
    let emojis: [String]

    /// Le total de TOUTES les réactions, y compris celles dont l'émoji n'est pas
    /// montré. C'est lui qui rattrape ce que le plafond de trois laisse dehors.
    let total: Int

    /// « J'ai réagi à CETTE pièce » — le renfort visuel, jamais un simple
    /// comptage. Il emprunte le langage des réactions de bulle
    /// (`BubbleReactionsOverlay`) : contour épais à l'accent.
    let mine: Bool

    /// - Parameters:
    ///   - summary: `émoji → compte`, tel que le serveur l'agrège.
    ///   - currentUserReactions: les émojis posés par le lecteur.
    static func make(summary: [String: Int]?,
                     currentUserReactions: [String]?) -> AttachmentReactionBadgeModel? {
        guard let summary, !summary.isEmpty else { return nil }
        let total = summary.values.reduce(0, +)
        // Un résumé dont tous les comptes sont tombés à zéro n'est pas une
        // pastille à zéro : c'est l'absence de pastille. Le cas arrive en
        // optimiste, entre le retrait local et le delta serveur.
        guard total > 0 else { return nil }
        return AttachmentReactionBadgeModel(
            emojis: Array(summary.keys.sorted().prefix(maxEmojis)),
            total: total,
            mine: !(currentUserReactions ?? []).isEmpty
        )
    }

    /// **VoiceOver lit des RÉACTIONS, pas une suite d'émojis suivie d'un
    /// nombre.** La tuile n'en avait aucun libellé : la pastille y était
    /// annoncée glyphe par glyphe, ce qui ne dit ni ce que c'est, ni si on y a
    /// participé — dimension 5.
    ///
    /// **Le COMPTE n'est pas dans le libellé, il est dans la valeur**
    /// (`accessibilityValue`) : c'est ce que la séparation libellé/valeur
    /// d'UIKit veut dire, et c'est aussi ce qui garde ces deux clés de
    /// catalogue libres de toute interpolation — donc traduisibles sans règle
    /// de pluriel dans sept langues.
    var a11yLabel: String {
        let base = String(localized: "media.reactions.badge.a11y",
                          defaultValue: "Réactions",
                          bundle: .main)
        guard mine else { return base }
        let sienne = String(localized: "media.reactions.badge.mine.a11y",
                            defaultValue: "dont la vôtre",
                            bundle: .main)
        return "\(base), \(sienne)"
    }
}

/// La pastille, peinte. Site UNIQUE : la tuile de la bulle et le plateau du
/// plein écran la montent toutes deux.
struct AttachmentReactionBadge: View {

    let model: AttachmentReactionBadgeModel
    /// La couleur de contexte — celle du contact en conversation, celle du
    /// visualiseur en plein écran. Jamais une couleur en dur : tout composant de
    /// contexte conversationnel prend l'accent (§ Conversation Accent Color).
    let accent: Color

    var body: some View {
        HStack(spacing: 1) {
            ForEach(model.emojis, id: \.self) { emoji in
                Text(emoji).font(MeeshyFont.relative(11))
            }
            if model.total > 1 {
                Text("\(model.total)")
                    .font(MeeshyFont.relative(9, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
        .padding(.horizontal, 5).padding(.vertical, 2)
        .background(
            Capsule().fill(model.mine ? accent.opacity(0.55) : Color.black.opacity(0.55))
        )
        .overlay(
            Capsule().strokeBorder(model.mine ? accent : .clear, lineWidth: model.mine ? 2 : 0)
        )
        .shadow(color: model.mine ? accent.opacity(0.4) : .clear, radius: model.mine ? 4 : 0)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.a11yLabel)
        .accessibilityValue(model.total.formatted())
    }
}
