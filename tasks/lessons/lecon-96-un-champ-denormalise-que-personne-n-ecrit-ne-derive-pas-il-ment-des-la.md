## Leçon 96 — un champ dénormalisé que personne n'écrit ne « dérive » pas : il MENT dès la première lecture (2026-08-11, routine messaging, cycle 71b)

Le cycle 70 laissait une question d'audience : *faut-il élargir la diffusion de trois événements
de membres ?* La réponse honnête imposait de vérifier d'abord ce que la ligne de liste rend. Cette
vérification a trouvé un défaut plus grave, ailleurs, et l'audience n'en était que la moitié.

1. **Chercher ce qu'un écran REND avant de décider ce qu'on lui envoie.** La question « la ligne
   de liste dépend-elle de ces faits ? » se répond en lisant la vue, pas en raisonnant sur les
   noms d'événements. `ThemedConversationRow` rend `memberCount` de trois façons — un badge, une
   intensité, et le **saturation boost de la couleur d'accent**. La troisième n'était devinable
   par personne, et c'est celle qui produisait le symptôme le plus visible : **la couleur d'une
   conversation changeait quand on l'ouvrait**, la liste calculant sur `0` et le fil sur le vrai
   effectif. Un « bug de compteur » ne ressemble pas à un bug de couleur : sans lire la vue, on
   ne relie jamais les deux.
2. **Une colonne dénormalisée se qualifie par ses ÉCRITURES, pas par ses lectures.** `grep`
   `memberCount` rendait quinze sites ; filtrer sur les écritures Prisma en rendait UN, une
   migration héritée. Un champ que le code courant n'écrit jamais n'est pas « en retard » : il
   vaut `@default(0)` pour tout ce qui a été créé depuis. **La question utile n'est pas « ce
   compteur est-il à jour ? » mais « qui l'incrémente ? » — et quand la réponse est "personne",
   le champ est mort, pas obsolète.**
3. **Deux routes qui servent le même nom de champ depuis deux sources sont un défaut, même quand
   les deux « marchent ».** Le détail servait `_count` filtré, la liste servait la colonne. Chaque
   route, lue seule, était cohérente. C'est leur CONTRAT COMMUN qui mentait — et le client, lui,
   ne sait pas de quelle route vient sa ligne. Le repli du transformer web
   (`memberCount || _count || participants.length`) achevait de masquer : il rendait `5`, une
   valeur plausible, parce que la liste n'envoie que 5 participants.
4. **Le nom d'événement surchargé — voir la leçon 94, écrite le même jour par la session
   parallèle, qui l'a instruit plus loin (le jumeau `conversation:left`).** *(Numérotée 110 et non
   96 : ce fichier porte DEUX séries de numéros qui se recouvrent depuis longtemps — une vingtaine
   de doublons entre ~54 et ~96. La série haute, seule à jour, va jusqu'à 109 ; s'y rattacher plutôt
   qu'ajouter une collision de plus. Le tri du reste est un chantier à lui seul, pas un effet de
   bord de cycle.)* Un point à ajouter
   depuis ce côté-ci : entre « un champ qui discrimine » et « un nom distinct », **prendre le
   nom**. Cette session proposait de séparer les deux sens par la PRÉSENCE de `memberCount` dans
   le payload ; ça fonctionne, mais ça fait porter la sémantique à une option, et ça élargit
   l'audience d'un événement que des clients déployés écoutent déjà. Un nom neuf ne demande rien
   à personne et se fige par un témoin.
5. **Le remède d'un delta n'est pas un meilleur delta : c'est un ÉTAT ABSOLU.** Élargir l'audience
   réduit les événements manqués ; elle ne les supprime pas (hors ligne, trou de reconnexion). Un
   `±1` ne se rattrape jamais, et les deux clients PERSISTENT la dérive (cache disque iOS,
   `staleTime: Infinity` web). Porter le total dans le payload — compté sur la requête qui sert
   déjà à nommer les rooms, donc gratuitement — rend l'effectif convergent, rend `membershipEnded`
   / `membershipRestored` superflus pour qui le lit, ET sépare les deux sens de l'événement
   surchargé : seul celui qui parle d'appartenance porte le compte. **Un champ bien choisi ferme
   trois défauts que trois correctifs séparés auraient traités un par un.**
6. **Un double de test qui ne supporte pas la forme de production décrit un autre programme.**
   Six suites plantaient parce que leur `io.to()` rendait `{ emit }` sans `.to` — or la forme
   livrée chaîne (`to(fil).to(perso).emit()`) pour ne délivrer qu'une copie par socket. Pire :
   `expect(io.to).toHaveBeenCalledWith(room)` ne prouve PAS la livraison — il dit qu'une room a
   été nommée quelque part, jamais qu'elle appartenait à la chaîne qui a émis cet événement-là.
   **Quand un témoin porte sur « qui reçoit quoi », le double doit retenir la chaîne, pas compter
   les appels.**
7. **`{ ...défauts, ...o.champ }` suivi de `...o` annule le premier spread.** Trouvé en passant
   dans une factory de test : le second spread réécrase l'objet entier, donc tout défaut non
   redéclaré par le test disparaît — silencieusement, jusqu'au jour où le code lit un champ de
   plus. La fusion par clé n'est vraie que si le spread large vient EN PREMIER.
