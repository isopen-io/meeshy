## Leçon 201 — un correctif qui expose une IDENTITÉ peut choisir le mauvais espace, et sa propre suite de tests peut le masquer (2026-08-16, routine appels, Vague 132)

**Le fait.** La Vague 131 a corrigé un vrai bug (les alertes de qualité/capture d'écran nommaient le
mauvais pair en appel de groupe) en exposant `event.participantId` jusqu'à l'UI. Mais
`participantId` est `CallParticipant.participantId` — la FK vers `Participant.id` — alors que le
roster client résout un nom par `.userId`, un vrai `User.id`. Le correctif de la Vague 131
« fonctionnait » dans ses tests et échouait pour quasiment tout appel réel : le nom affiché était
une chaîne vide, jamais le mauvais nom (ce qui aurait été visible en test manuel), juste un nom
absent — un `''` interpolé dans une phrase produit une apostrophe orpheline ou un double espace,
pas un crash, pas une exception, rien qui attire l'œil en revue rapide.

**Pourquoi la suite de tests de la Vague 131 ne pouvait pas le voir.** Le fixture roster de test
posait `{ userId: 'bob', ... }` et l'alerte de test posait `participantId: 'bob'` — la MÊME chaîne
dans les deux espaces, par choix arbitraire de nommage de test. Cette coïncidence ne se produit
JAMAIS avec de vrais ObjectId Mongo (24 caractères hexadécimaux générés indépendamment), mais rend
le test vert par construction. *Un test d'identité qui utilise la même valeur littérale pour deux
champs sémantiquement différents (ici `participantId` vs `userId`) ne teste pas leur relation — il
la présuppose déjà vraie.* Toujours choisir des valeurs de fixture DISTINCTES pour deux champs
d'identité censés vivre dans des espaces différents, précisément pour qu'une confusion entre eux
fasse échouer le test au lieu de le laisser passer.

**Ce codebase a maintenant DEUX (voire trois) espaces d'identité pour « ce participant » selon le
point du protocole d'appel** : `Participant.id` (ligne de conversation), `CallParticipant.id`
(ligne d'appel elle-même), `CallParticipant.participantId` (la FK entre les deux), et `User.id`.
Trois champs concurrents nommés de façon similaire (`id`, `participantId`, `userId`) sur des lignes
différentes, dont la confusion ne casse presque jamais bruyamment — un id qui ne matche rien produit
un lookup vide, pas une erreur. Ce n'est pas la première fois sur ce chantier (cf. le commentaire
« kick modérateur/mauvais côté qui meurt silencieusement » déjà présent dans `CallService.ts` avant
cette vague) : c'est un piège récurrent de la forme du domaine, pas un accident isolé.

**Règle pour la suite.** Quand un correctif fait voyager un identifiant du serveur vers l'UI à
travers plusieurs événements/hooks/composants, vérifier À CHAQUE saut quel espace d'identité
chaque bout attend — ne jamais supposer qu'un champ nommé `participantId`/`userId`/`id` sur deux
structures différentes du MÊME domaine désigne la même ligne. Le test de la relation doit fabriquer
des valeurs distinctes par espace ; si un seul littéral suffit à faire passer le test pour DEUX
champs différents, le test ne prouve rien sur leur accord. Et quand le correctif touche une
structure partagée entre plusieurs émetteurs/consommateurs (ici un `Set` alimenté par trois
événements), vérifier que TOUS s'accordent sur le même espace — pas seulement les deux qu'on est
en train de corriger : le nettoyage `participant-left` de la Vague 129 vivait déjà dans un
troisième espace, invisible tant qu'on ne creusait pas le même `Set`.
