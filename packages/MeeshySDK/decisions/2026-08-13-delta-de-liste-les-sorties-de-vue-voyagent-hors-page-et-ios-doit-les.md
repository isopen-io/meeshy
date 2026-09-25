## 2026-08-13: Delta de liste — les SORTIES de vue voyagent hors page, et iOS doit les lire
**Statut**: Accepté

**Contexte**: le delta `GET /conversations?updatedSince=` est upsert-only — sa clause serveur exige
une conversation `isActive` et un participant actif sans `deletedForMe`. Une conversation FERMÉE,
QUITTÉE, dont l'utilisateur a été BANNI, ou SUPPRIMÉE POUR MOI depuis un autre appareil n'y revient
donc dans aucune page, pas même sous la forme d'un `isActive: false` (qui ne décrit que les sorties
encore servables). Un leave ou un ban n'écrit d'ailleurs QUE la ligne `Participant` :
`Conversation.updatedAt` ne bouge pas, aucune clause ne les verrait. Le gateway livre ces
disparitions hors page (`meta.deletedConversationIds`, `routes/conversations/utils/delta-tombstones.ts`)
et le web les consomme. iOS ne les voyait pas : `OffsetPaginatedAPIResponse` — l'enveloppe de cette
route — ne portait pas `meta`, et le bloc était jeté au décodage. La ligne survivait dans la liste
ET dans l'index FTS jusqu'à la réconciliation complète, 24 h.

**Decision**: `APIResponseMeta` porte `deletedConversationIds` + `deletedConversationIdsTruncated`,
et `OffsetPaginatedAPIResponse` porte `meta` (défaut `nil` — l'absence se lit « pas de sortie, pas
de troncature », donc rétro-compatible avec un gateway antérieur).
`mergeDeltaConversations(existing:deltas:tombstoneIds:)` applique les tombstones **APRÈS** les
upserts : quand les deux flux du même lot se contredisent, la SORTIE est le fait le plus spécifique.
`removedIds` est dédupliqué (il pilote une invalidation par id) et son traitement s'énumère par
MAGASIN — cache des messages **et** index FTS local, que rien ne purgeait ; le ré-index du même lot
filtre `removedSet`, sinon une ligne servie puis tombstonée y ressusciterait seule.

La troncature des tombstones se replie dans `mayHaveMore` (décision du 2026-08-12) : ils n'ont
AUCUN curseur de reprise — il n'existe pas de « page suivante » de disparitions — donc l'escalade
vers `fullSync` est le seul recours, et retenir le curseur est ce qui les rend redemandables si
cette escalade échoue.

**Alternatives rejetées**: attendre la réconciliation complète (le statu quo, c'est-à-dire le
défaut) ; élargir la clause serveur pour servir les sorties en `isActive: false` — impossible, un
leave/ban ne touche pas `Conversation.updatedAt` ; garder le signal d'escalade distinct du curseur
comme le web — le web RECALCULE son curseur à chaque exécution, iOS le PERSISTE, et un curseur
persisté avancé au-dessus d'une escalade échouée rendrait les sorties coupées irréclamables (borne
serveur stricte `> since`).

**Cons**: `deletedConversationIds` est un plafond de 500 par stream côté gateway, tenu à la main
comme `deltaPageLimit` — sa troncature ne se rattrape que par un `fullSync` complet. Et la règle
« rapporter un retrait même inconnu de la liste » diverge du web, dont le cache dérivé est indexé
par la même clé que la liste, là où iOS a deux magasins distincts.
