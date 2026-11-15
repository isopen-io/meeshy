## Leçon 180 — Un champ HOMONYME sur deux modèles rend une garde manquante invisible à la relecture (2026-08-15, routine temps réel, cycle 31)

Le schéma déclarait la règle en toutes lettres — `Conversation.closedAt` :
« Conversation closed for all — **no one can write**, messages stay readable ».
Aucun chemin d'écriture ne l'appliquait. Zéro, sur tous les transports.

**Pourquoi une absence aussi totale a tenu.** `isActive` existe sur DEUX
modèles. Toutes les gardes d'envoi en portent une —
`where: { conversationId, userId, isActive: true }` — et c'est celle du
`Participant`. Une relecture qui se demande « l'état actif est-il vérifié ? »
trouve la réponse partout et s'arrête. Or fermer une conversation ne touche
AUCUNE ligne `Participant` : les quatre routes de clôture n'écrivent que sur
`Conversation`.

**La règle.** Quand deux modèles portent un champ de même nom, la présence du
nom dans une clause ne prouve RIEN sur le modèle qu'on croit garder. Vérifier
sur quelle TABLE porte le filtre, pas sur quel mot. Et le test décisif ne se
pose pas au lecteur mais à l'écrivain : *quelles lignes la mutation écrit-elle
réellement ?* Ici la réponse — « `Conversation` seulement » — dit immédiatement
qu'aucune garde lisant `Participant` ne peut voir la clôture.

Même famille que les leçons 175 (cycle 26) et 178 (cycle 29) : une garde jumelle
existe, correcte, ailleurs, et sa présence rassure la relecture qui aurait dû
poser la question au bon endroit. Trois cycles sur six ont eu cette forme.

**Corollaire — un invariant DÉCLARÉ mais non exécuté est pire qu'un invariant
absent.** Le commentaire du schéma faisait croire la règle tenue à quiconque
lisait le modèle ; le cycle 30 l'a même citée dans son CHANGELOG en constatant
son absence, sans que cela suffise à la faire poser. **Chercher les invariants
que la documentation affirme et grepper leur exécutant** est une sonde
autonome, distincte de « chercher les bugs » — et elle rend, ici, quatre défauts
d'un coup.

**Corollaire de PLACEMENT — une garde d'admission se pose après le dédoublonnage,
jamais avant.** Un rejeu porte l'id d'un message déjà accepté : il a été admis
quand le conteneur était encore ouvert. Le refuser sur l'état COURANT ferait
marquer « échoué » un message pourtant délivré à tous ses destinataires. Le
témoin qui le prouve est le seul de la suite qu'une garde mal placée fait
échouer — les quatre témoins de refus, eux, passent des deux côtés. **Quand on
ajoute une garde à un pipeline idempotent, le test qui vaut n'est pas
« refuse-t-elle ? » mais « laisse-t-elle encore aboutir le rejeu ? »**

**Corollaire — « inconnu » n'est pas « terminal ».** Une ligne absente ne doit
pas produire un refus quand une AUTRE garde, juste au-dessus, est l'autorité sur
l'existence et l'appartenance. Faire arbitrer les deux à la même unité lui donne
deux raisons de changer, invente un mode d'échec là où le gardien voisin répond
déjà — et, très concrètement, casse tous les doubles de test qui ne modélisaient
pas un champ dont la règle n'a pas besoin.

**Corollaire — une garde qui dépend d'une colonne PROJETÉE se teste avec un
double qui projette.** Rencontré en écrivant ce cycle, sur son propre correctif :
la route de lien authentifiée résout par DEUX branches jumelles, la garde n'avait
été posée que sur la seconde, et la première lisait `undefined` — donc admettait.
**Les deux témoins étaient verts**, parce que le double rendait son objet entier
quel que soit le `select`. Un tel double prouve que le code sait DÉCIDER, jamais
qu'il a demandé de quoi décider ; les deux se cassent séparément. Remède double,
et les deux moitiés sont nécessaires : le double ne rend une colonne que si la
requête l'a réclamée, ET la projection est NOMMÉE plutôt que recopiée — deux
`select` jumeaux à quinze lignes d'écart sont une garde à moitié posée qui a
l'air d'une garde entière.
