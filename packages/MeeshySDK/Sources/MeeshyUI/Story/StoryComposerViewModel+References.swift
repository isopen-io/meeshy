import SwiftUI
import UIKit
import MeeshySDK

// MARK: - StoryComposerViewModel + References

extension StoryComposerViewModel {
    /// Nomme quelqu'un, dans le mode choisi.
    ///
    /// PINNED pose un `StoryTextObject` portant `@pseudo` et son
    /// `referenceUserId` ; les trois autres modes ne posent RIEN sur le
    /// canevas — ils vivent dans `references`, que la publication déclare.
    ///
    /// Changer de mode et en choisir un sont le MÊME geste : cette méthode est
    /// donc aussi celle qui change un mode, et c'est elle qui retire le badge
    /// quand on quitte PINNED (le laisser afficherait une étiquette que plus
    /// rien ne justifie).
    func addReference(_ reference: ComposerReference) {
        let key = reference.username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !key.isEmpty else { return }

        // **La mention naît attachée à la publication COURANTE** (#4068).
        // En profil Story, une slide EST une publication : c'est son id qui
        // fait la portée. L'appelant n'a pas à la fournir — il ne sait pas
        // toujours dans quel profil il est, et une clé qu'on peut oublier de
        // passer est une portée qui se perd en silence.
        var attachée = reference
        if attachée.publicationKey == nil { attachée.publicationKey = currentSlide.id }

        let previous = references.first {
            $0.username.lowercased() == key && $0.publicationKey == attachée.publicationKey
        }
        references = ComposerReferences.upsert(attachée, into: references)

        if previous?.display == .pinned, attachée.display != .pinned {
            removeBadge(of: previous ?? attachée)
        }
        if attachée.display == .pinned, previous?.display != .pinned {
            poseBadge(for: attachée)
        }
    }

    /// Adopte l'ensemble rendu par la feuille de sélection.
    ///
    /// La feuille pilote l'ensemble sans rien savoir du canevas : c'est ICI que
    /// l'écart se traduit en badges posés ou retirés. Les retraits d'abord —
    /// sinon un mode changé reposerait le badge qu'on vient d'enlever.
    func applyReferences(_ updated: [ComposerReference]) {
        let kept = Set(updated.map { $0.username.lowercased() })
        for gone in references where !kept.contains(gone.username.lowercased()) {
            removeReference(username: gone.username)
        }
        for reference in updated { addReference(reference) }
    }

    /// Retire une personne — et le badge qui la portait, s'il y en avait un.
    ///
    /// La référence est lue AVANT le retrait : c'est elle qui porte le `userId`
    /// par lequel son badge se reconnaît.
    func removeReference(username: String) {
        let key = username.lowercased()
        let departing = references.first { $0.username.lowercased() == key }
        references = ComposerReferences.remove(username: username, from: references)
        removeBadge(of: departing ?? ComposerReference(username: username, display: .pinned))
    }

    /// Retire du canevas le badge d'une personne, sans toucher à sa référence :
    /// c'est le mode qui vient de changer, pas la décision de la nommer.
    ///
    /// Un badge se reconnaît à son `referenceUserId`, jamais à son texte : la
    /// pastille est un `StoryTextObject` ordinaire, que l'auteur peut retoucher
    /// au doigt. Comparé au texte, un badge renommé survivait à son propre
    /// retrait — et la règle d'union du canevas le redéclarait PINNED à la
    /// publication, annulant en silence le mode choisi. Le repli sur le texte ne
    /// sert qu'aux références sans `userId`, qui ne peuvent pas avoir de badge.
    private func removeBadge(of reference: ComposerReference) {
        let key = "@\(reference.username.lowercased())"
        var effects = currentEffects
        let doomed = effects.textObjects.filter { object in
            guard let badgeUserId = object.referenceUserId else { return false }
            guard let userId = reference.userId else { return object.text.lowercased() == key }
            return badgeUserId == userId
        }
        guard !doomed.isEmpty else { return }
        let ids = Set(doomed.map(\.id))
        effects.textObjects.removeAll { ids.contains($0.id) }
        currentEffects = effects
        if let selected = selectedElementId, ids.contains(selected) { selectedElementId = nil }
        for id in ids { zIndexMap.removeValue(forKey: id) }
    }

    /// Épingle quelqu'un sur la slide SANS l'écrire dans une phrase (directive
    /// user 2026-08-18). La pastille EST un `StoryTextObject` portant `@pseudo` :
    /// elle hérite ainsi, gratuitement, de tout ce que le texte sait déjà faire —
    /// déplacement, rotation, z-order, timeline, rendu à l'export, persistance
    /// dans `StoryEffects` (la seule unité que le dépôt enregistre et envoie).
    /// Un type d'élément neuf aurait réclamé les six chemins, et en aurait
    /// silencieusement raté un.
    ///
    /// `referenceUserId` est ce qui la distingue d'une phrase : sans lui, la
    /// dérivation INLINE côté serveur relirait le badge comme une mention de
    /// texte et écraserait le mode choisi par l'auteur. C'est aussi lui qui la
    /// rend publiable après une reprise de brouillon, quand la liste des
    /// références n'existe plus mais que le canevas, lui, a survécu — d'où le
    /// refus de poser un badge dont on ne connaît pas la personne.
    ///
    /// Le fond plein est ce qui la fait LIRE comme une étiquette et non comme du
    /// texte libre — c'est la seule chose qui la distingue à l'œil.
    ///
    /// Décalage en cascade comme les lieux et les stickers : deux mentions
    /// successives ne doivent pas se superposer exactement.
    @discardableResult
    private func poseBadge(for reference: ComposerReference) -> StoryTextObject? {
        let handle = reference.username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !handle.isEmpty, let userId = reference.userId, canAddText else { return nil }
        let existing = currentEffects.textObjects.filter { $0.text.hasPrefix("@") }.count
        var obj = StoryTextObject(
            text: "@" + handle,
            x: 0.5,
            y: 0.62 + Double(existing % 5) * 0.06,
            scale: 1.0,
            rotation: 0,
            fontSize: 64,
            textStyle: "bold",
            textColor: "FFFFFF",
            textAlign: "center",
            backgroundStyle: .solid(hex: MeeshyColors.brandPrimaryHex),
            sourceLanguage: declaredContentLanguage
        )
        obj.referenceUserId = userId
        var effects = currentEffects
        var texts = effects.textObjects
        texts.append(obj)
        effects.textObjects = texts
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        // Pas de bascule vers l'outil texte : le geste s'achève à la pose. Un
        // panneau d'édition qui s'ouvre sur une étiquette qu'on vient de choisir
        // demanderait de la refermer pour en poser une seconde.
        return currentEffects.textObjects.first { $0.id == obj.id } ?? obj
    }
}
