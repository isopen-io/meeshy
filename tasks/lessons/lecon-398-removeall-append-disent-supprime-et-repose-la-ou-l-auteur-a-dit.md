## Leçon 398 — `removeAll` + `append` disent « supprime et repose » là où l'auteur a dit « modifie »

**Contexte.** Rouvrir la première carte d'un son et valider sans rien changer la
renvoyait en DERNIÈRE position. `A, B` devenait `B, A`. Le commit qui avait livré
les N cartes posait pourtant l'ordre de la pose en invariant, dans son propre
témoin : « l'ordre est celui de la POSE — le seul que l'auteur puisse prévoir ».

**La leçon.** Le couple `removeAll { … } / append(…)` est le motif à chercher
dans tout chemin d'ÉDITION. Il grave son défaut dans l'ORDRE — une propriété que
presque aucun test n'observe, parce qu'un test à UN élément ne peut pas la voir.
Un remplacement à l'index (`ComposerMediaOrder.replacing`) dit ce qui se passe.

Difficulté propre au domaine, qui interdit un simple `firstIndex(of:)` : un
rognage rend une URL NEUVE. **La clé cherchée et la valeur posée ne portent pas
la même URL** — c'est ce que la règle doit tenir, et ce qu'un site d'appel
réécrirait de travers une fois sur deux.
