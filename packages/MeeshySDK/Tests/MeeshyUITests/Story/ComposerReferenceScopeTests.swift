import Testing
@testable import MeeshyUI
import MeeshySDK

/// **Une mention est attachée à la PUBLICATION ; le format décide seulement de
/// ce qu'une publication EST** (#4068, porteur 2026-09-03).
///
/// ## Le défaut que ce lot ferme
///
/// En profil Story, une slide EST une publication entière : publier N slides
/// crée N publications. Or `references` vivait au COMPOSER, et la boucle
/// d'envoi semait la même liste sur chacune. Déclarer une mention **NOTE** en
/// pensant à la slide 1, puis publier 3 slides, notifiait la personne **trois
/// fois** et la faisait apparaître sous **trois** stories — dont deux où
/// l'auteur ne l'a jamais nommée.
///
/// C'est pire pour **SILENT** (« notifiée, invisible aux tiers ») : la personne
/// reçoit une notification pour des stories auxquelles rien ne la rattache, et
/// **personne ne peut le voir** pour le signaler. Une mention silencieuse mal
/// portée est invisible par construction — donc jamais signalée, donc jamais
/// corrigée.
///
/// ## La règle, et pourquoi elle tient en une phrase
///
/// > Une mention est attachée à la publication. En Story, une publication est
/// > une slide ; en Post et en Réel, il n'y en a qu'une.
///
/// Une première rédaction distinguait une portée d'ATTACHEMENT d'une portée de
/// NOTIFICATION. Le porteur l'a retirée : il n'y en a qu'une, et la seconde se
/// déduit. C'est plus simple, donc plus tenable — les trois lignes du tableau
/// se déduisent de la première, et aucun `if` par format n'est nécessaire.
struct ComposerReferenceScopeTests {

    private func note(_ username: String, on key: String?) -> ComposerReference {
        ComposerReference(username: username, userId: "id-\(username)",
                          display: .note, publicationKey: key)
    }

    // MARK: - Story : une slide, une publication

    @Test("une slide ne sert QUE les mentions qui lui sont attachées")
    func slideServesOnlyItsOwn() {
        let references = [note("alice", on: "slide-1"), note("bob", on: "slide-2")]

        let first = ComposerReferences.payload(references, for: "slide-1")
        let second = ComposerReferences.payload(references, for: "slide-2")

        #expect(first.count == 1)
        #expect(second.count == 1)
        #expect(first != second)
    }

    /// Le témoin qui décrit littéralement le défaut : trois slides, une seule
    /// mention posée. Il ne peut pas passer par chance — sur une publication à
    /// slide unique, la règle juste et la règle fautive rendent le même
    /// résultat, et c'est exactement pourquoi le défaut a vécu si longtemps.
    @Test("trois slides, une mention posée sur la première : une seule notification")
    func oneMentionOnThreeSlidesTravelsOnce() {
        let references = [note("alice", on: "slide-1")]
        let servies = ["slide-1", "slide-2", "slide-3"]
            .map { ComposerReferences.payload(references, for: $0) }

        #expect(servies[0].count == 1)
        #expect(servies[1].isEmpty)
        #expect(servies[2].isEmpty)
    }

    // MARK: - Post et Réel : une seule publication

    /// `nil` ⇒ « la publication unique ». Toutes les références partent, ce qui
    /// EST la règle en Post et en Réel : il n'y a qu'une publication, donc
    /// toute mention lui appartient.
    @Test("sans clé de publication, tout part — c'est le cas Post et Réel")
    func singlePublicationTakesEverything() {
        let references = [note("alice", on: "slide-1"), note("bob", on: nil)]
        #expect(ComposerReferences.payload(references, for: nil).count == 2)
    }

    // MARK: - Ce qui n'a pas de clé

    /// **Une référence SANS clé appartient à toutes les publications.** C'est la
    /// dégradation choisie pour les brouillons repris d'avant ce lot : leur
    /// `publicationKey` est `nil` et rien ne permet de deviner la slide visée.
    ///
    /// > Une donnée qu'on n'a jamais écrite ne se devine pas. Le repli reproduit
    /// > l'ancien comportement pour ces brouillons-là seulement, plutôt que de
    /// > faire disparaître une mention que l'auteur a bel et bien posée — perdre
    /// > est pire que répéter, ici.
    @Test("une référence héritée, sans clé, reste servie partout")
    func keylessReferenceIsInherited() {
        let references = [note("alice", on: nil)]
        #expect(ComposerReferences.payload(references, for: "slide-1").count == 1)
        #expect(ComposerReferences.payload(references, for: "slide-9").count == 1)
    }

    // MARK: - INLINE reste hors charge, quelle que soit la clé

    /// La règle d'origine ne bouge pas : un `@handle` écrit dans le texte est
    /// relu par le serveur depuis le `content` de SA slide. L'ajouter à la
    /// charge le compterait deux fois.
    @Test("INLINE reste exclue de la charge, avec ou sans clé")
    func inlineStaysOut() {
        let inline = ComposerReference(username: "alice", userId: "id",
                                       display: .inline, publicationKey: "slide-1")
        #expect(ComposerReferences.payload([inline], for: "slide-1").isEmpty)
        #expect(ComposerReferences.payload([inline], for: nil).isEmpty)
    }
}
