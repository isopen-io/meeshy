## Leçon 347 — un découpage de fichier n'est pas terminé quand le fichier passe sous le budget, mais quand les gardes qui le nommaient pointent l'UNITÉ

**Le fait.** Quatre gardes de source du composer levaient `GuardIsBlind` — « Ancre « var sendButton:
some View { » introuvable : la garde ne garde plus rien ». Aucune n'avait été touchée. Leur cause
commune : `UniversalComposerBar` a été découpée en **huit** parties et `ConversationView` en **dix**
pour rentrer dans le budget de 800–1100 lignes, et les blocs que ces gardes ancrent ont suivi dans les
extensions. Les gardes, elles, lisaient toujours le fichier-tête.

> **Une garde de source qui nomme des FICHIERS se périme au premier fichier ajouté ; une garde qui
> nomme une UNITÉ survit au découpage.** `AppSourceGuard.unit(_:)` existe exactement pour ça — il globe
> `Type+*.swift` — et son propre doc-comment le disait déjà : « une liste de parties se périme au
> premier fichier ajouté, et se périme EN SILENCE puisque le résultat reste non vide ».

**Ce qui a sauvé ce cas, et qu'il faut savoir reproduire.** Ces gardes levaient une erreur nommée
(`GuardIsBlind`) au lieu de rendre une chaîne vide. Une garde qui lit un fichier introuvable et
poursuit passe au VERT en n'ayant rien mesuré ; celle-ci rougit et dit pourquoi. **C'est la seule
raison pour laquelle le défaut était trouvable** — cinq propriétés du bouton d'envoi auraient cessé
d'être gardées sans que personne le sache.

Le corollaire pratique : toute garde qui extrait un BLOC par ancre doit traiter l'ancre absente comme
un ÉCHEC, jamais comme un bloc vide. Un `guard let … else { return "" }` y est une extinction déguisée.

**La règle de fin de travail.** Un lot de découpage a trois étapes, pas deux :

1. le fichier passe sous le budget ;
2. le projet se régénère (`xcodegen`) et compile ;
3. **les gardes qui nommaient l'ancien fichier pointent l'unité** — sans quoi on a échangé une dette de
   taille contre une dette de protection, et la seconde ne se voit pas.

L'étape 3 se cherche par `grep -rn "<NomDuType>.swift" MeeshyTests` : ce sont les gardes qui viennent
de perdre leur objet. Elle n'a pas été faite au découpage d'origine — d'où quatre gardes aveugles
retrouvées des semaines plus tard, par une session tierce qui faisait tourner la suite entière.

Voir la leçon 344 (une garde négative posée sur un FICHIER attrape les jumelles innocentes de sa cible)
et la 340 (dans un arbre partagé, le gate d'une session mesure aussi le WIP des autres) : trois façons
dont la PORTÉE d'une garde décide de ce qu'elle vaut.
