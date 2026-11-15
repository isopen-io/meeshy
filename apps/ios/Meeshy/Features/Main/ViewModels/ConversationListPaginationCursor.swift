import Foundation

/// **CE QU'ON A LE DROIT D'ENVOYER COMME CURSEUR DE PAGINATION** (#6857).
///
/// `ConversationListViewModel.loadMore()` retombait, faute de `nextCursor`, sur
/// l'identifiant de la conversation locale la plus ancienne. Le repli est
/// LÉGITIME — il reprend la pagination quand le curseur n'a jamais été persisté,
/// et sans lui l'infinite scroll se bloque sur un compte dont le full sync s'est
/// arrêté en route. Ce qui manquait est la question : cet identifiant veut-il
/// dire quelque chose pour la passerelle ?
///
/// Mesuré au simulateur : `before=conv-hydrate` — une fixture de témoin gravée
/// dans le cache disque. La passerelle la remet à
/// `prisma.conversation.findFirst({ where: { id } })`, Prisma la caste en
/// ObjectId, la conversion lève, et le handler rend **500**. Comme « Réessayer »
/// rappelle `loadMore()`, qui recompose le même curseur depuis le même état
/// local, l'erreur ne pouvait structurellement jamais se lever.
///
/// > **Le serveur est seul juge de ce qu'il ÉMET ; le client est juge de ce
/// > qu'il INVENTE.** D'où l'asymétrie de cette loi : un `nextCursor` servi
/// > passe tel quel, opaque, sans examen — le durcir ferait dépendre la
/// > pagination d'une supposition du client sur un format qui ne lui appartient
/// > pas. Un repli que le client FABRIQUE, lui, doit ressembler à ce que la
/// > passerelle sert.
///
/// Fichier à part : `ConversationListViewModel.swift` pèse plus de 2 500 lignes,
/// donc hors du budget de 1 200 — on n'y ajoute pas, on extrait.
nonisolated enum ConversationListPaginationCursor {

    /// Un identifiant servi par la passerelle : 24 caractères hexadécimaux
    /// (§ « Database » du CLAUDE.md racine — les id sont des ObjectId MongoDB).
    private static func estUnIdentifiantServeur(_ valeur: String) -> Bool {
        valeur.count == 24 && valeur.allSatisfy(\.isHexDigit)
    }

    /// Le curseur à envoyer, ou `nil` — auquel cas la requête demande la
    /// PREMIÈRE page, ce qui est un repli sûr : on réaffiche ce qu'on a déjà
    /// plutôt que d'échouer.
    static func resolve(nextCursor: String?, oldestLocalId: String?) -> String? {
        if let nextCursor, !nextCursor.isEmpty { return nextCursor }
        guard let oldestLocalId, estUnIdentifiantServeur(oldestLocalId) else { return nil }
        return oldestLocalId
    }
}
