import Foundation
import MeeshySDK

/// **LE TEXTE D'UN STICKER, POUR QUE SON IMAGE LE PORTE** (#6377, retour
/// porteur 2026-09-14).
///
/// Un sticker envoyé en conversation part comme un PNG : le fil ne reçoit
/// qu'une image, et `MeeshyMessageAttachment.alt` / `.caption` restaient vides
/// — alors que les deux champs existent depuis toujours et que le texte est là,
/// dans le `MessageSticker` que le même appel transporte.
///
/// > Le texte n'était pas absent : il n'était pas RELIÉ.
///
/// Ce que cela coûtait : un lecteur d'écran annonçait « image », une bannière
/// de notification ne montrait rien, et une recherche dans le fil ne pouvait
/// pas retrouver un sticker par ce qu'il DIT.
///
/// La loi est PURE et `nonisolated` : elle ne connaît ni vue ni réseau, et ses
/// cas se vérifient sans simulateur.
nonisolated enum StickerAltText {

    /// Le texte que l'image MONTRE, ou `nil` s'il n'y a rien à décrire.
    ///
    /// **`nil`, jamais `""`.** Une chaîne vide posée en `alt` ANNONCE une
    /// description qui n'existe pas : un lecteur d'écran la lit comme un champ
    /// présent mais muet, ce qui est pire que l'absence, laquelle le laisse
    /// retomber sur ses propres heuristiques.
    static func describe(_ sticker: MessageSticker) -> String? {
        let valeurs = orderedValues(of: sticker)
        if !valeurs.isEmpty { return valeurs.joined(separator: " ") }
        let emoji = (sticker.emoji ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return emoji.isEmpty ? nil : emoji
    }

    /// Les valeurs des emplacements, DANS L'ORDRE OÙ L'IMAGE LES MONTRE.
    ///
    /// `MessageSticker.slots` est un DICTIONNAIRE : son ordre d'itération n'est
    /// pas garanti et change d'une exécution à l'autre. L'ordre d'affichage,
    /// lui, est celui de `StickerTemplate.slots`, un TABLEAU. Lire le
    /// dictionnaire tel quel donnerait, pour une même image, une légende dont
    /// les mots changent de place entre deux lancements — un défaut qui ne se
    /// voit qu'au hasard des exécutions, donc presque jamais en revue.
    ///
    /// Gabarit INCONNU de ce binaire — publié par une version plus récente : on
    /// ne peut pas suivre un ordre qu'on ignore, alors on prend les clés
    /// TRIÉES. C'est arbitraire, mais STABLE, et la stabilité est ce qui compte
    /// ici : deux légendes différentes pour la même image seraient pires qu'un
    /// ordre imparfait.
    private static func orderedValues(of sticker: MessageSticker) -> [String] {
        let propre: (String) -> String? = { brut in
            let v = brut.trimmingCharacters(in: .whitespacesAndNewlines)
            return v.isEmpty ? nil : v
        }
        guard let id = sticker.templateId, !id.isEmpty else { return [] }

        if let gabarit = StickerTemplateCatalog.template(id: id) {
            // L'ordre du catalogue. Un emplacement non rempli est SAUTÉ, jamais
            // rendu par une chaîne vide : sinon la jointure produirait un
            // double espace ou un séparateur orphelin.
            return gabarit.slots.compactMap { slot in sticker.slots[slot.name].flatMap(propre) }
        }
        return sticker.slots.keys.sorted().compactMap { sticker.slots[$0].flatMap(propre) }
    }
}
