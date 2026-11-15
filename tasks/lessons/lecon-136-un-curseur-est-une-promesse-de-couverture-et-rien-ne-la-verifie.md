## Leçon 136 — un CURSEUR est une promesse de couverture, et rien ne la vérifie jamais (2026-08-12, routine messaging, cycle 98)

**Le défaut.** `GET /sync` rend un `checkpoint` que le client renverra en `since` au tour suivant.
La borne serveur est STRICTE (`updatedAt > since`). Un curseur rendu trop AVANCÉ ne produit donc ni
erreur, ni log, ni test rouge : il produit un **trou définitif** dans les données d'un client qui a
fait exactement ce qu'on lui disait de faire. Trois fenêtres coexistaient dans le même endpoint.

**Les trois questions à poser à tout curseur rendu à un client** — chacune avait ici une mauvaise
réponse, et chacune ouvrait sa propre fenêtre de perte :

1. **À quel instant est-il ancré, AVANT ou APRÈS les lectures qu'il prétend couvrir ?**
   `checkpoint: new Date()` était évalué à la construction du payload, donc après. Signal qui
   aurait dû alerter : `checkpointSeq`, dans le MÊME payload, était lu AVANT les collections. Deux
   watermarks côte à côte penchant en sens opposés — l'un conservateur, l'autre optimiste — sont
   une incohérence visible à l'œil nu, et personne ne l'avait regardée.
2. **L'estampille sur laquelle il porte est-elle posée au COMMIT ou à la CONSTRUCTION de
   l'écriture ?** `@updatedAt` est posé par Prisma au build de la requête. Une ligne estampillée T
   peut n'être visible qu'à T+δ : ancrer le curseur avant les lectures ne suffit donc PAS, il faut
   un retrait. C'est le point qu'on rate en croyant avoir fini après la question 1.
3. **Que vaut-il quand la réponse est TRONQUÉE ?** Le reste d'une page tronquée est un ARRIÉRÉ :
   ses estampilles sont ANTÉRIEURES au curseur. Rendre un curseur frais invite le client à perdre
   tout l'arriéré d'un coup.

**Le filtre de recherche que ce cycle valide, et qui est réutilisable tel quel.** La règle exacte
était DÉJÀ écrite dans le dépôt — mais côté CLIENT seulement, et pour un autre endpoint :
`SyncWatermark.advancedAfterDeltaPage` (`packages/MeeshySDK/.../SyncWatermark.swift`) dit noir sur
blanc « une page qui laisse du reste n'a pas rendu toute la fenêtre » et « la borne serveur est
STRICTE (`gt`) ». Elle n'avait jamais traversé jusqu'au serveur qui ÉMET les curseurs.
**Chercher les règles déjà écrites d'un côté d'une frontière (client/serveur, iOS/web, module A/
module B) et jamais portées de l'autre est, en soi, un filtre productif** — le dépôt connaît
souvent déjà la réponse, à un fichier près.

**Le piège de test, observé en direct.** La première rédaction de la garde « le checkpoint ne
post-date pas la lecture » est passée AU VERT sur le code défectueux : lecture et checkpoint
partageaient la milliseconde. Il a fallu introduire un délai dans le double de `findMany` pour
matérialiser la fenêtre. **Un test de fenêtre temporelle qui passe au vert du premier coup n'a
probablement rien mesuré** — vérifier qu'il est RED avant de le croire, comme pour n'importe quel
autre test, mais avec une attention particulière : ici le faux vert vient de la RÉSOLUTION de
l'horloge, pas d'une erreur de logique, et il est donc invisible à la relecture.

**Ce que le cycle a refusé, et pourquoi c'est une leçon aussi.** L'item instruit était une passe
planifiée détruisant définitivement des posts N jours après leur suppression douce. Le
raisonnement technique qui y menait était solide et vérifié sur deux cycles. Il a quand même été
refusé : `N` est une décision produit, le geste est irréversible et sort du dépôt, et une question
de périmètre restait ouverte (un repost SIMPLE d'un post PERMANENT ne duplique rien — le détacher
le VIDE au lieu de le sauver). **Un raisonnement complet n'autorise pas un geste destructeur ; il
le rend seulement prêt à être soumis.** Le cycle 97 venait précisément de trouver qu'une passe
voisine détruisait depuis des mois du contenu qu'elle n'avait jamais eu le droit de toucher.

---
