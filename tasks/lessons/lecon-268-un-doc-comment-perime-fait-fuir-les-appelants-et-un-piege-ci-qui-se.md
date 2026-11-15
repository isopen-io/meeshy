## Leçon 268 — Un doc-comment périmé fait fuir les appelants, et un piège CI qui se reproduit trois fois n'est plus un accident

**Contexte** : itération iOS 240i (PR #3426, mergée `52445d9e`).

### (a) La limitation qui n'existe plus mais que le commentaire annonce encore

`PostStatAccessibility` portait, depuis 2025, la phrase :

> Proper multi-language plurals would require a `.xcstrings` plural variant.

Vraie à sa rédaction. **Fausse depuis** : les trois clés de ce type même
(`feed.post.stat.{likes,comments,reposts}`) avaient reçu leurs
`variations.plural` complètes — 6 formes arabes comprises. Personne n'a relu
le commentaire quand la limitation est tombée.

Conséquence mesurée : les **cinq** surfaces SwiftUI du fil ont recopié la règle
par **quatre clés PLATES différentes** plutôt que d'appeler le helper, qui ne
servait plus qu'aux deux cellules UIKit. Le défaut le plus grave n'était pas
un défaut d'accessibilité mais une **faute de français VISIBLE en production** :
« 1 réponses » à l'écran, en toutes locales.

**Règle : un doc-comment qui DÉCRIT UNE LIMITATION doit être relu quand la
limitation tombe.** Le laisser en place est plus nuisible qu'un commentaire
absent — il ne se contente pas d'être faux, il *détourne activement* les
appelants de la source unique et fabrique la duplication qu'on passera ensuite
des itérations à réduire.

Corollaire de recherche : avant d'écrire un helper « parce qu'il n'en existe
pas », chercher le nom COMPTÉ (« likes », « replies ») dans le catalogue, pas
seulement dans le code — une clé plurielle déjà traduite dans 7 locales est la
preuve qu'une source existe.

### (b) Trois fois le même piège CI ⇒ c'est le comportement nominal

La suite iOS est en **opt-in** (` — run test` dans le SUJET du commit de tête).
Sans lui, le job s'appelle `Build app (app + cibles de test)` et **ne fait que
compiler**, tout en affichant vert.

- 238i l'a subi (premier run tout vert, zéro test).
- 239i l'a re-subi, **par une main tierce** (tête `17d25455`).
- 240i l'a subi **une troisième fois**, encore par une fusion tierce : PR
  **17/17 verte, zéro test exécuté**, alors que l'apport ÉTAIT une garde neuve
  et quatre tests de pluriel.

Trois occurrences sur trois itérations consécutives : **ce n'est plus un
accident à consigner, c'est le comportement à ANTICIPER** dès qu'un tiers
touche une PR iOS.

**Règle opératoire : après CHAQUE poussée sur une PR iOS — surtout celles qu'on
n'a pas faites soi-même — lire le NOM du check avant sa couleur ; si c'est
celui de la compile seule, re-pousser avec l'opt-in.** Et jamais par un commit
vide (proscrit) : embarquer l'opt-in sur un commit qui porte un vrai contenu
(ici, la mise à jour du plan et du pointeur, légitimement en attente).

### (c) Un rouge de base se PROUVE avant de se déclarer « pas à moi »

240i a d'abord rendu 7762/1, l'unique rouge nommant cinq clés
`forward.publish-*` étrangères au lot. « Ça ne vient pas de moi » n'est une
conclusion recevable qu'ADOSSÉE À UNE PREUVE. Trois ont été produites :
le commit fautif est **ancêtre de la base**, la liste de dette vaut `[]` (rien
n'est toléré), et le diff de la branche **ne touche aucun fichier `forward`**.
Alors seulement : signaler en commentaire **avec le patch proposé**, et ne pas
élargir une PR i18n de compteurs avec les traductions d'une autre feature.
