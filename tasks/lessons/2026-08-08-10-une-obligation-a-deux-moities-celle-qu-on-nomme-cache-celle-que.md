## 2026-08-08 (10) — Une obligation à DEUX moitiés : celle qu'on nomme cache celle que personne ne tient

**Contexte** — Cycle 24. Le cycle 23 laissait une tête nette : « l'édition socket ne repasse pas par
`processExplicitLinksInContent`, là où REST le fait ». Diagnostic exact, et facile à corriger : un
appel à ajouter, avec un modèle vivant sous les yeux (REST).

**Ce qu'on trouve en lisant le bloc plutôt que la prescription** — le chemin de CRÉATION fait DEUX
choses aux URLs d'un message, pas une :

1. réécrire `[[url]]` / `<url>` en `m+<token>` — le contenu change ;
2. minter un token pour chaque URL BRUTE et ranger le mapping dans `metadata.trackingLinks` — le
   contenu ne change pas, mais le client route le clic vers `/l/<token>`.

La tête ne nommait que la première, parce que c'est la seule que REST tient — et une asymétrie se
repère en comparant deux chemins. La seconde n'était tenue **par aucun des deux** : invisible par
construction, puisqu'il n'y a rien à quoi la comparer. Résultat concret : une URL ajoutée par
édition restait intraçable pour toujours, alors que le même texte, envoyé tel quel, était tracé.

**Règle** — quand une tête dit « le chemin A ne fait pas ce que fait le chemin B », ne pas se
contenter de recopier B chez A. Aller lire ce que fait le chemin de **création** — celui qui n'a pas
de jumeau et qu'on ne compare donc à rien. C'est là que vivent les obligations qu'aucune asymétrie
ne révèle. Une comparaison A-vs-B ne peut jamais trouver ce qui manque à A **et** à B.

**Corollaire — la duplication est la CAUSE, pas un dommage collatéral.** L'algorithme de réécriture
existait en deux exemplaires recopiés ligne pour ligne (`MessageProcessor.processLinksInContent` et
`TrackingLinkService.processExplicitLinksInContent`). Le chemin socket n'avait pas « oublié » un
appel : il n'avait aucun appel qui soit manifestement le bon. Corriger le défaut sans supprimer le
doublon aurait laissé un troisième écrivain dans la même position. Quand un site manque un
traitement qui existe en deux exemplaires, la déduplication fait partie du correctif, pas d'un
nettoyage ultérieur.

**Corollaire — un blob `Json?` partagé se FUSIONNE.** `Message.metadata` porte `trackingLinks`,
mais aussi `postReplyTo` (snapshot GELÉ d'un post cité, irrécupérable après expiration de la story)
et `location`. Écrire `{ trackingLinks }` par-dessus aurait détruit les deux, et la citation perdue
ne se reconstruit pas. Avant d'écrire dans un champ Json, énumérer ses AUTRES clés : la colonne ne
dit pas qui elle héberge.

**Confirmation par les tests** — deux doubles de `TrackingLinkService` ne stubaient que trois
méthodes. Ils ont échoué bruyamment dès que le code a appelé la vraie surface, ce qui est le bon
comportement (cf. 2026-08-07, « un mock qui invente le contrat protège le bug qu'il prétend
couvrir »). Un double partiel n'est un piège que s'il rend `undefined` en silence ; ici, appeler une
méthode absente lève, donc la dette s'est signalée elle-même.
