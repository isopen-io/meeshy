import Foundation
import MeeshySDK
import MeeshyUI

/// **Quel cadre à mots la pastille du composer porte** (directive porteur
/// 2026-09-06, #5326 : « une des icônes de sticker DYNAMIQUE »).
///
/// Dynamique veut dire : celui dont l'auteur se sert. La source est le magasin
/// que la palette alimente déjà à chaque pose (`StickerUsageStore` —
/// `noteUse` met l'entrée en TÊTE des récents), jamais une seconde préférence
/// « mon cadre par défaut » : deux mémoires du même goût divergeraient au
/// premier ajustement, et l'auteur ne saurait pas laquelle il vient de changer.
///
/// ## Les trois rangs, et ce que chacun protège
///
/// 1. **Les récents** — l'USAGE. C'est ce que « le plus utilisé » veut dire.
/// 2. **Les favoris** — l'INTENTION déclarée, pour un compte tout neuf sur un
///    appareil neuf : l'auteur a épinglé un cadre sans l'avoir encore posé ici.
/// 3. **Le catalogue** — le premier cadre, la bulle, pour que la pastille
///    existe au tout premier lancement.
///
/// L'usage passe AVANT l'épinglage : un favori posé une fois il y a un mois ne
/// doit pas reprendre la pastille à celui de tous les jours.
///
/// ## Le filtre qui n'est pas décoratif
///
/// Les deux listes portent des emojis, des images de bibliothèque et des
/// gabarits de TOUTES les familles. Un cadre à cœurs n'a pas d'emplacement
/// `text` : servi ici, il partirait sans les mots tapés — une décoration à la
/// place du message. D'où la résolution par le catalogue de la famille servie,
/// qui écarte du même geste un gabarit retiré par une mise à jour.
nonisolated enum ComposerTextStickerChoice {

    /// - Parameters:
    ///   - recents: `StickerUsageStore.recents`, la tête étant la plus récente.
    ///   - favorites: `StickerUsageStore.favorites`.
    ///   - catalog: les gabarits ÉLIGIBLES — `StickerTemplateCatalog.templates(family: .text)`.
    /// - Returns: `nil` seulement si le catalogue est vide ; la pastille est
    ///   alors ABSENTE, jamais grisée (loi 4).
    static func resolve(recents: [StickerUsageEntry],
                        favorites: [StickerUsageEntry],
                        catalog: [StickerTemplate]) -> StickerTemplate? {
        firstEligible(in: recents, catalog: catalog)
            ?? firstEligible(in: favorites, catalog: catalog)
            ?? catalog.first
    }

    private static func firstEligible(in entries: [StickerUsageEntry],
                                      catalog: [StickerTemplate]) -> StickerTemplate? {
        for entree in entries where entree.kind == .template {
            if let gabarit = catalog.first(where: { $0.id == entree.value }) { return gabarit }
        }
        return nil
    }
}
