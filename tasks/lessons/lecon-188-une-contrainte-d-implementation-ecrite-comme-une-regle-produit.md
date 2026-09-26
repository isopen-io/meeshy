## Leçon 188 — une contrainte d'implémentation écrite comme une règle produit devient indélogeable (2026-08-15, routine temps réel, cycle 37)

**Le défaut.** Le drain sautait l'accusé de remise pour tout lecteur sans compte,
sur un `return` commenté « delivery receipts require a registered userId
(participant lookup is keyed on Participant.userId, null for anonymous) ». La
première moitié de la phrase est une RÈGLE — « il faut un compte pour mériter un
accusé ». La seconde est un FAIT sur la requête d'alors — `row.userId === userId`
ne matche aucune ligne pour ce lecteur. Le fait était vrai ; la règle qu'il
justifiait était fausse, et l'auteur du message, lui, avait bel et bien droit à
sa double coche.

**Pourquoi c'était indélogeable.** Le `return` vivait un cran AU-DESSUS de la
requête qu'il décrivait. Tant qu'il tenait, il n'y avait plus rien à corriger en
aval : l'unité défectueuse n'était jamais atteinte, donc jamais exercée, donc
jamais suspecte. *Un garde placé au-dessus du code qui le motive supprime la
preuve de sa propre obsolescence* — corriger la requête n'aurait rien changé, et
personne ne corrige une requête que rien n'appelle.

**La règle.** *Une limite d'implémentation se commente à l'endroit qu'elle
limite, jamais à l'entrée.* Écrite à l'entrée, elle se lit comme une décision
produit et survit à la disparition de sa cause. Le test de relecture est
mécanique : la phrase dit-elle ce que le code NE PEUT PAS faire, ou ce que le
produit NE DOIT PAS faire ? Ici « lookup is keyed on Participant.userId » est du
premier type — il décrit une ligne de `select`, pas un droit.

**Le corollaire sur l'incertitude.** Le cycle 36 avait relevé ce gap et l'avait
différé, jugeant que trancher la forme du payload « sans pouvoir exercer les
décodeurs iOS/Android mélangerait un correctif prouvé avec un pari ». Le pari
n'existait pas : le type partagé énonçait déjà `userId: string | null` avec le
cas anonyme NOMMÉ, les deux décodeurs le déclaraient déjà optionnel, et le jumeau
EN LIGNE de l'unité (`autoDeliverToOnlineRecipients`) émettait déjà cette forme
en production. *Une incertitude sur un contrat se lève en LISANT le contrat et
ses consommateurs, pas en attendant de pouvoir les exécuter.* Un doute qui n'a
pas été confronté aux fichiers coûte un cycle entier — et, ici, il s'est
retrouvé à protéger le défaut qu'il avait lui-même identifié.

**Le discriminant qui interdit la sur-correction.** Le lecteur se reconnaît par
`row.id` s'il est anonyme, par `row.userId` sinon — jamais par les deux. La forme
tolérante qui vient naturellement (`row.id === key || row.userId === key`) passe
tous les témoins sauf un, et fait accuser réception à un inscrit au nom d'un
participant sans compte dont l'id coïncide. Ce témoin-là s'écrit ; il ne se
déduit d'aucun autre. Même famille que la leçon 187 : *le cas qu'un prédicat
tolérant absorbe en silence est celui qu'aucune assertion existante ne regarde.*
