## Leçon 82 — un compteur dénormalisé et son registre par acteur se contredisent en silence (2026-08-10, routine messaging, cycle 57)

`Message.viewOnceCount` était incrémenté par un `update` inconditionnel à chaque appel de la route
`consume`. Deux instructions plus bas, le même gestionnaire écrivait
`MessageStatusEntry.viewedOnceAt` — la vérité par participant — et ne la relisait jamais. Le
compteur mesurait des OUVERTURES là où tous ses lecteurs (`isFullyConsumed`, l'annonce à la room,
la disparition du média) le lisent comme un nombre de SPECTATEURS.

**Leçons :**

1. **Quand un agrégat et un registre par acteur coexistent, vérifier lequel des deux est écrit
   sans consulter l'autre.** C'est la forme jumelle de la leçon 74 : là, un champ avait un
   consommateur qu'on n'avait pas cherché ; ici, un champ a un producteur et pas de consommateur.
   Le tell est le même — deux écritures dans le MÊME gestionnaire, dont une seule décide. Le grep
   qui tranche est `grep -n "<champ>"` sur le service : si toutes les occurrences sont des
   écritures, l'agrégat voisin ne peut pas être exact.
2. **Un compteur sans clé d'idempotence n'est pas « approximatif », il est faux dès le premier
   rejeu.** File hors-ligne, double tap, retry réseau : chacun de ces chemins existe déjà dans le
   produit. Avant d'accepter une mutation nue, se demander qui la rejoue — la réponse est rarement
   « personne ».
3. **Une garde de concurrence vit dans un `where`, jamais dans un `if` qui suit une lecture.**
   « Lire si c'est nul, puis écrire » se trompe dès que deux appels se croisent, et déplace le
   défaut d'un cran au lieu de le corriger. L'`updateMany` filtré tranche côté base ; quand il
   n'apparie rien, c'est l'ÉCRITURE suivante (et son conflit d'unicité) qui distingue « la ligne
   manque » de « la ligne est déjà prise » — pas une seconde lecture, qui rouvrirait la fenêtre
   qu'on vient de fermer.
4. **Un `catch` qui avale tout transforme une panne en fait accompli.** Ne traiter comme « déjà
   fait » que le code d'erreur qui le PROUVE (`P2002`), et laisser remonter le reste : sinon une
   base indisponible se lit comme une action antérieure, et l'utilisateur perd son geste sans que
   rien ne le signale. Un témoin dédié à ce cas coûte quatre lignes.
5. **Le piège `{ champ: null }` sur MongoDB se relance à CHAQUE nouveau prédicat, pas une fois par
   modèle.** `viewedOnceAt` a deux états « pas encore » — absent (l'entrée créée par la livraison
   n'écrit que `deliveredAt`/`readAt`) et présent-et-nul (une entrée qu'un autre chemin a posée).
   Le dépôt a déjà payé ce piège trois fois (`deletedAt` sur `Post`, `leftAt` sur les participants
   d'appel, le balayage éphémère du cycle 54). La question à poser devant tout filtre sur une
   colonne `DateTime?` : *quel chemin écrit cette colonne, et est-ce que TOUS les créateurs de la
   ligne l'écrivent ?* Si non, il faut la forme `OR`.
6. **Un test nommé d'après un numéro de ligne épingle une implémentation, et peut épingler un
   défaut.** Les deux témoins de couverture de branche tombés ici — « line 2265 false branch » —
   figeaient `viewParticipant = null` comme un chemin de SUCCÈS, c'est-à-dire le corollaire anonyme
   du défaut lui-même. Un tel témoin ne se supprime pas et ne se plie pas : on lui rend l'intention
   qu'il visait, formulée en comportement. Quand un correctif fait rougir un test de couverture,
   lire ce qu'il croyait garantir avant de le juger obsolète.
7. **Une piste héritée peut se réfuter par lecture seule, et c'est un résultat.** « `post_comment`
   et `comment_like` n'exposent pas `context.commentId` » était exact et sans conséquence : le
   retrait couvre déjà les deux chemins par un `$or`, son en-tête dit pourquoi, et aucun client ne
   lit ce champ. Une demi-heure de lecture a évité un changement de contrat qui n'aurait corrigé
   aucun défaut observable. Réfuter la tête du backlog n'est pas perdre le cycle — c'est ce qui
   autorise à en chercher un vrai.
