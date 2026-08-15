# Lessons

## Leçon 246 — Avant d'OUVRIR un chantier, regarder qui d'autre est déjà dessus — la leçon 242 vaut aussi à l'aller (2026-08-14, routine messaging, cycle 123bis)

La leçon 242 disait : avant de RÉPARER un fichier cassé, chercher qui d'autre le répare déjà. Ce
cycle a montré que la règle vaut à l'identique pour une FONCTIONNALITÉ, et qu'elle se paie plus
cher — parce qu'un chantier dure des heures, pas trois minutes.

J'ai implémenté « le filtre de la cloche ne filtre que le déjà-chargé » de bout en bout : gateway,
web, témoins, doc, PR #2991, CI verte sur quatorze jobs. Pendant que ma CI tournait, une autre
session de LA MÊME routine a livré et fusionné le même correctif (#2986). Deux implémentations
indépendantes du même défaut, dont une jetée — la mienne.

**Ce qui l'aurait dit en dix secondes, avant d'écrire la première ligne :**

```bash
git ls-remote origin 'refs/heads/*' | grep -i <mot-clé-du-chantier>
# et : gh/MCP search_pull_requests state:open — le TITRE d'une PR ouverte dit le chantier
```

Le candidat que j'ai pris venait de la section « Prochains candidats » de `tasks/todo.md` — c'est-
à-dire d'une liste PUBLIQUE, lue par toutes les sessions de la routine. **Une file de tâches
partagée sans réservation produit mécaniquement des doublons** : le premier candidat de la liste
est celui que tout le monde prend. Prendre le premier NON déjà porté par une branche distante est
le geste correct.

**Ce que le doublon coûte, et ce qu'il ne coûte pas.** Il ne coûte pas la compréhension du défaut :
les deux implémentations sont arrivées aux mêmes conclusions (`?types=` en CSV, liste vide = pas de
filtre, compte serveur pour les pastilles), ce qui est un signe que l'analyse était juste. Il coûte
le temps machine et, surtout, il fait courir le risque d'un ÉCRASEMENT : deux branches qui touchent
les mêmes fichiers, et la dernière fusionnée gagne. C'est exactement le scénario de la leçon 242,
en plus gros.

**Le geste de sortie, quand le doublon est constaté : ne pas fusionner par-dessus.** Repartir de
`main`, comparer les deux implémentations point par point, et ne garder que le DELTA réellement
absent. Ici, trois choses manquaient à la version fusionnée — le squelette qui emporte toute la
page à chaque premier passage sur un onglet, le `{ types: [] }` qui dédouble le cache de la cloche,
et la doc qui annonçait toujours les paramètres fantômes à l'origine du bug. Le cycle a donc rendu
une PR de suite, petite et honnête, au lieu d'une PR concurrente. Le travail superseded est gardé
sous un tag (`cycle123-superseded-by-2986`) plutôt que poussé.

**Corollaire — une CI longue est une fenêtre de collision.** Quatorze jobs, dont un de huit
minutes, laissent une demi-heure pendant laquelle `main` peut recevoir le même correctif. Re-faire
`git fetch origin main` AVANT de fusionner n'est donc pas une formalité : c'est le seul moment où
la collision est encore réparable proprement.

## Leçon 243 — « La CI ne l'a pas vu » a plusieurs causes possibles, et elles n'ont pas le même remède (2026-08-14, routine messaging, cycle 122)

`main` ne compilait plus pour iOS : la PR #2982 avait retiré `enum MessageDayStickyPlacement`
en laissant trois usages dans `MessageListViewController`. Le gate iOS de MA PR l'a levé.

La première explication trouvée était vraie **et fausse en même temps** : `ios-tests.yml` n'a
effectivement pas tourné sur `main` depuis le 2026-08-02 (sa portée de déclenchement l'y limite),
donc j'ai conclu « le gate ne s'exerce qu'en PR, la rupture est passée sans rougir ». Fait exact,
cause fausse — et je l'ai envoyée en notification, c'est-à-dire vers le mauvais correctif
(élargir un trigger).

Ce que disent les horodatages, qu'il aurait fallu lire AVANT de conclure :

| Événement | Heure |
|---|---|
| PR #2982 ouverte | 04:25:32 |
| `iOS compile (PR gate)` démarré | 04:25:38 |
| **PR mergée** | **04:25:45** |
| gate annulé | 04:30:09 |

**La PR a été mergée 13 secondes après son ouverture.** Le gate n'a pas manqué la rupture : il
n'a jamais eu le droit de finir. Six autres jobs portent le même `cancelled` à la même minute —
c'est la signature d'une fusion pendant que la CI tourne, pas d'un trou de couverture. Le remède
n'est donc pas un trigger, c'est une **required check** / protection de branche.

**La règle** : devant « la CI n'a pas attrapé X », ne pas s'arrêter à la première explication
cohérente. Distinguer trois causes qui produisent le même silence et appellent trois remèdes
opposés :

1. **Le job n'a pas tourné** (portée de déclenchement) ⇒ élargir le trigger.
2. **Le job a tourné et a été annulé** (fusion en cours de route, `cancel-in-progress`) ⇒ exiger
   le check avant fusion.
3. **Le job a tourné, il est vert, et il ne testait pas ça** ⇒ écrire le témoin manquant.

Le discriminant se lit en dix secondes dans les `conclusion` des check runs de LA PR fautive :
`cancelled` ≠ absent ≠ `success`. Je ne l'ai regardé qu'après avoir déjà notifié.

**Et le remède « évident » n'en est pas un.** `ios-tests.yml` porte, écrite par l'équipe :
« No branch protection requires this check, so neither trigger can deadlock a merge » — les
checks iOS sont volontairement NON bloquants, parce que la file macOS du compte fait attendre
24 à 49 minutes et qu'un check requis y bloquerait toutes les fusions. Le trou n'est donc pas un
oubli, c'est le prix d'un arbitrage déjà rendu. Proposer « exiger le check » sans dire ce qu'il
coûte, c'est proposer d'annuler une décision sans la nommer.

**La règle complète, alors** : après avoir identifié la cause, chercher si elle est DÉLIBÉRÉE
avant de proposer le remède. Un fichier de CI qui explique pourquoi il ne bloque pas est un
arbitrage, pas un bug — et la piste utile devient ce qui protégerait SANS payer ce prix (un gate
compile-only, plus court que la suite complète, est déjà là et suffisait ici : il aurait rougi en
9 minutes).

**Corollaire — une description de PR n'est pas un témoignage.** Celle de #2982 énumérait
fièrement `MessageDayStickyPlacement` parmi les suppressions, et cochait « Manual Testing:
Visually verified responsive behavior ». Les deux ensemble sont impossibles : l'app ne compile
pas. Une case cochée décrit une INTENTION, jamais une exécution ; seul un job vert atteste
quelque chose, et encore faut-il qu'il ait fini.

**Corollaire — supprimer un type et supprimer SES USAGES sont deux gestes.** Le compilateur
s'arrête au premier lot fautif : il a nommé `MessageDayStickyPlacement` et s'est tu sur
`MessageDayStickyMetrics` et `MessageDayStickyPalette`, encore référencés par toute une suite de
témoins. **Un message d'erreur de compilation est un plancher, jamais un inventaire.** Le vrai
inventaire se fait en listant les déclarations retirées par le diff (`git show <sha> | grep '^-enum\|^-struct'`)
et en grepant chacune — c'est ce qui a montré que la rupture était trois fois plus large que ce
que la CI affichait.

## Leçon 242 — L'argument qui justifie un élargissement de diffusion doit être appliqué à CEUX QU'IL EXCLUT (2026-08-14, routine messaging, cycle 122)

Trois routes de la gateway — `leave.ts`, `participants.ts`, `ban.ts` — avaient déjà été
corrigées : leur événement d'appartenance n'atteignait que `ROOMS.conversation(id)`, et
l'écran de LISTE, qui rend l'effectif, a précisément quitté cette room. Le correctif a
ajouté les rooms personnelles des membres **restants**. Il a laissé dehors la seule
personne dont l'événement parle : le partant, le retiré, le banni.

**Et le code écrivait sa propre justification** : « la room de conversation reste en tête
de chaîne : elle porte le partant lui-même, encore dedans à cet instant ». C'est vrai — de
l'appareil qui a le FIL ouvert. C'est faux de tous ses autres appareils, qui sont sur
l'écran de liste, c'est-à-dire *hors de la room*, ce que la phrase d'à côté venait
d'établir. Deux commentaires voisins, l'un énonçant la règle, l'autre l'oubliant pour un
cas particulier.

**La règle** : quand on élargit une diffusion parce qu'« une population lit ailleurs que
dans la room », lister explicitement QUI reste hors de l'éventail après le correctif, et
repasser l'argument sur chacun. Le raisonnement ne s'applique pas moins au sujet de
l'événement qu'à ses témoins — il s'y applique PLUS FORT, parce que ce qu'il rate chez le
sujet n'est pas un compteur faux mais une ligne qui n'existe plus.

**Corollaire — la gravité ne suit pas la symétrie apparente.** Les restants voyaient un
compteur d'un cran à côté. Le sujet gardait dans sa liste une conversation que
`GET /conversations` ne sert plus, cliquable, et PERSISTÉE des deux côtés (cache disque
iOS, `staleTime: Infinity` web). Le défaut « secondaire » du même correctif était le plus
grave — écho direct de la leçon 239.

**Corollaire — un rattrapage différé masque un trou temps réel, et le rend plus dur à
voir.** Le delta `updatedSince=` unifiait DÉJÀ les quatre fins d'appartenance dans un seul
`deletedConversationIds` (`delta-tombstones.ts` les énumère nommément : fermeture,
suppression-pour-moi, départ, bannissement). La ligne fantôme finissait donc par partir —
à la reconnexion suivante au mieux, 24 h plus tard au pire. Rien ne devenait rouge, aucun
symptôme ne remontait, et le module de rattrapage se lisait comme la PREUVE que le cas
était traité. **Quand un chemin de réconciliation énumère des cas, chacun de ces cas est
une question à poser au chemin TEMPS RÉEL** : « qui envoie ça tout de suite, et à qui ? ».
Ici la réponse était « personne » pour trois cas sur quatre — et le quatrième
(`conversation:deleted`) visait bien `ROOMS.user`, en le documentant. Un exemplaire correct
au milieu de trois fautifs est le signal le plus lisible qu'il y avait à lire.

**Corollaire — un garde écrit pour protéger une VALEUR ne doit pas garder une EXISTENCE.**
`membershipEnded: false` (bannir quelqu'un déjà parti) existe pour empêcher un décrément de
compteur injustifié. Placé avant le test d'identité, il aurait aussi empêché le RETRAIT de
la ligne — et précisément dans le cas qui en a le plus besoin : le ban qui suit un départ
non synchronisé, donc celui où la ligne fantôme est encore là. L'ordre des gardes n'est pas
cosmétique ; il faut lire ce que chaque garde protège avant de choisir son rang.

**Corollaire — `==` et `!=` sur une identité ne sont pas symétriques quand le repli est une
valeur vide.** `currentUserId` retombe sur `""` tant que l'auth n'est pas résolue. Le
voisin existant, `guard event.userId != currentUserId`, est inoffensif dans cet état (un
vrai `userId` diffère de `""`). Son miroir `==` retirerait une ligne au hasard sur un
payload au `userId` vide. Copier la forme du voisin sans rejouer le cas dégradé aurait
introduit le défaut ; d'où `isMe()` (app) et `!me.isEmpty` (SDK).

## Leçon 239 — Un événement ÉMIS peut ne porter aucune information, et rien dans le code d'émission ne le dit (2026-08-13, routine messaging, cycle 117)

`deleteAllRead` faisait tout ce qu'un chemin correct fait : il purgeait, il vérifiait `count > 0`,
et il émettait. L'audit qui le lit y voit un chemin annoncé. Il ne l'est pas : l'événement émis est
`notification:counts`, et une purge des LUES ne fait bouger aucun compteur — `unread` est inchangé
par construction (les lignes qui partent sont lues), `total` n'est affiché nulle part. Zéro bit
d'information part, sous l'apparence complète d'une notification de changement.

**La règle** : pour tout événement émis après une mutation, poser la question « quelle VALEUR
change dans ce payload, du fait de cette mutation ? ». Si la réponse est « aucune », le chemin est
muet quel que soit le nombre d'`emit` qu'on y lit. La question ne se pose pas au site d'émission —
elle se pose en rapprochant la CLAUSE de la mutation (`{ isRead: true }`) du CONTENU du payload
(`{ unread, total }`). Deux fichiers, aucun symptôme, et l'`emit` qui rassure entre les deux.

**Le corollaire qui a mordu ici** : cet écart est plus grave que son jumeau du cycle 116, alors
qu'il en est le symétrique « moins visible ». Là-bas (`markAllAsRead`), `counts` recalait au moins
le badge et ne laissait dériver que les lignes ; ici il ne recale rien. **L'ordre de gravité de
deux défauts symétriques ne suit pas l'ordre de leur visibilité** — et l'intuition inverse est
précisément ce qui a laissé `deleteAllRead` ouvert un cycle de plus, une fois la fiche déjà écrite.

**Le second corollaire, sur la justification** : le geste livré des deux côtés est le même (ne pas
toucher au badge), mais sa raison change de NATURE. Au cycle 116, précaution — un cache paginé
matche moins de lignes que le serveur. Ici, conséquence du prédicat — toute ligne retirée était
lue, donc jamais comptée. Quand on porte un patron d'un cas au suivant, écrire la raison du cas
COURANT et non celle du cas source : « même chose qu'au-dessus » en commentaire aurait transmis une
précaution révisable là où il y a une impossibilité.

**Le refus qui vaut d'être testé** : égrener un `notification:deleted` par ligne aurait fermé
l'écart ET la divergence transitoire résiduelle. Refusé parce que la purge n'est pas bornée (des
milliers de lignes sur un compte ancien) et que la divergence est déjà acceptée sur l'appareil
acteur. Un tel refus est invisible dans le code livré — il ne laisse aucune trace. Le figer par un
test (`count: 1200` ⇒ zéro `notification:deleted`) est ce qui empêche une « optimisation » future
de l'annuler sans savoir qu'elle tranchait quelque chose.

## Leçon 122 — deux troncatures sur la MÊME réponse peuvent exiger des gestes opposés ; ce qui tranche, c'est l'existence d'un curseur de reprise (2026-08-11, routine messaging, cycle 80)

`GET /posts/feed/stories?updatedSince=` tronque deux choses à la fois : sa page (plafond 50) et
ses tombstones (plafond 500). La tentation — et ce que la tête du cycle proposait — est de leur
appliquer le même remède, puisque c'est « la même famille de défaut ». C'est faux, et l'écart n'est
pas de degré mais de nature :

- **La page a un curseur de reprise, et il est exact.** Elle est filtrée par `updatedAt` mais
  ordonnée par `(createdAt, id)` — le mésappariement de la leçon 121 — SAUF que son curseur porte
  sur ce même couple. Le parcours est donc sans saut ni doublon : le geste est de **paginer**.
- **Les tombstones n'ont AUCUN curseur.** Il n'existe pas de « page suivante » de disparitions à
  demander. Le seul geste qui fasse sortir les fantômes est le **REMPLACEMENT** du tray par un
  fetch complet : le geste est d'**escalader**.

**Règle : avant de choisir entre paginer et escalader, chercher si le signal tronqué possède un
curseur de reprise — et si ce curseur est cohérent avec l'ORDRE de la page.** Les trois questions
sont distinctes et se posent dans cet ordre. Un curseur qui existe mais porte sur un autre champ
que l'`orderBy` ne vaut rien (c'est le cas des conversations, cycle 79 — d'où l'escalade là-bas).

Deux corollaires qui ont mordu ici :

- **Vérifier que le recours est un vrai recours.** Escalader vers `fullSync` avait du sens pour les
  conversations parce que cette route-là couvre tout. Ici le « fetch complet » emprunte la MÊME
  route plafonnée à 50 : l'escalade seule n'aurait rien rattrapé. Pire, c'est le chemin qui
  REMPLACE l'état affiché puis sauve le cache disque — la troncature y effaçait des stories au lieu
  d'en omettre. **Le chemin de repli mérite le même audit que le chemin nominal**, surtout quand on
  s'apprête à lui envoyer plus de trafic.
- **L'ordre de livraison n'est pas indifférent.** L'escalade des tombstones ne devient correcte que
  parce que le drain a été livré dans le même lot ; livrée seule, elle aurait pointé vers un fetch
  lui-même tronqué. Quand deux correctifs se tiennent, dire lequel rend l'autre valable.

Enfin, un réflexe à installer : **`docs/reviews/**` prescrivait déjà ce correctif** (fiche
`gwcontract-11`), sonde `take: LIMIT+1` comprise, et nommait même le RED discriminant « exactement
LIMIT ⇒ non tronqué ». Trouvée en cherchant où documenter, après avoir tout re-dérivé. Le backlog
d'audit du dépôt est une **source de conception**, pas seulement un registre à cocher : le grepper
sur le symptôme AVANT de concevoir.

## Leçon 115 — Un plafond serveur silencieux transforme une pagination en perte de données, et le tri de la route décide s'il est récupérable (2026-08-11, routine messaging, cycle 76)

Le catch-up delta demandait `limit=500` à `GET /conversations?updatedSince=`. La route
répond `Math.min(limit, 100)` sans jamais le dire — ni champ « tronqué », ni erreur, ni
`hasMore` fiable sur ce chemin. Écrit naïvement, le client fusionne les 100 lignes reçues,
avance son watermark au max des `updatedAt` REÇUS, et enjambe définitivement le reste.

Ce qui rend le défaut irrécupérable n'est pas la troncature, c'est **l'orthogonalité du
tri et du filtre** : la route filtre sur `updatedAt` et trie sur `lastMessageAt`. Si elle
triait sur son propre filtre, les lignes coupées seraient exactement « les plus
anciennes » et le watermark suivant les rattraperait tout seul — la troncature ne coûterait
qu'un tour de plus. Avec deux clés distinctes, les lignes coupées sont arbitraires, et
n'importe quel watermark calculé sur ce qui a été reçu passe par-dessus.

1. **Avant d'écrire un client de pagination delta, lire le `Math.min` de la route.** Le
   `limit` qu'on demande n'est pas celui qu'on obtient, et rien dans la réponse ne le
   signale. Ici, iOS demandait 500 depuis toujours ; personne ne l'avait rapproché du
   plafond de 100 écrit trois fichiers plus loin.
2. **La question qui tranche est : « le tri de la route est-il sa clé de filtre ? »**
   Même clé ⇒ la troncature est un simple report, sûre par construction. Clés distinctes
   ⇒ la troncature est une perte, et le client DOIT la détecter. C'est une propriété de
   la ROUTE, pas du client — elle se vérifie dans le `orderBy`, pas dans le hook.
3. **Une page pleine est la seule preuve d'incomplétude disponible**, et elle suffit :
   `length >= limitDemandée` ⇒ ne pas faire confiance au delta, escalader vers la
   relecture complète. Le coût de l'escalade est payé exactement quand elle est justifiée.
4. **Le mensonge et le défaut sont deux choses distinctes.** Corriger `500 → 100` rend le
   code honnête et ne répare rien ; c'est la détection qui répare. Réparer d'abord ce qui
   perd des données, l'hygiène ensuite — sinon on livre un correctif qui se lit comme un
   correctif et n'en est pas un.

## Leçon 114 — Un watermark se DÉDUIT quand ses deux extrémités vivent dans le même objet (2026-08-11, routine messaging, cycle 76)

iOS garde `lastSyncTimestamp` comme état persisté explicite, avec toute la machinerie qui
va avec : ne jamais régresser, ne jamais partir de l'horloge locale (R15b), purger au
changement d'identité. Porter le delta au web invitait à porter aussi le curseur. C'était
une erreur de lecture : sur iOS, le cache disque et le curseur sont deux stockages
distincts, donc le curseur DOIT être tenu. Sur le web, le cache React Query est le seul
stockage — le plus récent `updatedAt` qu'il contient EST le watermark.

La déduction n'est pas un raccourci, elle se démontre. Soit `T` le max des `updatedAt` en
cache et `F` l'instant de la lecture serveur qui les a produits : `T <= F` par
construction, et tout changement postérieur à cette lecture porte un `updatedAt > F >= T`.
`updatedSince=T` ne peut donc rien rater ; au pire il re-livre `]T, F]`, que l'upsert rend
idempotent. Et la propriété survit aux écritures socket, qui ne peuvent que faire avancer
`T`.

1. **Un état dérivable ne se stocke pas.** Toutes les propriétés qu'on aurait dû écrire,
   tester et maintenir — monotonie, purge au logout, non-régression sur event réordonné —
   sont vraies gratuitement quand la valeur est recalculée à l'appel depuis la seule
   source qui compte.
2. **Porter une règle cross-plateforme, c'est distinguer ce qui est du CONTRAT de ce qui
   est de la PLATEFORME.** Contrat : l'endpoint, la sémantique d'upsert, le refus de
   l'horloge locale, la détection de troncature. Plateforme : le curseur persisté, qui
   n'existe que parce qu'iOS a deux stockages. Copier le second aurait produit du code
   correct, testé, et inutile — la pire sorte de dette, celle qu'on n'ose plus retirer.
3. **Le corollaire protège le suivant** : un throttle qui SAUTE une exécution est sans
   conséquence ici, précisément parce que le watermark est dérivé — une exécution sautée
   n'avance rien, et la suivante couvre exactement la même fenêtre. Avec un curseur
   stocké, ce même throttle aurait demandé une preuve séparée.

## Leçon 109 — Un même nom d'événement pour deux faits produit DEUX défauts opposés, et aucun ne se lit dans le code qui l'émet (2026-08-11, routine messaging, cycle 71)

`conversation:joined` était émis à deux endroits avec **le même payload** : l'ack self-only d'un
socket qui rejoint la room (à chaque ouverture de fil, aucune appartenance changée) et la diffusion
d'une adhésion réelle. Aucun client ne pouvait les distinguer. Les deux s'en sont sortis
différemment, et les deux se sont trompés :

- **web** a compté l'ack comme une adhésion → l'effectif du groupe grossissait d'une unité à chaque
  ouverture du fil, indéfiniment ;
- **iOS** n'a rien compté du tout → l'effectif ne connaissait que des soustractions et dérivait vers
  le bas, persistée dans le cache disque.

Symptômes opposés, racine unique. Ce qu'il faut en retenir :

1. **L'absence d'un handler est une donnée, pas un vide.** Le `+1` manquant côté iOS n'était pas un
   oubli : c'était la seule réaction correcte face à un événement ambigu. Chercher pourquoi un
   client N'ÉCOUTE PAS est aussi instruit que lire ce qu'il fait.
2. **Le défaut ne se voit dans aucun des deux émetteurs.** Chacun, lu seul, est parfaitement correct.
   Il n'apparaît qu'en cherchant TOUS les émetteurs d'un même `SERVER_EVENTS.X` — ce que fait
   `grep SERVER_EVENTS.X` en une seconde, et qu'aucune lecture de route ne fera jamais.
3. **Le critère mécanique se réutilise** : un événement émis à la fois par `socket.emit` (self-only)
   et par `io.to(...).emit` (diffusion) porte deux faits. Le vérifier avant d'écrire un handler
   qui compte quoi que ce soit.
4. **Séparer plutôt que désambiguïser.** Ajouter un champ discriminant à `conversation:joined`
   aurait cassé tous les clients déployés qui ne le lisent pas. Un événement neuf, laissant
   l'ancien strictement intact, ne régresse personne — et un témoin fige l'ancien pour le prouver.

## Leçon 108 — Un gate qu'on n'a pas le DROIT de déclencher n'est pas un gate : le vérifier fait partie de l'instruction (2026-08-11, routine messaging, cycle 70)

Le cycle 69 a refusé d'écrire du Swift invérifiable et a laissé une tête instruite très précise, en
nommant son gate : « `ios-tests.yml` ne se déclenche pas sur les PR — lancer le workflow à la main
sur la branche (Actions → Run workflow) avant de merger, sinon la vérification n'existe pas ».
Instruction juste, et impossible à exécuter : l'intégration GitHub de la routine n'a pas
`actions: write`. `POST /actions/workflows/ios-tests.yml/dispatches` répond `403 Resource not
accessible by integration`. Le cycle 70 ne l'a découvert **qu'après avoir écrit le correctif et les
témoins**.

Le coût n'est pas d'avoir perdu du travail — le correctif est bon et le prochain cycle le fera
tourner. Le coût est que le cycle 69 a **cru** avoir sécurisé la suite en nommant un gate, et que
le cycle 70 a **cru** hériter d'un plan exécutable. Deux cycles ont raisonné sur une vérification
qui n'a jamais existé.

**Règle** : instruire un gate, c'est aussi prouver qu'on peut le déclencher. Un cycle qui reporte
du travail « avec son gate » doit avoir TENTÉ le déclenchement (ou l'avoir tenté à vide sur un
commit sans effet) avant de l'écrire dans la tête instruite. Le résultat de cette tentative se note
au même titre que le défaut : « gate vérifié, dispatch OK » ou « gate INACCESSIBLE, il faut
`actions: write` ».

Corollaire, qui est celui de la leçon 103 appliqué à l'outillage : quand le gate manque et que le
correctif est déjà écrit, le choix n'est pas entre « livrer » et « jeter » mais entre « livrer en
ÉCRIVANT que ce n'est pas gaté » et « livrer en le taisant ». Ce cycle a livré, a retiré du Swift
toute inférence de type évitable, a relu chaque API dans son fichier source — et a écrit en tête du
relevé que rien de tout cela ne remplace une compilation. C'est la forme honnête. Elle ne devient
acceptable que parce que la dette est datée, nommée, et posée en PREMIER geste du cycle suivant.


## Leçon 107 — Une capacité client complète, testée et jamais alimentée est un défaut serveur, pas une feature en attente (2026-08-10, routine messaging, cycle 60)

Le SDK iOS portait `resolvedLastMessagePreview` — la résolution du Prisme pour la ligne de liste —
avec douze témoins, une facette dédiée pour l'écrire atomiquement, et une doc en trois paragraphes.
Le champ qu'elle lit valait `nil` pour tout le monde depuis toujours : `GET /conversations` ne
sélectionnait ni `Message.translations` ni `Message.originalLanguage`.

Rien ne signalait le trou. Les douze témoins passaient — ils construisent leur propre fixture. La
suite gateway passait — elle ne teste que ce que la route renvoie, pas ce qu'elle DEVRAIT renvoyer.
Le seul indice était dans la doc du champ SDK : « when the gateway starts shipping these in
`/conversations` it will be wired through the API → domain converter ». Une phrase au futur, écrite
par quelqu'un qui savait, restée vraie pendant des mois.

Et elle renvoyait à un contournement (`ConversationListViewModel.attachLastMessageTranslations`)
dont le nom n'apparaît **nulle part ailleurs dans le dépôt** : la doc décrivait un repli qui
n'existait pas, ce qui rendait le trou encore plus invisible — on lisait « c'est couvert
autrement ».

**Règle** : une capacité client entièrement écrite et testée n'est PAS la preuve que la donnée
arrive. Le geste qui tranche, et il est mécanique : prendre le champ que le client lit et chercher
son PRODUCTEUR sur tout le dépôt. Zéro producteur = défaut serveur en production, pas travail
restant. C'est le miroir de la leçon 92 (là, la colonne était écrite et jamais lue ; ici, elle est
lue et jamais écrite) — et les deux se cherchent avec le même `grep`, dans les deux sens.

**Corollaire sur les réserves au futur.** La leçon 97 disait qu'une réserve écrite en bas d'une ADR
est un défaut daté. Celle-ci l'étend au commentaire de code : « until then the field stays nil »
n'est pas une note d'implémentation, c'est un bug report que son auteur a rangé dans le seul endroit
qu'aucune suite ne lit. Quand on en croise un, on ne le laisse pas au futur — on mesure le trou
immédiatement.
## Leçon 106 — Une session concurrente peut pousser un correctif IDENTIQUE avant le tien : re-vérifier `gh pr list`/`git branch -r` juste avant de pousser, pas seulement à l'Étape 0 (2026-08-10, routine android-ios-parity, itération 30)

Choisi un run d'archivage pur (`PROGRESS.md` de la lane Android à 1688 lignes, au-delà du seuil de
~1500 documenté par l'itération précédente elle-même). Analyse, découpage et vérification de contenu
menés entièrement en amont — jusqu'à `git add` inclus — avant de brancher/committer. Au moment de
committer, le HEAD du worktree avait déjà changé de branche et portait déjà un commit que je n'avais
pas émis, avec un message quasi identique au mien et un contenu **octet pour octet identique** à mon
propre diff (vérifié par `diff` sur les deux fichiers). `gh pr list --state open` (déjà vide à
l'Étape 0, quelques minutes plus tôt) montrait désormais une PR fraîchement ouverte pour cette
branche. `ps aux` a confirmé une dizaine de processus `claude --dangerously-skip-permissions`
concurrents sur la machine — cet environnement multiplexe plusieurs sessions sur le **même worktree**
(pas seulement sur le repo), au point qu'une autre session peut committer/pousser dans le répertoire
de travail qu'on croyait exclusif, entre deux appels d'outils.

**Ce n'était pas un défaut à arbitrer (cf. Cycle 45b §3 ci-dessous) mais une redondance MÉCANIQUE
totale** — même fichier, même découpage, même message quasi mot pour mot, parce que la tâche
(archiver au même seuil documenté) ne laisse quasiment aucun degré de liberté à deux agents lisant
la même note. Ouvrir une seconde PR aurait produit exactly le doublon documenté par
`feedback_routine_prs_duplicate_same_fix` (mémoire projet) — sans même le mérite d'un correctif
alternatif à comparer. **Le bon geste a été d'adopter la PR déjà ouverte comme livrable de CE run**
(vérifier son diff/CI/mergeabilité, la merger, nettoyer les branches locales orphelines) plutôt que
de pousser une branche concurrente ou de recommencer le travail.

**Règle** : sur ce repo multi-worktree/multi-session, `git status`/`gh pr list --state open` à
l'Étape 0 ne garantit RIEN sur l'état au moment de pousser — re-vérifier les deux, juste avant
`git push`/`gh pr create`, pour une tâche à faible liberté de forme (hygiène, migration mécanique,
renommage) où une collision de contenu identique est plausible. Si une PR identique existe déjà :
ne pas la dupliquer — l'auditer et la conclure (merge si verte, sinon comprendre pourquoi et agir en
conséquence), exactement comme s'il s'agissait de la sienne.

## Leçon 105 — Une convention tenue par les APPELANTS n'est pas testée par ce qui la consomme (2026-08-10, routine messaging, cycle 58)

Le modèle `Message` fait tenir son soft-delete par ses écrivains : ~119 lectures filtrent
`deletedAt: null`, et ce sont les sept `message.create` qui rendent ce filtre vrai en écrivant la
colonne. Deux l'avaient perdu depuis longtemps. Aucune suite ne l'a vu.

La sonde qui l'a établi vaut plus que le constat. Après avoir corrigé les deux sites, j'ai vidé la
constante partagée (`{}`) et relancé 45 suites voisines : **seuls mes deux témoins neufs sont
tombés.** Les cinq créateurs qui portaient le littéral correctement depuis toujours n'avaient AUCUNE
couverture dessus. La couverture de leurs chemins était pourtant excellente — contenu, expéditeur,
métadonnées, idempotence P2002, races — parce que les tests sont écrits contre ce que la méthode
CALCULE, jamais contre ce qu'elle doit se contenter de recopier.

**Règle** : quand une invariante est tenue par N appelants plutôt que par le type ou le schéma,
elle n'a de couverture nulle part par défaut — les tests de chaque appelant portent sur ce qui lui
est propre. Le geste qui le mesure : vider l'invariante à la source et regarder ce qui tombe. Si la
réponse est « seulement les témoins que je viens d'écrire », la conclusion n'est pas « ma couverture
est suffisante », c'est « voilà comment la divergence est née, et elle recommencera ».

**Corollaire sur la forme du correctif.** La sonde a changé le correctif, pas seulement le rapport.
Ajouter le littéral aux deux sites fautifs aurait rendu la suite verte en laissant sept copies sans
propriétaire. Extraire UNE constante nommée fait deux choses qu'aucune des sept copies ne faisait :
elle donne un endroit unique où écrire POURQUOI, et elle rend l'invariante testable par un témoin
unique sur la source — sept témoins de créateur auraient été sept fois le même test.

## Leçon 104 — Deux modèles, un même piège, deux moitiés opposées : ne jamais transporter la réparation de l'un chez l'autre (2026-08-10, routine messaging, cycle 58)

`Post` et `Message` portent tous deux un `deletedAt DateTime?` et affrontent le même piège MongoDB
(une colonne optionnelle jamais écrite est ABSENTE, pas `null`). Ils l'ont résolu par les deux
moitiés OPPOSÉES : `Post` côté lecture (`NOT_DELETED` = `{ isSet: false }`, les posts vivants n'ont
pas la colonne), `Message` côté écriture (les lectures filtrent `deletedAt: null`, les créateurs
écrivent la colonne).

Les deux marchent. Et **la réparation de l'un est un incident de production chez l'autre** :
basculer les lectures de `Message` sur `NOT_DELETED` — le geste « d'alignement » qui saute aux yeux
quand on vient de lire `softDelete.ts` — n'apparierait AUCUN message existant, tous portant un
`deletedAt` présent-et-null. C'est très exactement le post-mortem de `postIncludes.ts`, à l'envers.

Ce que ça ajoute aux leçons 89 et 90 : celles-ci disent qu'une symétrie de SCHÉMA ne prouve rien sur
le comportement. Celle-ci dit qu'une symétrie de PIÈGE n'en prouve pas davantage. Deux modèles
peuvent partager un piège à l'identique et avoir des données incompatibles avec la solution de
l'autre. Le geste : avant de transporter un remède d'un modèle à l'autre, se demander non pas
« le piège est-il le même ? » mais « à quoi ressemblent les LIGNES DÉJÀ ÉCRITES de ce modèle-ci ? ».
La réponse tient dans un `create`, pas dans un schéma.

## Leçon 103 — Un correctif juste sous les deux hypothèses n'attend pas la preuve de l'hypothèse (2026-08-10, routine messaging, cycle 58)

La prémisse du cycle 57 — « sur MongoDB, `deletedAt: null` n'apparie pas une colonne absente » — est
invérifiable dans cet environnement : aucun démon Docker, donc aucune vraie base. La leçon 90 dit
qu'un double Prisma ne peut PAS trancher un prédicat, et elle a raison ; j'ai donc passé un moment à
chercher comment prouver la prémisse avant de corriger.

C'était la mauvaise question. La bonne : **le correctif dépend-il de l'hypothèse ?** Écrire
`deletedAt: null` apparie `deletedAt: null` sous les deux sémantiques — si l'absence appariait aussi,
le correctif est un no-op inoffensif ; sinon il répare un défaut réel. L'incertitude ne porte que sur
l'AMPLEUR du défaut d'origine, jamais sur la validité de sa réparation.

**Règle** : face à une prémisse non vérifiable ici, séparer deux questions que la prudence a
tendance à fusionner — « qu'est-ce que je sais ? » et « qu'est-ce que mon correctif suppose ? ».
Quand le correctif est correct sous toutes les branches de l'incertitude, la livrer et ÉCRIRE
l'incertitude dans le relevé est supérieur à attendre une preuve qui ne viendra pas de cet
environnement. Quand il n'est correct que sous une branche, la leçon 90 reprend la main : ne rien
livrer sans base réelle.

Le corollaire de rigueur : l'incertitude doit être écrite là où le prochain cycle la lira (relevé +
ADR), et jamais présentée comme un fait établi. Ce cycle s'appuie sur trois indices convergents —
le post-mortem de `postIncludes.ts`, sa reconfirmation par le cycle 54, et le fait que six créateurs
sur sept écrivent une colonne qui n'aurait aucune raison d'être écrite si le filtre appariait
l'absence — et cela reste trois indices, pas une mesure.

## Leçon 102b — Un conteneur neuf a besoin de `bun install` AVANT le bootstrap de la leçon 102 (2026-08-10, routine messaging, cycle 58)

La leçon 102 prescrit `prisma generate` + `bun run build` avant toute mesure. Dans un conteneur
fraîchement cloné, les deux échouent : il n'y a aucun `node_modules`. Et `bun install` échoue lui
aussi, sur le postinstall de `grpc-tools` (binaire précompilé récupéré hors du proxy → 403). La
séquence qui marche est `bun install --ignore-scripts`, puis les deux commandes de la leçon 102.

`grpc-tools` est une dépendance du gateway et son postinstall ne sert qu'à produire les stubs
protobuf, dont aucune suite n'a besoin. Sauter les scripts n'a fait rougir aucune des 643 suites.

---

## Leçon 102 — L'angle mort des « 20 suites rouges » n'est pas une fatalité de l'environnement : c'est une étape de bootstrap sautée (2026-08-10, routine messaging, cycle 56)

La leçon 100, écrite le même jour, conclut que ~20 suites gateway ne compilent pas dans cet
environnement (`PostReactionService.ts:354`, `groupBy` non typé), que ce trou de 3 % ne peut
contredire aucun cycle, et que « réparer cette compilation localement vaudrait plus qu'un cycle de
correctif ».

Elle vaut, et le correctif tient en une commande — **déjà écrite dans le `CLAUDE.md` racine**, au
paragraphe « Local Test Parity (bun) » : `cd packages/shared && npx prisma generate --generator
client` (« else ~17 gateway suites fail (commentId/PostMediaSelect) »), suivi de
`cd packages/shared && bun run build` (sans quoi le web ne résout pas `@meeshy/shared/*`, dont le
`moduleNameMapper` pointe sur `dist/`).

Mesure de ce cycle, après ces deux commandes : **640 suites / 16 261 tests, 0 échec, 0 suite
rouge** — y compris `posts-share-tracking.test.ts`, précisément la suite dont la leçon 100 dit
qu'elle était invisible en local et n'a rougi qu'en CI. Le client Prisma généré n'est pas un artefact
du dépôt ; un conteneur frais n'en a aucun, et les suites qui en dépendent ne compilent pas tant
qu'on ne l'a pas généré.

**Règle** : avant toute mesure de suite gateway ou web, exécuter les deux commandes de bootstrap et
VÉRIFIER le nombre de suites rouges. S'il n'est pas nul, c'est un défaut d'environnement à réparer
avant de mesurer quoi que ce soit — pas une baseline à documenter. Une baseline rouge qu'on accepte
devient un angle mort qu'on transmet au cycle suivant.

## Leçon 101 — Une piste nomme l'endroit où le défaut SE VOIT, pas celui où il est (2026-08-10, routine messaging, cycle 56)

La piste héritée du cycle 52 disait : « `broadcastCommentDeleted` n'annonce que la cible et pas le
sous-arbre ». Elle est confirmée mot pour mot — le broadcast ne portait bien que la cible. Et elle
désigne quand même le mauvais fichier.

Le broadcast n'annonçait pas le sous-arbre parce qu'il **ne l'avait pas**. `deleteComment` calculait
la liste des ids retirés, s'en servait pour le soft-delete, le décompte et le retrait des
notifications, puis rendait `{ success: true }` : la liste mourait dans la méthode. La route
n'avait à sa disposition que le `commentId` de son propre chemin d'URL.

Corriger à l'endroit nommé aurait voulu dire reconstruire le sous-arbre dans la route — une SECONDE
dérivation d'une règle qui a déjà un propriétaire unique un étage plus bas, et qui plus est
impossible après coup (le soft-delete est committé, `NOT_DELETED` masque désormais les lignes qu'il
faudrait relire). C'est exactement la classe de défaut que le cycle 54 a payée sur les types
éphémères : deux copies d'une même liste, qui dérivent.

Ce que ça ajoute à la leçon 96 : celle-ci disait que le **remède** suggéré par une piste est une
seconde hypothèse. Celle-là dit que le **lieu** l'est aussi. Une piste est écrite depuis le
symptôme, donc depuis le dernier maillon — celui qu'on observe. Le geste qui la met à l'épreuve :
remonter d'un étage et demander « d'où cette fonction tient-elle ce qu'elle annonce ? » avant
d'écrire la moindre ligne à l'endroit nommé. Si la réponse est « elle ne le tient de nulle part »,
le correctif n'est pas là.

**Addendum, attrapé sur moi-même dans ce cycle.** Le premier jet de l'ADR et du relevé affirmait
« iOS et Android retirent toujours la seule cible, leurs réponses dépliées survivent ». Faux sur les
deux plateformes : iOS fait `repliesMap[id] = nil`, Android appelle `removedThread(commentId)`. Le
web était le seul client sans compensation. J'avais déduit le comportement des deux autres du fait
que le serveur ne leur envoyait pas l'information — un raisonnement qui confond « n'a pas la
donnée » et « ne fait rien ». **Une conséquence affirmée sur un composant qu'on n'a pas lu est une
hypothèse, même quand elle découle « logiquement » de ce qu'on vient de prouver ailleurs.** Trois
`grep` l'ont réfutée en deux minutes, et la réfutation a rendu le cycle plus intéressant qu'il ne
paraissait : le vrai défaut n'était pas « le serveur se tait », c'était « le serveur se tait, et
chaque client paie sa propre traversée pour compenser ». Le coût de ne pas vérifier n'aurait pas été
un bug — le code était bon — mais un relevé qui aurait envoyé le cycle suivant corriger sur iOS et
Android un défaut qui n'y était pas.

Corollaire de vérification : quand le correctif consiste à faire remonter une valeur, la sonde de
fidélité qui compte est celle qui la fait remonter FAUSSE (ici : rendre `[commentId]` au lieu de la
vraie liste), pas celle qui la supprime. Une valeur absente casse la compilation ou tous les
témoins ; une valeur plausible mais fausse ne fait tomber que les témoins qui mesurent vraiment le
comportement — et c'est le seul décompte qui prouve quelque chose.

## Leçon 97 — Une réserve écrite en bas d'une ADR est un défaut daté, pas une note de prudence (2026-08-10, routine messaging, cycle 55)

Les deux dernières ADR du gateway se terminaient par la même phrase, à un cycle d'intervalle : « les
`TrackingLink` visant une story détruite ne sont pas désactivés par cette passe ». Elle a été écrite
deux fois, relue deux fois, et n'a rien déclenché — parce que la rubrique qui l'accueille s'appelle
« ce que la décision n'assure PAS », et qu'une limite ASSUMÉE se lit comme une limite RÉSOLUE. Le
format transforme un défaut connu en périmètre.

Ce qui l'a rendue actionnable n'est pas une relecture plus attentive : c'est que le cycle précédent
a changé le monde autour d'elle. Tant que le balayage n'appariait aucun post, aucune story n'était
jamais détruite et la réserve ne décrivait qu'un cas de figure. Le balayage rendu effectif, la même
phrase décrit le sort de TOUTE story.

**Règle** : quand un cycle rend effectif un mécanisme qui ne l'était pas, relire les réserves que
les cycles précédents ont écrites SUR ce mécanisme — elles ont été rédigées sous l'hypothèse
implicite qu'il ne s'exécutait pas, et leur gravité vient de changer sans qu'un mot n'ait bougé.
Corollaire pratique : une réserve qui réapparaît à l'identique dans deux ADR successives n'est plus
une réserve, c'est un point de backlog qui a échoué à se faire nommer comme tel.

## Leçon 98 — Deux chemins qui appliquent la même règle ne l'appliquent pas au même INSTANT, et c'est correct (2026-08-10, routine messaging, cycle 55)

Le retrait interactif d'un post coupe ses liens de partage au SOFT-delete ; le balayage du contenu
éphémère les coupe au HARD-delete. La première lecture y voit une incohérence — deux chemins, une
règle, deux moments — et pousse à aligner le second sur le premier.

C'est cohérent, et la formulation qui le montre est la seule qui vaille : **chaque chemin agit au
moment où SON contenu devient définitivement inatteignable par SON propre chemin.** Un post non
éphémère n'est jamais hard-deleté — il reste soft-deleté pour toujours, donc le retrait interactif
n'a pas d'instant ultérieur où agir. Un post éphémère, lui, est réellement détruit, et c'est cette
destruction qui condamne le lien.

La leçon de méthode est sur la formulation, pas sur le cas : quand deux implémentations d'une même
règle divergent sur le QUAND, chercher l'énoncé sous lequel les deux deviennent le même geste avant
de conclure qu'une des deux a tort. S'il n'existe pas, l'une a effectivement tort ; s'il existe, il
est la bonne documentation des deux — et il dit du même coup ce qui se passerait si l'un des deux
chemins changeait de nature.

Contrepartie honnête, notée dans l'ADR : l'instant théoriquement juste dans les deux cas serait le
soft-delete, et ne pas l'avoir retenu pour le balayage tient à un coût mesurable (la passe de
soft-delete est un `updateMany` sans ids matérialisés, dont la conversion imposerait une borne et
la réécriture des témoins du cycle précédent), pas à une justification de principe. **Une
justification de coût s'écrit comme telle, avec la fenêtre résiduelle chiffrée** — sinon le cycle
suivant la relira comme une justification de principe et ne rouvrira jamais le sujet. C'est
exactement le mécanisme de la leçon 97, une rubrique plus haut dans le même document.

## Leçon 100 — Une suite rouge en baseline pour une raison sans rapport ne peut avertir de RIEN (2026-08-10, routine messaging, cycle 55)

L'extraction d'une règle a changé la forme d'un filtre (`{ targetId: id }` →
`{ targetId: { in: [id] } }`). Deux témoins la pinnaient, tous deux trouvés et mis à jour, suite
locale verte, PR ouverte. La CI en a trouvé un **troisième** — `posts-share-tracking.test.ts`.

Il n'était pas caché : un `grep` l'aurait rendu. Ce qui a manqué, c'est que la baseline locale, si
soigneusement mesurée soit-elle, comptait cette suite parmi ses **20 rouges pré-existantes** — elle
ne COMPILE pas dans cet environnement (`PostReactionService.ts:354`, `groupBy` non typé par le
client Prisma généré ici). Une suite qui ne démarre pas ne peut pas faire tomber une assertion. La
comparaison « mêmes 20 suites avant/après » était exacte et prouvait bien l'absence de régression
**parmi les suites qui tournent** — elle ne disait rien des 20 autres, et j'ai lu son silence comme
une couverture.

**Règle** : dès qu'un changement modifie la FORME d'un appel (arguments d'une requête, signature,
nom d'événement), la liste des sites à corriger se fait par `grep` sur la forme, jamais par la liste
des tests qui rougissent. Les tests qui rougissent sont un sous-ensemble de ce qu'il faut corriger,
et le complément est exactement invisible.

**Corollaire, plus important** : la baseline rouge de cet environnement n'est pas un décor, c'est un
angle mort **mesurable**. 20 suites sur 642 — soit environ 3 % du dépôt — ne peuvent contredire
aucun cycle. Tant qu'elles ne compilent pas, tout cycle qui touche `PostService`, `PostReactionService`
ou leurs voisins doit lister ses sites par `grep` et considérer la CI comme le premier vrai contrôle.
Réparer cette compilation localement vaudrait plus qu'un cycle de correctif.

## Leçon 99 — Une baseline lancée en tâche de fond pendant qu'on code n'est pas une baseline (2026-08-10, routine messaging, cycle 55)

La leçon 90.6 impose de comparer à une baseline MESURÉE sur arbre propre. Elle a été appliquée — et
ratée, par une erreur d'ordonnancement : la suite complète a été lancée en tâche de fond « pendant
ce temps », puis les fichiers du correctif ont été écrits dans les minutes qui ont suivi. Jest
n'énumère pas ses suites une fois pour toutes au démarrage : les fichiers créés en cours de route
sont ramassés, et ceux qu'on édite sont lus au moment où leur suite démarre. Le résultat annonçait
21 suites rouges dont une, `postRemovalEffects`, que le correctif venait de toucher — une baseline
qui décrit un arbre qui n'a jamais existé.

Le tell est bon marché et vaut d'être cherché : **si la liste des suites rouges d'une baseline
contient un fichier que le cycle touche, la baseline est contaminée.** Une baseline saine ne connaît
rien du travail en cours.

La parade est un ordre, pas une précaution : **commiter d'abord, mesurer ensuite.** Le travail
commité, `git checkout HEAD~1` en tête détachée rend un arbre réellement propre sans rien risquer —
tout est récupérable par un `git checkout` de retour sur la branche. C'est aussi ce qui évite le
`git stash -u` que la leçon 93 apprend à redouter. Le seul coût est une seconde exécution complète,
qui est précisément ce que la mesure vaut.

**Addendum, la cause racine étant pire que le symptôme.** La contamination n'était pas un défaut de
patience : les attentes étaient lancées en tâche de fond puis la question suivante posée sans
attendre leur notification, si bien que **zéro seconde réelle s'écoulait entre deux sondages**. Ça a
produit une seconde erreur, plus coûteuse : une étape de CI vue « en cours » à trois sondages
d'intervalle a été déclarée BLOQUÉE depuis 50 minutes alors qu'elle tournait depuis deux, et un
correctif de CI a été écrit — puis retiré — sur cette observation fabriquée. Elle avait duré
93 secondes.

Deux règles qui en sortent, et la seconde vaut au-delà de l'outillage :
1. **Une attente en tâche de fond n'est une attente que si l'on rend la main jusqu'à sa
   notification.** Sonder juste après l'avoir lancée mesure l'instant du lancement.
2. **Une durée n'est jamais « le nombre de fois que j'ai regardé ».** Avant de qualifier quoi que ce
   soit de bloqué, lire les HORODATAGES de la chose observée et les soustraire. Ici les deux
   timestamps étaient dans la réponse même qui servait à conclure au blocage.


## Leçon 96 — Une piste héritée peut être vraie sur le défaut et fausse sur son remède (2026-08-10, routine messaging, cycle 52)

Le cycle 51 léguait une piste bien formée : « le même mécanisme a un sixième candidat, la
suppression d'un commentaire ; `context.commentId` est écrit par sept types ». La leçon 18 dit d'en
faire une hypothèse à réfuter. Réfutation tentée sur le **défaut** : confirmé. Mais la piste
énonçait aussi, en passant, comment le corriger — et c'est là qu'elle était fausse.

Deux des huit types producteurs (`post_comment` et `comment_like`) n'écrivent PAS
`context.commentId` : leur lien ne vit que dans `metadata.commentId`. Le premier est la notification
la plus fréquente de toute la famille. Un retrait transposé littéralement du jumeau côté post — qui
ne connaît que `context.<clé>` — aurait laissé la majorité du volume en base, **en passant tous ses
tests**, puisque les tests auraient été écrits sur la même énumération erronée.

Ce que ça change à la méthode : la leçon 18 dit de vérifier qu'une piste désigne un vrai défaut.
Elle ne suffit pas. **Le remède qu'une piste suggère est une seconde hypothèse, indépendante de la
première, et elle se réfute par le même geste : relire les écrivains un par un.** Une piste qui
énumère des sites (« sept types écrivent cette clé ») est une liste transcrite de mémoire par la
session précédente — le format même dont la leçon 95 dit qu'il ne montre pas ce qui lui manque.

La trace de l'asymétrie était dans le code depuis longtemps, à un endroit qu'on ne lit pas comme
une alerte : le payload APNs fait `params.context.commentId || params.metadata.commentId`. **Un
repli entre deux chemins est l'aveu écrit qu'aucun des deux n'est complet.** Chercher les `||`
entre deux accès de forme parallèle est un moyen bon marché de trouver les colonnes dont le nom
promet plus que les écrivains ne tiennent.

## Leçon 95 — Une liste d'effets ne montre pas ce qui lui manque ; seul son JUMEAU le montre (2026-08-10, routine messaging, cycle 51)

`applyPostRemovalEffects` a été créée exactement pour empêcher ce défaut : son en-tête raconte que
la console avait rattrapé un par un, à trois cycles d'intervalle, ce que le service faisait et
qu'elle ne faisait pas, et conclut « chaque omission a attendu son propre incident parce que rien ne
NOMMAIT la liste ». La liste a été écrite. Elle a nommé trois effets. Le quatrième — retirer les
notifications du post — n'y a jamais figuré, et l'unité créée contre l'oubli n'a rien signalé.

Elle ne pouvait pas. **Une liste rend visible ce qu'elle contient, jamais ce qu'elle omet** : la
relire donne trois effets cohérents, bien commentés, et aucun trou où pointer. Le nom même du
fichier (« TOUT ce qu'un retrait de post doit écrire ») décourage la question, puisqu'il affirme la
complétude.

Ce qui la rend visible existait pourtant à une ligne de distance : le commentaire de tête nomme
lui-même `applyMessageRemovalEffects` comme jumeau. **Deux listes jumelles se lisent en DIFF, pas
l'une après l'autre.** Le diff donnait immédiatement le quatrième effet, présent d'un côté depuis
deux cycles et absent de l'autre.

Règle : dès qu'un module déclare un jumeau dans son propre commentaire, la revue de ce module est
un diff avec ce jumeau. Corollaire d'audit : quand une famille de défauts se répète (ici la
cinquième ligne dénormalisée survivant à son référent), ne pas chercher l'occurrence suivante par le
mécanisme — la chercher par les PAIRES d'unités censées faire la même chose de part et d'autre d'une
frontière de domaine.

## Leçon 94 — Un défaut par récurrence se cherche par les paires, et se réfute par ses faux positifs (2026-08-10, routine messaging, cycle 51)

La piste héritée du cycle 50 était juste, et la leçon 18 imposait quand même de la réfuter d'abord.
La réfutation n'a pas consisté à revérifier que le défaut existe — ça, un `grep` le montre en dix
secondes — mais à chercher **le cas qui rendrait le correctif faux**. Trois candidats, cherchés
nommément avant la première ligne de code :

1. une notification dont la clé de filtre désigne un AUTRE objet que celui qu'elle concerne
   (`post_repost` porte `context.postId = originalPostId` et le repost dans `metadata.repostId` — il
   allait dans le bon sens, mais rien ne le garantissait a priori) ;
2. une notification ancrée sur l'objet supprimé dont la cible vivante est ailleurs ;
3. une notification créée PAR le retrait, qui serait emportée par lui.

Aucun n'existait, et c'est ce constat — pas le diagnostic — qui a autorisé un filtre sans
distinction par `type`. **Le coût de la réfutation est le prix du filtre large** : sans elle, la
seule écriture prudente aurait été une liste de types en dur, c'est-à-dire une quatrième chose à
tenir à jour de mémoire.

Contrepartie à retenir : au cycle 18, la même démarche avait au contraire INVALIDÉ le correctif
suggéré. Les deux issues sont normales ; ce qui ne l'est pas, c'est de sauter l'étape parce que la
piste vient d'un cycle qui, lui, avait raison sur le défaut.

## Leçon 93 — Restaurer une sonde avec `git checkout <fichier>`, c'est jeter tout ce qui n'est pas commité (2026-08-10, routine messaging, cycle 49b)

Pour prouver qu'un test neuf est bien celui qui attrape le défaut, on neutralise le correctif et on
relance (leçon du cycle 45b). Le geste demande donc de **modifier puis restaurer** un fichier de
production. `git checkout -- <fichier>` restaure depuis **HEAD**, pas depuis l'état d'avant la
sonde : sur un fichier qui porte le travail non commité du cycle, il ne défait pas la sonde, **il
défait le cycle**. Dix éditions perdues d'un coup, silencieusement — la commande ne dit rien, et le
fichier a l'air « propre ».

La restauration d'une sonde se fait par **copie** (`cp <fichier> /tmp/x.bak` avant, `cp /tmp/x.bak
<fichier>` après) ou en committant avant de sonder. `git checkout` sur un fichier de travail n'est
jamais la bonne restauration, même quand la sonde est un `sed` d'une seule ligne.

**Signal de rattrapage** : après toute restauration, `grep` une des expressions ajoutées par le
cycle. Ici `grep -n "visibleNotificationsWhere" <fichier>` a rendu zéro ligne, ce qui a montré la
perte en dix secondes au lieu de la laisser sortir en échec de compilation quinze minutes plus tard.

## Leçon 92 — Un champ dans le modèle et un prédicat dans les types partagés ne prouvent pas que la règle est CÂBLÉE (2026-08-10, routine messaging, cycle 49b)

`Notification.expiresAt` existait dans le schéma Prisma. `formatNotification` le publiait, le schéma
de réponse Fastify le laissait traverser, `packages/shared/types/notification.ts` en dérivait
`isNotificationExpired`, et `isNotificationUnread` s'en servait pour définir « non lue **ET
valide** ». Un audit qui cherche « est-ce que le produit gère la péremption des notifications ? » en
grepant le nom du champ trouve **cinq preuves que oui**, à cinq étages différents.

La règle n'existait pas. Aucun producteur n'écrivait la colonne — `createNotification` acceptait un
`expiresAt` que personne ne lui passait — et aucune des sept lectures serveur ne la filtrait. Les
deux moitiés étaient écrites, jamais présentées l'une à l'autre.

**Ce qui rend ce cas invisible, c'est qu'il n'a pas de site de défaut.** Un champ oublié dans un
`select` a un endroit précis où l'on peut pointer le manque ; une chaîne dont les extrémités
existent n'en a aucun. Le seul test qui la révèle est celui qui traverse : « une valeur écrite ici
change-t-elle ce qui est lu là-bas ? », jamais « ce champ existe-t-il ? ».

**Règle d'audit** : pour toute colonne dont la présence tient lieu de fonctionnalité, chercher
d'abord **qui l'ÉCRIT avec une valeur non nulle**, et seulement ensuite qui la lit. Un `grep` du nom
du champ mélange les déclarations, les projections et les copies de type — qui coûtent zéro et
prouvent zéro — avec les deux seuls sites qui comptent. Corollaire : une valeur par défaut `null`
généreuse fait passer une colonne morte pour une colonne inutilisée, deux états qu'aucune requête ne
distingue.

## Leçon 91 — Un geste et son inverse ne sont inverses que si le premier RECONNAÎT ce qu'il n'a pas pris (2026-08-10, routine messaging, cycle 49)

`ban` écrivait `{ bannedAt, isActive: false, leftAt: now }`, `unban` écrivait
`{ bannedAt: null, isActive: true, leftAt: null }`. Lues côte à côte, les deux lignes ont l'air
d'être exactement l'inverse l'une de l'autre — c'est même ce qui les a fait survivre : elles se
relisent l'une l'autre et se rassurent.

Elles ne le sont que si le premier geste prend TOUJOURS la même chose. Dès qu'une entrée du domaine
peut être déjà dans l'état cible — ici, une personne déjà partie de la conversation — le premier
geste devient conditionnel sans le dire, et le second reste inconditionnel. Le second ne défait
alors plus : **il fabrique.** Débannir quelqu'un que le bannissement n'avait pas sorti ne rendait
pas une appartenance, ça en créait une, avec son rang périmé, ses sockets rebranchées de force et
une conversation qui réapparaît chez quelqu'un qui l'avait quittée.

**Le test qui manque à ce genre de paire n'est pas « A puis B rend l'état initial » sur le cas
nominal — il est vrai, c'est le piège.** C'est « A puis B rend l'état initial » sur l'entrée qui
était DÉJÀ dans l'état que A vise. Écrire la composition comme une involution, sur les deux classes
d'entrée, est ce qui rend le défaut visible en une ligne d'assertion.

**Corollaire sur la trace.** Le second geste ne peut être exact que si le premier lui a laissé de
quoi distinguer les deux cas. Ici le premier faisait pire que ne rien laisser : il ÉCRASAIT
`leftAt`, détruisant la preuve dont le second avait besoin — un défaut qui rendait l'autre
irréparable après coup. Avant d'ajouter une colonne pour porter cette information, regarder ce que
le geste écrit déjà : cesser d'écraser `leftAt` suffisait à faire de l'égalité `leftAt === bannedAt`
une trace exacte par construction (même objet `Date`, jamais deux lectures d'horloge), et à laisser
toutes les lignes déjà en base se lire comme le comportement qu'elles ont toujours eu — donc **zéro
script de réparation**, pour la première fois de cette famille depuis le cycle 27.

**Corollaire sur les clients.** Un événement qui annonce un geste conditionnel doit porter sa
condition. `participant-banned` ne disait pas s'il avait retiré quelqu'un ; web et iOS
décrémentaient à la réception, et iOS persistait la valeur fausse. Le champ ajouté est optionnel et
son ABSENCE se lit comme l'ancien comportement (`true`), jamais comme « pas d'effet » : lire le
silence d'un serveur plus ancien comme un refus fait ignorer tous ses gestes.


## Leçon 90 — Un prédicat manquant n'a pas UNE valeur juste ; il en a deux, opposées (2026-08-09, routine messaging, cycle 40)

Quatre cycles de suite (37, 38b, 39, 40) ont posé la même question : **quelles appartenances sont
jointes sans `isActive` ?** Les trois premiers l'ont traitée comme une question à réponse unique —
trouver le site, ajouter le filtre, fermer. Le quatrième est tombé sur la famille où **ajouter le
filtre est exactement le mauvais correctif sur deux sites sur trois.**

Les trois portes d'entrée d'une conversation face à la ligne qu'un départ laisse derrière :

- celle **sans** le filtre concluait « déjà membre » sur une ligne inactive → l'ancien membre ne
  revenait **jamais**, et l'écran ne disait rien d'autre que « vous êtes déjà membre » ;
- celles **avec** le filtre ne voyaient pas la ligne d'un banni → elles lui **créaient une ligne
  neuve et active**, défaisant le bannissement sans passer par `unban`, et laissant un doublon.

Ajouter `isActive: true` à la première l'aurait fait rejoindre les deux autres dans leur défaut.
**La valeur juste du prédicat dépend de ce qu'on fait ENSUITE de la ligne trouvée** — donc ce n'est
pas le filtre qu'il fallait unifier, c'est la décision qui le consomme. Règle : avant d'ajouter un
filtre d'appartenance, lire le `create`/`update` qui suit. Si le filtre change la branche prise, on
ne corrige pas une garde, on change une politique — et il faut l'écrire quelque part.

**Le symptôme qui désigne cette famille : une paire d'états sans contrainte d'unicité.**
`Participant` n'a aucun index unique sur `(conversationId, userId)`. Le schéma ne rattrape donc
rien : chaque porte qui fait `create` sans avoir vu la ligne existante en fabrique une seconde, en
silence. **Quand un modèle encode une relation « au plus une par paire » sans le dire au schéma,
toutes ses portes d'écriture sont suspectes en bloc** — pas une par une.

**Corollaire — un « soft delete » multiplie les états, et personne ne les énumère.** `isActive:
false` + `bannedAt` + `leftAt` + `deletedForMe` font quatre façons d'être absent d'une conversation.
Un `where` n'en teste jamais qu'une, et le code lit le résultat comme un booléen « membre / pas
membre ». Chaque porte avait choisi un état différent à tester, ce qui donne exactement autant de
politiques que de portes. Le remède n'est pas un filtre commun mais **une fonction qui rend l'ÉTAT**,
et laisse l'appelant brancher dessus.

**Corollaire de sécurité — la révocation se contourne par la porte d'à côté, pas par la porte
qu'elle ferme.** Personne n'a essayé de contourner `POST …/ban` : il fait ce qu'il annonce. C'est
`POST …/participants` qui le défaisait, en ne sachant pas qu'il existait — et avec un rang
(`moderator`) que `POST …/unban` refuse. **Après avoir écrit une révocation, chercher tous les
chemins qui écrivent la même ligne dans l'autre sens**, et vérifier qu'ils exigent au moins le rang
que la levée exige. Un rang plus faible sur un chemin plus discret est une élévation de privilège
qui ne ressemble pas à une élévation de privilège.

**Corollaire de test — un double qui rend ses lignes dans l'ORDRE D'APPEL ne peut mesurer aucune
garde.** `signal-protocol-routes.test.ts` annonçait couvrir « user not a participant → 403 » ; son
`findFirst` rendait la première ligne au premier appel et la seconde au deuxième, **quel que soit le
`where`**. La branche 403 était donc atteinte en donnant `null` — jamais en donnant une ligne que le
`where` aurait dû exclure. Le test vérifiait que la route sait répondre 403, pas qu'elle sait
**quand**. Un double de base de données doit discriminer sur le `where`, sinon il ne teste que le
câblage.

**Et le faux positif qu'il a fallu corriger en route :** le premier harnais donnait à l'appelant des
portes d'ajout le rang `member`. Le 403 de **rang** satisfaisait alors l'assertion qui mesurait le
403 de **bannissement** : le test passait, pour la mauvaise raison, sur du code non corrigé. **Quand
une route peut refuser pour plusieurs motifs et que l'assertion ne regarde que le code de statut,
elle ne distingue pas les motifs** — il faut soit assertir l'effet (`create` non appelé ET `update`
appelé), soit rendre tous les autres motifs impossibles dans le montage.


## Leçon 89 — Unifier une règle sur un geste ne dit RIEN de son jumeau, et l'écart devient invisible (2026-08-09, routine messaging, cycle 38)

Les cycles 33/34 ont unifié « qui peut ÉDITER un message » dans `messageEditAdmission.ts`, avec un
en-tête, un tableau des divergences, une suite de tests dédiée. Le cycle 37 a corrigé un site que cet
élargissement avait périmé. Trois cycles sur l'édition, et **personne n'a regardé la suppression** :
`messageDeleteAdmission.ts` n'existait pas, et les **trois** transports de suppression portaient
chacun leur copie de la règle, divergentes sur trois points — dont un visible de l'utilisateur (le
même geste réussissait sur Android et retournait 403 sur iPhone) et un de sécurité (un membre parti,
donc `isActive: false`, gardait le rôle de modération qu'il y avait porté).

**La règle.** Quand on extrait une règle recopiée dans une unité partagée, le geste **jumeau** —
edit/delete, create/update, add/remove, pin/unpin — est le premier endroit à auditer ensuite, pas le
dernier. Les copies d'un jumeau ont exactement la même raison d'avoir dérivé (mêmes transports, mêmes
auteurs, même absence de test), et l'unification de l'un **rend l'autre plus difficile à voir** : le
répertoire contient désormais un fichier qui a l'air de traiter le sujet, avec un nom rassurant et une
documentation soignée. `grep admission` rend un résultat, et l'audit passe.

**Le corollaire qui a coûté le plus cher ici.** Le cycle 37 avait écrit, en toutes lettres : « quand
on corrige un chemin dont il existe un jumeau évident (edit/delete…), écrire le test des DEUX côtés ».
Il l'a fait — pour la file de rejeu hors ligne, le site précis qu'il corrigeait. Il n'a pas remonté
d'un cran : **le jumeau d'un SITE n'est pas le jumeau du GESTE.** Tester `handleMessageDelete` sur le
point qu'on vient de corriger ailleurs ne dit rien de la règle d'admission que ce même handler
applique quinze lignes plus haut. Quand on écrit « j'ai couvert le jumeau », préciser le jumeau de
QUOI — du site, ou du geste.

**Trois symptômes qui désignaient la copie, et qu'on peut chercher directement :**

1. **Un commentaire qui nomme le bon champ à côté d'un code qui lit l'autre.** La route iOS/web
   annonçait « les modérateurs/admins de CETTE conversation » et lisait `membership.user.role` — le
   rôle GLOBAL. Le commentaire décrivait l'INTENTION ; il se lit comme une description du code, et
   trois relectures l'ont cru. (Leçon 88b, troisième occurrence.) **Deux espaces de rôles qui ne
   diffèrent que par la casse — `Participant.role` en minuscules, `User.role` en majuscules — sont
   une machine à produire ce défaut** : les deux comparaisons compilent, aucune ne lève, et celle qui
   est fausse est simplement toujours fausse.
2. **Une jointure d'appartenance sans `isActive: true`.** Deux transports sur trois filtraient. Le
   troisième ne filtrait pas, et personne ne l'avait mesuré parce qu'aucun test ne construit un
   participant inactif. **Une permission dérivée d'une ligne d'appartenance doit se lire avec le
   filtre qui la rend vivante, sinon elle survit à la révocation du lien qui la justifiait.**
3. **Une branche de rôle qui ne peut jamais être vraie.** `role === 'CREATOR'` alors que l'enum
   `UserRole` ne le contient pas — le mot existe ailleurs dans le dépôt, comme rôle de COMMUNAUTÉ
   (`MemberRole.CREATOR`). Elle ne causait aucun bug ; elle donnait à lire une permission
   inexistante, ce qui suffit à égarer l'audit suivant. **Une valeur de rôle en dur se vérifie contre
   l'enum, pas contre le souvenir qu'on en a.**

**Sur le choix de la règle unifiée — union, jamais intersection.** Unifier N copies divergentes
oblige à choisir, et tout choix élargit certaines entrées ou en rétrécit d'autres : il n'y a pas
d'option neutre. Prendre l'**union des intentions** (ce que chaque copie CHERCHAIT à admettre, y
compris quand seule sa documentation le disait) ne retire aucune capacité que quelqu'un emprunte ;
prendre l'intersection casse silencieusement le client le plus permissif. Et quand deux copies
divergent sur une question de **produit** et non de correction — ici : un admin global doit-il agir
dans une conversation où il n'est pas ? — la trancher fait partie du travail d'un humain, pas de
celui d'une routine. **Consigner l'écart, l'implémenter dans le sens qui ne retire rien, et le dire.**

**Corollaire de refactor : un refactor qui déplace une lecture peut rouvrir le défaut du cycle
précédent.** Retirer le `include` des participants de la requête de message a supprimé la valeur d'où
le handler socket tirait le `Participant.id` de l'ACTEUR — celle que le cycle 37 avait mise là
exprès. La reconstruire depuis `message.senderId` aurait rouvert **exactement** le défaut fermé la
veille, en croyant simplifier. **Quand un refactor supprime la source d'une valeur, chercher qui la
consomme AVANT de la remplacer par ce qui est à portée de main** — ce qui est à portée de main est
généralement la propriété de l'objet muté, c'est-à-dire la mauvaise réponse (leçon du 2026-08-09
(15)). Ici, la bonne réponse était de faire rendre la valeur par l'unité qui vient de la lire.


## Leçon 88 — « aucun appelant » ne se conclut jamais d'une recherche sur un seul client (2026-08-09, routine messaging, cycle 36)

Le cycle 35 a laissé au cycle suivant une consigne explicite : retirer `PATCH /messages/:messageId`,
« qui n'a aucun appelant de production ». Il avait vérifié — mais uniquement côté **web**
(`grep` sur `.ts`/`.tsx`), où le client était effectivement mort. Côté **Android**,
`OutboxFlushWorker.kt:161` appelle `messageApi.edit(...)` → `@PATCH("messages/{id}")` : c'est le
chemin par lequel Android **rejoue les éditions faites hors ligne**. Exécuter la consigne aurait
transformé chaque flush d'édition offline en 404, silencieusement — un rejeu de file n'a pas d'écran
pour se plaindre.

**Leçons :**

1. **Ce dépôt a quatre clients — web (`.ts`/`.tsx`), iOS (`.swift`), Android (`.kt`), SDK Swift —
   et un `grep` par défaut n'en voit qu'un.** Avant d'écrire « aucun appelant » sur une route HTTP,
   la recherche doit couvrir les quatre langages ET les deux formes d'appel : l'URL littérale
   (`/messages/${id}`, `"/messages/\(id)"`) et la **déclaration déclarative** (`@PATCH("messages/{id}")`
   de Retrofit), qui ne contient ni slash initial ni interpolation et échappe donc à la plupart des
   motifs qu'on écrit spontanément. Chercher le **chemin sans slash initial** (`messages/{`,
   `messages/`) autant que le chemin complet.

2. **Une consigne héritée d'un cycle précédent se re-vérifie avant de s'exécuter, pas après.**
   Le coût de la vérification était de deux `grep` ; le coût de la confiance aurait été une
   régression silencieuse sur un chemin offline. Une routine qui se reprend elle-même de cycle en
   cycle accumule ses propres erreurs à la vitesse où elle accumule ses réussites : **le reste
   ouvert d'un cycle est une hypothèse, pas un ordre de travail.**

3. **Corollaire de portée : une consigne fausse à moitié se coupe en deux, elle ne se jette pas.**
   Le client web de cette route était bien mort — il a été retiré. La route, elle, reste. Rejeter la
   consigne en bloc aurait perdu la moitié qui était juste.

4. **Symptôme à reconnaître : un transport « sans appelant » qui porte quand même des correctifs de
   parité.** Le cycle 35 a payé la parité de cette route sur trois lots tout en la déclarant morte.
   Quand on soigne quelque chose qu'on croit mort, c'est en général qu'on se trompe sur l'un des
   deux.

## Leçon 88b — un commentaire qui décrit un ordre que le code n'a pas est un défaut de premier ordre (même cycle)

Les deux routes REST d'édition portaient, au-dessus de la composition de leur charge utile :
« La retraduction qui précède a déjà invalidé `translations` en base, donc le payload renvoyé
reflète cet état : `[]`. » L'invalidation était en réalité placée **après** la lecture qui compose
cette charge. La réponse HTTP et l'événement `message:edited` emportaient donc le nouveau texte avec
les traductions de l'ancien — et le Prisme Linguistique fait que la plupart des lecteurs ne voient
QUE la traduction.

**Leçons :**

1. **Un commentaire affirmant un ORDRE est une assertion vérifiable, et personne ne la vérifie.**
   Trois cycles ont revu ces routes en lisant cette phrase comme un fait. Quand un commentaire dit
   « X a déjà eu lieu », le réflexe doit être de localiser X dans le fichier, pas de le croire.
2. **Un mock à valeur fixe ne peut pas tester un défaut d'ordre.** Il rend la même chose avant et
   après le correctif : le test passe au vert sans rien prouver. Il faut un fake **stateful** —
   les écritures mutent la ligne, les lectures la rendent — sinon on n'écrit pas un test, on écrit
   une tautologie. Même règle pour les transformateurs de sortie : `transformTranslationsToArray`
   mocké à `[]` masque exactement ce qu'on mesure.
3. **La règle va où le geste se produit.** Un nouveau contenu périme ses traductions à l'instant où
   il est écrit — l'invalidation appartient donc au `data` de l'écriture, pas à un second `update`
   trois `await` plus loin. C'est la même forme que le lot A du cycle 35 (la purge appartient à la
   retraduction, pas à ses appelants) : **tout ce qui est confié à un appelant sera oublié par le
   quatrième.**


## Leçon 88c — le module sans CI n'est pas stable, c'est le module dont personne ne mesure l'instabilité (même cycle, session parallèle)

Deux sessions ont convergé sur la même découverte Android (leçon 88). En creusant le chemin qu'elle
désigne — `OutboxFlushWorker` — le défaut le plus grave du cycle est apparu, et il n'a **pas** pu
être corrigé :

- `SendResult` documente le contrat (`TransientFailure` = « réseau coupé, 5xx, timeout » ;
  `PermanentFailure` = « 4xx autre que 404 »), `ARCHITECTURE.md §5` l'exige nommément
  (« transient-vs-permanent classification, 404-as-success »), et `ApiError` porte bien `httpStatus`.
  **Quatorze des quinze senders l'ignorent** et écrasent tout échec en `TransientFailure`. Seul
  `SEND_FRIEND_REQUEST` classe correctement — le patron existe déjà dans le dépôt, appliqué à une
  lane sur quinze.
- `OutboxDrainer` est en **FIFO strict** et une `TransientFailure` **arrête la lane**. Un 403
  définitif (fenêtre d'édition dépassée, auteur retiré de la conversation) bloque donc tous les
  messages suivants de cette conversation pendant 5 tentatives à backoff exponentiel — de l'ordre de
  cinq minutes de blocage de tête de file pour une erreur qui ne guérira jamais.
- À l'épuisement, `onExhausted` n'a aucun cas pour `EDIT_MESSAGE` / `DELETE_MESSAGE` (`else -> Unit`)
  alors que `editOptimistic` a déjà peint l'édition localement : l'appareil montre le texte édité
  pour toujours, le serveur n'a rien appliqué, personne d'autre ne le voit.

**Leçons :**

1. **Le module le moins outillé accumule les défauts les plus graves, et c'est mécanique.**
   `.github/workflows/` ne contient **aucun** job Gradle : Android n'est vérifié par rien. Ce n'est
   pas un hasard si c'est là qu'on trouve à la fois le défaut le plus sévère du cycle et la croyance
   fausse qui a failli coûter une régression. Un module sans CI ne produit aucun signal — ni rouge,
   ni vert — et l'absence de rouge se lit comme de la santé.
2. **Ne pas livrer ce qu'on ne peut pas prouver.** Le correctif était rédigeable de tête. Il n'a pas
   été écrit : `dl.google.com` est refusé par la politique réseau de l'environnement (403 sur
   CONNECT), donc ni le SDK Android ni le dépôt Maven Google ne sont atteignables, `:sdk-core:test`
   ne peut pas tourner, et aucune CI ne l'aurait rattrapé. Du Kotlin non compilé et non testé sur
   `main` est une régression déguisée en correctif. **Ce qu'on livre quand on ne peut pas livrer le
   code, c'est la mesure complète et le correctif esquissé** — consignés en tête du reste ouvert.
3. **Vérifier qu'on PEUT prouver avant de choisir la tête du cycle, pas après l'avoir écrite.**
   La faisabilité de la vérification (toolchain présent ? CI existante ?) fait partie du choix de la
   cible, au même titre que la gravité du défaut. Ici, elle a fait basculer le cycle d'Android vers
   la gateway — où le défaut jumeau (`PATCH /messages/:messageId` sans garde de vacuité) était, lui,
   entièrement testable.

## Leçon 87 — quand deux écrivains d'un même champ divergent, c'est le PLUS DESTRUCTEUR qu'il faut lire en premier (2026-08-08, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). Suite immédiate du cycle 20 :
la route d'édition était le quatrième écrivain de `Message.validatedMentions`, et le seul à
extraire avec `extractMentions` (handles bruts) au lieu de
`extractMentionsWithParticipants` (qui résout aussi `@Display Name`). Comme elle PURGE les
lignes `Mention` avant de ré-extraire, corriger une faute de frappe dans un message qui
nommait quelqu'un par son nom d'affichage supprimait sa mention — inbox `/mentions` et
surlignage compris.

**Leçons :**
1. **Un écrivain qui commence par supprimer transforme toute différence d'extraction en perte
   définitive.** Deux extracteurs qui divergent sur un champ *additif* donnent un affichage
   incomplet ; sur un champ *reconstruit après purge*, ils donnent une suppression. Chercher
   d'abord, parmi les écrivains divergents, celui qui fait `deleteMany` avant de recalculer :
   c'est lui qui porte le dégât, et c'est lui qu'il faut brancher sur la source unique.
2. **Un drapeau `{ replace: true }` aurait recréé le trou qu'on venait de fermer.** Deux
   exports nommés (`resolveMessageMentions` / `replaceMessageMentions`) forcent l'appelant à
   dire quelle sémantique il demande ; un paramètre booléen a une valeur par défaut, donc un
   oubli possible — et l'oubli aurait laissé un `validatedMentions` périmé décrivant des
   lignes déjà supprimées. Quand deux variantes n'ont PAS de défaut raisonnable, ne pas leur
   en inventer un.
3. **L'absence de court-circuit peut être le contrat, pas une optimisation oubliée.** La
   variante « création » ne doit rien écrire quand le contenu n'a pas de `@` ; la variante
   « édition » doit faire exactement l'inverse (effacer). Avant de reporter une garde d'un
   chemin sur l'autre par symétrie, vérifier qu'elle veut dire la même chose des deux côtés.
4. **Un test qui assert le NOM de la méthode appelée bloque la convergence.** Trois tests
   existants verrouillaient `extractMentions` — c'est-à-dire le défaut lui-même. Les faire
   porter sur le comportement (« une mention par nom d'affichage survit à une édition »)
   change ce que le prochain refactor a le droit de casser.

## Leçon 86 — une garde d'optimisation posée AVANT l'appel est la moitié oubliable du contrat (2026-08-08, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). Cinquième unité de la même
famille extraite des routes de lien de partage : la résolution des mentions vivait sous DEUX
niveaux de `private` dans `MessageProcessor`, et les deux routes de lien contournent
`MessagingService.handleMessage`. Un `@alice` envoyé par lien ne produisait ni ligne
`Mention`, ni `Message.validatedMentions`, ni notification de mention.

**Leçons :**
1. **Le court-circuit appartient à l'unité, pas à l'appelant.** `handleMentionsAndNotifications`
   testait `content.includes('@')` AVANT d'appeler la résolution. Recopié dans deux routes, ce
   test serait devenu la moitié oubliable de la leçon 85 : un troisième écrivain le laisse
   tomber et fait payer quatre requêtes à chaque message. Déplacé dans l'unité, il est
   inoubliable — et il devient testable comme un comportement (« aucune requête sans `@` »)
   plutôt que comme une ligne.
2. **Toutes les unités partagées ne sont pas fire-and-forget : c'est la DESTINATION de leur
   sortie qui tranche.** Les quatre sœurs de ce cycle (`broadcastLinkMessage`,
   `runMessagePostSaveEffects`, `emitUnreadCountsToRecipients`, `notifyMessageRecipients`) sont
   lancées sans `await` parce que rien de ce qu'elles produisent ne repart dans la réponse.
   Celle-ci en a deux qui repartent — les usernames dans le payload 201 et l'événement socket,
   les ids dans l'éventail. L'attendre est ce qui lui donne son sens ; copier le `void` des
   sœurs par symétrie aurait produit un payload systématiquement vide.
3. **Un champ nommé « validated » qui contient des rejetés est un bug qu'on lit dans son nom.**
   Le chemin de création persistait `Array.from(userMap.keys())` — tous les usernames résolus,
   pas ceux retenus par la validation. Le chemin d'édition, lui, filtrait par `validUserIds`.
   Quand deux écrivains d'un même champ divergent, le nom du champ dit lequel a raison ; et
   unifier vers la source unique est le seul moment où l'arbitrage coûte zéro.
4. **Chercher les DOUBLONS du helper qu'on extrait, pas seulement ses appelants.**
   `getConversationParticipants` (MessageProcessor) et `getConversationParticipantsForMention`
   (MeeshySocketIOManager) sont le même corps avec le même `select`, sous deux noms. Extraire
   l'un sans grep-er l'autre laisse la dérive intacte : le second reste ouvert, noté.

## Leçon 85 — un contrat à deux moitiés se vérifie sur TOUS ses écrivains, et une moitié sans l'autre est un no-op silencieux (2026-08-08, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). `UserConversationPreferences`
est une ligne **par utilisateur** : chaque écriture doit incrémenter `version` (le schema la
déclare monotone, les clients jettent `incoming.version <= local`) ET diffuser l'instantané
sur `user:<id>`. Cinq écrivains existent ; les trois de `routes/user-deletions.ts`
(`delete-for-me`, `restore-for-me`, `clear-history`) n'honoraient **aucune** des deux moitiés.
Une conversation supprimée sur l'iPhone restait dans la liste de l'iPad, un historique vidé
restait affiché ailleurs — et comme on n'épingle pas une conversation qu'on vient de
supprimer, le ricochet par une autre préférence (le payload étant un instantané complet)
n'arrivait jamais : divergence permanente, pas différée.

**Leçons :**
1. **Deux obligations qui ne valent que conjointes doivent vivre dans UNE fonction, et le
   type d'entrée doit rendre la moitié oubliable inatteignable.** Diffuser sans incrémenter
   émet un événement que tous les appareils jettent ; incrémenter sans diffuser avance un
   compteur que personne ne reçoit — deux no-op silencieux, aucun log, aucune exception.
   `writeConversationPreferences` porte les trois obligations (persister, incrémenter,
   diffuser) et **exclut `version` de son type d'écriture** : le compteur appartient au
   module, jamais à un appelant. Un helper qu'on peut appeler à moitié ne ferme pas le trou.
2. **Le champ qu'un payload partagé déclare mais qu'aucun écrivain n'émet est un chemin
   manquant, exactement comme un membre d'union sans appelant (leçon 2026-08-07 (3) #3).**
   `ConversationPreferencesPayload` déclarait `deletedForUserAt`/`clearHistoryBefore`, iOS les
   mappait déjà sur `userState` et le web écoutait l'événement : les DEUX clients étaient
   câblés, seul le serveur se taisait. Règle : partir du type d'événement partagé et remonter
   à tous ses producteurs, pas l'inverse.
3. **Un commentaire qui ÉNUMÈRE les émetteurs d'un événement est une liste à vérifier, pas
   une description.** « émis par `PUT/DELETE /user-preferences/conversations/:id` » nommait
   deux écrivains sur cinq — vrai et incomplet, même signal que « les trois transports » pour
   cinq sites REST. Une grep des écrivains du modèle Prisma (`.upsert|.update|.updateMany`)
   coûte dix secondes et tranche.
4. **Changer la méthode Prisma d'une route déplace le levier de ses mocks.** Passer
   `restore-for-me` de `update` à l'`upsert` du helper a fait virer au rouge un test existant
   dont le knob injectait l'erreur sur `update` : le test n'échouait plus parce que le chemin
   testé n'existait plus. Un knob de mock nomme une méthode, pas une intention — après tout
   changement de méthode, re-vérifier que le levier atteint encore le chemin réel (et
   supprimer le knob devenu mort).

## Leçon 84 — toute transition d'état a une inverse : auditer les DEUX sens, et l'ORDRE de chacun (2026-08-07, routine messaging)

Audit ciblé des 4 transitions d'appartenance à une conversation (env Linux, pas de Xcode).
`leave`, `kick` et `ban` évincent tous explicitement les sockets de la cible de
`ROOMS.conversation(id)` ; les 8 sites d'octroi d'appartenance appellent tous
`joinUserToConversationRoom`. L'`unban` — inverse exacte du `ban` — n'appelait NI l'un NI
l'autre : la ligne `Participant` repassait `isActive: true`, mais les sockets restaient hors
de la room. Or `connectedUsers` rapporte alors l'utilisateur EN LIGNE, donc les deux chemins
d'envoi le **sautent à l'enqueue de la file de livraison hors ligne** : ni émission live, ni
replay au reconnect. Les messages n'étaient pas différés, ils étaient **perdus**. Second
défaut de même racine : `conversation:participant-unbanned` n'étant diffusé qu'à la room dont
le ban l'avait évincé, le débanni était le seul participant à ne pas l'apprendre.

**Leçons :**
1. **Un site qui applique une transition doit être lu en paire avec son inverse, pas seul.**
   Le `ban` était irréprochable ; c'est précisément sa qualité qui rendait l'`unban` fautif
   (il défait un effet que rien ne recompose). Chercher les paires — ban/unban, join/leave,
   add/remove, subscribe/unsubscribe — et vérifier que la seconde annule TOUT ce que fait la
   première, effets mémoire (rooms, caches) compris, pas seulement l'écriture DB.
2. **« En ligne » n'est pas « joignable » : une garde d'enqueue basée sur la présence est un
   amplificateur de perte.** Dès qu'un utilisateur est présent SANS être dans la room, la file
   de livraison hors ligne le saute — la panne passe d'un retard d'affichage à une perte
   définitive. Tout code qui retire une socket d'une room doit être audité contre
   `connectedUsers.has(...)` côté envoi.
3. **L'ORDRE entre « muter l'appartenance » et « diffuser » porte le contrat.** Le `ban` émet
   AVANT d'évincer (sinon le banni n'apprend jamais son ban) ; l'`unban` doit donc joindre
   AVANT d'émettre (sinon le débanni n'apprend jamais le sien). Un mock socket qui ne
   consigne pas la SÉQUENCE (`mockReturnThis()`, assertions de comptage) ne peut exprimer
   aucun de ces deux contrats — et c'est très exactement ce qui a laissé le défaut vivre.

## Leçon 83 — un handler socket qui écrit dans le cache ne doit se scoper à la conversation active que si l'événement le permet (2026-08-06, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). Le gateway auto-join CHAQUE socket
à TOUS les rooms de conversation de l'utilisateur (`AuthHandler._joinUserConversations`) : un client
reçoit donc `message:new` ET `message:translation` pour des conversations qu'il ne regarde pas.
`use-socket-cache-sync.handleNewMessage` écrit dans TOUTES les listes de messages en cache (scan par
`conversationId`), mais `handleTranslation` se scopait à la seule `conversationId` active du hook —
alors que `TranslationEvent` ne porte AUCUN `conversationId`. Résultat : une traduction arrivant pour
un message d'une conversation en cache mais non-active était **droppée**, le message restait en langue
d'origine jusqu'à un refocus fenêtre (`staleTime: Infinity` ne relit jamais) — **violation directe du
Prisme Linguistique**. Idem `handleAudioTranslation`, qui ignorait le `data.conversationId` pourtant
présent dans `AudioTranslationReadyEventData`. Fix : router le merge par `messageId` à travers toutes
les listes en cache (miroir du scan de `handleMessageDeleted`) ; router l'audio par `data.conversationId`.

**Leçons :**
1. **Vérifier la portée de LIVRAISON avant de scoper un handler à la vue courante.** Le réflexe
   « je suis dans la conversation X, donc l'événement concerne X » est faux dès que le transport
   auto-join tous les rooms. Deux handlers frères (`handleNewMessage` global vs `handleTranslation`
   local) écrivant le MÊME cache signalent une asymétrie à auditer — l'un des deux a tort.
2. **Un événement sans `conversationId` ne peut pas être routé par la conversation active — il doit
   l'être par son `messageId`.** Se rabattre sur la `conversationId` du hook produit un no-op silencieux
   (le message n'est pas dans ce cache) qui se lit comme « appliqué ». Quand l'événement PORTE un
   `conversationId` (`handleAudioTranslation`), l'utiliser — jamais la fermeture du hook.
3. **Un test de régression doit d'abord échouer sur le cas non-actif.** Mon test « conversation active »
   passait AVANT le fix (le chemin actif marchait déjà) : seul le test « conversation NON-active » prouvait
   le bug. Un test qui ne distingue pas la conversation observée de la conversation cible ne prouve rien.

## Leçon 82 — une détection de présence via `io.in()` DOIT cibler `ROOMS.user(id)`, jamais l'id brut (2026-08-05, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). `NotificationService.createNotification`
testait la présence pour l'e-mail immédiat haute priorité via `io.in(params.userId).fetchSockets()` —
l'**id brut**. Aucun socket ne rejoint un room à id brut : tous rejoignent `ROOMS.user(id)` (`user:${id}`,
`AuthHandler.ts`). Le room brut est **toujours vide** → `length === 0` toujours vrai → le garde
« hors ligne » est mort, les utilisateurs EN LIGNE reçoivent l'e-mail (mentions, appels manqués, alertes
sécurité). C'était le **seul** des ~18 `io.in(...).fetchSockets()` du gateway à omettre `ROOMS.user(...)`.

**Leçons :**
1. **Un room Socket.IO nommé par id brut est un faux-ami silencieux : il « existe » (aucune erreur) mais
   est toujours vide.** Un garde `sockets.length === 0` construit dessus ne throw jamais et ne loggue rien —
   il se contente d'inverser la logique métier. Toute présence via `io.in(x)` doit passer par le SSOT de
   nommage (`ROOMS.user`), jamais une string ad hoc.
2. **Grep TOUS les call sites d'un pattern avant de conclure (récidive des leçons 2026-07-31 #2 / 2026-08-03 #4).**
   Ici l'audit a comparé les ~18 sites `io.in(...).fetchSockets()` : 17 corrects, 1 divergent. La divergence
   d'un seul site face à N siblings identiques est le signal le plus fiable d'un bug — le chercher activement.
3. **Un mock qui ignore son argument masque exactement ce type de bug.** Le test existant stubbait
   `in: jest.fn(() => ({ fetchSockets: () => [] }))` — insensible au nom du room, donc incapable de distinguer
   `io.in("u1")` de `io.in("user:u1")`, et ne simulant que le cas hors ligne. Un mock de présence DOIT clé sur
   l'argument room (`room === ROOMS.user(id) ? [socket] : []`) pour couvrir en ligne ET hors ligne.

## Leçon 81 — la langue SOURCE envoyée au translator n'était PAS normalisée, contrairement aux cibles (2026-08-04, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). `MessageTranslationService`
canonicalisait chaque langue CIBLE via le SSOT `normalizeLanguageCode`
(`_resolveTargetLanguages`) mais envoyait la SOURCE verbatim :
`sourceLanguage: message.originalLanguage` (sites 540/656/3052). Or les clients
transmettent `originalLanguage` = `Locale.current` (`'pt-BR'`, `'FR'`, `'de-DE'`) et
le champ est persisté sans normalisation. Côté translator, la source passe par
`LANGUAGE_MAPPINGS.get(src, 'eng_Latn')` : un code région-taggé absent de la table
retombe **silencieusement sur `'eng_Latn'`** → NLLB traduit un texte portugais comme
s'il était anglais. Traductions dégradées/fausses pour tous les lecteurs cross-langue,
invisible pour l'expéditeur (le skip d'auto-traduction, lui, compare des formes
normalisées, donc il fonctionnait).

**Fix** : helper `_normalizeSourceLanguage` (miroir de la logique source déjà présente
dans `_resolveTargetLanguages`), appliqué aux 3 sites qui construisent une
`TranslationRequest` ZMQ. `'auto'` (détection) et valeurs vides préservés.

**Leçons :**
1. **Une asymétrie de normalisation entre deux champs d'un même payload est un bug
   silencieux.** La cible était corrigée, la source oubliée — le même `normalizeLanguageCode`
   existait à 3 lignes de distance. Quand un helper canonicalise un champ d'une requête,
   vérifier que TOUS les champs de langue de cette requête passent par lui.
2. **Le repli d'un `.get(key, DEFAULT)` côté consommateur masque le bug côté producteur.**
   `LANGUAGE_MAPPINGS.get('pt-BR', 'eng_Latn')` ne lève jamais — il retourne l'anglais.
   Un défaut « raisonnable » (anglais) transforme une clé invalide en résultat plausible
   mais faux. Chercher les `.get(x, default)` sur la frontière quand on trace une donnée
   mal formée : ils avalent l'erreur au lieu de la signaler.
3. **Un test de régression doit rester VERT sur les cas déjà corrects.** Les cas `'auto'`
   et `'fr'` passaient avant ET après le fix — ils prouvent l'absence de régression sur
   les entrées déjà canoniques, pendant que `'pt-BR'`/`'de-DE'` prouvaient le bug (rouge
   avant, vert après). Toujours mêler cas-qui-changent et cas-qui-ne-changent-pas.

## Leçon 80 — l'épinglage/désépinglage de message ne passait PAS par la file hors-ligne (2026-07-09, routine messaging, iter 150)

Suite directe de la Leçon 79 (qui appliquait la règle « énumérer TOUTES les mutations d'un agrégat message
visibles côté client et vérifier que chacune passe par la file de rattrapage hors-ligne » et bouchait le trou
réactions). Le prochain maillon manquant : **le pin/unpin**. Les routes REST
`PUT/DELETE /conversations/:id/messages/:messageId/pin` (`routes/conversations/messages.ts`) n'émettaient
`message:pinned`/`message:unpinned` QUE vers la room conversation live
(`getManager()?.getIO().to('conversation:...').emit(...)`) — **aucune** dépendance `deliveryQueue`, aucun
enqueue. Un participant hors-ligne au moment de l'épinglage ratait l'emit live et son état de pin restait
périmé jusqu'à un refetch complet sans rapport — exactement le trou déjà bouché pour edit/delete (Leçon 58) et
réactions (Leçon 79), laissé béant sur le jumeau « pin ».

**Scénario de perte** : A épingle le message M ; C (participant, hors-ligne) rate l'emit live. À la
reconnexion, `_drainPendingMessages` ne draine que new/edit/delete/reaction → C ne voit jamais l'épingle.

**Fix** : symétrie stricte. (1) `QueuedMessagePayload.eventType` gagne `'pinned' | 'unpinned'` (shared).
(2) `_drainedEventName` (MeeshySocketIOManager) mappe ces types vers `MESSAGE_PINNED`/`MESSAGE_UNPINNED`.
(3) Nouvelle méthode PUBLIQUE `MeeshySocketIOManager.enqueueOfflineMessageMutation({ conversationId,
actorUserId, eventType, messageId, payload })` — les routes pin/unpin sont REST (pas WS), donc l'enqueue vit
sur le manager (accessible via `getManager()`) plutôt que dans un handler socket. Elle exclut l'acteur **par
userId** (les routes pin tournent sous `requiredAuth` → acteur toujours registered) et saute les pairs en ligne
(`connectedUsers.has(queueKey)`, `queueKey = userId ?? participantId`). Dedup par défaut (messageId) suffisant :
`pinned` et `unpinned` portent des eventTypes distincts donc un pin-puis-unpin garde les deux entrées dans
l'ordre d'enqueue, un toggle répété même-sens supersede en place — pas besoin de `dedupKey` fin comme les
réactions. Les entrées pin ne portent jamais d'accusé (`_emitDeliveryForDrainedMessages` filtre déjà
`eventType === 'new'`). Tests : mapping drain pinned/unpinned + 4 tests `enqueueOfflineMessageMutation`
(exclusion acteur/en-ligne, clé participant pour anonyme, échec lookup avalé) + 2 assertions routes pin/unpin.
464 + 157 tests verts, tsc gateway OK.

**Règle réutilisable (rappel Leçon 79, étendue REST)** : le signal « handler/route qui ne fait que du broadcast
live sans dépendance `deliveryQueue` » vaut AUSSI pour les routes REST, pas seulement les handlers WS. Quand une
mutation d'agrégat message est déclenchée par REST (pin, futur : édition/suppression REST, receipts REST…),
elle doit passer par la MÊME file — via une méthode publique du manager si nécessaire. Reste à auditer côté
même série : `message:read-status` déjà couvert par un chemin dédié ; vérifier au prochain tour si d'autres
mutations REST d'agrégat (mentions résolues, traductions tardives) ont un jumeau hors-ligne manquant.

## Leçon 79 — la file de livraison hors-ligne couvrait send/edit/delete mais PAS les réactions (2026-07-08, routine messaging, iter 147)

`RedisDeliveryQueue` + `_drainPendingMessages` rejouent à la reconnexion les `message:new` (Leçon send),
`message:edited` et `message:deleted` (Leçon 77/78) aux participants hors-ligne. Mais `ReactionHandler`
n'avait **aucune** dépendance `deliveryQueue` : `reaction:added`/`reaction:removed` n'étaient émis QUE vers la
room conversation live (`_broadcastReactionEventWithConversationId` → `io.to(ROOMS.conversation(...))`). Un pair
hors-ligne ne recevait donc jamais la réaction et ses compteurs de réactions restaient périmés jusqu'à un refetch
complet sans rapport — exactement le trou que Leçon 77/78 avaient bouché pour les éditions/suppressions, laissé
béant sur le jumeau « réaction ».

**Scénario de perte** : A réagit 👍 au message de B ; C (participant, hors-ligne) rate l'emit live. À la
reconnexion, `_drainPendingMessages` ne draine que send/edit/delete → C ne voit jamais le 👍 tant qu'il ne
recharge pas toute la conversation.

**Fix** : symétrie stricte avec `MessageHandler`. (1) `QueuedMessagePayload.eventType` gagne
`'reaction-added' | 'reaction-removed'` (shared). (2) `_drainedEventName` mappe ces types vers
`REACTION_ADDED`/`REACTION_REMOVED`. (3) `ReactionHandler` reçoit `deliveryQueue` (setter injecté par
`MeeshySocketIOManager.setDeliveryQueue`, même instance que MessageHandler) + un
`_enqueueOfflineReactionEvent` copié sur `_enqueueOfflineEventForParticipants` — exclut l'acteur par **id
participant** (Leçon 78 : exclure sur l'identité de l'APPELANT, `participantId` du réacteur, jamais sur le
contenu) et saute tout pair en ligne (`connectedUsers.has`). Le swap mono-réaction met aussi en file la
suppression de l'emoji remplacé. Les entrées réaction ne portent jamais d'accusé de livraison
(`_emitDeliveryForDrainedMessages` filtre déjà `eventType === 'new'`). Tests RED→GREEN : 6 tests d'enqueue
`ReactionHandler` + mapping drain `MeeshySocketIOManager` + forward setter. 1130 tests socketio verts, tsc OK.

**Règle réutilisable** : quand une file de rattrapage hors-ligne existe pour un sous-ensemble d'événements de
mutation d'un même agrégat (message : new/edit/delete), énumérer TOUTES les mutations de cet agrégat visibles
côté client (réactions, épinglage, receipts…) et vérifier que chacune passe par la même file. Un handler qui
n'a pas la dépendance `deliveryQueue` du tout est le signal : il ne fait que du broadcast live et perd
silencieusement l'état pour les hors-ligne. La parité « live + rejeu » doit être exhaustive, pas
échantillonnée.

## Leçon 74 — Un audit gateway/web-only "SERVER_EVENTS.X, jamais émis" ne prouve pas que X est mort si iOS n'a pas été grep (2026-07-08)
En auditant `SERVER_EVENTS.CALL_FORCE_LEAVE` (`packages/shared/types/socketio-events.ts`), un agent
d'exploration scopé gateway+web a rapporté "aucun émetteur, aucun consommateur, commentaire source dit
'no emitter yet'" — j'ai supprimé la déclaration TS. Un grep `apps/ios` fait APRÈS coup (pas fait par
l'agent, ni par moi avant d'agir) a révélé `MessageSocketManager.swift:3052`
(`socket.on("call:force-leave")`, publie via un `PassthroughSubject` Combine) + `CallManager.swift:3689`
(abonnement réel) + une suite de tests dédiée (`CallManagerTests.swift:3230-3276`, vérifie le teardown et
le report CallKit) — un récepteur RÉEL et TESTÉ, pas mort du tout côté client, juste jamais déclenché
parce que le serveur ne l'émet jamais. Restauré avant tout commit. **Règle : dans un repo cross-platform
(iOS + web + gateway) où un seul côté définit le contrat serveur→client (`packages/shared`), un audit
"jamais émis" scopé à gateway/web ne peut PAS conclure "mort" — il ne voit que la moitié émettrice. Avant
de supprimer/modifier une déclaration `SERVER_EVENTS.X`/`CLIENT_EVENTS.X` sur la base d'un grep
gateway+web, grep AUSSI `apps/ios` et `packages/MeeshySDK` pour un `socket.on("...")`/`socket.emit("...")`
correspondant** — la vraie conclusion peut être "receiver mort des deux côtés" (à supprimer) OU "gap
d'implémentation serveur avec un client déjà prêt" (à décider : implémenter l'émission, ou supprimer le
récepteur en connaissance de cause), et ces deux verdicts appellent des actions opposées. Corollaire :
quand une suite de tests existe UNIQUEMENT pour un chemin qui semble mort ("pourquoi teste-t-on un
comportement jamais déclenché ?"), c'est un signal fort d'un gap d'implémentation ailleurs plutôt que de
code réellement mort — un vrai mort n'aurait généralement pas justifié l'investissement de 6 tests dédiés
dans une suite existante.

## Leçon 58 — L'offline delivery queue ne savait rejouer que `message:new` (2026-07-03/04)
Suite directe de la Leçon 57 : une fois `MessageHandler`/`MeeshySocketIOManager` capables
d'enqueue les nouveaux messages pour les destinataires hors-ligne, l'audit suivant a montré que
`handleMessageEdit`/`handleMessageDelete` (WS) et leurs équivalents REST (`routes/messages.ts`)
n'enqueuent JAMAIS rien — et plus profondément, `QueuedMessagePayload`/`RedisDeliveryQueue` ne
pouvaient structurellement représenter qu'un `message:new` (`_drainPendingMessages` émettait
`SERVER_EVENTS.MESSAGE_NEW` inconditionnellement). Un edit/delete fait pendant qu'un destinataire
est hors-ligne était donc silencieusement perdu pour lui : son cache garde l'ancien contenu (ou
le message supprimé reste visible) jusqu'à un refetch complet non lié. **Fix scopé au chemin WS
uniquement** (le chemin REST edit/delete a le même trou mais est laissé en suivi documenté, comme
Hotspot B.1 dans `tasks/realtime-hotspots-analysis.md` — élargir le schéma une seconde fois puis
router 4 call sites au lieu de 2 aurait dépassé le "petit changement chirurgical" de cette
passe) : `QueuedMessagePayload.eventType?: 'new'|'edited'|'deleted'` (absent = legacy, 100%
rétrocompatible), `_drainedEventName()` route l'émission du replay selon ce champ, et
`_emitDeliveryForDrainedMessages` ignore désormais les entrées non-`'new'` (une distribution
"delivered" n'a pas de sens pour un edit/delete). **Règle générale (applicable à tout futur ajout
similaire) : quand une queue de replay ne transporte qu'UN type d'événement en dur (ici
`MESSAGE_NEW` hardcodé dans la boucle d'émission), vérifier si d'autres mutations en place du
même objet (edit, delete, réaction...) ont le même besoin de rejeu offline avant de considérer le
sujet clos — le premier fix pour "new" laisse un faux sentiment de complétude.** Tests :
`MeeshySocketIOManager.test.ts` (routage par eventType + exclusion receipt), 2 nouveaux cas dans
`MessageHandlerEditDelete.test.ts`.
## Leçon 62 — Un chemin socket qui hardcode une valeur que son sibling REST calcule (2026-07-04, itération 91)
`NotificationService.createPostLikeNotification` reçoit un `postType` load-bearing (il pilote le TYPE de
notification `story_reaction`/`status_reaction`/`post_like`, le contenu, le sous-titre, `metadata.postType`
REEL vs POST) + un contexte éphémère `postCreatedAt`/`postExpiresAt`/`postPreview`. Le call site REST
(`routes/posts/interactions.ts`) forwardait le vrai `post.type` + le contexte ; le sibling socket
(`PostReactionHandler._createPostReactionNotification`) `select`ait `authorId` seul et **hardcodait**
`postType: 'POST'`. Résultat : toute réaction émise par WebSocket sur une STORY/STATUS/REEL produisait une
notification typée POST, sans contexte d'expiration — divergence directe avec le chemin REST pour la même
action utilisateur. **Règle : quand deux chemins (REST + socket) appellent le MÊME service producteur de
notification/événement, ils doivent forwarder le MÊME jeu d'arguments — un argument hardcodé sur un chemin
alors que son sibling le calcule dynamiquement est une dérive silencieuse. Grep le service producteur
(`createPostLikeNotification(`), énumère TOUS ses call sites, et diff leurs arguments — pas juste le
premier.** Le `select` du `findUnique` doit être élargi en lockstep avec les champs forwardés (ici
`type`/`content`/`createdAt`/`expiresAt`), sinon le champ forwardé est `undefined` silencieusement.

## Leçon 59 — Un widen de regex de langue (639-3) doit couvrir TOUS les schémas de code langue (2026-07-03, itération 89)
L'itération 86-B avait élargi `CommonSchemas.language` (`validation.ts`) de `[a-z]{2}` à `[a-z]{2,3}`
pour accepter `bas/ksf/nnh/dua/ewo` (639-3 camerounais canoniques). Mais un **second** schéma,
`languageCodeSchema` (`attachment-validators.ts`), gardait `[a-zA-Z]{2}` → transcriptions/traductions
`bas` rejetées au trust boundary alors qu'un user peut avoir `systemLanguage: 'bas'`. **Règle : un fix
de validation de langue doit grep TOUS les regex `[a-zA-Z]{2}`/`[a-z]{2}` du monorepo (pas juste le
premier trouvé) — les codes 639-3 supportés traversent transcriptions, maps de traduction, préférences
user, et messages ; chaque schéma est un trust boundary distinct.**

## Leçon 58 — Un invariant lossless documenté sur une méthode n'est pas propagé à son sibling (2026-07-03, itération 89)
`getFeed` (PostFeedService) porte un invariant de pagination **explicitement commenté** : `candidateLimit
= limit + 1`, fenêtre chronologique + sonde, *« We deliberately do NOT over-fetch then drop »* — curseur
pris sur le post chronologiquement le plus ancien AVANT le tri par score. Le sibling `getReels`, écrit
avec le même moteur de scoring, a gardé le pattern inverse (`limit * 4` sur-fetch, score tout, curseur
sur l'item score-trié) → réels sautés/re-servis en scroll infini. **Règle : quand un fix documente un
invariant dans un commentaire load-bearing sur une méthode, grep les siblings à même forme (`getFeed`
vs `getReels` vs `getStories` vs `getStatuses`) et vérifier que l'invariant y est appliqué — un
commentaire précis sur UNE méthode ne prouve rien sur ses jumelles.** Variante #40/#42/#45/#50/#55/#56/#57.
Corollaire validation : un test préexistant peut **encoder le comportement bogué** (ici `take === 20`
= le pool `limit×4`) — le recadrer sur l'invariant corrigé fait partie du fix, ne pas le contourner.

## Leçon 57 — Le sibling REST du chemin socket avait le seul enqueue offline (2026-07-03)
`services/gateway/src/socketio/handlers/MessageHandler.ts#broadcastNewMessage` (le chemin
`message:send`/`message:send-with-attachments`, DOMINANT selon ce même CLAUDE.md) n'appelait
JAMAIS `RedisDeliveryQueue.enqueue()` pour les destinataires hors-ligne — seul le sibling REST
`MeeshySocketIOManager._broadcastNewMessage` (utilisé par `POST /conversations/:id/messages`
et par les messages système de fin d'appel) le faisait. Un commentaire présent dans le code
documentait même le fait sans le signaler comme un bug (« le chemin principal `message:send`
n'enqueue pas offline » — `MeeshySocketIOManager.ts:1852-1858`), ce qui l'a laissé vivre sans
alerte. **Conséquence concrète** : un message envoyé via le composer normal (WS) à un
destinataire hors-ligne n'était jamais rejoué à sa reconnexion (`_drainPendingMessages`) et ne
déclenchait jamais l'avancement du reçu expéditeur de "envoyé" à "distribué" — jusqu'à ce que
le destinataire ouvre spécifiquement cette conversation. Variante du thème Leçon 56 (fonctionnalité
testée+câblée sur UN chemin, mais absente du chemin qui compte le plus) : ici pas un hook non
monté, mais un service partagé (`RedisDeliveryQueue`) jamais injecté dans le second des deux
constructeurs qui en avaient besoin. **Règle : quand un service in-memory/partagé (queue, cache,
compteur) est injecté via un setter post-construction (`setXxx()`) sur une classe qui elle-même
construit un sous-handler dans SON PROPRE constructeur, vérifier que le setter forward bien vers
CE sous-handler — sinon le sous-handler reste sur sa valeur d'init (`null`) pour toute sa vie,
même si le service parent est correctement configuré.** Fix : `MessageHandler` reçoit
`deliveryQueue` (optionnel au constructeur + `setDeliveryQueue()`), et
`MeeshySocketIOManager.setDeliveryQueue()` forwarde désormais la même instance à
`this.messageHandler.setDeliveryQueue()`. Enqueue utilise `broadcastPayload` (déjà
cid-stripped, cohérent avec ce que les autres participants reçoivent en direct). Tests :
`MessageHandler.test.ts` (3 cas) + `MeeshySocketIOManager.test.ts` (forwarding).

## Leçon 56 — Un fix "documenté + testé" peut vivre dans un hook jamais monté (2026-07-03)
`apps/web/hooks/useCallSignaling.ts` (répertoire `components/video-calls/`, PLURIEL) porte une
ré-émission `call:join` au reconnect socket, entièrement testée (`useCallSignaling.reconnect.test.ts`
vert) et créditée dans le backlog comme le miroir web du `didReconnect` iOS — mais n'est importé nulle
part dans l'app réellement rendue. Le composant monté à `app/call/[callId]/page.tsx` est
`components/video-call/CallManager.tsx` (SINGULIER), qui réagit bien à `'connect'` mais ne fait que
ré-attacher des listeners d'événements, jamais ré-émettre `call:join` — rendant tout l'investissement
gateway "résilience restart/reconnect" inopérant côté web malgré un test vert qui semblait le prouver.
**Règle : avant de créditer un fix "hook + test passent" dans un backlog, vérifier que ce hook/composant
est réellement import-atteignable depuis une route rendue (`grep` l'arbre d'imports depuis `app/**/
page.tsx` jusqu'au fichier en question) — un test vert sur du code mort ne prouve rien en production.**
Variante du thème sibling-drift (#5/#40/#42/#45/#50/#51/#55) : ici la divergence n'est pas entre deux
implémentations actives, mais entre une implémentation active et un jumeau non branché au nom de
répertoire trompeur (`video-call` vs `video-calls`).
## 2026-07-02 — Calling-feature routine: REST/socket CallService split + no Swift toolchain in this sandbox

1. **A shared in-memory service constructed twice (once per transport) silently desyncs, and it's easy to miss because each half looks correct in isolation.** `routes/calls.ts` built its own `new CallService(prisma)` while `MeeshySocketIOManager` built another — both correct on their own, but a call initiated via REST never registered its ringing-timeout on the instance `CallEventsHandler`/`CallCleanupService` actually read (and vice versa for cleanup). Same root cause class as this file's `RC-4` entries for `CallCleanupService`, just never extended to the REST routes. **Rule: when a service holds server-lifetime in-memory state (maps/timers, not just DB access), grep every `new ServiceClass(` call site in the codebase, not just the one you're touching — two constructions of a "just a DB wrapper"-looking service is a decoupled-state bug waiting to happen.** Fixed by decorating the Socket.IO layer's instance onto `fastify` (`server.ts` `setupSocketIO()`) and having `routes/calls.ts` consume `fastify.callService ?? new CallService(prisma)` (fallback kept for route-isolation tests / boot-order safety, mirroring the existing `presenceChecker`/`notificationService` decorator pattern).
2. **`markCallAsMissed`'s plain `update()` was the one sibling in `CallService.ts` that never got the version/status-scoped `updateMany` treatment** applied to `updateCallStatus`/`leaveCall`/`endCall` in earlier sessions — same "audit every sibling doing read-then-write" lesson as the entry below this one, different method. Fixed by scoping the write to `status: { in: [initiated, ringing] }` and short-circuiting on `count === 0`, mirroring the ringing-timeout handler's own atomic pattern (which is this method's actual caller).
3. **This remote sandbox has no Swift/Xcode toolchain at all** (`which swift/swiftc/xcodebuild` all empty) — confirmed while trying to act on an iOS audit's dead-code findings (`AudioEffectsPanel` + its ~10-file dead chain, `CallMediaConfig` scaffolding). **Rule: without a compiler, do NOT delete/refactor across multiple Swift files based on a text-search-verified "zero call sites" claim** — a single missed reference (protocol conformance, `#if canImport` branch, a test file) breaks the whole target and there is no way to catch it before `git push`. Reserve iOS changes in this environment to single-file, mechanical, pattern-mirroring edits you can fully verify by reading (e.g. folding a property into an existing `OSAllocatedUnfairLock`-guarded `LockedState` struct that already guards two sibling counters the exact same way, or adding a `.frame`/`.contentShape` modifier for a touch-target fix). Left the larger iOS dead-code removal as a follow-up for a session with real Xcode access (`./apps/ios/meeshy.sh build` must stay the actual gate per `apps/ios/CLAUDE.md`, not a text-search proxy for it).

## 2026-07-02 — Calling-feature routine: sibling-pattern drift strikes again (`endCall` idempotency) + a `#else` fallback stub silently missing 2 protocol requirements

1. **When one function in a class already has the "check ALL terminal statuses" guard, grep every sibling that guards on a single status literal instead of the shared constant.** `CallService.updateCallStatus`/`leaveCall`/`joinCall` all guard with `TERMINAL_STATUSES.includes(call.status)` — `endCall()` alone guarded `call.status === CallStatus.ended`, missing `missed`/`rejected`/`failed`. Concretely exploitable: the ringing-timeout path (`markCallAsMissed`) resolves a `CallSession` to `missed` WITHOUT touching `CallParticipant.leftAt` (by design — it only writes the session), so a delayed/retried `call:end` from the initiator still passes the "am I an active participant" check and silently overwrites `missed`→`ended`, `endReason`→`completed` — reopening the exact "phantom completed call" bug a previous session's C3/C4 fix (pre-answer ordering) had just closed, via a completely different trigger (duplicate invocation instead of event ordering). This is the same class of bug as lessons #40/#42/#45 (fix applied to one sibling, not audited across all siblings) — the fix pattern here was **already present three lines above** in the same file (`updateCallStatus`), just not reused.
2. **A `#if canImport(X) ... #else ... #endif` fallback class conforming to a shared protocol can silently drift out of conformance for months if the fallback branch is never compiled in normal CI** (only exercised when the SPM package fails to resolve). Removing one dead protocol requirement (`setMaxAudioBitrate`, confirmed zero prod callers) from `P2PWebRTCClient`'s `#else` stub surfaced that the SAME stub was already missing two OTHER requirements (`applyAudioEncoding`, `videoFilterPipeline`) that the real (`canImport(WebRTC)`) implementation had long since grown — a pre-existing, unrelated compile break in a branch nobody was building. **Rule: whenever touching one conformer of a multi-conformer protocol (real impl + mock + `#else` stub), diff the conformer's member list against the protocol's full requirement list, not just the one member you're editing** — a stub that "was fine last time you looked" silently rots as the protocol grows.
3. **Centralizing a repeated-but-inconsistent pattern (call CallKit `reportCall` before every `.failed(...)` teardown) is safer as ONE gated block than patching N call sites**, provided you first verify (grep) that no reason value reaching that shared point is *already* reported by its own call site — otherwise the centralization double-reports. (This session's own implementation put the gated block inline in `endCallInternal`; a concurrent session that reached `main` first instead extracted a dedicated `failCall(_:)` wrapper called from the 11 sites, additionally gated on `callUsesCallKit` — functionally equivalent, slightly more defensive. Superseded, see #4.)
4. **Two routine sessions running in parallel on the same backlog (`tasks/calls-fonctionnel-todo.md`) independently found and fixed the SAME 3 iOS bugs this cycle** (CallKit `.failed` teardown report, TURN loss on call-waiting hand-off, banner-not-cleared-on-early-hangup) — nearly identical diagnosis, different implementation shape. The other session reached `main` first (real Xcode toolchain, compiled+tested `MeeshyTests` green); this session's branch, based on an older `main`, collided on `git merge origin/main` in exactly the files both touched (`CallManager.swift`, `P2PWebRTCClient.swift`, `WebRTCService.swift`, 2 test files). Resolved by taking `origin/main`'s version wholesale for every conflicting file (`git checkout --theirs`) rather than attempting a line-level reconciliation of two independently-written fixes for the same bug — a merged Frankenstein of two designs risks compiling to neither author's tested state. **Critically, `git checkout --theirs` blindly discards this session's local test additions for the same area even when they're not literally conflicted (auto-merged) — grep the post-merge source for every string your own new tests assert on and delete/rewrite any that no longer match**, don't just trust a clean `git merge` exit code. Two of this session's own test classes (`CallWaitingPendingCallTests`, `EndCallInternalFailedReasonReportsToCallKitTests`) auto-merged into `CallManagerTests.swift` with zero textual conflict yet asserted on identifiers (`if case .failed = reason` inline in `endCallInternal`, inline `pendingIncomingCall?.callId` checks in the socket sinks) that no longer existed after taking `origin/main`'s `failCall(_:)`/`clearPendingIncomingCall(ifMatching:)` refactor — would have failed CI silently disguised as "my own tests, must be fine." One genuine, still-real bug from this session (the `#else` fallback stub missing `applyAudioEncoding`/`videoFilterPipeline`) had NOT been fixed by the other session and had to be reapplied after the merge — taking "theirs" is a starting point, not a substitute for re-diffing your own findings against the merged result. **Rule for future sessions of this routine: `git fetch origin main` and skim recent commit subjects for this backlog's files BEFORE investing in a large iOS fix pass, not just at the end when pushing.**

## 2026-07-02 — Remote sandbox: `prisma generate` can't download engine binaries, but gateway jest doesn't need it

In a fresh Claude Code on-the-web container, `npx`/local `prisma generate` reliably fails with `ECONNRESET` while streaming `libquery_engine*.gz` / `schema-engine*.gz` from `binaries.prisma.sh` through the agent proxy (the CONNECT tunnel + TLS handshake succeed, the transfer itself resets — `checkpoint.prisma.io` gets an explicit 403 policy denial logged at `$HTTPS_PROXY/__agentproxy/status`, but `binaries.prisma.sh` logs no relay failure, so it's a mid-stream reset, not a clean block). `CHECKPOINT_DISABLE=1` and `NODE_USE_ENV_PROXY=1` don't fix it; retries don't either. **Don't burn time retrying — check `services/gateway/jest.config.json`'s `moduleNameMapper` first**: `@meeshy/shared/prisma/client` is mapped to `src/__tests__/__stubs__/prisma-client.ts` and `@meeshy/shared/*` maps straight to `packages/shared/*.ts` source (not `dist/`) — so `node_modules/.bin/jest --config jest.config.json <path>` runs gateway unit/socketio tests with zero dependency on a generated Prisma client or a `packages/shared` build. Reserve the documented `prisma generate && shared build && bun run test:coverage` flow (CLAUDE.md) for when you actually need bun's coverage numbers or are touching Prisma-typed code paths that the stub doesn't cover (per CLAUDE.md, ~17 suites need it: commentId/PostMediaSelect). Also needed first: `bun install --ignore-scripts` (root `bun install` fails on `grpc-tools`' native postinstall trying to fetch a prebuilt binary from a non-allowlisted S3-fronted host — scripts aren't needed for gateway jest).

**Addendum — if you DO need the real generated client (full `bun run test:coverage` parity), the download is fixable, not just avoidable.** `curl` (through the same `$HTTPS_PROXY`) fetches the exact `.gz` engine files fine — only Prisma's own Node/undici downloader chokes mid-stream. Debug the exact URLs/paths with `DEBUG="prisma:*" npx prisma generate ... 2>&1 | grep -i download`, then `curl -sS -o /tmp/x.gz "<url>" && gunzip -c /tmp/x.gz > "<dest>" && chmod +x "<dest>"` for each engine Prisma wants (it needs copies in TWO places: `node_modules/.bun/@prisma+engines@<ver>/node_modules/@prisma/engines/{schema-engine,libquery_engine}-<target>` for the schema/query engine pair, AND `node_modules/.bun/prisma@<ver>/node_modules/prisma/libquery_engine-<target>.so.node` for every `binaryTargets` entry in `schema.prisma`, one download per target — `generate` only needs the ones matching this container's actual platform (`debian-openssl-3.0.x` on the standard image), the rest (arm64/musl, for docker cross-builds) can be skipped unless generate refuses to proceed without them). Once those files exist on disk, `prisma generate` finds them cached and skips the network entirely — full `bun run test:coverage` (492 suites) then runs clean.

## 2026-07-02 — Read-receipt cursor could regress on out-of-order delivery (sibling of the reaction-summary lost-update fix)

Same day, a separate commit (`c0939a3f`) fixed `ReactionService.updateMessageReactionSummary` for a non-transactional lost-update race. That fix pattern ("audit every sibling doing read-then-write on a shared cursor/counter") pointed at `MessageReadStatusService.markMessagesAsRead`/`markMessagesAsReceived`: both upsert `ConversationReadCursor.lastReadMessageId`/`lastDeliveredMessageId` unconditionally from whatever `messageId` the caller passes, with no check that it's actually newer than what's already recorded. A multi-device user (or a retried/reordered socket event) could roll the cursor **backward** — e.g. device B, still showing an older scroll position, marks-read after device A already advanced further — resurrecting already-read messages as unread. Fixed by comparing MongoDB ObjectId hex strings lexicographically (`isStaleCursorMessageId` in `MessageReadStatusService.ts`): the leading 4 bytes of a Mongo ObjectId are a creation timestamp, so string comparison approximates chronological order without an extra query — reusing the `lastReadAt`/`lastDeliveredAt` `findUnique` that already ran for the freeze-window calculation (just added `lastReadMessageId`/`lastDeliveredMessageId` to its `select`). **Guard the comparison to only fire when both ids match the 24-hex-char ObjectId shape** — plenty of this file's own tests use synthetic non-ObjectId strings (`'msg-1'`, `'provided-message-id'`), and a real fixture audit (`grep 'conversationReadCursor.findUnique.mockResolvedValue'`) showed none of them populate the new cursor-id fields, so the guard is a true no-op for all pre-existing tests — zero risk of silently breaking unrelated coverage while adding the safety net for real (24-hex) ids.

## 2026-07-02 — Gateway call authz: `resolveParticipantIdFromCall` vs `resolveActiveCallParticipantId` sibling drift

1. **A two-tier authz helper pair drifts silently unless every call site is audited together.** `CallEventsHandler` has `resolveParticipantIdFromCall` (conversation membership only) and `resolveActiveCallParticipantId` (active participant of THIS call — the strict one, per its own docstring). Previous audit passes fixed `QUALITY_REPORT` and `RECONNECTING`/`RECONNECTED` to use the strict resolver but left `TRANSCRIPTION_SEGMENT` on the weak one — any conversation member (not just call participants) could inject arbitrary text via `call:transcription-segment`, machine-translated and broadcast live into the call. Fixed at `services/gateway/src/socketio/CallEventsHandler.ts:2108`.
2. **`HEARTBEAT` (line 1961) still uses the weak resolver too** — lower severity (the downstream `updateMany` filters on `callSessionId+participantId+leftAt:null` so a spoofed id just no-ops), left as a follow-up rather than bundled into this fix to keep the diff minimal. **Fixed 2026-07-02** (`CallEventsHandler.ts:1961` → `resolveActiveCallParticipantId`): the real cost wasn't the DB no-op, it was the in-memory `CallService.heartbeats` map — any conversation member (not an active call participant) could plant a phantom entry there, and `CallCleanupService` reads that map (`hasHeartbeatData`/`getStaleHeartbeats`) to decide whether a call is a reapable zombie. While fixing it, found `CallEventsHandler-transcription.test.ts` referenced an undefined `activeCallSession()` helper (only a same-named `ACTIVE_CALL_SESSION` const existed) — a `tsc` compile error that failed the whole suite silently (`Test Suites: 1 failed`, `Tests: 0 total`, easy to miss in a big run). **Grep every `describe.only`-free suite's actual test count in CI output, not just pass/fail** — a suite that fails to compile reports 0 tests, which reads as "nothing to see" unless you check the totals line.
3. **When fixing one handler in this class, grep every `resolveParticipantIdFromCall` call site** (`grep -n resolveParticipantIdFromCall CallEventsHandler.ts`) and check each against the docstring's guidance — writes to call state/stats must use the active-participant resolver, not just conversation membership.
4. **Test-mock gotcha: `jest.clearAllMocks()` clears call history, not `mockResolvedValue` implementations.** Swapping a handler from a prisma-mock-backed resolver to `mockCallServiceGetCallSession`-backed resolver silently breaks sibling tests in the same `describe` block that never set `mockCallServiceGetCallSession` themselves — they inherit whatever the last test in file order left behind. Every test exercising an authz-gated branch must explicitly call `mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [...] }))`, mirroring the existing `QUALITY_REPORT`/`RECONNECTING` test pattern — don't assume a fresh default.

## 2026-06-24 — Story reader : démarrage vidéo bg/fg synchronisé

1. **Une vidéo foreground NE DOIT PAS démarrer dès l'attach — elle attend le « GO » du canvas.** `StoryMediaLayer.attachPlayer` jouait `player.play()` inconditionnellement en `.play`, donc une vidéo foreground attachée avant le content-ready démarrait EN AVANCE sur la vidéo de fond + l'audio (désync de démarrage). Le fond avait déjà ce gate (`StoryBackgroundLayer.isPlaybackActive`) ; le foreground ne l'avait pas — asymétrie exposée par le merge qui a fait démarrer le fond sans attendre le foreground (PR #915 / `257493438`).

2. **Invariant : fond, foreground et mixer audio démarrent au MÊME instant (content-ready).** Source de vérité côté canvas : `foregroundVideosPlaybackActive`, tenu en phase avec `backgroundLayer.isPlaybackActive` à chaque transition (GO, pause/resume, lifecycle, start/stopPlayback, préemption). Sticky + re-propagé dans `rebuildLayers()` pour qu'une vidéo dont les octets arrivent APRÈS le GO démarre immédiatement à son tour.

3. **Mirror le pattern background quand on ajoute un média gated.** `isPlaybackActive` (intention sticky) + `handleAppLifecycle(active:)` (pause/reprise transitoire respectant l'intention) doivent exister des DEUX côtés. Un `forEachAVPlayer { play/pause }` direct ne suffit pas : il n'affecte que les players déjà attachés, pas l'intention que consulte le prochain attach.

## 2026-04-17 — iOS background stability

1. **`didReceiveRemoteNotification` must await async work before the completion handler.** Calling `completionHandler(.newData)` synchronously before async subtasks finish lets iOS suspend the process mid-flight. Wrap in `beginBackgroundTask` + a tiny actor that guarantees the handler fires exactly once whether the happy path or the OS expiration wins.

2. **Delivery receipts belong in the push path, not the socket path alone.** Sender-side double-check cursors depend on the recipient calling `markAsReceived`. If the recipient never opens the app, the socket path never fires. The APN pipeline is the correct hook — emit `ack(conversationId:)` from `didReceiveRemoteNotification`.

3. **`fatalError` in singleton init crashes the app on disk-full / permission-change / cold wake from push.** Return a degraded in-memory fallback and expose an `isEphemeral` flag so callers can decide whether to persist. Never `fatalError` on initialisation paths that run during background wakes.

4. **Decryption can return an empty array — `msgArray[0]` is a crash.** When mutating via `decryptMessagesIfNeeded(&:)`, guard `first` before indexing. Force-unwrap on collections that were mutated by background tasks is a guaranteed crash in low-memory scenarios.

5. **`AVAudioSession` interruption / route-change observers must be installed exactly once, centrally.** Four players configuring the session independently with no observer leaves the app in a bad state after a phone call or AirPods disconnect. Centralise in a single actor and fan out events via a `PassthroughSubject`.

6. **`willResignActive` is not enough for cache flushes.** It fires on control-center pulls and transient hand-offs, but NOT reliably on full background → terminate. Also observe `didEnterBackground` and `willTerminate` with a synchronous semaphore wait (≤4s) on terminate.

7. **Timer.scheduledTimer on singletons with `[weak self]` closures never fires `deinit`.** Singletons live forever, so weak captures don't break the retain cycle — but the timer keeps firing in background. Explicitly stop timers in `prepareForBackground()` and rearm in `resumeFromBackground()`.

8. **`MKLocalSearch.start { ... }` strongly retains its closure.** Without `[weak self]`, a dismissed picker leaks, and worse, the completion task may write into a zombie view model. Apple search APIs should always be captured weakly.

9. **Route tasks in `@MainActor { Task { await ... } }` through a small actor state machine when multiple exit points exist.** Otherwise a race between happy-path completion and OS expiration leads to double-call of `completionHandler`.

10. **Backgrounding is a single state transition — orchestrate it.** Multiple `.background` handlers scattered across the app invariably drift out of sync. A single `BackgroundTransitionCoordinator` with explicit ordering (players → cache → push → sockets → BG tasks → widgets) makes the lifecycle auditable.

## Prod debugging — agent/translator (2026-06-01)

11. **Prefer a maintained library over a hand-rolled parser, even if absent from node_modules.** "Pas de lib dispo" is not a reason to reinvent — `npm view <pkg>` first. For repairing loose LLM JSON, `jsonrepair` (CJS+ESM, zero-dep) handles trailing commas, single quotes, unquoted keys AND truncation (LLM hitting maxTokens) — a custom scanner missed truncation entirely. Reuse > creation (matches the standing feedback memory).

12. **Never label a behavior "by design" without proving it from the product intent.** Claimed the agent's reactions-only output in dead conversations was "expected" — wrong. The Animator's whole purpose is to revive dead conversations by impersonating multiple users. The burst mechanism existed in the prompt but was never wired to low activity. Verify intent (CLAUDE.md, product docs) before excusing a gap as design.

13. **A hung process with thread-count 1 + ~0% CPU + frozen logs = deadlock, not load.** The translator held a global `threading.Lock` (synthesis serialization) across a never-returning `_model.generate()`; all 37 workers piled behind it. Fix: per-call `asyncio.wait_for` watchdog so a stuck synthesis exits the `with lock:` and frees everyone. Caveat: `run_in_executor` threads can't be truly killed — the watchdog breaks the deadlock but leaks the stuck thread (real fix = killable subprocess).

14. **Rapid sequential pushes to main can leave service images unbuilt.** docker.yml is change-detecting (builds only services whose files changed) AND has a concurrency group that cancels in-progress runs when a newer push arrives. A burst of small per-service commits → each new push cancels the previous run mid-build → the earlier commit's service image is never pushed (observed: fix(prod) built only `agent`, gateway/translator/web cancelled). After a burst of pushes, ALWAYS verify per-service build success (`gh run view <id> --json jobs`) and, if any were cancelled, dispatch a full rebuild: `gh workflow run docker.yml -f services=all`. Better: batch related fixes into ONE commit, or push, wait for the build, then push again.

## 2026-06-01 — Cleanup / suppression de fichiers

15. **"Absent de `project.yml`" ≠ "non utilisé". Avant de supprimer un fichier, lire son en-tête ET vérifier toutes les voies de build.** J'ai supprimé `apps/ios/WebRTCStubs.swift` en concluant "non compilé" parce qu'il n'était ni dans `project.yml`, ni dans le `project.pbxproj` committé, ni dans les workflows `.github`/`ci_scripts`/`fastlane`. Mais son en-tête disait explicitement : *stubs guardés par `#if !canImport(WebRTC)`, compilés UNIQUEMENT quand le package WebRTC n'est pas résolu (CI sans WebRTC)*. C'est un fallback CI volontaire : inerte quand WebRTC est présent (le `#if` le vide), indispensable quand il est absent. Restauré après correction user. **Règle : un fichier dont l'en-tête décrit une compilation conditionnelle (`#if !canImport(...)`, fallback CI, build variant) ne doit JAMAIS être supprimé sur la seule base "pas trouvé dans la config de build par défaut" — le grep ne voit pas les chemins de build alternatifs.**

## 2026-06-07 — Indicatifs pays & affichage téléphone

16. **Un numéro étranger affiché avec `+33` = `phoneCountryCode` traité comme source de vérité au lieu du numéro lui-même.** Le défaut codé en dur `phoneCountryCode || 'FR'` (admin) et les listes de pays partielles (49 web / 25 iOS / 14 admin) faisaient hériter le +33 à des numéros non-FR. **Règle : la source de vérité du pays d'un numéro est le numéro E.164 parsé (`parsePhoneNumber(n).country`), PAS le champ stocké.** `resolveCountry()` ordonne : numéro parsé → `phoneCountryCode` stocké → locale → FR. Pour rendre un numéro « corrigeable pour de bon », l'édition doit exposer (sélecteur pays autoritaire + saisie nationale) et reconstruire l'E.164 via `toE164(national, pays)` — sinon un E.164 déjà préfixé ignore le changement de pays.

17. **Lister TOUS les indicatifs sans maintenir 240 entrées à la main : dériver.** Web → `libphonenumber-js` (`getCountries()` + `getCountryCallingCode()`) + `Intl.DisplayNames` (nom localisé) + drapeau dérivé du code ISO (indicateurs régionaux Unicode). iOS (pas de lib) → un seul dictionnaire `[ISO: indicatif]` + nom via `Locale.localizedString(forRegionCode:)` + drapeau dérivé. Repli **globe 🌐** quand le code n'est pas un couple de lettres valide / inconnu. Le drapeau est un repère de confiance : toujours l'afficher à côté du numéro et dans les sélecteurs.

18. **Vérif env distant : `npx tsc` s'arrête à la 1re erreur de config (`TS5101 downlevelIteration`) → un grep "0 erreur dans mes fichiers" est un FAUX positif.** De plus `node_modules` est partiel (55k « Cannot find module 'react' »). Pour valider une logique pure dépendant d'une lib, l'installer dans un bac à sable `/tmp` (`npm i libphonenumber-js`) et exécuter un script Node ciblé > se fier à un tsc cassé.

## 2026-06-07 — iOS XcodeGen : nouveaux fichiers Swift

19. **Un nouveau fichier `.swift` n'est PAS compilé tant que le `project.pbxproj` n'est pas régénéré.** Le projet iOS est piloté par **XcodeGen** (`apps/ios/project.yml`, `sources: [{path: Meeshy}]` globbé), mais `meeshy.sh` **ne lance pas** `xcodegen generate` — il build le `project.pbxproj` committé tel quel. Donc créer `Features/.../NewFile.swift` n'ajoute rien au build sans `xcodegen generate` (et éditer le pbxproj à la main est écrasé au prochain generate). **Règle : quand on ne peut pas régénérer/builder soi-même, mettre le nouveau code utilitaire dans un fichier DÉJÀ référencé** (ex. `ContactsShared.swift`) plutôt que créer un fichier — sinon le code ne compile pas et toutes ses références échouent.

## 2026-06-08 — SwiftUI iOS 16 compat

20. **Ne JAMAIS utiliser `.onChange` natif de SwiftUI dans le code app/feature (cible iOS 16).** La forme à 2 paramètres `.onChange(of:initial:){ old, new in }` est **iOS 17+** → erreur de compilation sur iOS 16 ; la forme à 1 paramètre `.onChange(of:){ new in }` compile mais est **dépréciée en iOS 17** (warning). **Règle : toujours `adaptiveOnChange(of:initial:_:)`** (wrapper `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveOnChange.swift`, importer `MeeshyUI`). Le seul `.onChange` natif autorisé est celui confiné dans ce wrapper. Même prudence pour toute API SwiftUI iOS-17-only → `if #available` ou wrapper compat. Violation trouvée+corrigée : `MiniAudioPlayerBar.swift:93`.

## 2026-06-09 — Diagnostic « impossible d'envoyer plusieurs messages à la suite (horloge) »

21. **Distinguer le mécanisme (mutex) du contrat UX (affordance du bouton).** En diagnostiquant « on ne peut pas envoyer plusieurs messages à la suite quand le 1ᵉʳ est en attente (horloge) », j'ai d'abord cadré le défaut comme « le texte tapé est perdu ». Correction user : *envoyer un texte vide sans pièce jointe n'a pas de sens — c'est le BOUTON d'envoi qui devrait être désactivé/masqué pour que ce cas n'arrive jamais.* Le vrai défaut UX est l'affordance, pas la perte de texte en soi. **Règle : pour un bug « impossible de faire X pendant l'état Y », chercher le garde-fou silencieux côté logique ET l'affordance UI qui aurait dû refléter l'état Y. Le fix appartient en général à l'affordance (désactiver/masquer le contrôle), pas seulement au guard silencieux.** Cause racine prouvée par instrumentation (`SendFlow LOCK/BLOCKED/UNLOCK`, trace `apps/ios/logs/sendflow-pending-lock-2026-06-09.log`) : `ConversationViewModel.sendMessage` sérialise via `@Published isSending` (guard l.1784, `defer` l.1786) tenu pendant tout l'`await` du POST REST — **30 s** sur réseau lent (`durationMs=30092`). Pendant ce temps `UniversalComposerBar.actionButton` garde `isReady = effectiveIsRecording || hasContent` (l.775) **sans tenir compte de `isSending`** → bouton tappable → `sendMessageWithAttachments` vide le champ (l.70) puis le ViewModel dépose le 2ᵉ envoi en silence.

22. **Capture de logs simulateur : la fenêtre `timeout` doit COUVRIR les actions, pas démarrer trop tôt.** 1ʳᵉ tentative ratée : stream `timeout 90` démarré à T, mais `navigator find-text --tap` a mis **11 s** par appel (le mapping accessibilité était ralenti par un thrashing `[MessageStore] publish` 20×/s) → les 3 envois sont tombés APRÈS la fin du stream → 0 log d'envoi (faux « instrumentation absente »). **Règle : pour tracer une interaction, lancer le stream live juste AVANT, taper par coordonnées `idb ui tap X Y` (pas `navigator find-text` qui re-mappe), et relire le fichier pendant que le stream tourne encore.** Et `strings` ne trouve PAS les format strings `os_log` (section `__TEXT,__oslogstring` encodée) — vérifier l'instrumentation en runtime, jamais via `strings` sur le binaire.

## 2026-06-09 — Animations d'entrée & recyclage de cellules UIKit

23. **Une animation d'apparition gatée par un `@State` PAR CELLULE se rejoue à chaque scroll-in dans une liste qui recycle ses cellules.** Bug : les réactions rejouaient leur animation « comète » en scrollant, même pour des réactions anciennes. Cause : `BubbleReactionsOverlay` détectait la nouveauté via `@State private var seenEmojis`. La liste de messages est un `MessageListViewController` **UIKit** (UIHostingConfiguration) qui **détruit/recrée** la vue SwiftUI d'une cellule hors-écran → le `@State` repart vide → au 1ᵉʳ rendu, TOUTES les réactions existantes sont « nouvelles ». Le réensemencement dans `.onAppear` du parent arrivait trop tard (l'`onAppear` enfant du `CometPillModifier` se déclenche AVANT celui du parent). **Règle : le signal "nouvellement ajouté" est un ÉVÉNEMENT MODÈLE, pas un événement de vue. Il doit vivre HORS de la cellule recyclée** — ici une table latérale `@MainActor ReactionAnimationGate` marquée uniquement par les vrais ajouts (toggle local dans `toggleReaction` + socket `reaction:added` des autres), avec une fenêtre TTL (1.3 s = durée de l'anim). La vue lit `shouldAnimate(messageId:emoji:)` ; le scroll ne marque jamais rien → aucune animation. Corollaire : `markAdded` est appelé AVANT l'écriture async de persistance, pour que la clé soit présente quand le store observe l'ajout et re-rend la bulle. Tests : `ReactionAnimationGateTests` (non-marqué→false = le cas du bug, marqué→true, expiration→false).

## 2026-06-09 — Readiness vidéo : « fichier local » ≠ « première frame à l'écran »

24. **Gater une UI (progress bar, fin de loader) sur la PRÉSENCE DISQUE d'une vidéo (`url.isFileURL`) ou même sur `AVPlayerItem.status == .readyToPlay` est trop tôt : la frame n'est pas encore composée.** Bug : la progress bar d'une story avançait alors que seul le flou ThumbHash était à l'écran (vidéo BG pas encore rendue). Cause (`StoryCanvasUIView.scheduleContentReadyEvaluation`) : un fast-path `if isLocalFile || status == .readyToPlay { backgroundDidBecomeReady() }` considérait une vidéo locale immédiatement prête — or `isFileURL` ne prouve que la présence disque, et `.readyToPlay` ne prouve que les métadonnées/buffer, PAS que la 1ʳᵉ frame est décodée ET composée. **Règle : le seul signal fiable de « première frame réellement visible » est `AVPlayerLayer.isReadyForDisplay` (KVO, `false→true` une fois la frame composée), strictement postérieur à `.readyToPlay`.** Gater le timer là-dessus, garder le placeholder (ThumbHash) visible pendant le gap (UX inchangée), et CONSERVER un failsafe (forced-fire après 2 s) couvrant TOUS les chemins pour qu'un signal manqué ne bloque jamais la progression à 0%. ⚠️ `isReadyForDisplay` n'est pas reproductible en simulateur/tests unitaires (frame rendue trop vite) → validation = smoke device sur réseau/vidéo lente.

## 2026-06-11 — Incident prod : corps de réponse vides (compression)

21. **`@fastify/compress` global est incompatible avec le pattern de handler du gateway.** Quasi tous les handlers font `async (req, reply) => { sendSuccess(reply, …) }` (la promesse résout `undefined` après `reply.send()`). Le hook onSend de compress remplace le payload par un *stream* ; pendant qu'il est en vol, Fastify voit la promesse du handler résoudre `undefined` avec `reply.sent === false` et émet un **second `reply.send(undefined)`** → le client reçoit `content-encoding` + `content-length: 0` (corps vide, fetch navigateur rejette en `ERR_CONTENT_DECODING_FAILED` = « Erreur de connexion au serveur ») et le stream initial crashe en `ERR_HTTP_HEADERS_SENT` (unhandled rejection). Les hooks onSend async qui retournent un string/Buffer (ETag D6) sont SÛRS ; seuls les hooks qui retournent un *stream* déclenchent la course. **Règle : compression HTTP au niveau Traefik (`compress@file`), jamais in-app — ou alors chaque handler doit `return reply`.** Test verrou : `async-send-contract.test.ts`.

22. **Méthode de debug à distance qui a marché (à réutiliser).** (a) Reproduire l'appel exact du client en curl ; (b) comparer `Accept-Encoding: identity` vs gzip → isole la couche compression ; (c) frapper le conteneur en direct (`docker exec node -e`) → disculpe Traefik ; (d) bisection dans le conteneur avec les modules de `/app/node_modules` + variantes de pattern de route → 4 runs ont suffi à isoler `async+reply.send`. Un `cl=0` explicite (vs `transfer-encoding: chunked`) = le payload final était une chaîne vide, PAS un stream — indice décisif.

23. **Hotfix conteneur = volatil.** Patch `sed` de `/app/dist/src/server.js` + `docker restart` survit aux restarts mais PAS à un `docker compose up` qui re-pull l'image. Tout hotfix in-container doit être suivi d'un rebuild d'image depuis le source corrigé AVANT le prochain déploiement, sinon l'incident revient.

## 2026-06-11 — Story vidéo gelée sur thumbnail (readiness jamais armée)

24. **`AVQueuePlayer.currentItem` est nil juste après l'attach d'un fond loopé** (l'`AVPlayerLooper` enqueue async). Tout code qui gate un armement d'observation sur `player.currentItem != nil` au moment de l'attach RATE la fenêtre. **Règle : armer sur la présence du PLAYER (le KVO `AVPlayerLayer.isReadyForDisplay` ne dépend que du layer) + failsafe temporel toujours armé ; le repli `.status` KVO seulement si l'item existe.**

25. **`displayLinkTick` gated sur `contentReadyFired` = plus aucune ré-évaluation après un armement raté.** Un seul signal manqué fige l'état pour toujours (pas de rebuild → pas de re-`scheduleContentReadyEvaluation`). Tout gate « j'attends X pour avancer » doit avoir un déclencheur évènementiel à l'arrivée de X (hook `onPlayerAttached`) OU un failsafe — jamais un sondage borné (l'ancien 30×50 ms abandonnait silencieusement si le download dépassait 1,5 s).

26. **Méthode de debug qui a gagné : sondes os_log AVANT de théoriser plus.** 3 hypothèses statiques plausibles se sont révélées partielles ; 2 builds instrumentés (catégorie `story-media`) ont montré en 2 itérations le `hasPlayer=true hasItem=false` décisif. Les chemins media/readiness des stories étaient totalement aveugles (3 régressions invisibles en 3 semaines) — les sondes restent en place (.info chemins rares, .debug par-tick).

## 2026-06-11 — Story rejoue au foreground + force-push dev

27. **Reprise foreground d'un média : TOUJOURS gater sur `window != nil` ET sur le drapeau d'autorisation canonique (`isPlaybackActive`), pas seulement sur le mode.** `handleDidBecomeActive` ne vérifiait `window` que pour l'audio mixer → un canvas `.play` retenu hors écran rejouait sa vidéo/audio à la réouverture de l'app. Et `handleAppLifecycle(active: true)` court-circuitait le gate. Preuve/validation : grep CoreMedia `SetRateAndAnchorTime` (rate=1 au foreground avant fix, plus aucun après).

28. **Avant tout `push --force-with-lease` sur `dev` : `git fetch` PUIS vérifier `git log main..origin/dev`** — un agent parallèle peut avoir mergé une PR sur dev uniquement (PR #570 écrasée puis réintégrée par merge `cb3cd8a9e`). Le lease ne protège que contre ce qu'on a déjà VU ; il faut regarder ce qu'on s'apprête à effacer.

## 2026-06-22 — iOS : ne JAMAIS hand-éditer project.pbxproj (XcodeGen)

29. **Le projet Xcode iOS est généré par XcodeGen depuis `apps/ios/project.yml`.** Les `targets` utilisent des globs de répertoire (`sources: - path: Meeshy`), donc **tout nouveau fichier `.swift` posé dans l'arborescence est auto-découvert** à `xcodegen generate`. J'ai édité `Meeshy.xcodeproj/project.pbxproj` à la main pour enregistrer `MediaConsumptionProgressBar.swift` — inutile ET nuisible : le pbxproj est un artefact généré, mes entrées manuelles (UUIDs ad-hoc) sont écrasées à la régénération. **Règle : pour ajouter un fichier à l'app, le créer au bon endroit sous `Meeshy/` (ou un sous-dossier d'un target déclaré) — jamais toucher le pbxproj. Pour le SDK (`packages/MeeshySDK/`), c'est SwiftPM qui découvre aussi par répertoire — pas de pbxproj non plus.** Indice de détection : présence de `apps/ios/project.yml` = XcodeGen actif.

## 2026-06-22 — Gateway test coverage (admin routes)

30. **Fastify response serialization strips response-body fields not declared in the route schema.** When a route handler returns `{ success, data, cacheInvalidation }` but the JSON schema only declares `{ success, data }`, Fastify's `fast-json-stringify` silently drops `cacheInvalidation`. Tests that assert `body.cacheInvalidation.*` will always fail. **Fix:** either add the extra field to the response schema, or (when verifying side-effects) assert on mock.calls instead of the response body.

31. **Mock ordering matters when conditional pipeline calls are skipped.** `aggregateRaw.mockResolvedValueOnce(a).mockResolvedValueOnce(b)` breaks when the first mock value is consumed by a call that only happens conditionally. If the first pipeline is skipped (e.g. `topLangCodes.length === 0` skips the distinct-users aggregation), the second mock value never gets consumed. **Rule:** for conditional pipelines, build mock stacks that match the actual execution path, not the happy-path order.

32. **Node 22 → Node 24 CI coverage gap is ~4–5pp, not a flat 4pp.** Local (Node 22) measured lines: 67.53%, statements: 67.29%; CI (Node 24) measured lines: 62.93%, statements: 62.87% — a 4.36–4.6pp gap. Setting thresholds at `local − 4` was too aggressive and caused a CI failure. **Rule:** use `local − 5` as the safe floor when setting coverage thresholds that must pass in both environments, or measure CI directly before committing thresholds.

## 2026-06-23 — « iOS Tests » CI rouge : repro locale fidèle (XcodeGen)

33. **`meeshy.sh` ne lance PAS `xcodegen` — la CI iOS, si.** Cause racine n°1 des « passe en local, casse en CI » (et l'inverse) : les workflows iOS font `cd apps/ios && xcodegen generate` AVANT de builder, donc compilent le vrai jeu de fichiers de `project.yml` (globbing `sources: - path: Meeshy`, `excludes: "**/*.md"`). `meeshy.sh` build le `project.pbxproj` *committé*, potentiellement périmé. **Pour reproduire un échec CI : régénérer d'abord** — `cd apps/ios && xcodegen generate`, puis `xcodebuild build-for-testing … -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build`, puis `xcodebuild test-without-building … -destination "platform=iOS Simulator,id=<simu 18.2>" -only-testing:MeeshyTests`. Compile = Xcode 26.1.1, run = iOS **18.2** (18.5+/26.x crashent au teardown xctest ; baselines sur 18.2). `build-for-testing` + `test-without-building` = compile une fois, exécute sans recompiler.

## 2026-06-23 — « iOS Tests » CI rouge : repro locale fidèle (XcodeGen)

34. **« TEST FAILED » + exit 65 = échec de COMPILE, pas un test flaky.** `Testing cancelled because the build failed` ⇒ le bundle de tests n'a pas linké. Lire la ligne `error:` juste au-dessus, corriger la compile — ne pas fouiller la logique des tests. Vécu 2026-06-23 : `'composerFocusTrigger' is inaccessible due to 'private' protection level`. **Piège accès cross-file** : un `@State private var` d'une `View` SwiftUI est inaccessible depuis un fichier d'extension frère `View+Xxx.swift` (même module) → retirer `private` (internal par défaut) sur toute propriété stockée touchée par une extension. La compile batch Swift masque les erreurs suivantes : après un fix, recompiler tout (un seul `error:` peut en cacher d'autres).

35. **Nettoyer le churn d'artefacts après une repro CI locale.** `xcodegen generate` réécrit `project.pbxproj` + `Meeshy.xcscheme` ; la résolution SPM réécrit `Package.resolved` (tracké malgré `.gitignore`). Ce sont des artefacts générés → `git checkout --` dessus, **jamais committer** ce churn (worktree partagé, agents parallèles). Vérifier `git status` propre avant/après. Diagnostic clé du jour : le run rouge précédait simplement le fix `c4cb4d76a` déjà dans `main` → toujours vérifier si la « brèche » CI n'est pas déjà corrigée par un commit ultérieur avant de toucher du code.

## 2026-07-01 — Web Socket.IO : listeners dupliqués sur ré-init

36. **`initializeConnection()` appelé plusieurs fois sur le MÊME socket ré-attachait tous les listeners Socket.IO à chaque fois.** `SocketIOOrchestrator.initializeConnection()` appelait inconditionnellement `messagingService/typingService/presenceService/translationService/preferencesSyncService.setupEventListeners(socket)` — or `ensureConnection()` (appelé avant CHAQUE `sendMessage`/`joinConversation`) et `setCurrentUser()` (retry de connexion) rappellent `initializeConnection()` dès que le statut n'est pas strictement `'connected'`, alors que `ConnectionService.getSocket()` renvoie systématiquement la MÊME instance de socket tant qu'aucun `cleanup()` complet n'a eu lieu (`this.state.socket` n'est nullé que là). Aucun des 6 services n'appelait `socket.off()` avant `socket.on()`. Résultat concret : après quelques cycles reconnect-adjacents, un `message:new` déclenchait N handlers → messages/réactions/receipts dupliqués, décryptage E2EE fait N fois, `markAsReceivedDebounced` fires N fois. **Fix minimal : un seul point de garde côté orchestrateur** — `private listenersAttachedSocket: TypedSocket | null`, on ne ré-exécute le bloc `setupEventListeners` que si `socket !== this.listenersAttachedSocket` (reset à `null` dans `cleanup()`). Pas besoin de dissiper `off()` dans les 6 fichiers de service : l'orchestrateur est l'unique point d'entrée qui les appelle tous. Test verrou : `orchestrator.service.test.ts` → « does not re-register event listeners when called again with the same underlying socket » (+ cas contraire : nouvelle instance de socket → ré-attache bien).

## 2026-07-01 — release.yml rouge 3× : `requirements.txt` avec bornes `>=` flottantes sur des libs ML actives

## 2026-07-01 — Web : `gcTime: 0` dans un helper de test partagé = flakiness inter-tests, pas un bug prod

38. **`gcTime: 0` sur un `QueryClient` de test rend TOUTE query alimentée uniquement via `setQueryData` (jamais via `useQuery`, donc 0 observer) éligible à la garbage collection sur le tout prochain macrotask réel — une course avec la chaîne async réelle (non mockée avec fake timers) de la mutation testée.** Un agent d'audit a rapporté un « bug d'idempotence » dans `use-send-message-mutation.ts` (l'`onSuccess` ne remplacerait jamais le message optimiste par le message réel, comparaison `id` cassée) — **faux positif** : `createOptimisticMessage()` pose `id: tempId` ET `_tempId: tempId` (même valeur), donc la comparaison `message.id === context.optimisticMessage.id` matche bel et bien l'entrée optimiste en cache. Vérifié en lisant le code source (pas en confiance aveugle dans le rapport de l'agent) + en ajoutant un test de réconciliation (`mutateAsync` réel jusqu'au bout, assert cache final = message réel, aucune entrée `cid_*` restante). Ce nouveau test, exécuté après un autre test du même fichier, faisait échouer intermittemment un troisième test sans rapport (`should update conversation lastMessageAt on success`, cache retrouvé totalement vide `[]` à l'assertion) — root cause : `createWrapperWithClient()`/`createWrapper()` (helpers locaux au fichier) posaient `gcTime: 0`, et AUCUN test du fichier n'exerçait réellement un comportement de GC (pas de fake timers, pas d'assertion sur la suppression). **Règle : dans un test RTL/React Query qui n'exerce PAS explicitly le GC, ne jamais mettre `gcTime: 0` dans le `QueryClient` — laisser le défaut (5 min) ; sinon la survie d'une entrée de cache entre la résolution d'une promesse réelle et l'assertion dépend de l'ordonnancement des macrotasks du fichier de test entier, pas seulement du test courant.** Repro : lancer le fichier seul (stable) vs avec un test additionnel qui `await mutateAsync(...)` réel juste avant (échoue de façon intermittente) — la suite complète du repo passait avant ce diagnostic uniquement par chance de timing.

37. **Un `Dockerfile` qui installe torch dans une commande `uv pip install` séparée puis `-r requirements.txt` dans une AUTRE commande perd l'ancrage torch pour la 2ᵉ résolution — toute lib ML à borne `>=` non pinnée peut alors dériver vers une release qui exige un torch/numpy plus récent que celui déjà épinglé.** `services/translator/Dockerfile` installe `torch==2.6.0` (étape 1/3) puis `uv pip install --system -r requirements.txt` (étape 2/3) séparément — mais `requirements.txt` avait `pyannote.audio>=3.4.0`. Entre deux runs de `release.yml`, pyannote.audio a publié 4.0.7 qui exige `torch>=2.8.0` ; la résolution de l'étape 2/3 (qui ne connaît pas le pin torch de l'étape 1 puisque torch n'apparaît pas dans requirements.txt) a essayé de satisfaire ce nouveau plancher, entraînant en cascade un numpy incompatible avec le pin `espnet==202412` (`numpy<1.24`) → `× No solution found: numpy>=2.2.6,<2.3.0 vs numpy<2.0.0`. 3 runs consécutifs rouges (`Build translator` / Docker Buildx) avant diagnostic. **Repro sans télécharger torch (index PyTorch bloqué par la policy proxy) : `uv pip compile requirements.txt --python-version 3.11 -o /dev/null` reproduit la résolution EXACTE hors Docker** (uv utilise le même resolver pour `compile` et `install`) — combiner avec `torch==2.6.0` + `torchaudio==2.6.0` en tête d'un fichier de requirements temporaire donne le jeu de versions compatibles à figer. **Fix : épingler en `==` exact toute lib ML à `>=` dans un `requirements.txt` de build Docker** (ici `pyannote.audio`, `speechbrain`, `scikit-learn`, `scipy`, `soundfile`, `accelerate`, `datasets`, `huggingface_hub`, `safetensors`, `einops`, `s3tokenizer`, `soxr` → versions issues de la résolution jointe avec torch==2.6.0). Un `requirements.txt` de prod ne doit JAMAIS avoir de borne flottante sur une lib activement maintenue — seul un lockfile (`uv.lock` via `pyproject.toml`, déjà utilisé par `ci.yml`/`uv sync`) protège durablement contre ce type de dérive ; `requirements.txt` (chemin Docker/release.yml, sans lockfile) n'a que des pins manuels comme garde-fou.

## 2026-07-01 — Dead-code deletion verified with Bash `grep | head -N` instead of the Grep tool → CI regression

39. **`grep -n "A|B|C" file | head -30` silently truncates before reaching a real match if earlier alternation branches (unrelated homonyms) produce >30 hits first.** Before deleting `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallMediaConfig.swift` (part of a 4-file "dead code" cluster), I verified zero real usage of its types (`VideoConfig`, `AudioConfig`, `DataChannelConfig`, `CodecPreferences`) via `grep -n "AudioConfig\|VideoConfig\|DataChannelConfig\|CodecPreferences" P2PWebRTCClient.swift | head -30` — ~30 unrelated matches on `setCodecPreferences`/`applyAudioCodecPreferences` (a different, unrelated libwebrtc API) appear earlier in the file (lines 336–921) and used up the entire `head -30` budget before the search ever reached the REAL hit at line 1259–1263 (`VideoConfig.hd720p30.maxFrameRate`/`.maxResolution` — genuinely used by `selectFormat(for:)` to cap the camera format). Result: merged the deletion, CI's `ios-tests` job failed on `cannot find 'VideoConfig' in scope` (this environment has no Xcode/Swift toolchain to catch it before push). **Rule: for a "zero references before deletion" check, NEVER pipe raw Bash `grep` through `| head -N`. Use the `Grep` tool instead** — call `files_with_matches` first (no truncation risk on file lists), then `content` mode with `head_limit: 0` (unlimited) on each hit file to see every match, not just the first N. If using Bash grep is unavoidable (e.g. inside a larger pipeline), use `grep -c` (count) first per-file to know whether truncation is even possible before trusting a `head`-truncated read. Fix: restored `CallMediaConfig.swift` + `CallMediaConfigTests.swift` byte-identical from git history (`git show HEAD~1:<path>`) while keeping the genuinely-dead 3 files removed (re-verified with the correct method: zero hits repo-wide outside their own cluster/tests).
## 2026-07-01 — Realtime audit : réactions message manquaient le fix P2002 déjà appliqué aux réactions soeurs

40. **Un fix de concurrence appliqué à un service "soeur" ne se propage pas automatiquement — chercher activement les copies non corrigées.** `ReactionService.addReaction` (réactions de MESSAGE) faisait un `findFirst` (pré-check) puis `create()` sans `try/catch` — race TOCTOU classique : si deux `reaction:add` concurrents pour le même `(messageId, participantId, emoji)` arrivent en même temps, le perdant lève `P2002` (contrainte unique DB, donc pas de doublon en base) mais l'erreur Prisma brute remonte jusqu'au client via `ReactionHandler.handleReactionAdd`, qui répond `{success:false}` alors que la réaction existe bel et bien côté serveur — l'UI optimiste annule à tort une réaction qui vient de réapparaître au prochain `reaction:sync`. `CommentReactionService.addReaction` et `PostReactionService.addReaction` avaient DÉJÀ le bon pattern (`try { create() } catch (P2002) { return existing }`), mais `ReactionService` (le plus utilisé, réactions sur messages) et n'avait jamais reçu le backport. **Règle : quand un pattern de fix concurrence/idempotence existe dans un service, grep TOUS les services structurellement similaires (`grep -rn "MAX_REACTIONS_PER_USER\|findFirst.*create" services/`) avant de considérer le risque couvert — un fix qui n'existe que dans 2 services sur 4 quasi-identiques est un fix incomplet.** Fix + tests : `ReactionService.ts` (try/catch P2002 + recovery lookup), `ReactionService.test.ts` (3 cas : concurrent insert résolu, autre erreur DB rethrow, P2002 sans ligne trouvée rethrow).

## 2026-07-02 — Realtime audit cycle : stale-broadcast ordering fixés, 3 pistes à haut impact reportées au prochain cycle

41. **`ConversationStore.applyConversationUpdated` (SDK) et `ConversationSyncEngine.handleNewMessage` (SDK) laissaient `lastMessageId`/`lastMessagePreview` s'appliquer sans garde de fraîcheur alors que `lastMessageAt` avait déjà une garde monotone** — un broadcast en retard pour un message plus ancien laissait la ligne de la liste afficher l'horodatage le plus récent apparié au texte d'un message plus ancien. Un test existant (`test_applyConversationUpdated_staleLastMessageAt_skippedButOtherFieldsApplied`) encodait ce bug comme comportement voulu ("other fields must still be applied") — corrigé pour distinguer les champs liés à l'ordre du message (groupés sous la même garde) des champs indépendants (`title`, `avatar`, ...). Fix : `ConversationStore.swift:425-444`, `ConversationSyncEngine.swift:868-882` + tests. **Cet environnement n'a pas de toolchain Swift (`swift`/`xcodebuild` absents) — ces fixes n'ont pas pu être compilés localement, seulement relus attentivement + vérifiés contre les conventions des tests voisins déjà mergés. Laisser la CI iOS trancher.**

42. **`normalizeConversationId` a DEUX implémentations indépendantes** : la version partagée `services/gateway/src/socketio/utils/socket-helpers.ts` (Map non bornée, utilisée par `MessageHandler`/`StatusHandler`/`ReactionHandler`/`ConversationHandler` — le chemin le plus chaud) et une copie privée dans `MeeshySocketIOManager.ts:157-159,466-489` (bornée à 2000 entrées LRU/FIFO, commentaire explicite "bounded to 2000 entries LRU"). La version partagée n'avait jamais reçu ce bornage → fuite mémoire sur le process gateway long-running. Fix minimal appliqué : même bornage FIFO sur `socket-helpers.ts` (`CONVERSATION_ID_CACHE_MAX = 2000`) + test d'éviction. **Dette non résolue : les deux implémentations restent dupliquées (violation Single Source of Truth) — `MeeshySocketIOManager.normalizeConversationId` pourrait déléguer à la version partagée maintenant qu'elle est bornée, mais ça touche la DI au constructeur (ligne 278) donc reporté par prudence (minimal impact ce cycle).**

43. **Pistes à haut impact identifiées mais NON corrigées ce cycle (prochain audit realtime devrait commencer ici) :**
    - **`OfflineQueue.items[]` (SDK) n'est jamais réconcilié avec `OutboxFlusher`** (`packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`, `retryAll()` lignes ~2284-2338) — un message offline peut être ré-envoyé à CHAQUE reconnexion pour la durée de vie de l'app, et un message définitivement échoué (`.exhausted`) est réessayé indéfiniment en bypassant `maxAttempts`. HIGH impact, mais correction risquée (deux sources de vérité à unifier) — nécessite plus qu'un cycle de review pour être fait proprement, surtout sans toolchain Swift local pour vérifier.
    - **`StatusHandler.identityCache`** (gateway, `StatusHandler.ts:43`) — même pattern que #42 mais sans bornage ni sweep périodique, peuplé à chaque `typing:start`/`typing:stop`.
    - **Race retraduction sur edit de message** (`MessageTranslationService._processRetranslationAsync`, `services/gateway/src/services/message-translation/MessageTranslationService.ts:550-643`) — deux edits rapprochés peuvent faire gagner la traduction de l'edit le plus ancien si les réponses ZMQ arrivent dans le désordre.
    - Typing indicator iOS keyé par `preferredDisplayName` au lieu de `userId` (`apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift:711-739`) — collision possible entre deux participants au même nom d'affichage (flicker, s'autorépare en ~3s).

## 2026-07-02 — Résolution de mention par préfixe = fausses notifications (iter 78)

44. **Une regex de mention `@DisplayName` sans frontière de fin matche par PRÉFIXE — `@Marie` résout à tort `@Marienne`.** `packages/shared/utils/mention-parser.ts` construisait `new RegExp('@' + escaped, 'gi')` sans borne : `@Marie` matchait `@Marienne`, `@Jean Charles` matchait `@Jean Charleston`, et le fallback username `/@(\w{1,30})/g` (sans borne gauche) matchait le `@marie` interne de `contact@marie.com`. La JSDoc promettait pourtant une « résolution exacte ». Chaque faux positif = une notification push envoyée à un utilisateur NON mentionné. **Fix : frontières Unicode-aware** — `(?<![\p{L}\p{N}_])@…(?![\p{L}\p{N}_])` avec flag `u` (displayName) + `(?<!\w)@` (username). Le flag `u` est sûr ici car `escapeRegex` n'échappe que des caractères de syntaxe (jamais `-`), donc aucun *identity escape* invalide en mode Unicode. Repro avant fix (vitest) : 3 classes de faux positifs confirmées ; +6 tests de régression. **Règle : toute résolution de token par nom d'affichage dans du texte libre DOIT ancrer les deux frontières (gauche+droite), sinon un prénom court est le préfixe/suffixe de mots plus longs.**

45. **Follow-ups caches gateway non bornés (prochain audit mémoire devrait commencer ici)** — même pattern que #42/iter 76 :
    - ~~`services/gateway/src/utils/conversation-id-cache.ts` — `Map` non bornée dans `resolveConversationId`, **3e copie** non bornée du cache déjà borné dans `socket-helpers.ts` + `MeeshySocketIOManager`. Appelée sur ~15 routes REST.~~ **RÉSOLU iter 79** : borne FIFO 2000 (idiome exact de `socket-helpers.ts`) + test d'éviction. Les 3 copies sont désormais toutes bornées ; les unifier en 1 SSOT reste à faire (touche la DI de `MeeshySocketIOManager`).
    - `services/gateway/src/utils/participant-lookup-cache.ts` — TTL lazy sans sweep périodique ni max-size ; peuplé à chaque envoi de message (chemin le plus chaud). Ajouter sweep `unref()` + borne. **← prochaine cible F45.**
45. **Follow-ups caches gateway non bornés (prochain audit mémoire devrait commencer ici)** — même pattern que #42/iter 76, non traités iter 78 :
    - `services/gateway/src/utils/conversation-id-cache.ts` — `Map` non bornée dans `resolveConversationId`, **3e copie** non bornée du cache déjà borné dans `socket-helpers.ts` + `MeeshySocketIOManager` (violation SSOT). Appelée sur ~15 routes REST. Appliquer la borne FIFO 2000 (ou unifier les 3).
    - `services/gateway/src/utils/participant-lookup-cache.ts` — TTL lazy sans sweep périodique ni max-size ; peuplé à chaque envoi de message (chemin le plus chaud). Ajouter sweep `unref()` + borne. **[RÉSOLU iter 80 — voir #46]**

## 2026-07-02 — Dernier cache mémoire non borné de la famille gateway borné (iter 80, F45)

46. **`participant-lookup-cache.ts` (borné iter 80) était le 4e et dernier cache « TTL sans balayage » du gateway.** Même anti-pattern que #42 (socket-helpers), iter 76 (StatusHandler.identityCache), et #1350 (conversation-id-cache) : le TTL (30 s) protège la fraîcheur mais pas la mémoire — une entrée `(participantId, conversationId)` lue une seule fois puis jamais rerelue expire mais reste dans la Map pour la vie du process (les sites `invalidateParticipantLookup` ne couvrent que leave/ban/delete-for-me, pas un départ passif). Peuplé sur CHAQUE envoi de message (chemin le plus chaud). **Fix : idiome canonique déjà établi** — `PARTICIPANT_LOOKUP_CACHE_MAX = 5_000` (même valeur que `IDENTITY_CACHE_MAX_SIZE`, cache voisin comparable) + éviction à l'insertion d'une NOUVELLE clé au plafond (`!cache.has(key)` garde → `evictExpired()` sweep puis FIFO sur la plus ancienne). **Choix : pas de `setInterval` module-level** — un cache fonctionnel sans lifecycle n'a pas de teardown propre ; la borne à l'insertion suffit à garantir la mémoire de façon déterministe ET testable (StatusHandler doit gérer un timer seulement parce qu'il est *classé* avec un `destroy()`). Tests : +3 cas (FIFO au plafond, préférence sweep-expired sur FIFO, no-evict on refresh de clé existante). **Dette DRY restante (candidat prochain cycle) : les 4 caches partagent le MÊME idiome FIFO+sweep dupliqué 4× — un `boundedTtlCache<K,V>({ max, ttlMs })` générique les unifierait (SSOT), mais ça touche 4 fichiers + la DI de `MeeshySocketIOManager`.** **[RÉSOLU iter 81 — voir #47]**

## 2026-07-02 — SSOT du cache borné : `BoundedTtlCache` unifie les 5 copies dupliquées (iter 81)

47. **La dette DRY annoncée par #42/#46 (idiome « Map bornée FIFO+TTL » copié-collé 5×) est résolue par une source de vérité unique `services/gateway/src/utils/bounded-cache.ts`.** Les 5 exemplaires étaient : `conversation-id-cache` + `socket-helpers.normalizeConversationId` + `MeeshySocketIOManager.normalizeConversationId` (variante FIFO pure, données immuables `identifier→ObjectId`, sans TTL) et `StatusHandler.identityCache` + `participant-lookup-cache` (variante FIFO + balayage TTL). Chaque copie réimplémentait à la main `size>=MAX`, l'éviction FIFO (`keys().next().value` + `delete`), et — pour la variante B — le sweep des expirées avant la FIFO + la vérification lazy de `expiresAt`. **Design de la SSOT : `class BoundedTtlCache<K,V>` avec `ttlMs` OPTIONNEL** — `undefined` → borne FIFO pure (`expiresAt = Infinity`, `evictExpired()` no-op) ; défini → FIFO + sweep TTL. Une seule variante gère les deux familles. **Comportement strictement préservé** : sweep-avant-FIFO, garde `!has(key)` (no-evict-on-refresh), lazy-expiry à la lecture. **Interface Map-compatible sur le sous-ensemble utilisé (`get`/`set`/`has`/`delete`/`clear`/`size`/`evictExpired`) mais `keys()` VOLONTAIREMENT non exposé** (fuite d'abstraction pour un cache) — un seul test white-box (`MeeshySocketIOManager.test.ts`) l'appelait pour trouver la clé la plus ancienne ; réécrit pour cibler `key-0` (clé la plus ancienne connue, comportement d'éviction désormais couvert génériquement par `bounded-cache.test.ts`). **Règle : quand un idiome subtil (sweep-avant-FIFO, no-evict-on-refresh, lazy-expiry) est copié ≥3×, l'extraire en SSOT paramétrée par options plutôt que de reborner chaque copie à des dates différentes — la duplication a coûté 4 itérations séparées (42/76/79/80) pour appliquer le MÊME fix.** Validation : 13 tests SSOT + 2351 tests verts sur le périmètre affecté (78 suites), 0 régression.
49. **`participant-lookup-cache.ts` (borné iter 80) était le 4e et dernier cache « TTL sans balayage » du gateway.** Même anti-pattern que #42 (socket-helpers), iter 76 (StatusHandler.identityCache), et #1350 (conversation-id-cache) : le TTL (30 s) protège la fraîcheur mais pas la mémoire — une entrée `(participantId, conversationId)` lue une seule fois puis jamais rerelue expire mais reste dans la Map pour la vie du process (les sites `invalidateParticipantLookup` ne couvrent que leave/ban/delete-for-me, pas un départ passif). Peuplé sur CHAQUE envoi de message (chemin le plus chaud). **Fix : idiome canonique déjà établi** — `PARTICIPANT_LOOKUP_CACHE_MAX = 5_000` (même valeur que `IDENTITY_CACHE_MAX_SIZE`, cache voisin comparable) + éviction à l'insertion d'une NOUVELLE clé au plafond (`!cache.has(key)` garde → `evictExpired()` sweep puis FIFO sur la plus ancienne). **Choix : pas de `setInterval` module-level** — un cache fonctionnel sans lifecycle n'a pas de teardown propre ; la borne à l'insertion suffit à garantir la mémoire de façon déterministe ET testable (StatusHandler doit gérer un timer seulement parce qu'il est *classé* avec un `destroy()`). Tests : +3 cas (FIFO au plafond, préférence sweep-expired sur FIFO, no-evict on refresh de clé existante). **Dette DRY restante (candidat prochain cycle) : les 4 caches partagent le MÊME idiome FIFO+sweep dupliqué 4× — un `boundedTtlCache<K,V>({ max, ttlMs })` générique les unifierait (SSOT), mais ça touche 4 fichiers + la DI de `MeeshySocketIOManager`.**

## 2026-07-02 — Realtime audit : réaction de MESSAGE était le seul sibling encore non transactionnel (lost-update race)

50. **`ReactionService.updateMessageReactionSummary` (réactions de MESSAGE) faisait un `findUnique` → increment JS → `update` sans `$transaction`, alors que `PostReactionService.updatePostReactionSummary` ET `CommentReactionService.updateCommentReactionSummary` avaient déjà le pattern correct (transaction + `reactionCount` autoritaire recalculé depuis la table source).** Deux `reaction:add`/`reaction:remove` concurrents sur le MÊME message (2 participants réagissent à ~la même milliseconde) lisent le même `reactionSummary`/`reactionCount` de départ avant qu'aucun des deux `update` ne commit — le second write écrase intégralement le premier (lost update classique). Les lignes `Reaction` individuelles restent correctes (protégées par le catch `P2002` déjà en place), donc `getMessageReactions`/`reaction:sync` (qui recalculent depuis la table `Reaction`) restent exacts — seul le `reactionCount`/`reactionSummary` dénormalisé affiché dans la liste de messages dérive silencieusement, sans job de réconciliation pour se corriger. Exactement le pattern « fix appliqué à un sibling, pas audité sur tous les siblings » de #40/#42/#45/#5 — cette fois le sibling non corrigé (réactions message) est le PLUS utilisé des trois. **Fix : mirror exact de `CommentReactionService`** — `$transaction` + `tx.reaction.count({ where: { messageId } })` comme compteur autoritaire (auto-réparant, contrairement à l'ancien increment). Tests : 4 cas ajoutés (`updateMessageReactionSummary — uses $transaction` : transaction ouverte sur add, sur remove, PAS ouverte si `deleteMany.count === 0`, `reactionCount` dérivé de `reaction.count` et non d'un increment JS même quand le compteur dénormalisé était déjà faux). Suite `Reaction` complète : 473/473 tests verts (17 suites).

## 2026-07-02 — Itération 82 : durcissement compteur/curseur (round 2) + CI miss sur suite colocée

51. **Continuité du thème #50 (races lost-update/out-of-order sur compteurs & curseurs partagés).** Un audit read-then-write a trouvé les 2 analogues NON corrigés : (A) `AffiliateTrackingService.convertAffiliateVisit` écrivait `currentUses: affiliateToken.currentUses + 1` (valeur JS) → deux conversions concurrentes perdent un increment ET peuvent dépasser le cap `maxUses` ; fix = `{ increment: 1 }` atomique (idiome déjà présent dans `routes/anonymous.ts`). (B) `MessageHandler.handleMessageDelete` réécrivait `lastMessageAt` **inconditionnellement** après recompute → un `message:new` committant entre le `findFirst` et l'`update` fait reculer le curseur ; fix = garde de **concurrence optimiste** via `updateMany({ where: { id, lastMessageAt: <valeur lue au début du handler> } })`. **Subtilité clé : `lastMessageAt` est estampillé `new Date()` à la création (MessagingService), DÉCORRÉLÉ de `message.createdAt`** — une garde basée sur `createdAt` serait donc peu fiable (laisserait un curseur obsolète après suppression du dernier message). La concurrence optimiste (equality sur la valeur lue) ne fait aucune hypothèse d'alignement d'horloge. Résidus documentés F47 (cap TOCTOU affiliation), F48/F49 (ConversationMessageStats / ConversationStats).

52. **CI GATE MISS : un balayage `src/__tests__/…` ne couvre PAS les suites COLOCÉES `src/**/__tests__/`.** J'ai validé localement `src/__tests__/unit/handlers/MessageHandler.core.test.ts` (vert) mais raté `src/socketio/handlers/__tests__/MessageHandlerEditDelete.test.ts` — un SECOND fichier testant `handleMessageDelete`, colocalisé à côté du code. Il mockait `conversation.update` ; après bascule vers `conversation.updateMany`, le mock manquant faisait throw le handler → 10 tests rouges en CI (`test:coverage` tourne TOUTE l'arbo). **Règle : avant de déclarer un changement de handler/service vert, `grep -rln "<methodeModifiée>\|<mock changé>" src --include=*.test.ts` sur TOUTE l'arbo `src` (pas seulement `src/__tests__`), OU lancer le glob du répertoire concerné (`jest src/socketio src/__tests__/unit/handlers`).** Meeshy a DEUX conventions de placement de tests (`src/__tests__/**` centralisé ET `src/**/__tests__/**` colocalisé) — toujours vérifier les deux.
## 2026-07-02 — E2E d'appels pilotés par simulateurs (chaos-tests prod)

53. **Deux simulateurs pilotés par idb suffisent pour des E2E d'appels WebRTC complets contre la prod** — mais cinq pièges : (a) `idb ui tap` prend des POINTS (écran/3 en 3x), pas des pixels de screenshot ; (b) le keychain simulateur SURVIT à la désinstallation de l'app — `xcrun simctl keychain <UDID> reset` sinon la session du compte précédent se restaure silencieusement et on appelle le mauvais compte (vérifier l'identité via l'avatar « Moi »/liste avant d'appeler, le TITRE de conversation est fixe des deux côtés et ne prouve rien) ; (c) les popups premier lancement (notifications, Save Password) volent les frappes idb — les dismiss AVANT toute saisie ; (d) `simctl spawn <UDID> log collect` produit des archives VIDES — utiliser `simctl spawn <UDID> log show --last Xm --predicate 'subsystem == "me.meeshy.app" AND category == "calls"'` (post-hoc, fiable) ; (e) les agents parallèles qui lancent xctest sur le simulateur standard RELANCENT l'app et tuent l'appel E2E en cours — créer des simulateurs dédiés (`simctl create`) pour tout E2E long.

54. **Chaos-engineering d'appels : les bugs sont dans les erreurs « transitoires » traitées comme fatales et les intentions locales jamais matérialisées côté serveur.** Trois espèces trouvées le même jour : call:error TARGET_NOT_FOUND (relay vers un pair momentanément sans socket) qui tuait un appel au média sain ; un teardown local (failCall) qui n'émettait jamais call:end → pair zombie ~48s jusqu'à ses watchdogs ; des grâces serveur à durée fixe que le backoff socket.io dépasse légitimement (étendre si le user garde UN socket vivant, room user:<id>). Règle : côté client, seule une décision serveur explicite (call:ended/missed) ou un échec média constaté (watchdogs) peut tuer un appel établi ; côté serveur, ne jamais conclure « parti » sur la seule absence d'un socket si un autre socket du même user vit.

## 2026-07-02 — Itération 83 : F48 soldé — hooks edit/delete des stats de conversation rendus atomiques

55. **`ConversationMessageStatsService.onMessageEdited`/`onMessageDeleted` écrivaient leurs compteurs scalaires en VALEUR ABSOLUE dérivée d'une lecture (`Math.max(0, existing.totalWords ± diff)`), alors que `onNewMessage` — le hook soeur — écrivait DÉJÀ les mêmes champs en atomique `{ increment }`.** Même famille lost-update que #50 (réactions), #51 (affiliation/curseur), PR #1362 : deux `message:edited`/`message:deleted` concurrents lisent le même `existing` puis le second `update` écrase le premier → les totaux (`totalMessages`, `totalWords`, `totalCharacters`, `textMessages`, compteurs de pièces jointes) dérivent silencieusement à la baisse sur une conversation active. Le fix atomique de `onNewMessage` n'avait jamais été propagé aux deux hooks soeurs (motif « fix appliqué à UN sibling, pas audité sur tous » — #40/#42/#45/#50). **Fix : `{ increment: wordDiff }` (Prisma accepte un increment négatif) pour edit, `{ decrement: n }` pour delete, sur tous les scalaires.** **Arbitrage clé : le plancher `Math.max(0, …)` est ABANDONNÉ au niveau du write DB** — un increment/decrement atomique MongoDB ne peut pas clamper dans la même op ; identique au choix #50 (correctness sous concurrence > garde défensive sur valeur dénormalisée). Justifié car (a) une op équilibrée create↔delete ne descend jamais sous 0, (b) les champs JSON `participantStats`/`dailyActivity`/… GARDENT leur clamp (ils restent en read-modify-write non atomique, corrigé par `recompute()` périodique — commentaire doctrine l.84 mis à jour), (c) toute dérive scalaire résiduelle est corrigée par le même `recompute()`. Tests : suite service réécrite pour attendre les opérateurs atomiques + 2 régressions lost-update (2 edits concurrents → 2 increments indépendants ; delete → decrement indépendant de la lecture) ; 61/61 + MessageHandler 420 + stats 277 verts. **Règle réaffirmée : quand un service a plusieurs hooks écrivant le MÊME champ dénormalisé (create/edit/delete), ils doivent TOUS utiliser le même idiome d'écriture atomique — un seul hook en RMW absolu suffit à réintroduire le lost-update sur le champ partagé.**

## Leçon 53 — Boucle parallèle : le même item de backlog peut être fixé par deux agents en même temps (2026-07-02)
P7-11 (ConversationLockManager au logout) : pendant mon itération TDD, un agent parallèle a poussé le MÊME fix (5aef1abb2) — nos implémentations ont convergé à l'identique (pattern canonique wireAuthLogoutHook + réutilisation removeAllLocks/forceRemoveMasterPin). Le `git pull --rebase --autostash` a absorbé mes hunks devenus vides sans conflit ; seul le todo restait à committer. À FAIRE systématiquement : (1) `git log --oneline -- <fichier>` juste AVANT d'implémenter un item du backlog partagé (pas seulement au début de l'itération) ; (2) après tout rebase, `git log --grep=<item>` pour détecter la convergence — un commit au titre différent peut porter le même contenu ; (3) mes tests RED→GREEN restent utiles même en cas de convergence : ils VALIDENT le code de l'autre agent (leçon build-for-testing ≠ exécuter). Le rebase gère bien la convergence exacte ; le danger réel serait deux implémentations DIVERGENTES du même item — d'où l'importance du pattern canonique documenté (le todo décrivait le fix précis, les deux agents l'ont suivi).

## Leçon 54 — Toute transition TERMINALE d'un appel doit relâcher la claim `Conversation.activeCallId` AU PLUS PRÈS de l'écriture gagnante (2026-07-02)
Bug prod reproduit EN LIVE pendant la validation device (item J) : le ringing-timeout handler gagne l'`updateMany` atomique `[initiated,ringing] → missed`, puis délègue le cleanup à `handleMissedCall → markCallAsMissed` — dont le guard non-ringing early-return AVANT `releaseActiveCallClaim`. La claim reste pointée sur l'appel missed → TOUS les `call:initiate` suivants de la conversation sont rejetés `CALL_ALREADY_ACTIVE` (« lost race to claim »). Observé : une conversation bloquée ~5 min, une autre bloquée 12 HEURES (missed du matin). Triple enseignement : (1) **une claim/lock dénormalisée doit être relâchée dans le MÊME chemin que l'écriture d'état gagnante**, pas déléguée à un chemin qui peut early-return (le guard « déjà missed » raisonnait sur le statut, pas sur le cleanup) ; (2) **un early-return de garde doit exécuter les cleanups idempotents avant de retourner** (clearHeartbeats/clearRingingTimeout/release — jamais pour un statut ACTIF qui détient légitimement la claim) ; (3) **le commentaire promettait un self-heal (« the claim self-heals the next time... ») qui n'existait PAS dans le code** — leçon 'source-guards : lire le code, pas les commentaires' appliquée aux invariants de conception : le self-heal a été implémenté pour de vrai (compare-and-swap depuis un holder terminal, atomique, jamais de clobber d'une claim saine). Diag express : `db.Conversation.find({activeCallId: {$ne: null}})` croisé avec le statut du holder — tout holder terminal = claim fuitée. Fix : b02de2eee.

## Leçon 56 — Helper de polling à fallback : re-vérifier l'état attendu sur le retour, sinon le test « passe » sans prouver (2026-07-03)
`MessageStoreObservationHelper.awaitRecord` retourne le DERNIER record fetché quand le timeout expire, même si le prédicat n'a JAMAIS matché (design voulu pour « asserter sur l'état final »). Conséquence : un test qui fait `let x = await awaitRecord(...) { predicate }` puis seulement `XCTAssertNotNil(x)` + des assertions faibles PASSE alors que le comportement testé n'existe pas — mon test RED « remplacement de réaction » est passé faussement vert (1s pile = timeout brûlé, l'indice), failli me faire conclure « pas de bug » sur un bug réel. RÈGLE : avec tout helper await-avec-fallback, RE-ASSERTER explicitement le prédicat sur la valeur retournée (`XCTAssertEqual(mine, ["thumbsup"])`), jamais juste non-nil. Indice de détection : durée du test == timeout du helper. Corollaire process : sur worktree partagé, un agent parallèle peut committer TES fichiers en cours (add trop large de son côté) — vérifier `git show --stat` des DEUX derniers commits après chaque commit, pas seulement le sien.

## Leçon 55 — `VoiceProfileService.calibrateProfile` : 4e sibling non audité du même lost-update (2026-07-02, itération 84)
Continuité directe du thème #40/#42/#45/#50/#51/#55 (« fix appliqué à UN service, jamais propagé aux siblings structurellement identiques »). `calibrateProfile` lit `voiceModel` (audioCount/totalDurationMs/version) AVANT deux `await` séquentiels — `resolveAudioInput` puis `waitForZmqResponse` (round-trip ZMQ vers le translator pour l'analyse audio, potentiellement plusieurs secondes) — puis écrit `voiceModel.audioCount + 1` etc. calculé en JS. Deux calibrations concurrentes pour le même `userId` (ajout rapide de 2 échantillons audio en onboarding, ou un retry client après timeout apparent pendant que la requête originale est encore en vol) lisent le même snapshot pré-await ; la seconde écriture écrase l'incrément de la première (perte silencieuse, aucune erreur retournée). Fix : mirror exact de l'idiome déjà établi — `audioCount`/`totalDurationMs`/`version` passent en opérateurs Prisma atomiques (`{ increment }`), le seul cas gardant une valeur absolue est le reset explicite `replaceExisting` (action utilisateur volontaire, pas un compteur). **Aucun garde-fou par version (OCC) nécessaire ici** contrairement à `lastMessageAt` (leçon #51/pattern B) : ces trois champs sont de purs compteurs, un `{increment}` atomique MongoDB reste correct quel que soit l'ordre d'arrivée des écritures concurrentes — pas besoin de détecter/rejeter un conflit puisqu'il n'y a rien à rejeter. Piège de test découvert en écrivant le repro : le mock global `crypto.randomUUID` renvoyait la MÊME constante pour tout le fichier de test → deux appels concurrents collisionnaient sur la même clé dans `pendingRequests` (Map interne), un artefact de mock sans rapport avec le vrai bug (en prod `randomUUID()` est unique). Fix du mock : `jest.fn()` avec `mockImplementationOnce` par test au lieu d'une constante figée, pour que les request IDs concurrents restent distincts comme en production. Tests : 1 nouveau (repro concurrence + assertion sur la forme `{increment}`) + 2 tests existants réécrits pour attendre les opérateurs atomiques (mêmes assertions `toHaveBeenCalledWith` mais valeur littérale → objet `{increment}`) ; 78/78 VoiceProfileService verts, 120 suites `services/` vertes (4449 tests). **Règle réaffirmée : avant de considérer un audit de concurrence "couvert", grep `voiceModel\.\w+ +\|user\.\w+ +\|existing\.\w+ +` (accès `.champ +` sur un objet lu avant un `await`) dans TOUS les services qui font lecture→await(réseau/ZMQ)→écriture — le prochain candidat n'est jamais loin du dernier trouvé.**

## Leçon 56 — F47 : increment atomique ≠ cap atomique (TOCTOU de dépassement de quota) (2026-07-02, itération 85)
Continuité #50→#55 (« fix appliqué à UNE face du problème, pas à toutes »). La leçon #51 avait rendu `AffiliateTrackingService.convertAffiliateVisit` **atomique en increment** (`currentUses: { increment: 1 }` au lieu de `currentUses + 1` en JS) — fermant la **perte** d'increment (compteur trop bas). Mais l'increment restait **inconditionnel** : le cap `maxUses` était vérifié séparément par un garde `if (currentUses >= maxUses) return` sur la valeur **lue**. Entre cette lecture et l'increment, N inscriptions concurrentes portant le même token franchissent toutes le garde puis incrémentent toutes → `currentUses` **dépasse** `maxUses` (compteur trop haut). **Deux faces d'une même absence d'atomicité check+write** : l'increment atomique corrige la perte, PAS le dépassement. Fix canonique : **réservation de slot conditionnelle** — `updateMany({ where: { id, currentUses: { lt: maxUses } }, data: { currentUses: { increment: 1 } } })` puis `if (reservation.count === 0) return 'cap atteint'`, effectuée **avant** la création de la relation. MongoDB sérialise les updateMany sur un même document : seuls `maxUses - currentUses` matchent, les perdants renvoient `count 0`. Subtilités : (1) garde `>= maxUses` conservé en **fast-path** (évite findFirst+updateMany quand manifestement épuisé + erreur précise) ; (2) réservation **avant** create → si create échoue, un slot est consommé sans relation = direction **sûre** (sous-attribue, jamais au-delà du cap) ; (3) `existingRelation` reste **avant** la réservation (idempotence : un retry du même user ne consomme pas un second slot) ; (4) `maxUses` falsy (null/0) → pas de condition = increment inconditionnel, identique à la sémantique `maxUses &&` du garde existant. **Règle : quand un compteur atomique est aussi borné par un cap, l'increment atomique NE SUFFIT PAS — le cap doit être dans le `where` du même update (`{ increment }` + `{ field: { lt: cap } }`), sinon le check-then-increment laisse fuir le dépassement.** Tests : mock `updateMany` ajouté, assertions `update`→`updateMany`, +2 cas (réservation cap-guardée `where currentUses < maxUses` ; perte de course `count 0` → aucune relation) ; 34/34 service + 21/21 routes verts.
## Leçon 55 — Un statut TERMINAL d'appel est immuable + les migrations Mongo doivent viser la collection PRISMA réelle (2026-07-03)
Sonde prod : un appel résolu `missed` par le ringing timeout a été réécrit `ended/completed/89s` + 2e summary posté quand le socket du caller a lâché ensuite. Trois trous complémentaires : (1) l'écriture terminale du timeout n'incrémentait pas `version` → tous les version-guards des écrivains terminaux (leaveCall/endCall/idempotent-leave) étaient inopérants contre elle — **règle : TOUTE écriture terminale bump `version`** ; (2) les guards du disconnect (armement l.2893 + expiration l.392) ne couvraient QUE `'ended'` — **règle : tout guard de terminalité utilise la liste complète** (`CALL_TERMINAL_STATUSES` dans @meeshy/shared/types/video-call, ajoutée comme constante runtime — les suites gateway mockent le module CallService, donc une constante partagée doit vivre dans un module NON mocké ; 2 suites mockent AUSSI @meeshy/shared/types/video-call → ajouter la constante à leur factory) ; (3) `leaveCall` recomputait l'issue depuis un statut lu qui pouvait être terminal (`missed` ∉ pre-answer → « completed ») — **règle : un leave sur appel terminal ne touche QUE le leftAt du participant**. BONUS CRITIQUE découvert en validant : l'index unique partiel `(conversationId, clientMessageId)` ciblait `db.messages` — collection VIDE ; le model Prisma `Message` n'a pas de `@@map` → la vraie collection est `db.Message` (majuscule). L'index n'a JAMAIS existé → dédup P2002 (summaries + offline-queue) inopérante → 33 paires de doublons en prod (dédupliquées, index créé, sonde E11000 ✓). **Règle : après toute migration Mongo manuelle, VÉRIFIER l'effet sur la collection réelle (`db.<Collection>.getIndexes()`), et tester la contrainte par une insertion-sonde.** Fix : c00076e6f.

## Leçon 54 — pbxproj stale : tout nouveau .swift APP casse le build local jusqu'au commit du pbxproj (2026-07-03)
Piège récurrent (SyncEngine A5.3/A5.4) : dès qu'un nouveau fichier .swift est ajouté sous apps/ios/Meeshy/, `meeshy.sh build` et `xcodebuild` échouent en local avec « cannot find 'X' in scope » sur TOUS ses call sites (+ souvent un « unable to type-check this expression in reasonable time » en cascade sur un gros body voisin comme ConversationListView:583). Cause : le projet est XcodeGen ; le pbxproj committé est un artefact qui ne globe PAS automatiquement — CI lance `xcodegen generate` mais pas meeshy.sh/xcodebuild. Et comme on `git checkout` le churn pbxproj après chaque commit (règle worktree partagé), le fichier reste hors du pbxproj committé À VIE tant qu'on n'a pas régénéré. Conséquence : l'itération SUIVANTE qui touche ce fichier re-casse le build local au premier essai. PROCÉDURE : (1) nouveau .swift APP → `cd apps/ios && xcodegen generate` AVANT le build, TOUJOURS, même si le fichier a été créé une itération précédente ; (2) après build/test vert, `git checkout -- apps/ios/Meeshy.xcodeproj/project.pbxproj apps/ios/Package.resolved` avant de committer (ne jamais committer le churn) ; (3) les fichiers SDK (packages/MeeshySDK/) NE sont PAS concernés — SPM globe, aucun xcodegen requis. Un « TEST BUILD FAILED » avec « cannot find <NouveauType> » n'est JAMAIS un bug de code : c'est le pbxproj stale — régénérer, ne pas déboguer le type.

## Leçon 56 — Un compteur de rate-limit sécurité doit être CONSOMMÉ atomiquement (check-then-act ≠ increment atomique) (2026-07-03, itération 85)
Continuité de la classe F47 (« le cap peut être dépassé bien que l'increment soit atomique »). `PhonePasswordResetService.verifyCode`/`verifyIdentity` incrémentaient DÉJÀ leurs compteurs de tentatives en atomique (`update({ codeAttempts: { increment: 1 } })`) — le lost-update pur était donc absent — mais la VÉRIFICATION du plafond (`if (token.codeAttempts >= MAX)`) lisait la valeur du `findUnique` (snapshot début de handler), décorrélée de l'increment qui suivait. C'est un **TOCTOU (check-then-act)** : N requêtes concurrentes sur le même `tokenId` lisent toutes `codeAttempts = k`, passent toutes le garde `< MAX`, tentent chacune un code SMS à 6 chiffres différent, puis incrémentent → le plafond de 5 tentatives ne borne plus le nombre RÉEL de codes essayés (amplification de brute-force sur la surface de récupération de compte). **Un compteur atomique ne suffit pas ; c'est la SÉQUENCE check→act qui doit être atomique.** Fix canonique (idiome lesson #51 pattern B / `AffiliateTrackingService`) : **consume atomique conditionnel** — `updateMany({ where: { id, codeAttempts: { lt: MAX } }, data: { codeAttempts: { increment: 1 } } })` placé AVANT la vérification du code ; MongoDB évalue le filtre `$lt` + applique `$inc` en une écriture atomique par document, donc **au plus MAX consommations réussissent** sous concurrence. `consumed.count === 0` ⟹ plafond atteint ⟹ revoke + block. La branche d'échec (code invalide / mismatch) ne ré-incrémente plus (tentative déjà comptée). Arbitrage assumé identique à #50/#55 : le consume compte AUSSI une tentative réussie, sans effet observable car le compteur n'est plus jamais relu après transition d'étape / `usedAt` (une re-tentative échoue sur le garde d'étape). `attemptsRemaining` conserve la formule `MAX - token.<attempts> - 1` (valeur pré-lecture). Tests : 2 régressions concurrence (consume conditionnel `updateMany` code ET identité, `count===0` ⟹ block) + adaptation des tests de plafond (piloter `updateMany → { count: 0 }`) ; 66/66 `PhonePasswordResetService` + 138 (`password-reset`+`AuthService`) verts. **Règle : tout garde de plafond sur un compteur de sécurité (rate-limit, tentatives, quota) DOIT être un consume atomique conditionnel (`updateMany where < MAX` + `count`), jamais un `if (read >= MAX)` suivi d'un increment séparé — même quand l'increment lui-même est atomique. Prochain candidat même classe : F47 `AffiliateTrackingService.convertAffiliateVisit` (cap `maxUses`).**
## Leçon 56 — La règle de visibilité FRIENDS n'était pas appliquée uniformément dans PostFeedService (2026-07-03, itération 85)
Même famille que #40/#42/#45/#50/#55 (« règle/fix appliqué à un sous-ensemble de siblings, jamais audité sur TOUS »), cette fois sur la **visibilité** (autorisation) et non un compteur. `PostFeedService` a une SSOT `buildVisibilityFilter(viewerId, contactIds, communityCoMemberIds)` que `getStories`/`getStatuses`/`getReels` utilisent tous. Mais **`getFeed`** (le home feed classé, surface sociale la plus chaude) utilisait un filtre plat `visibility: { in: ['PUBLIC','FRIENDS'] }` **sans aucune garde auteur/ami** — `friendIds` n'était récupéré qu'APRÈS la requête, pour le scoring uniquement → **tout post FRIENDS de n'importe qui était servi à n'importe quel viewer** (fuite de confidentialité). Et **`getUserPosts`** hard-codait `visibility = 'PUBLIC'` pour tout non-auteur → un **ami** ne voyait jamais les posts FRIENDS de l'auteur sur son profil (sous-diffusion, bug miroir). Fix : les deux passent par `buildVisibilityFilter` (contacts = amis ∪ partenaires DM, comme les siblings), composé sous `AND` avec l'expiry + le curseur ; `getUserPosts` garde `anonyme → PUBLIC` et `self → aucun filtre`. `getFeed` conserve `friendIds` (amis acceptés seulement, distinct des contacts) pour `affinityScore` — la garde de visibilité et le scoring ont des besoins différents (contacts vs amis), les DEUX doivent être satisfaits, pas confondus. Vérification : ces bugs se prouvent **purement en asserttant la forme de la clause `where`** émise (le mock Prisma ne filtre pas — c'est la stratégie déjà documentée en tête de `PostFeedService.visibility.test.ts` : « A mocked Prisma client cannot reproduce the query-engine behaviour, so we assert the query SHAPE instead »). Aucune MongoDB live requise. Tests : `PostFeedService.visibility` 2→7 (3 RED neufs : getFeed gate FRIENDS + sert PUBLIC/own/COMMUNITY, getUserPosts ami voit FRIENDS ; 2 conservés : anonyme→PUBLIC, self→tout) ; 220/220 suites posts-feed vertes. **Règle : un audit de "cohérence de règle métier" (visibilité, ACL, rate-limit, quota) doit énumérer TOUTES les méthodes d'un service qui appliquent la règle et vérifier qu'elles délèguent à la même SSOT — la méthode la plus chaude (`getFeed` ici) est souvent celle qui a divergé, parce qu'elle a été écrite/optimisée en premier, avant l'extraction du helper partagé.**
## 2026-07-02 — Itération 84 : F47 soldé — cap TOCTOU du token d'affiliation (réservation atomique)

56. **Un increment atomique (`{ increment: 1 }`) protège le *comptage* mais PAS la *borne* — un cap `maxUses` gardé par un check-then-act reste un TOCTOU même après le fix lost-update.** `AffiliateTrackingService.convertAffiliateVisit` avait été rendu atomique iter 82 (lesson #51) sur le compteur, mais le pré-check `if (maxUses && currentUses >= maxUses)` et l'increment restaient **découplés** : quand `currentUses === maxUses - 1`, deux conversions concurrentes lisent la même valeur, franchissent toutes deux le check, créent chacune une relation puis incrémentent → `currentUses` finit à `maxUses + 1`, dépassant le cap (résidu F47 explicitement reporté iter 82). **Fix canonique = réservation atomique AVANT matérialisation** : pour un token cappé, `updateMany({ where: { id, currentUses: { lt: maxUses } }, data: { currentUses: { increment: 1 } } })` — la clause conditionnelle + increment est sérialisée côté DB, donc au plus `maxUses` réservations réussissent ; `count === 0` ⇒ cap atteint dans la fenêtre de course → rejet AVANT toute création (donc **pas de rollback** — reserve-then-commit, pas create-then-rollback). Token illimité (`maxUses == null`) : `update` inconditionnel inchangé. Le pré-check est conservé comme fast-path bon marché mais la réservation conditionnelle est l'autorité. **Arbitrage assumé : slot fantôme si `create` échoue après réservation (chemin DB rare) — strictement moins nuisible qu'un dépassement de cap, et évite un delete sur le chemin race-loser chaud.** **Règle : tout enforcement de cap/quota/borne sous concurrence doit se faire par écriture conditionnelle (`updateMany where value < limit`), JAMAIS par `read → check en JS → write` ; un increment atomique ne suffit pas si la borne est vérifiée séparément.** Tests : mock `updateMany` ({count:1} défaut) + 3 régressions (réservation cappée atomique avant relation, rejet race-loser `count===0` sans relation ni friend-request, chemin illimité utilise `update` jamais `updateMany`) ; 35/35 service + 25/25 routes affiliate/devices verts. Clôt le dernier résidu « intégrité de compteur/cap » de la famille lost-update (iter 79→83).

## Leçon 58 — F49 soldé : `ConversationStatsService.updateOnNewMessage` perdait un increment sous course (2026-07-03, itération 87)

Dernier résidu explicitement reporté à l'issue de l'itération 82 (« F48/F49 »), continuité de la famille #40/#42/#45/#50/#51/#55/#56/#57 (« read-then-write partagé sans garde de concurrence »), cette fois sur un cache **en mémoire** plutôt qu'une écriture DB. `updateOnNewMessage` (appelé sur CHAQUE `message:new`, via `MessageHandler.ts`, `ConversationHandler.ts` ET `MessagingService.ts` — donc plusieurs entrées concurrentes possibles pour la même conversation) lit `this.cache.get(conversationId)` de façon synchrone, incrémente `messagesPerLanguage[lang]` sur une COPIE, puis `await this.computeOnlineUsers(...)` avant d'écrire `this.cache.set(...)`. Le point `await` — même quand `computeOnlineUsers` retourne quasi immédiatement (`connectedUserIds.length === 0 → return []`) — suffit à céder la main au microtask suivant : deux messages de la même langue arrivant dans la même milliseconde pour la même conversation (chat de groupe actif) lisent tous deux le MÊME compteur de base, incrémentent chacun leur copie de +1, et le second `cache.set` écrase le premier → un des deux messages n'est jamais compté dans les stats affichées (aucune erreur, dérive silencieuse). Repro déterministe SANS fake timers ni promesses contrôlées manuellement : `Promise.all([updateOnNewMessage(...), updateOnNewMessage(...)])` suffit, l'ordonnancement microtask de V8 garantit l'interleaving. **Fix : sérialisation par clé (conversationId) via une chaîne de promesses auto-nettoyante** (`withConversationLock`), PAS l'idiome `{increment}` atomique Prisma des sièges précédents — il n'y a pas de DB ici, juste une `Map` en mémoire partagée entre callers concurrents du même process. Design : `Map<string, Promise<void>>` où chaque appel chaîne son `fn` après la précédente entrée pour la même clé (`previous.then(fn, fn)` — poursuit même si la précédente a rejeté, pour ne jamais bloquer une conversation à cause d'un échec passé) ; l'entrée est supprimée de la map dès que sa chaîne se vide (comparaison de référence `updateLocks.get(key) === settled` avant delete), donc la map reste bornée par la concurrence RÉELLE (conversations avec une écriture en vol), pas par le nombre total de conversations vues par le process — évite de réintroduire le pattern de fuite mémoire #42/#45/#46 en résolvant celui-ci. **Alternative rejetée : verrou global (une seule chaîne pour TOUT le service)** — aurait sérialisé les mises à jour de conversations sans rapport entre elles, dégradant le débit d'un gateway multi-conversations pour un problème qui n'existe qu'INTRA-conversation. Test RED→GREEN : `Promise.all` de deux `updateOnNewMessage` sur la même conversation, assertion sur le compteur final (12, pas 11) via un `getOrCompute` de suivi qui sert le cache encore valide. 59/59 `ConversationStatsService*.test.ts` verts + 601/601 tests verts sur les 7 suites appelantes (`MessageHandler`, `ConversationHandler`, `MeeshySocketIOManager`) — aucune régression. **Résidu HORS PÉRIMÈTRE découvert en marge (pas ce cycle) : `src/__tests__/unit/services/MessagingService.test.ts` échoue à charger dans cette sandbox (`SequenceService.ts` importe `PrismaClient` depuis `'@prisma/client'` au lieu de `'@meeshy/shared/prisma/client'` — TS2305) ; confirmé PRÉEXISTANT (même échec sur `git stash`, sans mon diff) — pas causé par ce fix, laissé pour un audit d'imports Prisma dédié.**

## Leçon 57 — `routes/messages.ts` DELETE REST était le seul sibling du cursor `lastMessageAt` encore non guardé (2026-07-03, itération 86)

Continuité directe de #51/#55 (« fix appliqué à UN chemin, jamais audité sur le sibling REST vs socket »). `MessageHandler.handleMessageDelete` (socket, `socketio/handlers/MessageHandler.ts:744-752`) avait déjà l'optimistic-concurrency guard sur `conversation.lastMessageAt` (lesson #51/pattern B : `updateMany({ where: { id, lastMessageAt: <valeur lue au début> } })`), mais **`routes/messages.ts` DELETE `/messages/:messageId`** (endpoint REST, ligne 434) faisait toujours un `conversation.update` inconditionnel keyé sur `id` seul — le message est déjà fetché avec `include: { conversation: {...} }` donc `message.conversation.lastMessageAt` était disponible mais jamais utilisé comme garde. **Scénario de course concret** : suppression REST d'un vieux message pendant qu'un nouveau message arrive dans la même conversation (chat de groupe actif, chemin très fréquent) — (1) la lecture `lastNonDeletedMessage` du delete capture l'ancien dernier message ; (2) le nouveau message avance `conversation.lastMessageAt` en parallèle ; (3) le `conversation.update` du delete écrase inconditionnellement `lastMessageAt` en arrière, faisant régresser le curseur au-delà d'un message qui existe toujours — corrompt le tri de la liste de conversations et la pagination par curseur (`routes/conversations/core.ts` `lastMessageAt: { lt: cursor }`). Fix : mirror exact de l'idiome déjà établi côté socket — `conversation.update` → `conversation.updateMany({ where: { id, lastMessageAt: message.conversation.lastMessageAt }, data: {...} })`. Tests : 2 nouveaux dans `messages.test.ts` (guard `updateMany` avec la bonne clause `where`, jamais `update` ; fallback sur `conversation.createdAt` quand tout le fil est supprimé) + mise à jour du mock `conversation` (ajout `lastMessageAt` + `updateMany`) dans `messages.test.ts` ET `messages-extended.test.ts` (2e fichier de test qui monte la même route — un mock Prisma incomplet fait échouer silencieusement TOUT test DELETE existant avec `updateMany is not a function`, pas seulement le nouveau test). **Règle réaffirmée : quand un chemin socket ET REST exposent la même opération d'écriture (delete/edit d'un message), auditer les DEUX — le REST est souvent le jumeau oublié parce que le socket est le chemin optimisé/testé en premier.** Suite gateway (Bun, `--ignore-scripts`, cette sandbox n'a pas de toolchain grpc-tools) : `messages.test.ts` 31/31, `messages-extended.test.ts` 17/17, aucune régression trouvée sur les suites `routes/` restantes (un crash runtime bun sans rapport — `panic: unsupported uv function: uv_async_init` sur `admin-anonymous-users.test.ts` — a interrompu le balayage complet ; isolé et non lié à ce diff, hors périmètre de ce cycle).

## Leçon 58 — Route sans schema de réponse strict = fuite de champs Prisma bruts (2026-07-03, routine calling-feature)

`GET /conversations/:conversationId/active-call` (`services/gateway/src/routes/calls.ts`) contournait un
bug connu `fast-json-stringify` (`oneOf: [schema, {type:'null'}]` crashe quand la valeur est `null`) en
supprimant TOUT schema sur `data` (`additionalProperties: true`) au lieu de corriger la vraie cause. Effet
de bord non anticipé : les 5 routes soeurs (`callSessionSchema` en whitelist stricte) filtrent déjà tout
champ non déclaré côté serializer Fastify, mais celle-ci sérialisait le document Prisma brut — quand un
nouveau champ privé (`CallParticipant.analytics`, télémétrie WebRTC) a été ajouté au schema Prisma des
mois plus tard, il a fuité silencieusement vers n'importe quel membre de la conversation (authz =
membership, pas participation à CET appel précis) sans qu'aucun diff ne touche cette route. **Règle : un
contournement de bug de sérialisation qui désactive le filtrage de champs (`additionalProperties: true`,
schema absent sur une branche `oneOf`) est une dette de sécurité latente — elle ne fuite rien AU MOMENT du
contournement, mais fuite automatiquement le prochain champ sensible ajouté ailleurs dans le modèle, sans
qu'aucun reviewer ne relise cette route.** Fix correct pour `oneOf`+`null` : `nullable: true` directement
sur le schema objet (pas de `oneOf`) — évite le bug fast-json-stringify tout en gardant le filtrage.
Vérifié par script Node autonome sur `fast-json-stringify` avant d'écrire le test Jest (plus rapide que
d'itérer sur un test complet pour valider le comportement d'une lib de sérialisation).

**Piège de test associé** : un test qui boote un VRAI Fastify + `.inject()` (nécessaire ici — les tests
existants du fichier, `calls-routes.test.ts`, mockent `sendSuccess` ET
`@meeshy/shared/types/api-schemas` en stubs `{type:'object'}`, donc ne peuvent PAS attraper un bug de
sérialisation) exige que CHAQUE mock de hook `preValidation`/`onRequest` soit une vraie fonction
`async (request) => {...}`, jamais un `jest.fn()` nu à 0 argument — sous dispatch Fastify réel (pas
l'extraction-et-appel-direct des tests `getRoute`), un stub nu fait `.inject()` **hang indéfiniment**
(pas d'erreur, pas de timeout explicite avant celui de Jest) sans qu'aucun mock en aval (prisma, service)
ne soit jamais invoqué — symptôme distinctif à chercher en premier sur tout futur test `.inject()`-based.

## Leçon 60 — F52 soldé : `triggerStoryTextTranslation` (caption) n'excluait pas la langue source, contrairement à son sibling `triggerStoryTextObjectTranslation` (2026-07-04, itération 90)

Résidu explicitement reporté à l'issue de l'itération 89 (« F52 »), même famille sibling-drift que
#40/#42/#45/#50/#55/#56/#57/#59 (« garde/règle appliquée à UNE méthode mais pas à son sibling
structurellement identique »). `PostService` a deux pipelines de traduction de story qui partagent
`resolveAudienceTargetLanguages(authorId)` : le pipeline `textObjects` (overlays,
`triggerStoryTextObjectTranslation`) filtre déjà `allTargetLanguages.filter(l => l !== sourceLanguage)`
avant d'envoyer le job ZMQ ; le pipeline `content` (légende, `triggerStoryTextTranslation`) ne le
faisait PAS — il passait la liste d'audience brute (source incluse) à
`zmqClient.translateToMultipleLanguages`. Conséquence concrète : un auteur francophone dont l'audience
inclut au moins un contact `systemLanguage: 'fr'` déclenchait un aller-retour NLLB `fr→fr` sur CHAQUE
story avec légende, et le handler de résultat (`$runCommandRaw` sur `translations.fr`) écrasait le champ
avec une **paraphrase** de la légende originale au lieu de la laisser intacte — violation directe de la
règle Prisme « le contenu déjà dans la langue préférée du viewer doit rester l'original, jamais une
resucée machine ». Fix : recalculer `sourceLanguage` AVANT de résoudre l'audience (au lieu d'après), puis
filtrer `allTargetLanguages.filter(l => l !== sourceLanguage)` — mirror exact du sibling, mêmes noms de
variables (`allTargetLanguages` / `targetLanguages`) pour que la divergence future soit visuellement
évidente en diff. Aucune signature changée, zéro requête supplémentaire, comportement inchangé pour toute
audience ne partageant pas la langue source. Tests : nouveau fichier
`PostService.storyCaptionSourceFilter.test.ts` (3 cas : filtre appliqué, plus aucun call ZMQ quand
l'audience entière == source, comportement inchangé quand aucune langue cible ne matche) — RED prouvé
(le mock capture `targetLanguages: ['fr','es']` non filtré avant le fix), GREEN après. Suites
`posts|Post` : 1128/1128 tests verts (51/52 suites ; le seul échec, `core.story-translation.test.ts`,
est un TS2305 préexistant sur `SequenceService.ts` important `PrismaClient` depuis `'@prisma/client'` —
confirmé identique sur `git stash`, même classe que le résidu documenté Leçon 58/itération 87). **Piège
de test à noter : `triggerStoryTextTranslation` enregistre un listener ZMQ (`zmqClient.on`/`.off`) et un
`setTimeout(60_000)` de cleanup — contrairement à son sibling fire-and-forget
`triggerStoryTextObjectTranslation`, le mock `ZMQSingleton.getInstanceSync` doit donc fournir `on`/`off`
(sinon l'appel jette et le test observe silencieusement 0 call — pas une erreur explicite), et le test
doit activer `jest.useFakeTimers()` pour ne pas laisser un timer réel de 60s ouvert après la fin du test
(sinon Jest force-exit après un délai, `--detectOpenHandles` visible dans les logs CI).**

## Leçon 61 — F51 soldé : suppression du sender FCM mort `FirebaseNotificationService`, supplanté par `PushNotificationService` (2026-07-04, itération 92)

Report explicite parké 5 itérations (87→91). Le gateway hébergeait **deux** implémentations d'envoi
de push FCM : la vivante `services/PushNotificationService.ts` (909 l., multicast `sendEachForMulticast`
+ APNs + routing d'env, instanciée dans `MeeshySocketIOManager` et injectée via
`setPushNotificationService()`, faisant l'objet du commit HEAD `6cd1a3c4`) et la morte
`services/notifications/FirebaseNotificationService.ts` (242 l., ancien sender minimal). Preuve de mort :
`grep "new FirebaseNotificationService"` hors tests = 0 ; seuls référents = ré-export `index.ts` + son
test unitaire dédié + une assertion de ré-export dans `NotificationService.uncovered-paths.test.ts`.
Retiré : la classe, son test unitaire (492 l.), la ré-export, l'assertion, et `FILES.txt` (cruft
machine-spécifique `/Users/smpceo/…` référençant un module fantôme `NotificationServiceExtensions.ts`).
**Piège évité : `notifications-firebase.test.ts` (770 l.) NE teste PAS la classe morte** — il monte le
chemin VIVANT `NotificationService`/APNs et ne référence jamais `FirebaseNotificationService` ; il est
donc CONSERVÉ. Toujours vérifier le SUJET réel d'un test « firebase » avant de le supprimer avec la
classe : ici l'homonymie de nom (`FirebaseNotificationService.test.ts` = mort vs `notifications-firebase.test.ts`
= vivant) est un piège de suppression.

Docs de dossier (`README/SUMMARY/ARCHITECTURE/MIGRATION.md`) = instantané historique périmé décrivant
une **composition** `FirebaseNotificationService` qui n'existe plus (le réel est INJECTÉ, pas composé) +
un module `NotificationServiceExtensions.ts` inexistant. Choix : bannière « obsolète » bornée pointant
vers `PushNotificationService`, PAS de réécriture complète (dette pré-existante orthogonale, reportée
F51b). **Règle : supprimer une classe référencée par des docs impose au minimum de neutraliser les
références pendantes (sinon la doc pointe un fichier supprimé = pire dette) — mais ne pas se laisser
entraîner dans une réécriture doc complète non bornée pour un cycle de suppression de code mort.**

**Gotcha d'environnement de validation (sandbox) réutilisable** : le schema Prisma override l'output
vers `./client`, donc `@prisma/client` (que `SequenceService.ts` importe) n'est jamais généré → baseline
TS2305 qui bloque le CHARGEMENT de toute suite important la chaîne `NotificationService` (documenté
it.87-91, faussement pris pour « suites non exécutables »). Pour un signal vert RÉEL : injecter un
générateur `client_default` (output par défaut) **transitoire** dans le schema, `npx prisma generate`,
puis **restaurer le schema immédiatement** (`git diff` schema == vide) — ça peuple
`node_modules/.prisma/client` (gitignored). Résultat : les 28 suites `[Nn]otification` du runner par
défaut passent (619 tests), dont la suite éditée `uncovered-paths` (53/53). Effet de bord à connaître :
avec DEUX clients générés (le `./client` + le default transitoire), ts-jest peut lever un TS2321
« Excessive stack depth » sur `new SequenceService(prisma)` (`NotificationService.ts:419`) dans les
suites `@ts-nocheck` hors runner par défaut (`notifications-firebase.test.ts`) — artefact du double
client aux types divergents, JAMAIS un signal de régression du diff. Ne pas chasser cette erreur si le
fichier concerné n'est pas dans le diff.

## Leçon 63 — une entrée de backlog "FIXED" n'est une preuve de rien sans grep contre `HEAD` (2026-07-06, routine calling-feature)

`tasks/calls-fonctionnel-todo.md` documentait (Vagues 13-16) plusieurs fixes calling comme "CONFIRMÉ +
CORRIGÉ", tests inclus — mais ces sections du fichier avaient elles-mêmes été effacées de `main` par la
régression `8ebd497b` (même commit qui avait aussi silencieusement supprimé le code qu'elles décrivaient),
et ne survivaient que dans deux PR ouvertes non mergées (#1558, #1563). Une session qui aurait fait
confiance au fichier tel qu'il existait sur sa propre branche (avant divergence) sans re-vérifier `HEAD`
aurait pu croire ces fixes présents alors qu'ils ne l'étaient pas. Pire : la PR #1558 elle-même a bâti un
nouveau fix (web, `call-store.ts` + `CallManager.tsx` initiator-timeout) sur l'hypothèse que le P0 du jour
(`682c35279`, "l'initiateur voit sa propre UI d'appel") était déjà sur `main` — il ne l'était pas (supprimé
par la même régression) — donnant une **couverture de test illusoire** : les tests de #1558 passent
(ils posent l'état directement via un helper de test) mais le vrai chemin de production qu'ils sont censés
protéger était cassé d'une façon différente et plus grave, jamais exercée par ces tests.
**Règle** : avant de s'appuyer sur une entrée de backlog pour décider qu'une zone du code est "déjà
traitée", `grep` la primitive technique citée (nom de fonction/champ/constante) directement dans le
fichier source sur `HEAD` — jamais seulement dans les docs. Avant de construire un nouveau fix par-dessus
un fix antérieur documenté, vérifier par lecture du code réel (pas de la doc, pas du diff de la PR qui le
cite) que ce fix antérieur est bien présent sur la base de travail actuelle.
## Leçon 62 — `MessageReadStatusService` : le curseur delivered/read pouvait régresser sous course (TOCTOU read-then-write) (2026-07-04, itération 93)

Audit expert (agent Explore, 56 tool-uses) sur la synchronisation temps réel du gateway : parmi 7
findings, celui retenu (isolé, testable, faible risque — cf. finding #1 sur `AuthHandler`, plus sévère
mais touchant tout le cycle de vie de connexion, différé). `markMessagesAsReceived`/`markMessagesAsRead`
(`MessageReadStatusService.ts`) lisaient le curseur (`findUnique`), décidaient "stale ou non" via
`isStaleCursorMessageId` sur ce snapshot, puis écrivaient sans condition via `upsert` — classique
check-then-act. Deux appels concurrents pour des messages différents (ex. burst `message:new`
déclenchant `_autoDeliverToOnlineRecipients` pour chaque message, ou deux devices qui livrent/lisent en
parallèle) pouvaient tous deux lire le même curseur "pas encore avancé" ; celui dont l'écriture atteint
Mongo EN DERNIER gagne, même si son message est plus ANCIEN — régression silencieuse du curseur
delivered/read, resurrection de messages déjà livrés/lus comme non livrés/non lus.

Fix : `upsert` ne peut pas porter de condition de garde au-delà de la clé unique — impossible de rendre
la décision atomique en gardant `upsert`. Remplacé par un `updateMany` gardé (`WHERE lastDeliveredMessageId
IS NULL OR lastDeliveredMessageId < messageId`, exactement le motif déjà utilisé par
`MessageHandler.handleMessageDelete` pour `lastMessageAt`) — la fraîcheur est évaluée par MongoDB AU
MOMENT de l'écriture, jamais sur un snapshot antérieur. Si `updateMany` ne matche rien : soit aucun
curseur n'existe encore (`create`), soit le curseur existant est déjà à jour (stale, `false`). Le
"existe déjà" est déduit du `findUnique` best-effort déjà fait par l'appelant pour borner la fenêtre de
gel (`prevDeliveredAt`/`prevReadAt`) — zéro requête supplémentaire dans le cas commun. Un `create` qui
échoue en P2002 (row créée entre-temps par un appel concurrent) retente le `updateMany` gardé une fois —
auto-guérison sans jamais faire confiance au hint d'existence pour la décision finale. Un helper privé
partagé `_advanceCursor` (idField/atField/resetUnreadCount paramétrés) sert les deux méthodes
symétriquement — `markMessagesAsReceived` ne remet PAS `unreadCount` à 0 sur l'`update` (contrairement à
`markMessagesAsRead`), seule divergence intentionnelle entre les deux sinon jumelles.

**Piège relevé pendant l'implémentation** : `cursorExists = prevCursor !== null` est FAUX quand le mock
Jest de `findUnique` n'est pas configuré (retourne `undefined`, pas une Promise résolue à `null`) —
`undefined !== null` vaut `true`, donc un curseur inexistant serait à tort traité comme existant. Fix :
`!= null` (égalité faible, capture `undefined` ET `null`). Prouvé nécessaire par un test préexistant qui
ne mockait pas `findUnique` du tout.

**Piège de suppression** : `isStaleCursorMessageId` (+ son test associé) devient mort dans
`MessageReadStatusService.ts` une fois les deux call sites retirés — supprimé. Une COPIE quasi-identique
existe dans `routes/conversations/messages.ts` (endpoint `mark-unread`, commentaire explicite « mirrors
the isStaleCursorMessageId guard ») mais avec une sémantique différente (déplace le curseur EN ARRIÈRE
intentionnellement) — PAS touchée, hors scope, TOCTOU résiduel noté mais non corrigé cette itération
(risque plus faible : action manuelle utilisateur, fenêtre de course étroite).

**Piège de test** : changer `upsert` → `updateMany`/`create` casse ~35 assertions dispersées dans TOUT
`MessageReadStatusService.test.ts` (pas seulement les describe blocks `markMessagesAsReceived`/
`markMessagesAsRead` — aussi Idempotency, Concurrency, Bulk Operations, dedup cache, error paths) PLUS
2 fichiers de tests de routes (`delivery-receipt.test.ts`, `mark-conversation-status.test.ts`) qui
montent le vrai service derrière `app.inject()`. Toujours `grep -rn "conversationReadCursor.upsert"`
au-delà du seul fichier de test unitaire avant de considérer un refactor de ce type terminé. Un test de
non-régression stateful (fake `updateMany`/`create` simulant le WHERE-guard réel de Mongo) prouve le fix
end-to-end : RED confirmé par `git stash` du fichier service seul (row reste `undefined`, l'ancien code
n'appelle jamais le fake), GREEN après restauration.

Suite `MessageReadStatusService.test.ts` : 148/148 (147 existants adaptés + 1 nouveau). Suites
adjacentes vérifiées non régressées : `MessageHandler.core/autoDeliver`, routes messages/conversations,
`delivery-receipt`, `mark-conversation-status` — 786/786 tous confondus. `MessagingService.test.ts`
échoue isolément sur le TS2305 baseline documenté Leçon 61 (confirmé identique via le workaround
`client_default` transitoire, restauré immédiatement) — non lié au diff.

## Leçon 63 — `handleMessageEdit` (WS + REST) pouvait ressusciter un message supprimé avec du contenu édité (2026-07-04, itération 94)

Audit expert (agent Explore, 27 tool-uses) sur la synchronisation temps réel du gateway, suite directe
de la Leçon 62. Parmi 4 findings (le plus fort — max-1-réaction-par-user TOCTOU sur `PostReaction`/
`CommentReaction` — nécessite une migration de schéma, différé pour un cycle isolé sans migration),
retenu : `MessageHandler.handleMessageEdit` (socket) et la route `PUT /messages/:messageId` (REST,
`routes/messages.ts`) lisaient le message avec `deletedAt: null`, décidaient l'autorisation sur ce
snapshot, puis écrivaient sans condition via `prisma.message.update({ where: { id } })` — classique
check-then-act. Un `message:delete` (ou `DELETE /messages/:messageId`) atterrissant entre la lecture et
l'écriture de l'edit n'empêche PAS ce `update` par id de réussir (il ne filtre pas sur `deletedAt`) : la
ligne soft-supprimée ressuscite avec le contenu édité, et le gateway diffuse quand même
`MESSAGE_EDITED` — un client ayant déjà retiré le message de son cache le voit réapparaître édité.

Fix, exactement le même motif que `handleMessageDelete`/`MessageReadStatusService` (Leçon 62) : remplacer
le `update` inconditionnel par un `updateMany({ where: { id, deletedAt: null }, data: {...} })` gardé,
puis brancher sur `count`. Socket handler : `count === 0` → erreur générique, aucune diffusion ; le
payload broadcasté est reconstruit localement (`{ ...champs déjà lus, content, isEdited, editedAt }`)
plutôt que depuis le retour d'`updateMany` (qui ne renvoie que `{ count }`), zéro requête
supplémentaire. Route REST : même garde, mais la réponse HTTP a toujours renvoyé la ligne complète
(toutes les colonnes scalaires, via l'`include` d'origine) — reconstruire ce payload à la main aurait
risqué d'omettre un champ (mentions, chiffrement, view-once, etc.) et de changer silencieusement le
contrat API. Choix plus sûr : après le `updateMany` gardé, un `findUniqueOrThrow` réhydrate la ligne à
jour avec le même `include: { sender: {...} }` que l'ancien `.update()` — un aller-retour DB
supplémentaire dans le cas commun, mais fidélité de contrat garantie plutôt qu'une énumération de champs
fragile.

**Piège de test répété (3 fichiers)** : chaque test qui stubait `prisma.message.update(...).mockResolvedValue(fullRow)`
et assertait dessus a dû être réécrit en `updateMany(...).mockResolvedValue({ count: 1 })` — le retour
n'est plus un message complet, donc les helpers `makeUpdatedMessage()` qui construisaient ce retour
deviennent morts une fois tous les call sites migrés (supprimés dans
`MessageHandler.core.test.ts`). Repéré par grep `prisma\.message\.update\b` scindé entre le describe
`handleMessageEdit` (à migrer) et `handleMessageDelete` (inchangé — sa propre écriture reste
volontairement non gardée, seul son recompute de `lastMessageAt` l'est, cf. Leçon précédente) : ne pas
migrer tout le fichier en aveugle. RED confirmé sur les deux fixes (`git stash` du fichier prod seul) :
le test "concurrent delete race" échoue avec `success: true`/`200` sur l'ancien code, prouvant le bug
avant le fix.

Suites vérifiées : `MessageHandlerEditDelete.test.ts` 36/36, `MessageHandler.core.test.ts` (fichier
complet) inchangé sauf edit block, `unit/routes/messages.test.ts` 32/32 (+2), `messages-extended.test.ts`
migré (mock prisma partagé). Suite complète gateway (bun, workaround `client_default` transitoire pour
lever le TS2305 baseline Leçon 61, schema restauré immédiatement après, `git diff` vide) :
506/506 suites, 13680/13681 tests (1 skip pré-existant).

## Leçon 63 — F58 soldé : la notif de réaction-commentaire s'effondrait le postType vers un booléen `isStory` (2026-07-04, itération 96)

Même classe de bug que le fix post-reaction déjà accepté (« Hardcoding 'POST' here dropped that
typing on every socket-path reaction »). `createCommentReactionNotification` prenait
`isStory?: boolean` et posait `metadata.postType: isStory ? 'STORY' : 'POST'` — un REEL/STATUS
portant un commentaire réagi produisait `metadata.postType: 'POST'` + un corps « … sur le post de X ».
La sœur `createPostLikeNotification`, sur le même contenu, portait déjà le vrai
`postType?: 'POST'|'STORY'|'MOOD'|'STATUS'|'REEL'` sans collapse. Fix en 3 points miroir : (1) shared
`COMMENT_CONTEXT` élargi de `{story, post}` à un `ObjMap` complet (5 `NotificationPostKind` × 8
langues), en réutilisant les choix de noms des tables voisines (`INDEF_OBJ`/`LOC_OBJ`) pour la
cohérence de genre/casse ; (2) `createCommentReactionNotification` prend `postType` (mirror de la
sœur), body + metadata sans collapse ; (3) `CommentReactionHandler` forwarde `post?.type` au lieu de
`isStory = post?.type === 'STORY'`. **Garde-fou legacy conservé** : la branche `reaction.commentVerbose`
résout `kind = params.postType ?? (params.isStory ? 'STORY' : 'POST')` — `postType` prime, `isStory`
reste un repli inerte quand `postType` est fourni → les 2 tests `isStory:true/false` existants restent
verts sans réécriture. Zéro changement iOS/web/DB : la sœur post-reaction émettait déjà REEL/STATUS
en `metadata.postType`, donc les clients gèrent déjà ces valeurs.

**Ménage de backlog fait ce cycle (règle réutilisable)** : toujours VÉRIFIER dans le code qu'un item
listé « parké » l'est encore avant de le retenir. Les reports it.90→94 listaient F53/F54 (HIGH) comme
parkés alors qu'ils étaient soldés en it.89 et présents sur `main` (lecture directe de
`PostFeedService.ts` + `attachment-validators.ts`) — un report se périme si l'itération qui solde ne
nettoie pas la liste en aval. **Note F57** : ce cycle avait pré-évalué F57 comme inerte côté
consommateurs de prod (`hasMentions`/`extractMentions` référencés uniquement par des tests, chemins
d'extraction de prod sur usernames ASCII-validés `/^[a-z0-9_]{1,30}$/`) ; une itération parallèle
(it.95 sur `main`) l'a néanmoins durci défensivement — les deux constats coexistent, F57 est clos.
Leçon transverse : toujours grep les call-sites non-test AVANT d'inscrire (ou de clore) un item comme
dette — et vérifier `origin/main` juste avant de statuer, un cycle parallèle peut l'avoir traité.


## Leçon 64 — F61 soldé : le fallback `@username` de `parseMentions` gardait une frontière gauche ASCII, jumelle résiduelle de F57 (2026-07-04, itération 96)

Suite de la Leçon 44 (mention par préfixe) et de F57 (it.95, `hasMentions` ASCII→Unicode). Le module
`mention-parser.ts` déclare `NAME_BOUNDARY_LEFT = (?<![\p{L}\p{N}_])` comme **source de vérité unique**
de la frontière de nom. Le path `@DisplayName` (l.40) la réutilise avec le flag `u` ; mais le fallback
`@username` réimplémentait la frontière gauche à la main en ASCII (`/(?<![\w])@(\w{1,30})/g`, sans flag
`u`). Or `\w` ASCII = `[A-Za-z0-9_]` : dès que le caractère précédant le `@` est une lettre Unicode
(`é`, `à`, cyrillique…), le lookbehind ASCII échoue silencieusement et le `@` interne d'une adresse
e-mail est capturé comme mention. Repro vitest : `parseMentions('écris à André@atabeth.com',
[{username:'atabeth'}])` retournait `['u1']` (mauvais user notifié) alors que `Andre@atabeth.com`
(ASCII) rendait `[]` — même entrée, une lettre accentuée d'écart, résultat opposé. **Fix (1 ligne) :
réutiliser la constante — `new RegExp(\`${NAME_BOUNDARY_LEFT}@(\\w{1,30})\`, 'gu')`.** Le flag `u`
n'upgrade que la frontière gauche en Unicode ; `\w{1,30}` reste ASCII (usernames ASCII par validation —
intentionnel). Comportement strictement plus restrictif (rejette des faux positifs e-mail), aucun cas
de mention légitime affecté. RED→GREEN + suite `packages/shared` 1258/1258 + `tsc` 0 erreur. **Règle :
quand un module déclare une constante « source de vérité unique » pour une frontière/charset, AUCUN
chemin voisin ne doit réimplémenter la même frontière à la main — auditer TOUS les paths du module
(F57 avait unifié `hasMentions` + `@DisplayName` mais oublié le fallback `@username` : un seul path
oublié réintroduit la dérive ASCII↔Unicode).**


                                               
## Leçon 65 — Un nouveau `NotificationType` non câblé dans `isTypeEnabled` contourne la préférence via `default:true` (F59, it.97)
`isTypeEnabled(prefs, type)` mappe chaque `NotificationType` → son champ booléen de préférence. Son
`default: return true` est destiné aux types système/toujours-actifs (`login_new_device`,
`translation_ready`…). **Piège** : quand on ajoute un nouveau type gouverné par une préférence
utilisateur existante et qu'on oublie de l'ajouter au `switch`, il tombe silencieusement sur
`default:true` — il IGNORE l'opt-out utilisateur. C'était le cas de `comment_reaction` (chemin socket)
alors que son sibling REST `comment_like` était bien gaté sur `commentLikeEnabled`. Résultat : couper
« like de commentaire » n'éteignait que le REST, la réaction socket passait quand même.

**Règle réutilisable** : deux chemins/transports du MÊME geste produit (ici réagir à un commentaire)
DOIVENT honorer la même préférence. À chaque nouveau type de notif, se demander « quelle préférence
existante le gouverne ? » et l'ajouter explicitement au `switch` — ne jamais le laisser au `default`
sauf s'il est intentionnellement toujours-actif (sécurité/système). Audit rapide : lister l'union
`NotificationType` et cross-check vs les `case` — les types tombant sur `default` doivent être
soit système, soit sans champ de préférence à créer (décision produit), jamais un type qui a déjà un
toggle câblé pour son sibling.


                                               

## Leçon 66 — F62 soldé : `resolveUserLanguage` renvoyait les préférences in-app en casse brute, `resolveUserLanguagesOrdered` les lowercasait — drift de casse live sur le Prisme (2026-07-04, itération 98)
Deux résolveurs sœurs du même module (`packages/shared/utils/conversation-helpers.ts`) répondaient à
la même question « quelle langue pour cet utilisateur ? » avec deux politiques de casse divergentes :
`resolveUserLanguagesOrdered` lowercasait chaque préférence in-app (`c.toLowerCase()`) — c'est elle
qui produit les **cibles de traduction** (stockées minuscules) et les `resolvedLanguages` du socket ;
`resolveUserLanguage` renvoyait `user.systemLanguage` **verbatim** — c'est elle qui produit
`meta.userLanguage` (l'indice de langue d'affichage du client) et la langue des notifications. Cause
racine : `isSupportedLanguage` valide de façon insensible à la casse (`code.toLowerCase()` avant
lookup) mais **ne transforme pas** — les écritures (`register`, `PreferencesService`) persistent
`'EN'` verbatim, la casse n'est donc **pas garantie minuscule en base**. Conséquence live : un
`systemLanguage: 'EN'` → `meta.userLanguage: 'EN'` → le client cherche une traduction `'EN'`, ne
trouve que la clé `'en'` → **retombe sur l'original** (violation Prisme règle #1) ; notification dans
la mauvaise langue ; `getRequiredLanguages` produit `['EN','en']` (doublon, requête translator
gaspillée). **Fix (6 `.toLowerCase()`) : normaliser à la LECTURE dans les deux résolveurs** — parité
stricte avec `resolveUserLanguagesOrdered`, répare aussi les données déjà stockées en casse mixte,
sans migration, se propage à tous les consommateurs (dont le web qui délègue). RED→GREEN + suite
`packages/shared` 1265/1265 + `tsc` 0 erreur. **Règle : quand la validation d'un champ est
insensible à la casse mais ne normalise pas la valeur stockée, la casse en base n'est PAS garantie —
le résolveur de lecture (source de vérité) DOIT normaliser, et TOUS les résolveurs sœurs du même
champ doivent partager la même politique de casse (auditer le module entier, pas la seule fonction
touchée).**

## Leçon 67 — Le broadcast présence temps réel ignorait le blocage que `GET /users/presence` enforce (2026-07-05, itération 99)

Sibling drift entre le chemin REST et le chemin socket de la présence. `GET /users/presence`
(`routes/users/presence.ts:111`) résout la visibilité via `PresenceVisibilityService.resolveForTargets`,
qui masque `isOnline`/`lastActiveAt` (retourne `HIDDEN`) dès que l'un des deux users a bloqué l'autre
(`isBlockedEitherWay`, doc `2026-06-30-profile-last-seen-visibility-design.md`). Les DEUX chemins temps
réel jumeaux ne connaissaient QUE `showOnlineStatus`/`showLastSeen` (préférences globales) et n'appelaient
jamais cette vérification de blocage : `_applyPresencePrefs`/`_emitPresenceSnapshot`
(`MeeshySocketIOManager.ts:563-640`, snapshot initial envoyé au socket à la connexion) et
`_broadcastUserStatus` (`:1587-1667`, fan-out à chaque connexion/déconnexion vers toutes les rooms de
conversation de l'utilisateur). Concrètement : A bloque B, les deux restent co-participants d'un groupe
(bloquer ne retire jamais des conversations partagées) ; quand B se connecte, A reçoit quand même son
`isOnline`/`lastActiveAt` réels par socket — alors que `GET /users/presence` pour la même paire les
aurait masqués. Fuite de vie privée silencieuse sur le canal qui reste ouvert en permanence.

**Fix** : nouveau helper batché `getBlockedUserIdsAmong(prisma, userId, candidateIds)` dans
`utils/blocking.ts` (2 requêtes groupées, miroir de `PresenceVisibilityService.resolveForTargets`'s
calcul de blocage, réutilisable). (1) `_applyPresencePrefs` prend maintenant `viewerId` et masque
`isOnline`/`lastActiveAt` (mêmes valeurs que `HIDDEN`) pour tout contact bloqué avec le viewer — les
deux call-sites dans `_emitPresenceSnapshot` passent le `userId` du socket qui se connecte. (2)
`_broadcastUserStatus` calcule l'ensemble des viewers actuellement connectés (`this.connectedUsers`)
en relation de blocage avec le broadcaster, résout leurs socket ids via `this.userSockets`, et utilise
`io.to(rooms).except(blockedSocketIds)` — un `socket.id` est aussi une room Socket.IO auto-join, donc
`.except(socketId)` exclut précisément ce viewer du fan-out sans affecter les autres participants de la
même room. Pas de query DB supplémentaire quand personne d'autre n'est connecté (fast-path `[].length
=== 0`). RED→GREEN : `utils/__tests__/blocking.test.ts` (+7 cas sur le nouveau helper) +
`MeeshySocketIOManager.test.ts` (+3 cas : snapshot masque un contact bloqué, broadcast exclut le socket
d'un viewer bloqué, broadcast n'appelle PAS `.except()` en l'absence de blocage). Suite gateway complète
(workaround `client_default` transitoire Leçon 61, schema restauré immédiatement après, `git diff` vide) :
506/506 suites, 13707/13708 tests (1 skip pré-existant).

**Règle réutilisable** : quand une règle de visibilité/privacy (blocage, visibilité de post, etc.) est
enforced sur un endpoint de lecture ponctuelle (REST), auditer SYSTÉMATIQUEMENT le canal temps réel
jumeau (snapshot de connexion + broadcast incrémental) — un canal qui reste ouvert en permanence est
un vecteur de fuite plus grave qu'un endpoint interrogé à la demande, et c'est précisément le genre de
sibling que ce backlog a déjà trouvé divergent à plusieurs reprises (mentions, postType, casse de
langue, cursor read/delivered).

## Leçon 68 — Le broadcast `typing:start`/`typing:stop` ignorait aussi le blocage, alors que la présence (Leçon 67) venait d'être corrigée (2026-07-05, itération 100)

Sibling drift direct de la Leçon 67, sur un canal encore plus sensible : `_broadcastUserStatus`
(présence) enforce désormais le blocage bidirectionnel, mais `StatusHandler.handleTypingStart`/
`handleTypingStop` (`services/gateway/src/socketio/handlers/StatusHandler.ts`) diffusaient
`typing:start`/`typing:stop` via `socket.to(room).emit(...)` sans AUCUNE vérification de blocage —
seule la préférence globale `shouldShowTypingIndicator` (booléen, sans notion de viewer) était
consultée. Or bloquer ne retire jamais des conversations partagées (fait déjà établi en Leçon 67) :
A bloque B, les deux restent co-participants d'un groupe ; quand B tape dans ce groupe, A voit
« B est en train d'écrire… » en direct alors que `GET /users/presence` masquerait `isOnline`/
`lastActiveAt` pour cette même paire. La frappe est un signal plus sensible que la présence
(prouve un engagement actif, instant par instant) — c'était donc une régression de couverture
laissée ouverte par la Leçon 67 elle-même (fix scopé à `_broadcastUserStatus`, `StatusHandler` non
audité). Un troisième chemin jumeau avait le même trou : `handleSocketDisconnecting` (broadcast
`typing:stop` de secours à la déconnexion, via un `broadcastFn` injecté par
`MeeshySocketIOManager.ts`).

**Fix** : nouveau helper privé `StatusHandler._getBlockedSocketIdsInRoom(userId, conversationId)` —
requête les participants actifs et enregistrés (`userId: { not: null }`, les anonymes ne peuvent ni
bloquer ni être bloqués) de la conversation, filtre ceux actuellement en ligne
(`connectedUsers.has`), puis réutilise `getBlockedUserIdsAmong` (même helper que Leçon 67) pour
résoudre l'ensemble bloqué, et `userSockets` (nouvelle dépendance optionnelle de
`StatusHandlerDependencies`, câblée depuis `MeeshySocketIOManager`) pour mapper vers des socket
ids. Les 3 call sites (`handleTypingStart`, `handleTypingStop`, `handleSocketDisconnecting`) font
`socket.to(room).except(blockedSocketIds).emit(...)` quand la liste est non vide — identique au
pattern déjà validé sur la présence. `handleSocketDisconnecting` devient `async` (await du helper) ;
son `broadcastFn` gagne un 4e paramètre optionnel `exceptSocketIds`. RED→GREEN :
`StatusHandler.test.ts` (×2 fichiers) +5 cas (exclusion sur start/stop/disconnect, no-op quand
personne n'est bloqué, filtre les participants anonymes) + fixtures `makePrisma` étendues
(`participant.findMany`/`user.findMany` par défaut vides, non-régressif). Suite complète
StatusHandler (73/73) + blocking.ts (283/283 avec MeeshySocketIOManager) verte ; le seul échec
tsc/jest restant (`SequenceService.ts` → `@prisma/client` sans export `PrismaClient`) est
pré-existant sur `main`, confirmé par `git stash` avant relance — sans lien avec ce fix.

**Règle réutilisable** : une correction de sibling drift (Leçon 67) doit elle-même être auditée pour
d'autres siblings du MÊME concept produit avant d'être considérée close — ici « présence » et
« frappe » sont deux facettes du même signal (« cet utilisateur est actif maintenant »), et corriger
l'une sans l'autre laisse un vecteur de fuite ouvert, parfois plus grave que celui qu'on vient de
fermer. Lister explicitement TOUS les canaux qui exposent un signal de présence/activité (présence,
frappe, dernière vue, indicateurs de lecture en direct…) et vérifier qu'ils partagent tous la même
politique de blocage avant de clore un correctif de ce type.
## Leçon 68 — Un fix de sibling-drift peut lui-même en introduire un nouveau s'il ne couvre que les chemins terminaux qu'il possède (2026-07-05, itération 100, Vague 14 appels)

`a813b31` (gateway/calls, plus tôt le même jour) a ajouté `CallEventsHandler.clearQualityDegradedStreaks`
et l'a câblé sur les 3 chemins terminaux **que `CallEventsHandler` possède lui-même**
(`broadcastCallEnded`, disconnect-leave à 0 participant, disconnect-force-cleanup). Un **4e** chemin
terminal existe pour le même appel — `CallCleanupService.forceEndCall` (le tier GC cron 60s) — mais vit
dans une classe séparée sans référence à l'instance `CallEventsHandler`, donc n'a reçu ni l'ancien
bug (déjà documenté) ni son fix. Piège spécifique à ce cas : le fix a été écrit et testé en ne regardant
QUE les call-sites internes à la classe qu'on modifie déjà — la recherche de siblings s'est arrêtée à la
frontière de fichier au lieu de suivre "tous les chemins qui terminent un `CallSession`" (grep
`callSession.updateMany.*status` ou équivalent, à travers TOUT `services/gateway/src`, pas juste le
fichier en cours d'édition). Une classe séparée qui termine la même entité (ici via son propre GC/cron)
compte comme sibling au même titre qu'une méthode sœur dans le même fichier.

**Règle réutilisable** : quand on répare un sibling-drift ("chemin X était couvert, chemin Y ne l'était
pas"), avant de committer, lister EXHAUSTIVEMENT tous les chemins qui écrivent le même état terminal
sur la même entité — via un grep structurel sur le nom de la table/du champ concerné dans tout le
service, pas seulement dans le fichier qu'on est en train d'éditer — et vérifier explicitement que
chacun reçoit le fix, pas seulement ceux qui vivent dans la même classe. Un fix de sibling-drift qui
ne couvre que 3 des 4 chemins réels n'est qu'un sibling-drift déplacé, pas résolu.
## Leçon 68 — F71 soldé : `community-preferences.ts` était une copie figée de `conversation-preferences.ts`, sans la diffusion socket ajoutée après-coup au sibling (2026-07-05, itération 104)

Nouvelle variante de la famille « deux chemins jumeaux répondant à la même question produit divergent »
(#57/#62/Leçon 65/Leçon 67), cette fois entre deux ROUTE FACTORIES quasi identiques plutôt qu'entre deux
fonctions pures. `conversation-preferences.ts` (`PUT`/`DELETE /user-preferences/conversations/:id`)
diffuse `USER_PREFERENCES_UPDATED` vers `ROOMS.user(userId)` (multi-device sync, payload versionné)
depuis un cycle antérieur. `community-preferences.ts` implémente EXACTEMENT le même pattern de route
(mêmes champs `isPinned`/`isMuted`/`isArchived`/`customName`/`categoryId`/`orderInCategory`, plus
`isHidden`/`notificationLevel` propres aux communautés) mais n'avait **aucun** appel `broadcastToUser`/
`io.emit` (grep repo-wide confirmé nul) : la copie initiale du fichier a divergé du fix suivant, jamais
rétro-porté sur son sibling. Effet live : pin/mute/archive/hide/rename d'une communauté depuis un
onglet ou un appareil restait invisible pour toute autre session ouverte du même utilisateur jusqu'à un
refetch manuel — exactement la classe de bug déjà corrigée côté conversation.

**Fix** : nouveau type `UserPreferencesCommunityUpdatedEventData` (discriminant `communityId`, SANS
`version` — `UserCommunityPreferences` n'a pas ce champ en base, pas de migration Prisma nécessaire ;
le consommateur web réagit en invalidant son cache React Query plutôt qu'en réconciliant un snapshot
optimiste versionné) ajouté à l'union `UserPreferencesUpdatedEventData`. `PUT`/`DELETE` de
`community-preferences.ts` diffusent désormais via le même helper `broadcastToUser` que le sibling.
Web : `use-socket-cache-sync.ts` discrimine la nouvelle branche `'communityId' in data` et invalide
`queryKeys.communities.preferences.detail/list`. RED→GREEN : nouveau
`community-preferences-broadcast.test.ts` (3 cas, 2/3 rouges avant fix) + 2 cas web dans
`use-socket-cache-sync.test.tsx`. Suites ciblées vertes : gateway `preferences` 394/394,
web `community` 70/70 ; `packages/shared` `bun run build` 0 erreur ; `tsc --noEmit` gateway/web sans
nouvelle erreur (bruit préexistant documenté, non lié : `SequenceService.ts` TS2305, itération 86).

**Règle réutilisable** : quand un fix (diffusion socket, garde de concurrence, check de blocage…) est
ajouté à UNE route factory, grep immédiatement les routes SŒURS qui partagent la même forme
(`grep -rn "PUT.*preferences" routes/`, ou plus généralement chercher les fichiers dont le nom suit le
même gabarit — ici `*-preferences.ts`) — une copie de code initiale figée avant le fix ne le reçoit
jamais automatiquement, et rien ne le signale (pas d'erreur, pas de test qui casse, juste un
comportement silencieusement différent entre deux entités qui devraient se comporter pareil).


                                               
                                               
## Leçon 69 — Une liste blanche de langues codée en dur diverge de la source de vérité des bundles (2026-07-05, itération 108)

`detectBestInterfaceLanguage` (`apps/web/utils/language-detection.ts`) sélectionnait la langue de l'UI
au montage via une liste blanche codée en dur `['en', 'fr', 'pt']`. L'espagnol y manquait alors que
`locales/es/` est un bundle complet et que `es` est une entrée first-class de `INTERFACE_LANGUAGES`
(`types/frontend.ts`), placée AVANT `fr`/`pt` qui, elles, étaient auto-détectées. Résultat : tout
navigateur hispanophone recevait une UI anglaise — violation du Prisme Linguistique sur la surface
chrome, exactement le genre de friction que le produit promet d'éliminer. La fonction jumelle
`getUserPreferredLanguage` (même fichier, langue de contenu) gérait `es` correctement via
`isSupportedLanguage` : divergence entre deux détecteurs du même module.

**Fix** : `['en', 'es', 'fr', 'pt']` = exactement les 4 langues avec bundle complet ; `de`/`it` restent
exclues (sans bundle, repli `en` intentionnel documenté). RED→GREEN : 3 tests (`['es-ES','en-US'] → 'es'`,
`['es-419'] → 'es'`, garde-fou `['it-IT','de-DE'] → 'en'`). `language-detection.test.ts` 35/35,
`use-language.test.tsx` (callers) 24/24.

**Règle réutilisable** : quand une capacité produit (langue, thème, feature-flag) a une **source de
vérité déclarative** (ici `INTERFACE_LANGUAGES` + présence du dossier `locales/<code>`), toute liste
blanche codée en dur qui la re-liste ailleurs est un point de dérive garanti. Auditer systématiquement
que chaque valeur « expédiée » (bundle présent, entrée dans le sélecteur) apparaît dans TOUS les chemins
qui la filtrent — et distinguer l'omission-défaut (valeur expédiée mais absente : `es`) de
l'omission-intentionnelle (valeur non expédiée, repli documenté : `de`/`it`). Un test garde-fou sur le
cas intentionnel empêche un futur « fix » de casser l'exclusion voulue.
## Leçon 68 — F72 soldé : `capitalizeName` ne re-capitalisait qu'après un espace, mutilant Jean-Pierre/O'Brien à l'inscription (2026-07-05, itération 105)

**Contexte** : `services/gateway/src/utils/normalize.ts` normalise les champs d'inscription
(`normalizeUserData` → `AuthService.registerUser`). `capitalizeName` faisait `.split(' ')` — un seul
séparateur de segment. Or `AuthSchemas.register` autorise `[\p{L}\s'.-]` dans firstName/lastName : tout
nom composé à tiret ou apostrophe (omniprésent en clientèle francophone) passait la validation puis se
faisait forcer en minuscules après le séparateur : `'Jean-Pierre' → 'Jean-pierre'`, `"O'Brien" →
"O'brien"`. Preuve d'incohérence : sur un même enregistrement, `firstName` ressortait `'Jean-pierre'`
tandis que `displayName` (via `normalizeDisplayName`, qui ne touche pas la casse) restait
`'Jean-Pierre'`. Jumeau du même fichier : `normalizeDisplayName` promettait un rendu mono-ligne mais sa
classe `[\n\t]` **omettait `\r`**, laissant survivre le CR des fins de ligne Windows (`\r\n`) et Mac
historiques.

**Fix** : `capitalizeName` = `.trim().toLowerCase().replace(/(^|[\s'.-])(\p{L})/gu, (_, sep, l) => sep +
l.toUpperCase())` — capitalise la 1ʳᵉ lettre après début-de-chaîne OU tout séparateur de nom autorisé
(`[\s'.-]`, exactement le charset non-lettre de la validation), préserve les accents (`\p{L}`), les
multi-espaces et les préfixes numériques (`'3john'` inchangé). `normalizeDisplayName` = `replace(/[\r\n\t]/g,
'')`. Deux tests **codifiaient le défaut** (`'Jean-pierre'`, `'Test\rUser'`) alors que leurs intitulés
décrivaient le comportement correct — corrigés vers l'intention. Mock `normalize` d'`AuthService.test.ts`
réaligné sur l'impl réelle. RED→GREEN : `normalize.test.ts` 126/126 (+7 cas tiret/apostrophe/accent/`\r`
seul + 1 assertion d'intégration corrigée), `AuthService.test.ts` 115/115, `profile-extended.test.ts`
36/36.

**Règle réutilisable** : quand un helper de normalisation/formatage découpe sur UN séparateur (`split(' ')`,
`[\n\t]`, `lastIndexOf('.')`), vérifier l'**ensemble complet** des séparateurs que sa couche d'entrée
autorise réellement — ici le charset de la Zod schema qui garde l'endpoint. Le charset de validation EST
la source de vérité des séparateurs à traiter ; toute divergence entre « ce que la validation laisse
entrer » et « ce que le normalizer sait découper » est un bug latent (même classe que F65
`truncateFilename` sans point, F69 `sanitizeFileName`). Et un test dont l'intitulé décrit le
comportement correct mais dont l'assertion fige la sortie buggée est un signal fort de défaut, pas
d'intention.

## Leçon 70 — F73 soldé : `PATCH /messages/:messageId` (route Android) éditait le message sans jamais diffuser `message:edited` ni retraduire (2026-07-06, itération 110)

Nouvelle variante de la famille « deux routes REST jumelles répondant à la même action produit
divergent » (Leçon 65/67/68). Trois routes gateway éditent un message par ID :
`PUT /conversations/:id/messages/:messageId` (`messages-advanced.ts`), `PUT /messages/:messageId`
(`messages.ts`) et `PATCH /messages/:messageId` (`messages-advanced.ts`, décrite dans son propre
schéma OpenAPI comme « alternative to PUT /conversations/:id/messages/:messageId »). Les deux `PUT`
invalident les traductions en base, déclenchent `_processRetranslationAsync` et diffusent
`SERVER_EVENTS.MESSAGE_EDITED` sur `ROOMS.conversation`. Le `PATCH` — utilisé par le client Android
(`MessageApi.kt` : `@PATCH("messages/{id}")`) — ne faisait qu'un `prisma.message.update` puis
`sendSuccess`, avec un commentaire fantôme (« Le service de traduction sera notifié si nécessaire via
WebSocket ») ne correspondant à aucun code. Effet live : un utilisateur Android éditant un message,
toute autre session (web, iOS, autre appareil Android) dans la même conversation ne recevait jamais
la mise à jour tant qu'aucun refetch complet n'était déclenché ; les traductions déjà en cache
restaient alignées sur l'ancien contenu — violation directe du Prisme Linguistique sur ce chemin
précis. Aucun test existant ne couvrait le socket/la retraduction pour cette route (le describe
`PATCH /messages/:messageId` n'assertait que `sendSuccess`/`sendForbidden`/`sendNotFound`).

**Fix** : le handler `PATCH` inclut désormais `translations: null` dans son unique
`prisma.message.update` (une seule requête, pas de round-trip séparé comme le sibling
`messages-advanced.ts`), déclenche `fastify.translationService._processRetranslationAsync` dans un
try/catch qui n'échoue jamais l'édition, transforme `translations` en tableau via
`transformTranslationsToArray` (contrat client), et diffuse `SERVER_EVENTS.MESSAGE_EDITED` vers
`ROOMS.conversation(message.conversationId)` — strictement le même pattern que
`PUT /messages/:messages.ts`. RED→GREEN : 5 nouveaux cas dans
`conversation-messages-advanced.test.ts` (broadcast, retraduction déclenchée, retraduction en échec
n'empêche pas le succès, `socketIOManager` null → pas de broadcast mais succès) ; suite ciblée
95/95 verte. `tsc --noEmit` gateway : aucune nouvelle erreur (bruit préexistant inchangé :
`SequenceService.ts` TS2305, itération 86).

**Règle réutilisable** : quand TROIS routes (pas seulement deux) répondent à la même question
produit, l'audit de parité doit comparer les trois entre elles, pas seulement la paire la plus
visible — ici la troisième route porte dans son propre schéma OpenAPI la mention explicite d'être
une "alternative" à une autre, ce qui est un signal fort qu'elle doit être auditée pour la même
parité comportementale (pas seulement la même forme de payload). Un commentaire du type "sera notifié
si nécessaire via WebSocket" sans aucun appel `emit` associé est un marqueur quasi certain de
sibling-drift non résolu — grep `via WebSocket` / `WebSocket si nécessaire` dans les commentaires du
repo pour trouver d'autres promesses non tenues du même genre.
## Leçon 69 — F77 soldé : `SERVER_EVENTS.NOTIFICATION` (sans suffixe) était du code mort en miroir des deux côtés (gateway émetteurs + web listener), et masquait un vrai bug d'import Prisma qui cassait 26 suites (2026-07-05, itération 106)

**Contexte** : `tasks/socketio-events-cleanup.md` item #4 demandait un audit de
`SERVER_EVENTS.NOTIFICATION` (sans `:action`, à ne pas confondre avec `NOTIFICATION_NEW`) pour
décider deprecate/rename/remove. Grep des émetteurs réels : `MeeshySocketIOHandler.sendNotificationToUser()`
(définie, jamais appelée par aucun caller) et `SocketNotificationService.emitNotification()` (classe
jamais instanciée hors de son propre fichier de test — toute diffusion réelle de notifications passe
par `NotificationService` qui émet directement sur `this.io`). Le seul "consommateur" restant était
un listener web `notification-socketio.singleton.ts` commenté "Legacy support" — mais comme les deux
émetteurs étaient déjà morts, ce n'était pas un vrai chemin de compat, juste un miroir de code mort
côté client (iOS avait déjà indépendamment choisi de ne pas s'y abonner, commentaire à l'appui).
Classe de bug adjacente à celle de la Leçon 68/#57/#62/#67 (chemins jumeaux qui divergent) mais ici
les DEUX jumeaux étaient morts simultanément plutôt qu'un vivant/un mort.

**Fix** : suppression complète (constante + entrée `ServerToClientEvents`, méthode + import
`SERVER_EVENTS` devenu inutile sur `MeeshySocketIOHandler`, classe `SocketNotificationService` entière
+ son export, listener + tests web). Le principe CLAUDE.md « si tu es certain que c'est inutilisé,
supprime complètement, ne renomme pas en `_unused` » s'applique : pas de période de dépréciation
nécessaire puisqu'aucun code vivant n'émettait ni ne dépendait de cet event.

**Trouvaille annexe** : en lançant la suite complète gateway pour vérifier l'absence de régression,
26 suites échouaient à la compilation avec `TS2305: Module '"@prisma/client"' has no exported member
'PrismaClient'` — documenté dans plusieurs itérations précédentes comme "bruit préexistant non lié"
(ex. Leçon 68/F72) mais jamais élucidé. Cause réelle : `schema.prisma` ne déclare qu'UN seul generator
avec `output = "./client"` (donc `@meeshy/shared/prisma/client`) — le package `@prisma/client` par
défaut n'a jamais de client généré à cet emplacement dans ce repo. Trois fichiers
(`SequenceService.ts`, `__tests__/helpers/consent-test-helper.ts`, `migrations/migrate-from-legacy.ts`)
importaient `PrismaClient` depuis `@prisma/client` au lieu de `@meeshy/shared/prisma/client` (convention
suivie partout ailleurs dans `services/gateway/src`). Corrigé : alignement des 3 imports, suite complète
508/508 (contre 482/508 + 26 échecs de compilation avant).

**Règle réutilisable** : un item de backlog "à élucider" ne doit pas rester en l'état à chaque
itération — l'audit demandé (`grep` des émetteurs réels) est souvent rapide et donne une réponse
définitive (ici : mort des deux côtés → suppression, pas juste un renommage cosmétique). Et une erreur
de compilation répétée dans plusieurs comptes-rendus d'itérations sous l'étiquette "bruit préexistant,
non lié" mérite d'être élucidée au moins une fois plutôt que reconduite indéfiniment — le fait que ~26
suites échouent à charger n'est jamais vraiment "sans rapport", même quand isolé du diff de la session
en cours ; ici la cause était un import cassé trivial à corriger, pas un problème d'environnement.

## Leçon 70 — F84c soldé : le durcissement `reactionSummary` était asymétrique entre les 3 services de réaction — vérifier l'état RÉEL de chaque jumeau avant de « propager » (2026-07-06, itération 115)

**Contexte** : F84c (reporté par l'itération 113) décrivait la carte `reactionSummary` des posts/commentaires
comme maintenue par delta read-modify-write et proposait de « propager le durcissement groupBy déjà
appliqué aux réactions de message ». En vérifiant l'état réel de `main`, les trois services étaient dans
**trois états différents** : `ReactionService` (message) recompute carte+total depuis `groupBy`
(le plus dur) ; `PostReactionService`/`CommentReactionService` recomputent le **total** via `count()`
(autoritaire) mais laissent la **carte par emoji** en delta. La PR ouverte #1560 (même numéro d'itération
114, session parallèle) « durcissait » au contraire `ReactionService` en le RAMENANT à un delta + `count()`
— soit une régression vis-à-vis du `groupBy` déjà présent sur `main` (patch écrit contre un `main` plus
ancien). **Règle** : ne jamais faire confiance à la description d'un backlog reporté sur « quel jumeau est
déjà durci » — `grep`/lire les 3 implémentations avant de choisir la cible et la direction. Ici la bonne
direction était d'aligner post/commentaire sur le `groupBy` du message (le meilleur patron), pas l'inverse.

**Fix** : `updatePostReactionSummary`/`updateCommentReactionSummary` réécrites sur
`groupBy({ by:['emoji'], where, _count:{emoji:true} })` → carte ET total autoritaires ; `likeCount`
conservé synchronisé sur le total. Signature privée simplifiée `(id)` (drop `emoji/action/count`), 4 sites
d'appel adaptés. Une requête de MOINS par mutation (`groupBy` remplace `findUnique + count`). 142/142 sur
les 2 suites, 352/352 sur 7 suites voisines, tsc vert. RED prouvé par `git stash` du seul source.

**Trouvaille annexe (env)** : `bun install` déclenche un postinstall `turbo run generate --filter=@meeshy/shared`
qui est resté **bloqué >35 min** sans jamais produire le client Prisma. `prisma generate --generator client`
lancé **directement** dans `packages/shared` a réussi en **643 ms**. Le blocage venait du daemon/orchestration
turbo, pas de Prisma. **Règle** : si le `generate` via turbo/bun postinstall traîne anormalement, le tuer et
lancer `npx prisma generate` + `bun run build` directement dans `packages/shared` (les 2 prérequis de parité
CI documentés dans CLAUDE.md) — beaucoup plus rapide et observable.

## Leçon 71 — `getConversationReadStatuses` (batch) ne consultait que les curseurs, ses jumelles mono-message consultent l'UNION curseurs + reçus figés — sous-comptage après `cleanupObsoleteCursors` (2026-07-07, routine messaging)

**Contexte** : trois méthodes de `MessageReadStatusService` calculent le statut livré/lu par message
pour la même conversation. `getMessageReadStatus` et `getMessageStatusDetails` énumèrent l'UNION des
participants ayant un curseur ET de ceux ayant un `MessageStatusEntry` figé (write-once) pour CE message —
précisément pour survivre à `cleanupObsoleteCursors`, qui supprime un `ConversationReadCursor` dont le
`lastReadMessageId` pointe vers un message effacé mais **ne touche jamais** le reçu figé. La jumelle batch
`getConversationReadStatuses` (route `GET /conversations/:id/read-statuses`) ne bouclait QUE sur les curseurs
actifs → après nettoyage d'un curseur, un reçu de livraison/lecture figé toujours valide disparaissait du
comptage. Résultat client-observable : l'endpoint batch renvoyait `receivedCount`/`readCount` **strictement
inférieurs** à l'endpoint mono-message pour EXACTEMENT les mêmes données.

**Fix** : mirroring de la logique d'union. `getConversationReadStatuses` fetch désormais
`messageStatusEntry.findMany({ messageId: { in }, conversationId })`, indexe `messageId → participantId →
entry`, et boucle sur l'union `{curseurs actifs} ∪ {reçus figés de participants actifs}` (sender exclu, figé
d'un participant inactif ignoré — parité exacte avec le `if (!participant) continue` de `getMessageReadStatus`).
Par participant : `receivedAt = frozen.receivedAt ?? frozen.deliveredAt ?? cursorDelivered`,
`readAt = frozen.readAt ?? cursorRead` — copie littérale des lignes 944-955 de la jumelle mono-message.
158/158 sur la suite du service + 188/188 avec la suite de route, tsc gateway 0 erreur. RED prouvé par
`git stash` du seul source : le test "union parity" tombe à `receivedCount:1` au lieu de 2.

**Règle réutilisable** : quand une famille de méthodes calcule la MÊME grandeur (ici statut par message),
toute variante batch/agrégée doit être vérifiée contre la source de vérité mono-message — un durcissement
(ici l'union curseur+figé introduite pour `cleanupObsoleteCursors`) appliqué aux jumelles mono-message mais
oublié sur la variante batch est la signature exacte du sibling-drift que ce backlog trouve à répétition.

## Leçon 72 — un bug de type (`tsc` TS2353 sur un champ inexistant) n'implique pas automatiquement l'impact runtime dramatique qu'il semble suggérer — tracer la fenêtre temporelle avant d'écrire le scénario (2026-07-07, routine calling-feature, Vague 25)

Un agent d'audit web a rapporté `apps/web/hooks/use-adaptive-degradation.ts` : les branches catch de
`suspend()`/`resume()` écrivaient `poorStreak: 0`/`goodStreak: 0` — deux champs qui n'existent PAS sur
`DegradationState` (seuls `poorSince`/`goodSince` existent). Le rapport affirmait un scénario dramatique :
un rejet de `resume()` (ex. `getUserMedia()` refusé) laisserait `goodSince` à sa valeur périmée, provoquant
un re-déclenchement immédiat de `resume-video` au tick suivant — martèlement de `getUserMedia()` toutes les
~2s. `tsc --noEmit` confirmait bien 2 erreurs TS2353 réelles (isolées par `git stash` du seul fichier
source : présentes avant, absentes après le fix, aucune erreur nouvelle ailleurs sur le reste du projet).
Mais un test noir reproduisant exactement le scénario proposé **passait identiquement sur le code bogué et
corrigé** — aucune différence de comportement observable. Cause : chaque transition optimiste
(`suspend-video`/`resume-video`) dans `reduceDegradation` met déjà `poorSince`/`goodSince` à `null` de façon
SYNCHRONE avant même l'appel async, et le flag `state.sending` (déjà basculé à sa valeur optimiste au moment
où l'action async démarre) fait que tout tick reçu PENDANT la fenêtre d'attente retombe systématiquement
dans la branche du FSM qui NE touche PAS le champ que le catch tente de réinitialiser (sending=true pendant
l'attente de `resume()` → seule la branche qui manipule `poorSince` est atteignable, jamais celle qui
manipule `goodSince`, et inversement pour `suspend()`). Le champ mal nommé est donc, dans la structure
ACTUELLE du FSM, un no-op runtime pur — un vrai bug de type/dette de code (fragile si `reduceDegradation`
change un jour sa logique de reset optimiste) mais PAS le bug comportemental décrit.

**Règle réutilisable** : une preuve `tsc`/lecture statique ("un champ n'est jamais réinitialisé") ne suffit
pas à valider un scénario de reproduction runtime — tracer explicitement TOUTE la fenêtre temporelle entre
la transition optimiste et le moment où le catch s'exécute (quels ticks/événements peuvent survenir entre
les deux, et dans quelle branche du FSM ils tombent étant donné l'état DÉJÀ optimistement modifié) avant
d'écrire un scénario de reproduction dans un rapport d'audit. Mieux : falsifier empiriquement avec un test
qui s'exécute sur le code bogué ET corrigé (`git stash` du seul fichier source, comme pour n'importe quelle
preuve RED/GREEN) — si le test passe des deux côtés, le scénario n'est pas confirmé, même si le bug de type
sous-jacent est réel et vaut d'être corrigé. Les deux affirmations (bug de type statique / impact runtime
dynamique) sont indépendantes et doivent être vérifiées et rapportées séparément — ne jamais assumer que la
seconde découle automatiquement de la première. Le fix reste justifié (dette de type réelle, corrige un
TS2353, prépare le terrain si le FSM change), mais le rapport final doit refléter la gravité réelle, pas
la gravité initialement supposée par l'agent d'audit.

## Leçon 73 — le durcissement union curseur+reçu figé (Leçon 71) avait UNE quatrième jumelle non traitée : le calcul INLINE des compteurs dans la route liste `GET /messages` — la plus chaude de toutes (2026-07-07, routine messaging)

**Contexte** : Leçon 71 a corrigé le sous-comptage de `getConversationReadStatuses` (batch) en l'alignant
sur l'union `{curseurs actifs} ∪ {reçus figés actifs}` déjà présente dans `getMessageReadStatus` /
`getMessageStatusDetails`. Mais le calcul des `deliveredCount`/`readCount` par message existe AUSSI en
quatrième exemplaire : inliné dans le handler `GET /conversations/:id/messages`
(`routes/conversations/messages.ts:988-1022`), pas dans le service. Ce quatrième site ne bouclait QUE sur
`conversationReadCursor.findMany` — jamais `messageStatusEntry`. Après `cleanupObsoleteCursors` (supprime un
curseur dont le `lastReadMessageId` pointe vers un message effacé, sans toucher le reçu figé write-once), la
liste rendait `deliveredCount:0`/`readCount:0` (aucun tick ✓✓) alors que `GET /messages/:id/read-status` et
`GET /conversations/:id/read-statuses` renvoyaient `1` pour EXACTEMENT le même message — incohérence sur le
chemin le plus fréquenté (chaque ouverture de conversation).

**Fix** : mirroring littéral de la boucle union de `getConversationReadStatuses` dans la route — troisième
`Promise.all` fetch `messageStatusEntry.findMany({ conversationId, messageId: { in: messageIds } })`, index
`messageId → participantId → entry`, union `evaluatedParticipantIds` (sender exclu, figé d'un participant
inactif ignoré), puis `deliveredAt = frozen?.receivedAt ?? frozen?.deliveredAt ?? cursorDelivered`,
`readAt = frozen?.readAt ?? cursorRead`. 172/172 route + 210/210 suites read-status siblings. RED prouvé par
`git stash` du seul source : le test "union parity" tombe à `deliveredCount:0` au lieu de 1.

**Règle réutilisable** : quand une leçon corrige une « jumelle oubliée » d'une famille de méthodes, GREPPER
tous les sites qui recalculent la même grandeur — pas seulement les méthodes du service. Un calcul INLINE
dans une route (ici un handler de 30 lignes qui n'appelle même pas le service partagé) est un site jumeau
invisible pour une recherche par nom de méthode ; ici la même grandeur (statut livré/lu par message) était
implémentée QUATRE fois — trois dans `MessageReadStatusService`, une inlinée dans la route. Le durcissement
appliqué aux trois du service mais oublié sur l'inline-route est la signature exacte du sibling-drift, et le
site inline est souvent le PLUS chaud (rendu direct de la liste). Idéalement : déléguer la route au service
plutôt que dupliquer la logique — mais à défaut, tout durcissement d'une grandeur doit balayer les copies
inline autant que les méthodes nommées.
## Leçon 73 — deux garde-fous « corrects isolément » sur le même champ partagé peuvent s'annuler mutuellement : `endCurrentAndAnswerPending()` ne répondait JAMAIS à l'appel en attente (2026-07-07, routine calling-feature, Vague 26)

`CallManager.endCurrentAndAnswerPending()` (iOS, "End & Answer" sur la bannière de mise en attente) appelle
`endCall()` puis, après 0.5s, revalide `pendingIncomingCall?.callId == pending.callId` avant de router vers
`handleIncomingCallNotification`. Ce garde a été ajouté (audit 2026-07-02, "bug 3 follow-up") spécifiquement
pour éviter de répondre à un appel déjà raccroché/répondu ailleurs pendant le sleep — correct en isolation,
et testé par une assertion string-search qui vérifie juste la PRÉSENCE de la condition dans le corps de la
fonction. Mais `endCall()` (appelé 3 lignes plus haut, dans la MÊME fonction) déclenche synchronement
`endCallInternal()`, qui neutralise inconditionnellement `pendingIncomingCall = nil` — pour une raison sans
rapport (audit P2-iOS-1 : effacer une bannière "busy" pointant vers une room fantôme quand l'appel ACTIF se
termine pour SES propres raisons). Résultat : le garde de revalidation comparait toujours `nil ==
pending.callId`, donc toujours faux — "End & Answer" ne répondait JAMAIS à l'appelant en attente, à chaque
invocation, silencieusement (pas de crash, pas de log d'erreur, l'appelant en attente restait à sonner
jusqu'au timeout gateway ~60s). Aucun test ne l'a détecté car toute la suite `CallManagerTests.swift` est
faite d'assertions par recherche de sous-chaîne dans le source (le manager est un singleton trop lourd à
instancier avec de vraies dépendances) — chaque garde individuel testait sa PROPRE présence, jamais
l'interaction entre `endCall()` et le guard qui s'exécute après. Fix : un token dédié
(`answeringPendingCallId`), armé AVANT `endCall()`, qui survit à son effet de bord et sert seul de source de
vérité pour la revalidation — `pendingIncomingCall` reste réservé à son rôle originel (état de la bannière).

**Règle réutilisable** : quand deux correctifs distincts (souvent d'audits différents, à des dates
différentes) touchent le MÊME champ mutable partagé pour des raisons différentes dans le même fichier —
l'un l'annule pour raison A, l'autre le relit pour raison B quelques lignes plus loin — leur composition
n'est PAS garantie même si chacun est correct isolément et même si chacun a son propre test. Tracer l'ordre
d'exécution RÉEL (pas juste la présence syntaxique) de toute fonction qui (a) appelle une autre fonction
connue pour muter un champ partagé, PUIS (b) relit ce même champ quelques lignes/un `Task.sleep` plus tard
pour une décision différente. Quand une suite de tests ne peut instancier le système réel (singleton lourd,
dépendances réseau) et se rabat sur des assertions string-search par fonction, chaque garde testé
individuellement donne un FAUX sentiment de couverture — la seule protection réelle contre ce genre de
collision inter-correctifs est un champ de revalidation DÉDIÉ (jamais réutiliser un champ que d'autres
chemins de code ont le droit de muter pour leur propre compte) plutôt qu'un test qui vérifierait
l'interaction (impossible à écrire dans ce style de test sans instancier le vrai objet).

## Leçon 74 — le chemin `add` d'une paire add/remove n'exposait pas le no-op que `remove` signale déjà : `reaction:add` re-broadcastait + re-notifiait sur une ré-réaction identique (2026-07-08, routine messaging, iter 134)

`ReactionService.removeReaction()` retourne un `boolean` (`false` = rien supprimé) et TOUS ses consommateurs
(handler socket, route REST, DELETE conversation) respectent ce faux pour court-circuiter avant le broadcast
`REACTION_REMOVED` — garde idempotente explicite, testée. Mais `addReaction()` retournait
`{ reaction, replacedEmojis }` où le no-op (le participant a DÉJÀ exactement cet emoji, ligne 102) renvoyait
`replacedEmojis: []` — **strictement indiscernable** d'une première réaction authentique (elle aussi
`replacedEmojis: []`). Les 4 consommateurs (`ReactionHandler.handleReactionAdd`, `handleAgentReaction` dans
`MeeshySocketIOManager`, `routes/reactions.ts`, `routes/conversations/messages-advanced.ts`) broadcastaient
donc `REACTION_ADDED` à toute la room ET (3 d'entre eux) firaient `notifyReactionAdded` à chaque ré-envoi
d'un emoji déjà posé — un cas de routine (double-fire optimiste, retry socket après ACK perdu, second device
qui écho le même tap). Effet net : fan-out redondant à tous les participants + (une fois la fenêtre anti-spam
écoulée) seconde notif « X a réagi 👍 » pour une seule réaction logique qui n'a jamais changé d'état.

**Fix** : rendre le service seule source de vérité du « rien n'a changé » — ajouter `unchanged: boolean` à
`AddReactionResult` (`true` sur le retour no-op, `false` sur l'upsert réel), et une garde dans les 4
consommateurs qui répond succès mais saute broadcast + notif quand `unchanged` (miroir exact de la garde
`removed === false`). REST : 200 (pas 201, rien n'a été créé) sur le no-op.

**Règle réutilisable** : quand une opération et son inverse (add/remove, subscribe/unsubscribe,
acquire/release) forment une paire et que l'un des deux expose déjà un signal « no-op / rien fait » respecté
par ses appelants, VÉRIFIER que l'autre l'expose aussi — l'asymétrie (un côté durci contre l'idempotence,
l'autre non) est une signature de sibling-drift (cf. Leçon 72). Le piège spécifique ici : le no-op renvoyait
la MÊME forme de données qu'un succès réel (`replacedEmojis: []` des deux côtés), donc aucun appelant ne
POUVAIT distinguer les deux même en le voulant — un no-op silencieux doit toujours être rendu observable par
le type de retour, jamais laissé se confondre avec le cas nominal. Corollaire test : une garde d'idempotence
n'est prouvée que par un test qui compte les effets de bord (broadcast/notif appelés exactement 0 fois sur le
no-op) — vérifié RED ici en retirant la garde (io.to appelé 1× au lieu de 0×).

## Leçon 75 — `drain()` concaténait la queue mémoire AVANT Redis : un `edited` retombé en mémoire rejouait avant son `new` resté dans Redis (2026-07-08, routine messaging, iter 136)

`RedisDeliveryQueue.drain()` retournait `[...memoryEntries, ...redisEntries]` en s'appuyant sur un commentaire
affirmant que les entrées mémoire « prédatent toujours » ce que Redis contient (elles n'y arrivent que par
fallback pendant une panne Redis). Vrai UNIQUEMENT si Redis était down dès le départ. Faux sur un blip Redis
EN MILIEU de séquence : (1) Redis sain → `enqueue('new', M)` va dans Redis ; (2) blip transitoire →
`enqueue('edited', M)` throw dans `redis.eval`, catché, retombe en MÉMOIRE ; (3) Redis récupère → `drain()`
renvoie `[edited (mémoire), new (redis)]`. `_drainPendingMessages` (MeeshySocketIOManager) rejoue les events
au client dans CET ordre → le client reçoit `MESSAGE_EDITED` AVANT `MESSAGE_NEW` → l'edit cible un message
qu'il n'a pas encore → edit perdu, contenu pré-edit figé. Violation directe de l'invariant FIFO documenté sur
`ENQUEUE_DEDUP_LUA` (« edit/delete après un `new` offline ne doivent pas être perdus, rejeu FIFO »).

**Fix** : chaque entrée porte déjà un `enqueuedAt` monotone (ISO, stampé à l'enqueue par les 3 appelants). Trier
la fusion par `enqueuedAt` croissant au lieu de concaténer mémoire-d'abord. `Array.prototype.sort` étant stable,
les égalités de timestamp gardent l'ordre mémoire-avant-Redis — le test de réconciliation panne-totale (mémoire
enqueuée plus tôt en wall-clock) reste vert, et l'ordre up→down→up est corrigé. Bonus : `_emitDeliveryForDrainedMessages`
qui dérive le « dernier message » de l'ordre d'itération devient correct lui aussi.

**Règle réutilisable** : un commentaire qui justifie un ordre par « X précède toujours Y » cache souvent une
hypothèse temporelle non testée (« la panne a commencé au début »). Dès qu'un buffer de repli (mémoire, retry,
dead-letter) peut recevoir des entrées PENDANT une séquence déjà partiellement écrite dans le canal principal,
son contenu peut être plus RÉCENT que le canal — ne jamais présumer l'ordre par la source, toujours trier par la
clé temporelle monotone que les entrées portent déjà. Test : reproduire le blip milieu-de-séquence (channel sain
→ channel qui throw → channel récupéré) avec des `enqueuedAt` explicitement ordonnés, et asserter l'ordre de rejeu
(RED = ['edited','new'], GREEN = ['new','edited']).

## Leçon 76 — détection UA par `includes` : un token spécifique avalé par un token générique testé plus tôt (2026-07-08, routine messaging, iter 142)

`detectOS` / `detectBrowser` / `detectDevice` (`services/gateway/src/routes/tracking-links/types.ts`) classent le
User-Agent persisté sur CHAQUE clic de lien de tracking (chemin redirect `GET /l/:token` + chemin manuel
`POST .../click`), puis agrégé en `clicksByOS` / `clicksByBrowser` / `clicksByDevice` dans
`TrackingLinkService.getTrackingLinkStats`. Les trois helpers testaient des sous-chaînes `includes()` dans un ordre
naïf « du plus courant au plus rare » — mais les UA réels sont **imbriqués** : un token spécifique est presque
toujours un sur-ensemble d'un token générique testé plus tôt, donc la branche spécifique n'était JAMAIS atteinte.

- `detectOS` : tout UA Android contient `Linux` (`Linux; Android 13; …`) et tout UA iPhone/iPad contient `Mac OS X`
  (`like Mac OS X`). `Linux` étant testé avant `Android` et `Mac OS` avant `iOS`, **tout le trafic Android était
  compté comme Linux-desktop et tout l'iPhone/iPad comme macOS** — les deux OS mobiles dominants faux dans chaque
  rapport.
- `detectBrowser` : Opera moderne est Chromium (`… Chrome/104 … OPR/90`), sans `Edg`. La branche Chrome
  (`Chrome && !Edg`) l'attrapait avant la branche Opera → Opera compté comme Chrome.
- `detectDevice` : Safari iPad porte le token `Mobile` (`Mobile/15E148`). La branche `Mobile` renvoyait `mobile`
  avant que la branche `iPad` soit évaluée → tout iPad compté comme mobile ; le bucket `tablet` était de fait
  inatteignable.

**Fix** : ordonner chaque chaîne du **plus spécifique au plus générique** — mobile avant desktop dans `detectOS`
(Windows → Android → iOS → macOS → Linux), Opera/Edge avant Chrome dans `detectBrowser`, tablette avant mobile dans
`detectDevice` (+ heuristique Android-sans-`Mobile` = tablette). Aucun test préexistant ne couvrait ces helpers
(RED = 6 assertions fausses avant fix, GREEN après). 12 suites tracking (243 tests) restent vertes, `tsc --noEmit` OK.

**Règle réutilisable** : une cascade de `str.includes(token)` avec `return` au premier match n'est correcte QUE si
les tokens sont mutuellement exclusifs. Dès que le domaine réel est imbriqué (UA, MIME, chemins, langues avec
sous-tags), un token « fin » (Android, iPhone, iPad, OPR, Edg) est presque toujours contenu dans une chaîne qui
porte aussi un token « large » (Linux, Mac OS, Chrome, Mobile) — le spécifique DOIT être testé avant le générique,
sinon il est mort. Signature du bug : la branche générique n'a pas de garde d'exclusion (`&& !contientLeSpécifique`)
alors qu'une branche plus bas teste précisément ce spécifique. Balayer chaque fonction de classification par
sous-chaîne et se demander pour chaque paire (générique, spécifique) : « un input du type spécifique contient-il
aussi le token générique ? » Si oui et que le générique est testé d'abord → le spécifique est inatteignable.

## Leçon 77 — présence : le court-circuit modérateur batch bypassait la désactivation, divergeant du chemin single-target (2026-07-08, routine messaging, iter 144)

`PresenceVisibilityService` a DEUX chemins qui doivent rendre le même verdict (SSOT = helper pur
`resolvePresenceVisibility`, `packages/shared/utils/presence-visibility.ts`) : `resolveForTarget` (profil unique)
et `resolveForTargets` (batch, consommé par `/users/presence` + recherche). Le helper pur place
`targetIsDeactivated || isBlockedEitherWay → HIDDEN` **avant** le check de privilège `isSelf || isGlobalModerator`
(invariant design §8 : « Compte désactivé → présence masquée **en amont** »).

`resolveForTarget` respecte l'invariant : `if (target.deactivatedAt) return HIDDEN;` est la TOUTE PREMIÈRE ligne,
donc un modérateur regardant un compte désactivé voit HIDDEN. Mais `resolveForTargets` court-circuitait les
modérateurs AVANT même de charger `deactivatedAt` :
```ts
if (viewer && isGlobalModerator(viewer.role)) {
  for (const id of uniqueIds) result.set(id, FULL);   // désactivés → FULL, fuite
  return result;
}
const targetRows = await prisma.user.findMany({ ... select: { deactivatedAt: true } }); // trop tard
```
**Scénario de fuite** : un modérateur parcourant une LISTE de présence voyait `showOnline/showLastSeen = true`
pour un compte désactivé, alors que la vue PROFIL unique du même compte masquait correctement (last-seen d'un
compte désactivé exposé). Divergence directe entre les deux chemins d'un même SSOT.

**Fix** : remonter le fetch `deactivatedAt` (un seul `findMany` batché, pas une requête par-id) AVANT le
court-circuit modérateur, et y masquer les cibles désactivées : `result.set(id, deactivated.has(id) ? HIDDEN : FULL)`.
Aligne le batch sur `resolveForTarget` et sur le helper pur. Le check block-pour-modérateur reste inchangé
(les deux chemins concordent déjà — `resolveForTarget` retourne FULL avant le check block pour un modérateur ;
§4.2 « pas de requête » l'assume ; pas de divergence interne, donc hors scope de ce correctif conservateur).
Test RED ajouté : `resolveForTargets(moderator, [désactivé]) → HIDDEN` (échouait FULL avant, vert après ;
16/16 suite service + 49/49 sur 6 suites présence + 22/22 communities members).

**Règle réutilisable** : quand deux méthodes d'un même service (unique vs batch) doivent partager un SSOT, un
court-circuit « fast-path » (privilège, cache, rôle) placé AVANT de charger un flag de garde (désactivation,
blocage, suppression) va bypasser ce flag sur ce seul chemin. Signature du bug : la méthode single-target teste
le flag en PREMIER, mais la méthode batch teste le privilège en premier et ne charge le flag qu'ensuite. Vérifier
que TOUT fast-path d'un chemin batch charge et honore les mêmes gardes « en amont » que son jumeau single-target —
sinon la liste fuite ce que le détail masque.

## Leçon 78 — enqueue offline du delete : on excluait l'AUTEUR au lieu du SUPPRESSEUR (2026-07-08, routine messaging, iter 144)

`MessageHandler.handleMessageDelete` rejoue les suppressions aux destinataires hors-ligne via
`_enqueueOfflineEventForParticipants(conversationId, senderParticipantId, 'deleted', …)`, dont la boucle saute
`p.id === senderParticipantId` (l'ACTEUR de l'action) — plus les participants en ligne. L'appel delete passait
`message.senderId`, c.-à-d. l'**id participant de l'AUTEUR** du message. C'est correct sur `message:send`/`message:edit`
(seul l'auteur édite → auteur == acteur), mais `handleMessageDelete` autorise aussi admins/modérateurs (de conversation
OU globaux) à supprimer le message d'AUTRUI. Sur ce chemin auteur ≠ suppresseur.

**Scénario de perte** : auteur A (hors-ligne), modérateur B (en ligne) supprime le message de A. L'emit live
`message:deleted` part vers la room conversation → A hors-ligne le rate. La boucle d'enqueue atteint A mais
`p.id === message.senderId` (id participant de A) → `continue` → **A n'est jamais mis en file**. À la reconnexion
(`_drainPendingMessages`) A ne reçoit pas la suppression et continue d'afficher un message retiré par un modérateur,
jusqu'à un refetch complet sans rapport. Le `senderParticipantId` était de toute façon **redondant** pour sa raison
d'être (l'acteur vient d'agir via sa socket → il est en ligne → déjà exclu par `connectedUsers.has`), et donc
uniquement NUISIBLE quand auteur ≠ acteur.

**Fix** : passer l'id participant du **suppresseur**, pas de l'auteur. Sa ligne participant conversation-scoped est
déjà chargée (`message.conversation.participants` filtré par `where: { userId, isActive }` = l'utilisateur courant) ;
ajouter `id` à ce `select` et passer `message.conversation.participants[0]?.id`. Fallback = `undefined` (PAS
`message.senderId`) : quand le suppresseur est un admin GLOBAL non-participant, `participants` est vide → skip personne
(l'admin global n'est pas dans la boucle des participants de la conv, et s'il l'était il serait en ligne donc exclu).
Piège écarté : la proposition initiale `?? message.senderId` réintroduisait le bug pour les deletes d'admin global.
Test RED : admin supprime le message d'un auteur hors-ligne → 0 enqueue avant, 1 enqueue (auteur) après. 430 tests
MessageHandler verts, tsc OK.

**Règle réutilisable** : un paramètre « exclure l'acteur » n'est juste que si la variable passée EST l'acteur sur
TOUS les chemins. Dès qu'une action a plusieurs auteurs possibles (l'auteur du contenu vs. un modérateur agissant
dessus), ne pas dériver l'« acteur à exclure » d'un champ du CONTENU (`senderId`, `ownerId`, `createdBy`) — le dériver
de l'IDENTITÉ de l'appelant (participant/utilisateur authentifié courant). Signature du bug : `skip = entity.authorId`
alors que l'action est autorisée à un tiers. Et si l'exclusion est de toute façon redondante avec une autre garde
(ici « en ligne »), la retirer ou la fonder sur l'identité de l'appelant — jamais sur le contenu.

---

## iter 155 — `mention:created` jamais émis : `validatedMentions` lu comme objets alors que c'est `String[]`

`MeeshySocketIOManager._broadcastNewMessage` (chemin broadcast REST de `broadcastMessage`) castait
`message.validatedMentions` en `Array<{ userId?, participantId?, username? }>` puis lisait `mention.userId`.
Or `validatedMentions` est persisté en **`String[]` de usernames** (`schema.prisma:619` ; producteur
`MessageProcessor` l.926-940 écrit `finalValidatedUsernames: string[]`). Lire `("bob").userId` → `undefined`,
le garde `if (targetUserId && …)` est toujours faux → **`MENTION_CREATED` n'était jamais émis** pour aucun
message réel. Les tests existants masquaient le bug en injectant une forme `{ userId }` fabriquée qui
n'existe jamais en prod.

**Second bug latent (id-space)** sur la même ligne : l'auto-exclusion comparait `targetUserId` (un `User.id`)
à `message.senderId` (un `Participant.id`) — jamais égaux, donc une vraie auto-mention n'aurait pas été exclue.
Même famille que le bug delete de l'iter précédente (Participant.id vs User.id).

**Fix** : résoudre les usernames en `User.id` via `resolveUsernamesToIds(this.prisma, usernames)` (déjà utilisé
ailleurs dans le fichier + par `MessageHandler._resolveMentionUserIds` sur le chemin socket), exclure via
`resolvedSenderId` (le `User.id` de l'expéditeur, déjà calculé l.1815 et utilisé pour le payload `MESSAGE_NEW`),
et wrapper en try/catch pour qu'un échec de lookup ne bloque jamais le broadcast du message. Le champ
`mentionedParticipantId` (optionnel dans `MentionCreatedEventData`) est retiré du payload : on n'a plus que des
usernames, et le socket path ne le posait pas non plus. Bonus : `senderId` passe de Participant.id à User.id,
alignant `MENTION_CREATED` sur `MESSAGE_NEW` (les clients comparent senderId à leur userId).

**Règle réutilisable** : ne jamais caster un champ Prisma vers une forme d'objet sans vérifier son type réel
dans `schema.prisma` — un `String[]` (`@default([])`) n'est PAS un tableau d'objets. Signature du bug : un cast
`as unknown as Array<{…}>` sur un champ scalaire, suivi d'un accès `.prop` qui est toujours `undefined` et d'un
garde qui du coup ne s'ouvre jamais (branche morte que les tests couvrent avec une forme fabriquée). Tester avec
la forme RÉELLE persistée, pas la forme pratique pour le test.

---

## Leçon 79 — un sibling-drift peut se cacher dans une classe entièrement différente de celle qu'on vient de corriger (routine calling-feature, Vague 31, 2026-07-09)

Les Vagues 25/27/30 ont corrigé 3 fois le même bug — `duration` persisté comme `now - startedAt`
(temps de sonnerie + conversation) au lieu de `answeredAt ? now - answeredAt : 0` (temps de conversation
réel) — à chaque fois en supposant avoir traité le dernier writer terminal restant, et à chaque fois en
cherchant les siblings **dans le même fichier/classe** (`CallCleanupService.ts`, ses 4 tiers de GC).
La Vague 31 en a trouvé 2 de plus, mais dans `CallService.ts` — une classe différente, avec une
responsabilité de terminaison d'appel qui LUI APPARTIENT AUSSI (le phantom-cleanup et le zombie-cleanup
que `initiateCall()` exécute lui-même avant de créer un nouvel appel). Rien ne les reliait
syntaxiquement aux writers déjà corrigés — même `grep -n "duration" CallCleanupService.ts` ne les
aurait jamais fait apparaître.

**Règle réutilisable** : quand un bug de type « writer terminal incohérent » (anchor de date, garde de
version, fanout de room, etc.) est trouvé et corrigé dans une classe, chercher les siblings par
**responsabilité** (grep du champ concerné — ici `duration`/`answeredAt`/`startedAt` — sur TOUT le
répertoire `services/`, pas seulement le fichier corrigé), pas par proximité de fichier. Une
responsabilité de terminaison de session peut légitimement être dupliquée entre le service métier
principal (`CallService`) et un service de nettoyage dédié (`CallCleanupService`) sans que ce soit un
défaut d'architecture en soi — mais ça veut dire qu'un correctif doit être recherché aux DEUX endroits,
systématiquement, avant de déclarer un bug family clos.

---

## Leçon 80 — un objet partagé par référence entre N instances d'un service "par pair" transforme un cleanup local en effet de bord global (routine calling-feature, Vague 32, 2026-07-09)

`use-webrtc-p2p.ts` (web) garde une instance `WebRTCService` **par participant distant** dans un appel de
groupe (`webrtcServicesRef`, une `Map`) — l'intention claire du design est que chaque instance possède SON
PROPRE état de connexion, isolé des autres. Mais `addLocalMedia(stream, …)` leur passe à toutes la MÊME
référence `MediaStream` (celle du store `useCallStore.localStream`, jamais clonée), et
`WebRTCService.close()` faisait `this.localStream.getTracks().forEach(track => track.stop())`
inconditionnellement. `close()` sur UNE instance (`removeParticipant()`, appelé par un vrai
`participant-left` en cours d'appel de groupe, ou par le cleanup d'un échec de négociation limité à UN
pair) stoppait donc les tracks matérielles **utilisées par toutes les autres instances encore actives** —
un participant qui raccroche coupait le micro/caméra de tout le monde, alors que leurs connexions
respectives restaient `connected`. Le vrai propriétaire du cycle de vie du stream partagé existait déjà
ailleurs dans le code (`call-store.ts`'s `reset()`, qui stoppe les tracks UNE SEULE FOIS au vrai teardown
de fin d'appel) — le `close()` par-instance était un second stoppeur, redondant sur le chemin correct
(fin d'appel réelle) et actif-destructeur sur le chemin incorrect (un seul pair qui part).

**Règle réutilisable** : quand une collection tient N instances d'une classe "par pair/par ressource"
(`Map<participantId, Service>`), vérifier si un champ qu'elles reçoivent en construction/attachement est
un objet passé **par référence partagée** (pas cloné, pas recréé par instance) plutôt qu'une ressource
réellement possédée par l'instance. Si oui, toute méthode de cleanup de CETTE instance qui mute cet objet
partagé (`.stop()`, `.close()`, `.clear()`, toute API qui altère l'état plutôt que de simplement cesser de
le référencer) doit soit (a) ne jamais le faire depuis un cleanup "à la portée d'une seule instance", soit
(b) recevoir un paramètre explicite (`{ stopLocalTracks: boolean }`) distinguant "je me détache de la
ressource" de "je termine la ressource pour de bon", avec le vrai teardown final réservé au seul
propriétaire légitime (ici, le store qui a créé le stream). Signature du bug : `close()`/`dispose()`/
`teardown()` sans paramètre, appelé à la fois sur un seul élément d'une collection ET sur la collection
entière, mutant un champ qui s'avère être le MÊME objet dans tous les éléments — un test qui ne construit
qu'UNE instance à la fois ne peut jamais détecter ce genre de fuite inter-instance (c'est exactement
pourquoi aucun des tests `close()` existants ne l'avait attrapé : chacun testait une seule instance avec
son propre stream mocké, jamais deux instances partageant la même référence).

---

## Leçon 80 — le MÊME event socket peut être émis en deux id-spaces selon le transport ; vérifier que tous les writers d'un champ comparé côté client résolvent pareil (routine messaging, iter 157, 2026-07-09)

`message:new.senderId` était résolu vers le `User.id` par le writer REST/ZMQ
(`MeeshySocketIOManager.broadcastMessage`, avec un commentaire explicite « les clients comparent
senderId avec leur userId ») mais émis en `Participant.id` **brut** par le writer du chemin WS
`message:send` (`MessageHandler._buildMessagePayload`). `Message.senderId` est un `Participant.id`
(relation Prisma `MessageSender` → `Participant`), donc les deux writers d'un même wire event
mettaient des id-spaces différents. Côté client web, `use-socket-cache-sync.ts` compare
`message.senderId === currentUser.id` (un `User.id`) pour détecter ses propres messages et promouvoir
l'optimistic bubble multi-device — sur le chemin WS le test échouait toujours (Participant.id ≠
User.id), donc l'auteur voyait son propre message en double / rendu comme entrant. Le bug était
**invisible sur le chemin REST** (qui résolvait correctement) : seul le transport WS était atteint.

**Signature du bug** : un champ de payload socket comparé côté client à un id utilisateur, construit
par ≥2 writers (un par transport : WS vs REST vs ZMQ), dont un seul applique la résolution
`participant.userId ?? participant.user?.id ?? message.senderId`. Le writer « correct » porte souvent
un commentaire justifiant la résolution — mais ce commentaire ne protège PAS les writers siblings qui
n'ont jamais reçu le même traitement.

**Règle réutilisable** : quand un writer d'un event socket résout un id (Participant→User) avec une
justification « les clients comparent à leur userId », grep IMMÉDIATEMENT le nom de l'event
(`MESSAGE_NEW`/`message:new`) ET le champ (`senderId: message.senderId`) sur TOUT le service pour
trouver les autres writers du même event qui n'ont pas la résolution — un par transport. Ne jamais
supposer qu'un seul chemin construit un event : le send a au moins WS + REST, souvent + un
re-broadcast ZMQ (traduction). Le champ `sender.id` (Participant.id) reste disponible séparément pour
les rares consommateurs qui en ont besoin ; ne PAS toucher les events où les deux writers sont
cohérents entre eux (`CONVERSATION_UPDATED` garde le Participant.id brut des deux côtés — consommateur
distinct, pas de divergence).

---

## Leçon 81 — un fanout « écran liste » ajouté sur le chemin d'envoi doit l'être AUSSI sur edit/delete/recall — chercher les mutations siblings du même agrégat de liste (routine messaging, iter 158, 2026-07-09)

Le chemin d'envoi (`broadcastNewMessage`) fanne `CONVERSATION_UPDATED` (aperçu `lastMessageId`/
`lastMessagePreview`) vers **chaque salle `user:<id>`** des participants, avec un commentaire explicite :
sinon un membre posé sur la **liste de conversations** (qui a quitté `conversation:<id>` mais reste dans
`user:<id>`) ne reçoit jamais le signal et sa ligne reste figée. Mais **édition et suppression** — qui
changent aussi l'aperçu de la liste quand elles touchent le dernier message — n'émettaient que
`MESSAGE_EDITED`/`MESSAGE_DELETED` vers `conversation:<id>`, jamais `CONVERSATION_UPDATED` vers les salles
user. Le handler delete recalculait pourtant déjà `lastMessageAt` : le serveur *savait* que l'aperçu avait
changé, mais ne le disait qu'aux sockets dans la salle conversation. Faille auto-réparée par SWR à la
réouverture → fenêtre invisible = « rester sur la liste sans rouvrir la conversation », donc facile à rater
en test manuel.

**Signature du bug** : un agrégat affiché sur un écran de LISTE (aperçu de dernier message, compteur non-lus,
badge, ordre de tri) est rafraîchi en temps réel par UN chemin de mutation (create) via un fanout vers les
salles `user:` — mais les AUTRES mutations du même agrégat (edit, delete, recall, réaction qui change le
preview, pin/unpin) n'émettent que vers la salle `conversation:`, que l'observateur liste-seule ne rejoint
pas.

**Règle réutilisable** : quand un fanout vers les salles `user:` est ajouté sur une mutation « parce que
l'écran liste doit se rafraîchir même sans la conversation ouverte », énumérer IMMÉDIATEMENT **toutes** les
mutations qui touchent le même agrégat de liste et vérifier qu'elles fannent pareil. Extraire un **helper
partagé** (ici `emitConversationPreviewUpdate`) plutôt que dupliquer l'emit inline sur N sites (ici 7 : WS +
2 routes REST) — la duplication inline est exactement ce qui laisse un transport dériver (cf. Leçon 80). Le
helper recalcule l'agrégat depuis la source de vérité (dernier message non supprimé) pour rester
auto-cohérent : appliqué à une mutation d'un élément **non-dernier**, il ré-émet l'aperçu inchangé (no-op
idempotent client) plutôt que d'exiger une détection « est-ce le dernier ? » fragile. Best-effort strict :
un fanout side-channel ne doit JAMAIS faire échouer la mutation primaire déjà réussie (try/catch interne,
`onError` optionnel pour la traçabilité).

---

## Leçon 82 — un garde de sécurité/annulation placé AVANT une opération qui peut encore throw protège moins que prévu ; le placer une fois le succès confirmé (routine calling-feature, Vague 33, 2026-07-09)

`CallEventsHandler.ts`'s `call:join` handler appelait `cancelDisconnectGrace(callId, userId)` juste après
la validation Zod du payload, mais AVANT `resolveParticipantIdFromCall` et `callService.joinCall(...)` —
deux opérations qui peuvent encore throw (DB transitoire, race). Le commentaire au-dessus de l'appel
("a (re)join cancels any pending disconnect grace timer... the participant's signaling socket is back")
décrivait l'intention correcte, mais le PLACEMENT trahissait cette intention : le code annulait la grâce
sur la base de "une tentative de join a été REÇUE", pas "le join a RÉUSSI". Si le join échouait ensuite
pour une raison sans rapport avec l'état réel de l'appel, le participant perdait à la fois son socket actif
(le join a échoué) ET son timer de grâce (déjà annulé) — exactement le double filet que ce mécanisme
existe pour fournir. Le `catch` du handler n'avait aucune ré-armement compensatoire.

**Règle réutilisable** : quand un commentaire dit "X annule/confirme Y parce que l'opération a réussi",
vérifier que l'annulation/confirmation est physiquement placée APRÈS le `await` qui peut encore échouer,
pas avant par convenance de lisibilité (ex. grouper toute la logique "post-validation" en haut du handler).
Un signal d'alarme : l'annulation est suivie d'AUTRES opérations asynchrones qui peuvent throw avant la
fin du handler — si l'une d'elles échoue, l'annulation a déjà eu lieu sans jamais être compensée dans le
`catch`. Le fix est presque toujours un simple déplacement de ligne (pas une réécriture), mais il faut
ensuite auditer les tests existants qui pourraient avoir été écrits pour caractériser l'ANCIEN comportement
plutôt que l'intention réelle — ici, un test nommé "re-join... cancels the pending end" mockait en réalité
un join qui échoue TOUJOURS (config par défaut du test harness), avec un commentaire inline documentant
explicitement "bails after cancel, but the cancel already ran" comme si c'était le comportement voulu. Le
titre du test décrivait l'intention (rejoin réussi → annulation) mais le corps testait l'accident (rejoin
échoué → annulation quand même) — un signe qu'un test a dérivé pour suivre l'implémentation plutôt que la
spec. Toujours relire le TITRE du test contre son CORPS quand on modifie le comportement qu'il pin.

---

## Leçon 83 — un fast-path "perf" qui diffuse un effet observable AVANT le contrôle d'autorisation reste risqué même quand le contrôle d'autorisation lui-même est correct (routine calling-feature, Vague 35, 2026-07-10)

`CallEventsHandler.ts`'s `call:end` handler avait un fast-path de perf (2026-07-04) qui diffusait
`call:ended` à la room dès que `socket.rooms.has(ROOMS.call(callId))` était vrai, avec le commentaire
« l'appartenance à la room EST l'autorisation — rejoindre a exigé un `call:join` vérifié en DB ». Cette
affirmation était vraie AU MOMENT du join, pas un invariant permanent : rien n'évince un socket de la call
room si l'autorisation sous-jacente est révoquée plus tard (retrait de la conversation en cours d'appel).
Un fix sécurité du même jour (2026-07-10) avait déjà corrigé le SYMPTÔME visible côté écriture DB
(`resolveParticipantIdFromCall` échouant refuse maintenant de force-end la session) — mais le broadcast
fast-path, place AVANT ce contrôle dans le code, avait déjà notifié la room par le temps que le rejet
s'exécute. Le contrôle d'autorisation lui-même était correct ; seul son PLACEMENT après un effet de bord
déjà émis le rendait inefficace pour ce cas précis.

**Signature du bug** : un commentaire justifie un fast-path/raccourci par "X a déjà été vérifié à l'étape Y
(join/login/attribution initiale)", mais le fast-path s'exécute à une étape Z ultérieure sans revalider —
et rien dans le système ne garantit que la condition vraie en Y reste vraie en Z (pas d'éviction de room,
pas de TTL, pas de re-check périodique). Un fix de sécurité qui corrige le contrôle d'autorisation
LUI-MÊME sans auditer TOUT ce qui s'exécute avant lui dans le même handler laisse le trou ouvert pour
n'importe quel effet de bord placé plus tôt (broadcast, écriture cache, notification push, etc.) — cf.
Leçon 82 (garde placé avant un `await` qui peut throw) pour le même symptôme côté écriture, mais ici
côté diffusion réseau observable par un tiers, pas côté état interne.

**Règle réutilisable** : quand un fix corrige un contrôle d'autorisation dans un handler, lire le handler
ENTIER de haut en bas et lister chaque effet de bord observable par un tiers (broadcast socket, écriture
DB, notification push, log visible côté client) qui s'exécute AVANT ce contrôle — pas seulement APRÈS,
là où le contrôle corrigé s'applique déjà. Un fast-path "perf" ajouté pour la latence perçue est le
site le plus probable d'un tel effet de bord prématuré, précisément parce qu'il existe pour COURT-CIRCUITER
le chemin qui contient le contrôle d'autorisation complet.

---

## Leçon 84 — une émission qui ÉNUMÈRE `adapter.rooms` (ou lit `connectedUsers`/`socketToUser`) ne voit QUE le nœud local ; sur un déploiement multi-nœud (Redis adapter) elle perd silencieusement tous les destinataires connectés à un autre nœud (routine messaging, Vague 36, 2026-07-10)

`_emitMessageNewByLanguage` (présent en DEUX exemplaires : `MessageHandler.ts` chemin WS `message:send`,
et `MeeshySocketIOManager.ts` chemin REST/ZMQ + rediffusion des traductions) construisait le fan-out
`message:new` en énumérant `this.io.sockets.adapter.rooms.get(room)` puis en résolvant la langue de chaque
socket via les maps mémoire `connectedUsers`/`socketToUser`, avant d'émettre `io.to(socketId)` par groupe de
langue. Les trois sources — `adapter.rooms`, `connectedUsers`, `socketToUser` — ne contiennent QUE les
sockets du nœud courant. Sur la topologie horizontale documentée (100k+ msg/s via le Socket.IO Redis
adapter), un destinataire connecté à un AUTRE nœud gateway n'apparaît dans aucune des trois → il n'était
jamais énuméré, jamais émis, et le early-return `if (!socketIds || socketIds.size === 0) return;` court-
circuitait même l'envoi lorsque le nœud émetteur (celui de l'expéditeur) n'avait aucun socket local dans la
room. Résultat : sous `SOCKET_LANG_FILTER=true` en multi-nœud, `message:new` n'atteignait plus les
destinataires distants EN TEMPS RÉEL (récupérés seulement au prochain `/sync` ou refetch). Les chemins NON
filtrés (`io.to(room).emit(...)` / `.except(ROOMS.user(sender))`) n'avaient PAS le bug car le Redis adapter
propage `io.to(room)` à tout le cluster — seul le chemin filtré, qui énumère manuellement, régressait une
diffusion cross-node-correcte en diffusion locale-seulement.

**Signature du bug** : un raccourci/optimisation remplace un `io.to(room).emit(...)` (adapter-propagé,
cluster-wide) par une énumération manuelle de `adapter.rooms` / une lecture des maps de présence en mémoire,
pour émettre socket-par-socket. Toute décision de livraison bâtie sur ces structures est intrinsèquement
locale au nœud. Le bug est INVISIBLE en test unitaire mono-process et en dev mono-nœud — il n'apparaît qu'en
production multi-réplica.

**Règle réutilisable** : `adapter.rooms.get(room)`, `connectedUsers`, `socketToUser`, `userSockets` sont
des vues LOCALES au nœud. Dès qu'une émission dépend d'elles pour décider QUI reçoit, elle doit conserver un
filet cluster-wide pour les destinataires non-locaux : diffuser le payload complet via `io.to(room)`
(adapter-propagé) en `.except([...socketsLocaux, sender])` — les sockets locaux reçoivent la version
optimisée/trimmée, les sockets distants reçoivent le payload complet, chacun exactement une fois ; sur un
seul nœud l'except couvre toute la room et la diffusion cross-node ne touche personne (comportement
inchangé). Ne JAMAIS placer un tel calcul local-seulement AVANT un early-return qui suppriment aussi la
diffusion distante. Corollaire de duplication (SSoT) : ce helper existait en deux copies divergentes (une
via le helper pur `groupSocketsByLanguage`, l'autre en grouping inline) — le même bug logique devait être
corrigé aux DEUX sites ; un audit d'un seul fichier (ici `MessageHandler.ts`) aurait laissé le chemin
REST/ZMQ (le plus emprunté : tout envoi REST + toute rediffusion post-traduction) toujours cassé.

## 2026-07-11 — « Limitation système » = diagnostic non prouvé ; toujours faire le différentiel app minimale

**Correction user** : j'ai présenté « iOS 26 n'affiche pas les icônes des menus contextuels natifs » comme
une limitation système documentée (mémoire d'une session antérieure, "confirmé app-wide"). Le user a
répondu : « faux, ceci est un échec de configuration, recherche comment bien faire ». Il avait raison.

**Vraie cause** : `MeeshyRefreshableScroll` (wrapper SDK de TOUTES les listes) posait `.tint(.clear)` sur
le ScrollView entier pour masquer le spinner natif du `.refreshable`. L'environnement tint se propage au
contenu, et sur iOS 26 les icônes des menus Liquid Glass suivent le tint → icônes transparentes partout
dans l'app (d'où le faux "app-wide = système"). Le spinner était déjà masqué par le proxy
`UIRefreshControl.appearance().tintColor = .clear` (AppDelegate).

**Méthode qui a tranché (à refaire systématiquement)** :
1. Menu contextuel SYSTÈME sur le même simulateur (home screen) → icônes présentes → pas l'OS.
2. App SwiftUI MINIMALE (même Xcode, même runtime, même deployment target, même code Label) → icônes
   présentes → c'est NOTRE app. À partir de là c'est une bissection, pas une spéculation.
3. Sondes .contextMenu déplacées dans la hiérarchie (racine → OK ; sous le wrapper → KO) → l'ancêtre
   coupable se cerne en 2 sondes.

**Règles** :
- « Confirmé app-wide » ne signifie PAS « système » : un wrapper partagé par tous les écrans produit
  exactement la même signature. Un état app-wide doit d'abord faire suspecter un ancêtre COMMUN.
- Ne jamais graver en mémoire « limitation OS » sans le différentiel app-minimale. La mémoire erronée a
  coûté un menu custom entier (ConversationContextMenuView) construit pour contourner un bug qui était
  à nous.
- `.tint(.clear)` (ou tout override d'environnement destructif) ne se pose JAMAIS sur un conteneur qui
  a du contenu — le scoper à l'élément visé ou passer par le proxy UIKit dédié.
- Corollaire crash : un `@ViewBuilder () -> MenuContent` générique stocké sur une row `.equatable()`
  ré-exécute le builder à chaque body pass (mesures LazyVStack) et copie un tuple géant en pleine
  récursion de layout → EXC_BAD_ACCESS PAC au lancement (initializeWithCopy for Button). Résoudre le
  menu UNE fois à la construction et le stocker en AnyView (précédent MeeshyAvatar « single, stable
  array » ; AnyView acceptable pour du contenu de menu — pas d'identité structurelle à préserver).

## 2026-07-11 — zsh n'expanse pas `$VAR` en plusieurs arguments : xcodebuild « TEST SUCCEEDED » avec 0 test

Un run `xcodebuild test` avec les filtres dans une variable (`TESTS='-only-testing:A -only-testing:B'`
puis `xcodebuild ... $TESTS`) a « réussi » en exécutant ZÉRO test : sous zsh, `$TESTS` non quoté reste
UN SEUL argument (pas de word-splitting par défaut, contrairement à bash) → filtre invalide → aucun
test ne matche → exit 0. Les baselines snapshot supprimées n'avaient PAS été ré-enregistrées.

**Règles** :
- Jamais de liste d'arguments dans une variable scalaire sous zsh — flags inline, tableau zsh
  (`tests=(-only-testing:A ...)` puis `"${tests[@]}"`), ou script bash explicite.
- Un résultat de tests se valide sur « Executed N tests » avec N ATTENDU, jamais sur l'exit code ni
  sur « TEST SUCCEEDED » seul (même famille que meeshy.sh exit 0 malgré FAILED, et que le script
  record-snapshot qui listait des PNG périmés).
- Après un record de baselines : compter les PNG frais (`-newermt`), pas les messages du log.

## 2026-07-11 — Mock jest PARTIEL d'un module partagé = régression silencieuse quand la prod consomme un nouvel export

La migration des literals `socket.on('presence:app-state')` vers `CLIENT_EVENTS.PRESENCE_APP_STATE`
a cassé 227 tests en CI (`a7280bcf9`) : la suite legacy `src/socketio/__tests__/CallEventsHandler.test.ts`
mockait `@meeshy/shared/types/socketio-events` en n'exportant QUE `ROOMS` → `CLIENT_EVENTS` undefined
→ `setupCallEvents` crashait au premier `socket.on`. Vérification locale faite uniquement sur
`src/__tests__/unit/socketio/` + tsc : la suite fautive vit dans `src/socketio/__tests__/` (autre dossier).

**Règles** :
- Avant de pousser un changement gateway qui touche un module PARTAGÉ (shared types/utils) : grep
  `jest.mock('@meeshy/shared/...')` sur les deux arbres de tests (`src/__tests__/` ET `src/*/__tests__/`)
  — tout mock partiel du module modifié doit exposer les nouveaux exports (ou `jest.requireActual`).
- « Suite socketio verte » ≠ « gateway vert » : les tests CallEventsHandler existent dans DEUX dossiers.
  Le gate pré-push d'un changement handler = `bun run jest Call` minimum, suite complète si le diff
  touche packages/shared.
- tsc ne voit RIEN ici : le mock est un objet runtime. Seule l'exécution des suites attrape ce trou.

**Corollaire (2026-08-08, cycle 25) — la règle vaut aussi pour un service INTERNE, et une
délégation la déclenche.** Collapser une copie d'algorithme en délégation fait appeler, depuis ce
chemin, une méthode que personne n'y appelait : aucun double du service ne l'expose. Le piège est
silencieux par construction quand l'appelant est best-effort — la méthode absente vaut `undefined`,
l'appel lève, le catch avale, le contenu ressort brut. Rien ne casse bruyamment ; seule une
assertion « l'accès base a-t-il eu lieu » échoue. DEUX fichiers doublaient ici le même
`TrackingLinkService` (`MessageProcessor.test.ts` ET `MessagingService.test.ts`) ; corriger le
premier a suffi à verdir la suite CIBLÉE, et seule la suite COMPLÈTE (~3 min) a sorti les 2 échecs
du second. Ne jamais conclure une délégation sur une suite ciblée.

**Corollaire — face au `undefined`, doubler l'algorithme est le mauvais remède.** La tentation est
d'ajouter un `jest.fn()` renvoyant un résultat plausible : cela produit un TROISIÈME exemplaire de
ce qu'on vient de dédupliquer. Deux issues correctes, selon ce que le test décrit : monter la VRAIE
méthode (`jest.requireActual(...).Klass.prototype.method`) sur un objet dont seuls les accès base
restent doublés — les tests exercent alors l'algorithme partagé ; ou bien assumer que le test ne
décrit plus que la DÉLÉGATION, le doubler par une identité, et déménager la couverture de
l'algorithme vers la suite de son propriétaire. Ce qu'il ne faut pas, c'est un double qui
RÉIMPLÉMENTE.

## 2026-07-11 — Item d'audit partagé entre sessions : vérifier les WORKTREES avant de développer

En soldant « listeners #5 » de l'audit appels, j'ai réimplémenté (`62b111b80`) une feature déjà
développée EN MIEUX (avec `translated-segment` en plus) par une session parallèle dans
`.claude/worktrees/feat-calls-audit-5-9-remainders` (`2c3f75afa`, branche non mergée, worktree
verrouillé = session active). Mon check « existing work » s'était limité à `git status` + `git log`
sur main : les branches de worktree n'y apparaissent pas. Doublon reverté (`be30cca29`) pour que le
merge de la branche complète atterrisse sans conflit 15-fichiers entre deux implémentations.

**Règles** :
- Avant d'attaquer un item de backlog partagé (audit, tasks/*.md) : `git worktree list` +
  `git log --all --oneline --grep="<mots-clés de l'item>"` — pas seulement l'historique de main.
- Un worktree `locked` sous `.claude/worktrees/` = session active ; sa branche non mergée fait
  partie du « travail existant » au même titre que main.
- En cas de doublon découvert APRÈS push : garder l'implémentation surensemble, reverter l'autre
  immédiatement (avant que quiconque ne bâtisse dessus), et dire pourquoi dans le message du revert.

## 2026-07-12 — `gh run watch --exit-status` exit 0 ≠ succès (annulé retourne aussi 0)

Annoncé une run CI « verte » sur la foi d'un `gh run watch --exit-status` sorti en 0 : la run était
en réalité CANCELLED (annulée par le push suivant via la concurrency). L'exit-status de `gh run watch`
ne distingue pas success/cancelled dans cette version de gh — seul `failure` est non-zéro.

**Règles** :
- Un verdict CI se lit dans `gh run view <id> --json status,conclusion` (conclusion == "success"),
  jamais dans l'exit code de `gh run watch` seul. Même famille que « meeshy.sh exit 0 malgré FAILED »
  et « un résultat de tests se valide sur le compte attendu ».
- Sur un main à pushes rapprochés, chaque push ANNULE la run précédente (concurrency) : le seul
  verdict significatif est celui de la DERNIÈRE run du tip — attendre qu'elle se termine avant
  d'annoncer quoi que ce soit.

## 2026-07-12 — `grep -v <ClasseÉmettrice>` mange les consommateurs qualifiés — fausse « brèche confirmée »

En cherchant les consommateurs de `EXTRA_CALL_ID`, le filtre `grep -v MeeshyFcmService` (censé
exclure le fichier ÉMETTEUR) a aussi exclu les lignes des CONSOMMATEURS — qui référencent la
constante par son nom qualifié `MeeshyFcmService.EXTRA_CALL_ID`. Résultat : zéro occurrence,
« trou confirmé » annoncé... alors que MainActivity → LaunchRouter → CallRoute.incoming consomme
tout proprement.

**Règles** :
- Pour exclure un FICHIER d'un grep, exclure par CHEMIN (`grep -v "/MeeshyFcmService.kt:"`) ou
  utiliser `--exclude=<fichier>` — jamais par un motif texte qui peut apparaître dans le code des
  autres fichiers (nom de classe = namespace des constantes).
- Une absence de résultat grep n'est pas une preuve d'absence : avant d'annoncer « rien ne consomme
  X », refaire la recherche sans AUCUN filtre d'exclusion.

## 2026-07-12 — Renommer un appel dans CallManager.swift casse les source-guards de CallManagerTests.swift

**Contexte** : le fix reject iOS (`f67c39ac0`, `emitCallEnd` → `emitCallReject` dans
`rejectPendingCall()`) a fait tomber iOS Tests (2/3685) : `RejectPendingCallTests` sont des
source-guards qui lisent CallManager.swift en TEXTE et exigent des sous-chaînes exactes
(`emitCallEnd(callId: pending.callId)`). CI + SDK Tests verts n'ont rien vu — seul iOS Tests
exécute MeeshyTests.

**Règles** :
- Avant tout push qui renomme/déplace un appel dans CallManager.swift (ou tout fichier prod
  couvert par des guards) : `grep -n "<ancien-symbole>" apps/ios/MeeshyTests/` et adapter les
  guards DANS LE MÊME commit.
- Un source-guard cassé se répare en ré-encodant le NOUVEAU contrat (jamais en dégradant la
  prod) et en le RENFORÇANT si la substitution ouvre un trou (ex : verrou SDK
  `emitCallReject` doit émettre `call:end` AVEC `reason=rejected`, sinon le guard app
  passerait à vide).
- Ces guards se vérifient sans Xcode : répliquer l'extraction `functionBody` en Python sur
  les vraies sources (10 s au lieu d'un build de 15 min).

## 2026-07-12 — Lire le code d'émission AVANT de qualifier une donnée de prod d'anomalie

**Contexte** : le pipeline analytics live révélait 3 « anomalies » dans les données prod
(endReason="in_progress", averageRtt=0.489ms, durationSeconds float). J'ai d'abord documenté
les 3 comme des bugs d'émission iOS. Après lecture du code d'émission (CallManager:3182-3239,
WebRTCTypes:232), **2 sur 3 étaient du comportement CORRECT** :
- `in_progress` = snapshot périodique 60s délibéré (anti-perte de télémétrie sur appel long
  killé mid-call), pas un statut qui « leake ».
- `averageRtt` bas = conversion `*1000` correcte + quirk des stats WebRTC, pas un bug de code.

**Règle** :
- Une donnée qui « semble » anormale n'est pas une anomalie tant qu'on n'a pas lu le code qui
  la produit. Avant de documenter un « bug » à partir de données observées, ouvrir le site
  d'émission et vérifier l'intention.
- Un faux rapport de bug coûte plus cher qu'un silence : il envoie l'équipe chasser un
  comportement voulu. Corriger publiquement un finding erroné dès qu'on le découvre.
- L'accuracy prime sur le volume : 1 insight actionnable vérifié (ici : ~20% des appels
  répondables échouent réellement) vaut mieux que 3 « anomalies » dont 2 fausses.

## Parité cross-platform : certifier la RÈGLE ne suffit pas — vérifier les MAPPINGS d'entrée (2026-07-12)
En livrant retry-on-failure sur web/iOS/Android, j'avais certifié que les 3 `CallRetryPolicy`
encodaient une règle byte-identique (failed/connectionLost → retryable). Vrai mais insuffisant :
la même règle nourrie par des MAPPINGS d'entrée différents produit un comportement différent.
Android `CallSignalMapper.endedEvent` collapsait toute fin distante non-`missed` en `Remote`
(non-retryable), tandis qu'iOS/web mappaient `failed`/`connectionLost` serveur vers du retryable
→ divergence reachable côté appelant. **Règle : après avoir prouvé qu'une décision partagée est
identique, tracer TOUS les chemins qui alimentent son entrée sur chaque plateforme (décodage
socket, détection locale, valeurs par défaut) et vérifier qu'ils produisent des entrées
équivalentes. La parité d'une fonction pure est vide si ses arguments divergent en amont.**

## CI concurrency : un push docs juste après un push de code ANNULE le run CI du code (2026-07-12)
La CI Meeshy (workflow « CI ») a un groupe de concurrence par branche : chaque nouveau push
sur `main` annule le run en cours. En poussant un commit `docs(...)` immédiatement après un
commit `fix(...)`/`feat(...)`, j'ai annulé à répétition (5+ fois cette session) le run CI qui
validait le commit de code — verdict `cancelled`, jamais `success`. Pire : si le commit docs
ne matche pas les path-filters du job de test concerné, ce job est SKIP sur le commit docs →
le code n'obtient JAMAIS de verdict CI propre. **Règle : après un commit de code qui a besoin
de validation CI, NE PAS pousser de commit docs/lessons par-dessus tant que le run CI du code
n'est pas terminé. Grouper la doc AVEC le commit de code, OU attendre le vert avant de pousser
la doc.** Vérifier le verdict sur le job pertinent (`Test web`/`Test gateway`), pas juste sur le
run global — le run peut être `in_progress` alors que le job qui m'intéresse est déjà `success`.

## 2026-07-20 — Passe de merge de masse : les rouges se TRAITENT, ils ne s'accumulent pas

Consigne user pendant la passe (46 PR) : « Une fois mergé il faut fermer et ensuite passer aux
PR [rouges] pour savoir pourquoi c'est rouge et comment résoudre ! Si c'est résolvable résoudre
et préserver la résolution sur les autres merges ! »

**Règle : une passe de merge n'est pas finie tant que chaque PR rouge n'a pas un VERDICT** :
1. Lire le vrai log (`gh run view --job <id> --log-failed`), jamais deviner depuis le nom du check.
2. Base périmée (snapshot re-baseliné, échec translator sur PR iOS) → merge origin/main dans la
   branche + push, la CI repart ; même remède en série sur toutes les PR partageant la cause.
3. Breaking change réel (firebase-admin 14) → fixer SUR la branche dependabot + vérif locale
   (tsc + suites bun ciblées) avant push.
4. Majeur hors périmètre (tailwind 4, TS 7 qui casse ts-jest) ou PR supersédée par une itération
   plus récente déjà mergée → FERMER avec commentaire expliquant cause + condition de reprise.
Anti-pattern corrigé : lister les rouges dans le rapport final et s'arrêter là.

## 2026-07-22 — Essaim iOS : ne pas dupliquer une surface chaude ; tests source-introspection sous Linux

Deux PR de la branche `claude/laughing-thompson-qtvf62` auto-fermées sans merge par
l'automation de l'essaim : #2178 (staleness/conflit) et #2263 (**doublon rouge**). #2263
attaquait la durée VoiceOver des capsules audio de `CallView.swift` — mais **la même
correction avait déjà atterri sur `main`** via une autre PR de l'essaim (doctrine `.ignore`
verrouillée 206i/210i/211i, tests `test_audioDurationCapsules_collapseToIgnoreForNakedReadoutFix`
déjà présents). Mon test `test_audioCallLayout_durationReadout_isOpaqueElement_notCombine`
divergeait de l'état déjà mergé → 1 test rouge (4117 pass / 1 fail) → PR fermée.

**Règles :**
1. **Avant d'attaquer une surface, la re-vérifier contre `main` courant** — le dépôt est
   très mouvant (essaim parallèle). Un audit vieux de quelques heures est périmé : dans
   cette itération, 3 des 4 candidats icône-seule étaient déjà soldés sur `main`.
2. **Éviter les fichiers chauds** (`CallView.swift` : ≈40 tests, itéré en boucle par
   l'essaim). Préférer un fichier froid, un diff minuscule, un pattern déjà prouvé par un
   sibling. Collision = perte sèche (PR auto-fermée).
3. **Sans toolchain Xcode/Swift sous Linux, je ne peux PAS exécuter les tests iOS.** Pour
   qu'un test neuf soit fiable, utiliser l'idiome **source-introspection** du repo
   (`CallViewAccessibilityTests` : lecture du `.swift`, `source.contains(...)` scopé par
   fenêtre autour d'une ancre **unique**) — je peux alors le vérifier à 100 % au grep
   (Python mimant `vicinity()`) avant de pousser. Un test qui introspecte l'arbre
   d'accessibilité runtime est invérifiable côté agent → risque de rouge comme #2263.
4. Ancre de fenêtre = chaîne **unique** dans le fichier ; si la clé cherchée apparaît
   plusieurs fois (`common.close` ×2), ancrer sur un titre/identifiant unique proche et
   chercher vers l'avant avec un span mesuré (vérifié : distance réelle 743 → span 900).
## Iteration 196 — SSOT convergence appliquée aux helpers d'affichage utilisateur
- `users.service.ts` réimplémentait localement 3 SSOT (`getUserDisplayName`,
  `getInitials`, `formatPresenceLabel`) et en avait divergé. Leçon : quand un
  SSOT existe déjà (`utils/user-display-name`, `utils/initials`,
  `utils/presence-format`), un service ne doit JAMAIS refaire la logique — il
  délègue. Les copies dérivent silencieusement (blank-guard, découpe Unicode,
  règle présence partagée) et réintroduisent des bugs déjà corrigés ailleurs.
- Les clés i18n canoniques `contacts.status.lastSeen*` existaient déjà dans les
  4 locales ; vérifier la présence des clés AVANT de migrer un formatter vers le
  SSOT (évite d'ajouter des clés inutiles ou de casser le rendu).
- Les tests figeant l'ANCIEN comportement bugué (ex. `status.minutesAgo`, `'JP'`)
  doivent être mis à jour vers la vérité SSOT, pas contournés. Ajouter en même
  temps les cas défaillants explicites (displayName blanc, nom emoji, isOnline
  périmé, bascule cross-minuit) qui documentent POURQUOI la délégation corrige.
- `getInitials` multi-mot = 1ᵉʳ + dernier mot (JJ), pas 2 premiers mots (JP) :
  divergence volontaire alignée sur Telegram/Discord/Slack.

## Iteration 197 — Le NOM d'un type de notification n'est pas un discriminant d'entité
Bug utilisateur : une notification de commentaire sur un **réel** ouvrait une **story sans rapport**.

- Cause : la gateway appelle `createStoryCommentNotificationsBatch` pour **tout** post commenté
  (pas seulement les stories). Ce batch émet `story_thread_reply` / `friend_story_comment` /
  `story_new_comment` pour un réel comme pour une story ; le nom est historique, le vrai
  discriminant est `metadata.postType`. iOS routait ces types en dur vers le viewer de story
  (`storyNotificationTarget`) sans jamais lire `postType` → viewer ouvert sur un id de réel.
- Leçon générale : **ne jamais dériver l'ENTITÉ d'un nom de type d'événement.** Le type dit ce
  qui s'est passé (un commentaire, une réaction, une publication) ; seule la metadata dit SUR
  QUOI. Deux axes, deux sources — les confondre produit des redirections silencieusement fausses
  qu'aucun test de type ne rattrape.
- Corollaire vérifié à chaque fois : quand un champ est le discriminant, il doit voyager sur
  TOUS les canaux (REST/liste in-app, socket, `data` du push) et sous UN nom. `friend_new_*`
  n'émettait que `contentType`, jamais `postType` → discriminant absent du push, réel d'ami
  ouvert en détail de post plat. Fix : miroir gateway + repli client sur les deux noms.
- Anti-pattern trouvé au passage : chaque surface (iPhone, iPad) avait sa propre heuristique
  (`isStoryNotification`, `isReelNotification`, `isStoryPost`). Trois copies = trois vérités.
  Tout est passé par `NotificationContentRouter` (pur, testé), miroir du `resolveContentRoute`
  du web qui, lui, était déjà correct — le web était la référence, iOS la divergence.
- Second cul-de-sac trouvé en tirant le fil : `user_mentioned` ne portait qu'un `postId` pour
  les mentions dans un post/commentaire, mais iOS ne routait ce type que par `conversationId`
  → tap sans effet. Chercher systématiquement les branches qui `return` sur un champ absent.
- Vérification : HEAD était cassé côté iOS (helper `MicrophonePermission.swift` référencé par
  `0a66a536d` mais jamais committé) ET une autre session mutait le même worktree. Vérifier
  dans un worktree jetable sur HEAD + stub local plutôt que conclure depuis un build pollué.

## 2026-07-26 — 215i : quand une classe de défauts est épuisée, changer d'altitude

- Contexte : la série iOS UI/UX (206i→214i) a saturé la classe « label VoiceOver manquant
  sur bouton icône-seule ». Un balayage exhaustif de `apps/ios/Meeshy` n'a plus rendu **qu'un**
  candidat — un composant réutilisable **sans call-site**. Idem pour l'i18n : 11 `Text("littéral")`
  restants, **tous des faux positifs** (`LocalizedStringKey` dont la clé existe bel et bien au
  catalogue, nom de marque, bulle de démo).
- Leçon : **mesurer l'épuisement d'une classe avant de la re-balayer**, et écrire le chiffre dans
  le tracking doc. Sans ça, chaque itération refait le même balayage pour ne rien trouver, puis
  se rabat sur un candidat marginal (« composant sans call-site ») en le maquillant en amélioration.
- Corollaire : quand la classe unitaire est vide, **monter d'un cran** — chercher les défauts
  *structurels* (intégration native, HIG, duplication, code mort) plutôt que d'insister sur des
  micro-corrections a11y. C'est ce qui a fait apparaître le popover iPad ancré sur `CGRect.zero`
  et la scène tirée d'un `Set` non ordonné : deux vrais bugs, invisibles à un grep de label.
- Anti-pattern évité de justesse : le premier réflexe fut d'extraire les 7 copies du parcours de
  hiérarchie de fenêtres dans un `ActivitySheetPresenter` partagé. Ça aurait **consolidé — donc
  pérennisé — l'anti-patron que le dépôt rejette explicitement** (doctrine écrite dans
  `CommunityLinkDetailView.swift`). Toujours chercher si le dépôt a **déjà** tranché la doctrine
  et s'il existe un patron correct en place (ici `PostDetailView`) avant d'inventer un helper.
- Vérifier « 0 appelant » avant de corriger : `ConversationListView.shareConversationLink(for:)`
  portait le défaut… et n'était appelée nulle part. Corriger du code mort = fabriquer une
  fausse amélioration. Grep le nom sur **tout** `apps/ios` + `packages/MeeshySDK` d'abord.
- Outil : un compteur d'accolades naïf a signalé un faux déséquilibre parce qu'il retirait les
  commentaires **avant** les chaînes — le `//` de `"https://…"` tronquait la ligne et emportait
  son `{`. Retirer les chaînes d'abord, puis les commentaires ; et comparer le compte à `HEAD`
  avant de conclure qu'on a cassé le fichier.

## 2026-07-26 — 216i : vérifier ses propres assertions avant de pousser

- Deux tests source-introspection écrits en 216i étaient **faux** et l'auraient prouvé
  seulement après ~28 min de CI iOS. Trouvés en rejouant les assertions en Python
  avant le commit :
  1. `XCTAssertFalse(source.contains("presentSheet"))` lisait la source **brute** —
     et le doc-comment que je venais d'écrire *nomme* le helper supprimé pour
     expliquer son défaut. Une assertion **négative** doit toujours lire la source
     **commentaires retirés**.
  2. `XCTAssertTrue(source.contains(".accessibilityHidden(true)"))` était verte
     **des deux côtés** : ce modificateur existe déjà ailleurs dans les deux
     fichiers. Une assertion sur un modificateur courant ne prouve rien tant
     qu'elle n'est pas **ancrée** après une ancre unique.
  3. La fenêtre d'ancrage choisie « au feeling » (600 caractères) tombait **3
     caractères trop court** (repli réel à 603/633). **Mesurer** la distance, ne
     pas la deviner.
- Leçon : « RED prouvé » n'a de valeur que si on vérifie AUSSI que chaque assertion
  est verte pour la bonne raison. Rejouer les assertions contre `origin/main` ET
  contre le working tree, assertion par assertion, coûte une minute et évite un
  cycle CI.
- Corollaire outillage : le compteur d'accolades doit retirer les **chaînes avant
  les commentaires**, sinon le `//` de `"https://…"` tronque la ligne et emporte son
  `{` (faux déséquilibre signalé en 215i).
- Housekeeping : `git push --delete <branch>` est **bloqué par le proxy git** de cet
  environnement (« Everything up-to-date » + disconnect). Ne pas boucler avec backoff
  dessus : la branche assignée est de toute façon recyclée par un reset sur `main`.
## 2026-07-22 — Swarm collision: verify target is still unfixed on fresh main right before committing (iOS UI/UX routine)

**Context:** Iteration 212i (CallView audio-call duration VoiceOver label+value) was
opened as PR #2261 and **closed without merging — superseded by `main`**. A concurrent
swarm agent landed the identical fix (a superset: both audio capsules +
`compactAudioCallHeader` + tests, keeping `.combine`) directly to `main` between my
resync and my commit. My open-PR collision check didn't catch it because the other
work merged in the race window.

**Lessons:**
1. In a dense swarm, even a freshly-resynced target can be taken by a concurrent merge.
   **Re-verify the specific defect is still present on the latest `main` immediately
   before committing** (re-grep the exact lines), not just at target-selection time.
2. When several consecutive iterations (210i/211i/212i were all mine) cluster in one
   area (numeric-readout a11y: reaction counts → recording chrono → call duration),
   **other agents are likely swarming the same theme** — PIVOT to a distinct, quieter
   surface to reduce collision probability.
3. The superseding fix kept `.combine` (not my `.ignore`) so the caption-mode header —
   which has no `statusPill` row — still merges the signal glyph's label. When a
   duration/status element has NO sibling that voices degradation, `.combine` (glyph
   merges) is safer than `.ignore` (glyph swallowed). Match the collapse mode to
   whether degradation is voiced elsewhere.

## 2026-07-26 — Swarm collision, second occurrence: check `main` for the *whole* iteration, not just the file

**Context:** Iteration 220i (`StatusComposerView` `NavigationView` → `NavigationStack`) was
selected when `list_pull_requests` returned **zero** open PRs — the safest possible signal.
Within the hour a dozen concurrent `claude/quirky-curie-*` branches appeared, and one landed
`fdc6b422` on `main`: the same migration, the same empty-set invariant on
`NavigationContainerMigrationTests`, even the same reasoning in the doc comment. It also took
the **220i number** and consigned it in `branch-tracking.md` (`31d9e61d`). My PR #2339 was
entirely superseded — for the second time after 212i.

**Lessons:**
1. **Zero open PRs is not safety, it is a snapshot.** In a dense swarm the window between
   target selection and commit is where the collision happens. 212i taught "re-verify the
   defect on fresh `main` before committing"; I did that and still lost, because the
   supersession landed while CI was queueing — which on macOS runners was **90+ minutes**.
   The longer the gate takes, the wider the window. Re-check `main` again *after* CI, before
   assuming the PR is still worth merging.
2. **Iteration numbers collide too.** Another agent published 220i docs while my 220i PR was
   in flight. Reserve the number by pushing the tracking-doc entry **early**, or accept the
   number is only settled at merge time.
3. **Supersession is not total — salvage the remainder.** Of five changes on my branch, four
   were duplicated upstream but one (the export-duration expectation) was still uniquely
   needed and still red on `main`. The right move was to reset to `main` and re-apply only
   that, not to abandon the branch wholesale *or* force the superseded work through.
4. **A red `main` is the real blocker, not the collision.** Two unrelated breakages
   (`MockPostService` visibility drift, two-phase outro duration) reached `main` and kept
   every iOS PR red. Fixing those was worth more than the UI/UX iteration itself. When the
   gate is red for everyone, repairing it *is* the iteration.

---

## 2026-07-31 — « Ça part puis ça revient » : un état lu se défait toujours au même endroit

Trois trous distincts produisaient un unique symptôme, et **aucun** n'était dans le code
qui pose l'état lu — tous étaient dans le code qui le RELIT.

**Leçons :**
1. **Un état optimiste qui n'est pas écrit dans le cache n'existe pas.** L'état « lu » des
   notifications ne vivait que dans le tableau `@Published` de la liste ; le store GRDB
   gardait `isRead:false`. Comme `loadInitial()` lit le cache d'abord avec une fenêtre
   fraîche de 2 min, rouvrir la cloche re-servait l'instantané d'avant le marquage. Règle :
   pour toute mutation locale optimiste, se demander *quel est le prochain lecteur, et que
   verra-t-il ?* — pas seulement *l'écran courant est-il à jour ?*
2. **Une garde posée sur un chemin doit l'être sur TOUS les chemins.** `handleUnreadUpdated`
   protégeait déjà la conversation ouverte contre les broadcasts socket. Personne n'avait
   posé la même garde sur `fullSync` / `deltaSyncCore`, qui écrivent le MÊME champ dans le
   MÊME cache. Chercher systématiquement les autres écrivains d'un champ avant de conclure
   qu'il est protégé.
3. **Un enum de validation serveur est un contrat client silencieusement rompu.** iOS envoyait
   `source: "story"`, absent de l'enum → 400 à chaque slide, `impressionCount` figé à 0 sur
   toutes les stories depuis toujours. Même classe que le fix `reports` (`f408b2584`). Quand
   deux schémas listent les mêmes valeurs, en faire UNE constante partagée.
4. **Relire son propre correctif comme celui d'un autre.** Mon fix était incomplet :
   `fullSync` persiste sa 1re page avant d'avoir les suivantes, donc la 2e écriture
   confrontait les pages 2+ à un cache tronqué et reperdait leur frontière. Trouvé
   uniquement en relisant, pas par les tests — que j'avais écrits trop faibles pour le voir.
5. **Un test qui passe du premier coup n'a rien prouvé.** Mon test de non-régression passait
   AVEC ET SANS le correctif : le mock renvoyait les mêmes ids à chaque page, donc le code
   de fusion des pages 2+ n'était jamais atteint. Toujours retirer le correctif et exiger le
   rouge — un test de régression non vu rouge est un test décoratif.

## 2026-07-31 — Revue UI/UX simulateurs + incident xcstrings
- **`.scaledToFill()` sur une Image resizable enfant direct d'un frame flexible gonfle la largeur du parent** dès que la vignette dépasse le conteneur (carte position du feed : 640 pt > volet iPad ET > iPhone une fois la vignette chargée). Antidote systématique : la média en `.overlay {}` d'une base `Color.clear.frame(...)` — un overlay ne participe pas au layout.
- **Jamais de `git checkout -- <fichier>` sur un fichier potentiellement touché par une session parallèle** (récidive : Localizable.xcstrings — leur WIP de 5 clés détruit, puis leur commit a balayé mes clés sous un message trompeur). Réverter mes hunks chirurgicalement à la place. Et ne jamais réécrire un xcstrings par json.dump (churn intégral) : édition par blocs.
- **Un titre custom `titleView` de CollapsibleHeader n'hérite d'aucun lineLimit/minimumScaleFactor** — tout appelant doit les poser lui-même sinon troncature (« Mee. » sur volet iPad).

## 2026-08-01 — Application des lots de la revue local-first
- **`xcodebuild | grep && commit` avale l'exit 65** : le pipeline retourne le code de grep. Un commit est parti avec un test rouge (b426b11b8, rattrapé par 4690f85a9). Règle : toujours `set -o pipefail` en tête des chaînes de vérification, et vérifier `exit=$?` explicitement.
- **Fixture JSON minimale + decode `try?` = faux GREEN impossible, mais faux RED possible** : le décodage synthétisé de `MeeshyMessageAttachment` exige fileName/filePath/uploadedBy/createdAt — un JSON partiel échoue EN SILENCE dans les guards `try?` d'hydratation. Construire les fixtures par le VRAI type (init public + JSONEncoder), jamais à la main.
- **Les défauts d'arguments publics ne peuvent référencer un symbole privé** : `seedSource: ... = Self.privateClosure` ne compile pas ; utiliser un défaut `nil` + résolution `?? Self.privé` dans le corps.
- **`logout()`/hôte SPM** : la cascade complète avec session atteint UNUserNotificationCenter (bundleProxy nil). Les purges testables se posent AVANT le guard `activeUserId` (patron T15b), le test emprunte l'early-return.

## 2026-08-03 — Continuous-improvement cycle : alias 639-1 dépréciés + identité réaction multi-device

Deux corrections issues d'un audit ciblé du cœur temps-réel TS (env Linux, pas de
Xcode — vérification bornée à shared/gateway/web).

**Leçons :**
1. **Un champ requis dans une signature révèle TOUS ses appelants ; un champ optionnel
   les masque.** En rendant `userId` REQUIS sur `createUpdateEvent`, le compilateur a
   exposé 11 sites d'émission (handler socket, 3 routes REST, messages-advanced, chemin
   agent, fallback dégradé) — dont 8 que le grep initial du sous-agent avait ratés. Un
   `userId?` optionnel aurait compilé partout en injectant silencieusement `undefined`,
   laissant le prisme multi-device cassé sur le chemin REST. Règle : pour propager un
   nouveau champ à TOUS les producteurs, le rendre requis sur la fonction de fabrique
   force la complétude ; ne relâcher en optionnel que sur le TYPE transporté (compat des
   payloads rejoués).
2. **Comparer deux IDs de collections différentes échoue toujours en silence.** Le web
   comparait `event.participantId` (Participant.id) à `currentUserId` (User.id) : jamais
   égaux, donc « ma réaction » jamais reconnue sur un 2e appareil. Un test masquait le bug
   en passant `participantId: 'user-1'` ET `currentUserId: 'user-1'` — même valeur pour
   deux identités distinctes. Règle : dans une assertion d'égalité d'IDs, utiliser des
   valeurs LEXICALEMENT distinctes pour chaque espace d'ID, sinon le test valide une
   coïncidence, pas le contrat.
3. **`iw`/`in`/`ji` : la JVM émet encore les codes ISO 639-1 dépréciés** (`he`/`id`/`yi`).
   Un client Android sur locale hébraïque envoie `iw`, qui verbatim ne matche aucune
   traduction `he` → repli sur l'original non traduit (violation Prisme). Même classe que
   la troncature `fil→fi`/`swe→sw` déjà corrigée. Réduire via table EXPLICITE re-validée
   contre les codes supportés (`ji→yi` non supporté → `undefined`), miroir Swift maintenu.
4. **Toujours re-grep les autres écrivains d'un champ/appelants d'une fonction avant de
   conclure « fait ».** (récidive de la leçon 2026-07-31 #2). Le sous-agent avait localisé
   2 sites ; il y en avait 11.

## 2026-08-07 — Un mock qui invente le contrat protège le bug qu'il prétend couvrir

La file de renvoi web supprimait un message dont l'envoi venait d'échouer. Trois défauts,
une racine unique : **les tests avaient été écrits contre un `sendMessage` imaginaire.**

**Leçons :**
1. **Mocker l'échec comme une rejection quand le vrai service résout toujours = tester du
   code mort.** `mockRejectedValue(new Error(...))` faisait passer les deux tests d'échec,
   mais `meeshySocketIOService.sendMessage` ne rejette sur AUCUN chemin — socket absent,
   ACK expiré, file pleine, échec de chiffrement, erreur serveur résolvent tous
   `{ success: false }`. Le seul comportement réel n'était couvert par rien, et le `catch`
   « testé » était inatteignable. Règle : avant de mocker une dépendance, lire ses `return`
   ET ses `throw` réels ; un mock est une affirmation sur le contrat, pas une commodité.
2. **Une promesse résolue ne prouve pas la livraison.** `await send(...)` suivi d'un
   `remove()` inconditionnel traite un accusé négatif comme un succès. Pour toute API qui
   encode l'échec dans la VALEUR plutôt que par une exception, `try/catch` est la mauvaise
   forme : router sur le champ.
3. **Une garde lue impérativement dans un effet ne peut être évaluée qu'au mauvais moment.**
   Le hook dépendait de `isOnline` mais gardait sur `getConnectionDiagnostics().isConnected`
   — non réactif. `online` précède le handshake Socket.IO de plusieurs secondes, donc la
   garde échouait toujours et rien ne relançait l'effet. Règle : ce sur quoi on garde doit
   être ce dont on dépend. Une garde impérative doublant un état déjà réactif est un bug.
4. **Deux chemins pour la même intention divergent en silence.** Le renvoi MANUEL lisait
   `result?.success ?? false` ; l'AUTOMATIQUE l'ignorait. Comme le trou de parité
   iOS/web du cycle précédent (`SyncWatermark`) : quand un comportement existe en deux
   exemplaires, comparer les deux AVANT de conclure à un arbitrage de design.
5. **Vérifier chaque correctif par mutation, séparément.** Retirer D1/D2/D3 un à un a donné
   4/2/1 rouges — et surtout, le premier jet de D3 était incomplet : le cleanup libérait
   encore le jeton, un run neuf repartait sur un instantané pas encore purgé → doublon.
   Trouvé par le test, pas à la relecture.

## 2026-08-07 (2) — Un test qui construit lui-même le DOM peut construire un DOM qui n'existe pas

Le suivi de lecture exact du web n'observait aucune bulle montée après l'ouverture de la
conversation : `MutationObserver` rapporte la RACINE de chaque mutation, or la liste
enveloppe chaque bulle dans un `<div key>` sans `id`. La condition `node.id.startsWith('message-')`
ne pouvait jamais matcher en production — mais elle matchait dans les tests, qui inséraient
la bulle en nœud DIRECT.

**Leçons :**
1. **Un test qui fabrique son propre DOM doit fabriquer celui du composant réel.** Le test
   « observes a bubble mounted later by the virtualizer » passait sur `addedNodes: [bubble]`,
   forme que `messages-display.tsx` ne produit jamais (il insère `<div key><BubbleMessage/></div>`).
   Règle : avant d'écrire un fixture DOM, ouvrir le composant qui rend l'arbre et copier sa
   forme — wrappers compris. Variante DOM de la leçon 2026-08-03 #2.
2. **`MutationObserver` rapporte la racine de la mutation, pas les nœuds qui vous intéressent.**
   Tout `addedNodes/removedNodes` qui cherche un descendant doit descendre (`querySelectorAll`
   sur le nœud, plus le test du nœud lui-même). Le pendant `querySelectorAll` du montage
   descendait, lui — l'incohérence entre les deux chemins d'un même hook était le signal.
3. **Un observateur branché au mauvais niveau produit deux symptômes OPPOSÉS, pas un.** Ici :
   aucune lecture rapportée pour les messages arrivés après coup ET des messages jamais
   affichés déclarés lus (pas de `disappeared` au démontage). Voir un seul des deux
   symptômes et le corriger localement aurait manqué la racine.

## 2026-08-07 (3) — Une garantie énoncée dans un commentaire n'est pas une garantie du système

La file de livraison hors ligne rejouait les éditions/suppressions faites en socket, jamais
celles faites en REST — soit le chemin PRIMAIRE d'iOS. Une seule racine, invisible dans
tout diff isolé.

**Leçons :**
1. **Un commentaire qui énonce une garantie désigne l'endroit où la CHERCHER ailleurs.**
   `_enqueueOfflineEventForParticipants` dit « without this, an edit or delete made while a
   recipient is offline is lost for them ». C'est une affirmation sur le SYSTÈME, pas sur
   la fonction : elle oblige à re-grep tous les autres écrivains du même effet. Il y en
   avait cinq, aucun ne l'appliquait. Règle : quand un commentaire justifie un appel par
   une conséquence produit, lister immédiatement les autres sites qui produisent la même
   mutation — le commentaire est un invariant, pas une note locale.
2. **La duplication ne fait pas que coûter des lignes : elle CACHE l'asymétrie.** Cinq blocs
   « emit + fanout aperçu » identiques, aucun ne citant les autres — donc rien ne signalait
   qu'un sixième canal manquait partout. Le correctif utile n'est pas la 3ᵉ ligne recopiée
   cinq fois mais le point unique qui NOMME les trois audiences. Corollaire : quand un
   commentaire existant se trompe sur le nombre de sites (« les trois transports » pour
   cinq), c'est le symptôme, pas un détail rédactionnel.
3. **La signature d'une API porte parfois la trace de l'oubli.** `enqueueOfflineMessageMutation`
   acceptait déjà `'edited'` (appelant prévu, jamais écrit) et n'avait pas `'deleted'`. Une
   union de types dont un membre n'a aucun appelant est un indice de chemin manquant, pas
   du code mort à supprimer — vérifier lequel des deux AVANT de trancher.
4. **Vérifier quel transport le client PRIMAIRE utilise réellement, pas celui qu'on suppose.**
   La lecture « le socket est le chemin d'édition primaire » (écrite dans `handleMessageEdit`)
   est vraie pour le web et fausse pour iOS (`MessageService.swift` : PUT/DELETE REST).
   Une hypothèse de transport se vérifie dans le code du client, en une grep.
5. **Remplacer un `try/catch` par un appel de helper déplace la frontière d'erreur.**
   `socketIOHandler.getManager()` vivait DANS le bloc protégé ; passé en argument, il
   s'exécutait hors protection et un `socketIOHandler` null à l'enregistrement (cas réel,
   déjà testé) transformait un succès en 500. C'est le test existant qui l'a attrapé, pas
   la relecture — extraire du code d'un try/catch impose de re-vérifier ce qui s'évaluait
   à l'intérieur.

## 2026-08-08 — Une route qui diffuse son INTENTION plutôt que son RÉSULTAT peut mentir sans trace

`POST /user-preferences/reorder` répondait `200` et diffusait le nouvel ordre à tous les
appareils de l'utilisateur alors que son `updateMany` ne matchait aucun document (pas de
ligne `UserConversationPreferences` tant que la conversation n'a jamais été personnalisée).

**Leçons :**
1. **`updateMany` est un no-op silencieux, pas une écriture.** Il ne lève pas, ne renvoie
   pas 404, et son `count` n'est presque jamais lu. Chaque fois qu'un `updateMany` porte
   une intention utilisateur (et non un nettoyage de masse), la question est : « que se
   passe-t-il si la ligne n'existe pas encore ? ». Si la réponse est « le client croit que
   si », c'est un `upsert`.
2. **Diffuser l'entrée de la requête au lieu du résultat de l'écriture rend le mensonge
   invisible.** `broadcast(..., { updates })` reprenait le body ; aucune divergence entre
   ce qui était promis et ce qui était persisté ne pouvait apparaître. Règle : le payload
   d'une diffusion se construit à partir de ce que la base a RENVOYÉ, jamais de ce que
   l'appelant a DEMANDÉ. Corollaire du même invariant que la leçon 2026-08-07 #2.
3. **Un `200` optimiste est un contrat, pas une politesse.** Les deux clients ne restaurent
   leur instantané que sur erreur. Toute route qu'un client commite optimistement doit
   répondre en erreur ce qu'elle n'a pas fait — sinon la divergence est cohérente entre
   appareils, donc indétectable à l'usage, et ne se révèle qu'au refetch.
4. **Passer d'`updateMany` à `upsert` transforme une absence d'autorisation inoffensive en
   faille.** Aucune route de préférences ne vérifie l'appartenance ; tant que l'écriture
   ne matchait rien, ça ne coûtait rien. Règle : tout changement qui rend une écriture
   effective oblige à re-auditer les gardes que l'inefficacité masquait.
5. **Un test dont le NOM cite l'implémentation (« via updateMany ») verrouille le défaut.**
   Celui-ci assertait l'appel plutôt que l'effet, contre un mock qui n'écrit pas : « écrit »
   et « pas écrit » y étaient indiscernables. Troisième récidive de la même racine
   (cycle 10 store gelé, cycle 11 versions codées en dur) — le double doit APPLIQUER ses
   écritures, et l'assertion passer par l'API publique de lecture.

## 2026-08-08 (2) — Fermer un trou pour UNE famille d'événements ne le ferme pas pour ses voisines

Le cycle 13 avait créé `broadcastMessageMutation` pour que les cinq routes REST d'édition/
suppression atteignent les participants hors ligne. Son docstring promet qu'« un sixième
transport ne peut plus rouvrir le trou ». Le trou n'a pas été rouvert pour les messages —
il n'avait jamais été fermé pour les **réactions** : cinq des sept écrivains de réaction
(4 routes REST + le chemin d'agent) n'émettaient que vers la room.

**Leçons :**
1. **Un correctif « point unique » ne protège que la famille d'événements qu'il nomme.**
   `broadcastMessageMutation` couvre `edited`/`deleted` ; réactions, épinglages, accusés
   vivent à côté avec les mêmes deux/trois audiences et personne ne les y avait rattachés.
   Règle : après avoir créé un diffuseur unique, énumérer immédiatement les AUTRES types
   d'événements qui traversent les mêmes audiences et vérifier chacun — le point unique est
   un gabarit à appliquer, pas une barrière qui s'étend toute seule.
2. **Récidive de la leçon 2026-08-07 #1, et cette fois le commentaire menteur était dans le
   correctif précédent.** `enqueueOfflineMessageMutation` affirme être « the REST-side
   counterpart of the guarantee `MessageHandler` gives edits/deletes **and `ReactionHandler`
   gives reactions** ». Écrit en fermant le trou des messages, il énonçait pour les réactions
   une garantie que personne n'avait vérifiée. Corollaire neuf : **une phrase écrite pour
   documenter un correctif est le pire endroit où placer une affirmation non vérifiée** — elle
   hérite de la crédibilité du travail qu'elle accompagne.
3. **Le détenteur d'une capacité unique est le meilleur indicateur des sites qui en manquent.**
   `_enqueueOfflineReactionEvent` était `private` dans `ReactionHandler` : aucun autre écrivain
   ne POUVAIT l'appeler. Règle de repérage : une méthode privée qui implémente une obligation
   PRODUIT (et non un détail interne) est un défaut par construction pour tout autre transport
   du même effet — chercher les autres écrivains AVANT de la rendre partageable.
4. **Le `dedupKey` fait partie du comportement, pas du réglage.** Extraire l'implémentation
   sans lui aurait produit un correctif qui passe les tests « une réaction arrive » et perd
   toujours le deuxième réacteur, `RedisDeliveryQueue` dédoublonnant par (messageId, eventType).
   Une constante d'infrastructure qu'un seul appelant règle correctement est une leçon déjà
   apprise en attente d'être perdue au refactor : la déplacer AVEC le code, testée.
5. **`void promesse` peut tuer le processus sous Node 22** (`--unhandled-rejections=throw` par
   défaut). Un canal best-effort dont tout le contrat est de ne jamais nuire doit attacher un
   `.catch`, même quand l'implémentation actuelle avale déjà ses erreurs — l'implémentation
   actuelle n'est pas le contrat de l'interface.

## 2026-08-08 (3) — Un contrôle unanime chez tous les voisins est ce qui rend son absence invisible chez le dernier

`PUT /user-preferences/conversations/:id` écrivait sa ligne à partir de deux ids
fournis par l'appelant sans vérifier ni l'un ni l'autre. Le `categoryId` non vérifié
rendait la catégorie privée d'un AUTRE utilisateur dans la réponse, et dans toutes les
lectures suivantes (même jointure `include: { category: true }`).

**Leçons :**
1. **Chercher l'écrivain qui dépareille, pas le contrôle qui manque.** Les trois routes
   de `user-deletions.ts` vérifiaient l'appartenance avec exactement le bon prédicat, le
   réordonnancement aussi, et les six routes de catégories vérifiaient la possession
   sous commentaire explicite. Un seul écrivain sur onze ne le faisait pas — et c'est
   précisément cette unanimité qui le camoufle : rien ne dépareille à la lecture d'un
   seul fichier. Règle de repérage : quand un contrôle de périmètre existe, **énumérer
   tous les écrivains de la même table** et comparer, plutôt que relire le site suspect.
2. **Un id fourni par l'appelant qui devient une clé étrangère vers une table PAR
   UTILISATEUR est une fuite jusqu'à preuve du contraire.** Le danger n'était pas
   l'écriture (la ligne écrite reste celle de l'attaquant) mais la **jointure de
   lecture** qui la suit : `include` transforme un id non vérifié en contenu d'autrui.
   Règle : pour tout champ `xxxId` accepté d'un client, demander « quelle table, scopée
   par qui, et qu'est-ce qu'on renvoie après l'avoir joint ? ».
3. **Le code d'erreur fait partie du correctif.** Répondre `403` pour une catégorie qui
   n'est pas la sienne aurait troqué une fuite de contenu contre un **oracle
   d'énumération**. `404` (ce que font déjà les six routes sœurs) ne confirme pas
   l'existence. Corollaire : la non-appartenance à une conversation, elle, est un fait
   que l'appelant connaît déjà — `403` y est correct, et c'est ce que le dépôt répond
   déjà ailleurs. Choisir le code par ce qu'il DIVULGUE, pas par confort d'uniformité.
4. **Le contrôle va où va l'invariant, pas où va la lecture.** Placer les deux gardes
   dans la route aurait reproduit exactement la configuration qui a produit le défaut :
   un contrôle correct recopié en N endroits, dont l'un finit par manquer. Elles vont
   dans `writeConversationPreferences`, avec l'incrément de `version` et la diffusion —
   la ligne n'est atteignable que par cette fonction. Même argument qu'au cycle 12.
5. **Quand un correctif fait tomber des tests, distinguer régression et harnais
   incomplet — puis compléter le harnais, jamais plier la requête.** Les 10 tests tombés
   étaient des doubles de store qui ne modélisaient pas `Participant` sur ce chemin.
   Utiliser `findMany` (que les mocks avaient déjà) au lieu de `findFirst` aurait rendu
   la suite verte en choisissant la requête d'après la forme d'un mock — la racine exacte
   que les cycles 10, 11 et 13 ont chacun documentée sous un autre déguisement.
6. **Faire porter à un test la nature de la donnée fuitée.** La catégorie d'autrui
   s'appelle `'Divorce lawyer'` dans le harnais : le RED affiche alors littéralement
   `"category":{"name":"Divorce lawyer",…}` dans le corps sérialisé. Un `'Category A'`
   aurait produit le même vert et rendu l'enjeu illisible pour le prochain lecteur.

## 2026-08-08 (4) — Une CRÉATION ne se range pas avec les mutations, et c'est ainsi qu'elle échappe à l'énumération

Le cycle 14 avait conclu en ordonnant d'énumérer les autres familles d'événements traversant
les mêmes audiences. L'énumération a été faite — réactions, épinglages, accusés, tous
vérifiés — et elle a quand même manqué `link:message:new` : un **message entier**, sur le
seul transport d'envoi dont dispose un participant anonyme, jamais enfilé pour les pairs
hors ligne.

**Leçons :**
1. **Une énumération par « familles d'événements » rate ce qui n'a pas la même FORME.**
   `link:message:new` n'est pas une mutation, c'est une création — donc rangée mentalement
   avec `message:new`, qui est couvert sur ses deux transports, donc réputé traité. La bonne
   clé d'énumération n'est pas « quels événements ressemblent à celui que je viens de
   corriger » mais « qui ÉCRIT dans cette conversation », toutes formes confondues. En
   pratique : grep les `.to(ROOMS.conversation(...)).emit(` et non les noms d'événements.
2. **Un commentaire qui énumère ce qu'un contournement refait à la main est un inventaire,
   pas une prose.** Le fichier disait « ce chemin CONTOURNE `MessagingService.handleMessage` »
   et listait validation + stockage. La file hors ligne n'était ni dans cette liste ni dans
   celle des omissions assumées. Règle : tout `// ce chemin contourne X` oblige à énumérer
   ce que X fait et à classer CHAQUE élément en « refait » ou « délibérément omis, parce
   que ». Le silence sur un élément fait passer un oubli pour un choix.
3. **Une méthode privée qui implémente une obligation PRODUIT est un défaut par
   construction — et ici il y en avait cinq d'un coup.** Rappel du cycle 14 #3, mais la
   mesure neuve est le comptage : `MessageHandler` (deux fois), le manager,
   `reactionOfflineQueue`, `AttachmentReactionHandler`. Cinq copies dont quatre privées, donc
   quatre écrivains qui ne POUVAIENT pas honorer la garantie. Corriger le sixième trou sans
   fusionner les cinq aurait garanti un septième. La différenciation utile tient en deux
   paramètres (identité d'exclusion, `dedupKey`) — quand les copies ne diffèrent que par des
   valeurs, elles ne diffèrent pas.
4. **La duplication d'un fan-out se justifie parfois par une VRAIE raison de perf : garder
   la raison, pas la copie.** Le bloc inline de `broadcastNewMessage` réutilisait une liste
   de participants déjà chargée ; l'extraire naïvement aurait ajouté une requête DB par
   message sur le chemin le plus chaud du service. Un paramètre `participants` préserve la
   perf ET l'unicité. Quand une copie existe « pour la performance », vérifier si la
   performance tient à un ARGUMENT que l'API peut accepter avant de conclure à une divergence
   irréductible.
5. **Le rejeu doit porter le nom d'événement du live, pas celui de sa famille.** Tentation
   naturelle : rejouer un message de lien en `message:new` puisque c'est un message. Les deux
   événements ont des charges utiles de formes différentes (`{ message }` contre l'objet nu) ;
   le client aurait reçu une enveloppe là où il attend un message. Règle : un `eventType` de
   file existe pour nommer le COUPLE (événement, forme de payload), pas la sémantique.
6. **Justifier le nombre d'audiences quand il diffère du sibling.** Ici deux et non trois :
   `AuthHandler` rejoint toutes les rooms à la connexion et le handler web bump l'aperçu
   depuis ce même événement, donc un `conversation:updated` séparé coûterait une lecture DB
   par message pour une mise à jour déjà appliquée. Écrit dans le docstring pour qu'un
   lecteur ne prenne pas l'absence pour l'oubli auquel elle ressemble — troisième cycle
   consécutif où cette phrase est ce qui empêche la « correction » suivante d'être une
   régression.

## 2026-08-08 (5) — Le « Reste ouvert » du cycle précédent nommait UN effet manquant ; il y en avait trois

Le cycle 15 avait relevé, sans le traiter : « le chemin de lien ne déclenche aucune
traduction ». Vérification faite, le chemin de lien n'exécutait **aucun** des effets
post-commit du chemin nominal — ni le bump de `lastMessageAt`, ni les statistiques. La note
avait décrit le symptôme qu'on avait sous les yeux au moment où on l'écrivait, pas la classe.

**Leçons :**
1. **Un « reste ouvert » se relit comme une hypothèse, jamais comme un inventaire.** La note
   disait « aucune traduction » ; la bonne question au moment de la traiter n'était pas
   « comment ajouter la traduction » mais « qu'est-ce que ce chemin ne fait PAS, que le
   chemin nominal fait ? ». Poser la question sous cette forme a coûté une lecture de
   `runPostSaveSideEffects` et a triplé le périmètre réel du défaut.
2. **Troisième cycle consécutif sur la même racine : une obligation produit dans un
   `private`.** Cycle 14 (diffusion), cycle 15 (file hors ligne), cycle 16 (effets
   post-commit). À chaque fois la classe entière est contournée par un autre écrivain, donc
   la question « ce contrat est-il atteignable par quelqu'un qui n'est pas dans cette
   classe ? » aurait suffi. Règle opérationnelle : **tout `private` dont le docstring décrit
   une garantie côté produit (« tout message doit… », « chaque participant reçoit… ») est un
   défaut en attente d'un second écrivain.**
3. **Un correctif client peut MASQUER l'absence de la donnée serveur, et le commentaire qui
   l'explique devient alors la preuve du trou.** Le docstring de `broadcastLinkMessage`
   justifiait de ne pas émettre `conversation:updated` par « le handler web remonte lui-même
   la conversation depuis cet événement ». C'est exact — et c'est précisément ce qui rendait
   `lastMessageAt` périmé invisible : le client remontait la conversation, le refetch la
   redescendait. Quand une optimisation s'appuie sur un effet client, vérifier que le
   serveur porte la même vérité, sinon le prochain refetch est une régression silencieuse.
4. **Ce qu'on pousse en aval, c'est ce qui est STOCKÉ, pas ce qui est reçu.** Deux pièges au
   même endroit : le contenu (les URLs sont réécrites en liens de tracking avant l'insert) et
   la langue source (normalisée avant l'insert). Pousser `body.*` aurait traduit un texte que
   personne ne verra, rangé sous la clé du message — donc des traductions désalignées de leur
   original —, et fait retomber NLLB sur l'anglais pour toute locale région-taggée. Les deux
   sont invisibles à la lecture du site d'appel : ils n'existent que si un test les nomme.
   Vérifiés par mutation (`body.content`, `body.originalLanguage`), chacun faisant tomber
   exactement les deux tests qui le couvrent.
5. **Une omission de parité se justifie par deux faits vérifiés, pas par une intuition.**
   Le curseur de lecture de l'auteur n'est pas dans l'unité partagée pour deux raisons
   CONSTATÉES : le décompte de non-lus exclut déjà ses propres messages
   (`senderId: { not: participantId }`, trois occurrences), et la route authentifiée peut
   porter un participant synthétique `{ id: userId }` sous lequel l'upsert créerait un
   curseur orphelin. Sans ces deux vérifications, « je n'inclus pas cet effet » aurait été
   la même négligence que celle qu'on corrige, avec un meilleur vocabulaire.
6. **Extraire d'une classe, c'est aussi laisser un orphelin derrière soi.** `updateStats` et
   `updateConversation` sont devenus inatteignables au moment où `runPostSaveSideEffects` a
   délégué. Une extraction non suivie du retrait des méthodes qu'elle vide laisse deux
   implémentations de la même chose dans le fichier — exactement la divergence que
   l'extraction visait à rendre inécrivable.

## 2026-08-08 (6) — Une optimisation qui s'appuie sur un effet client est valide POUR L'EFFET QU'ELLE NOMME, pas pour ses voisins

Le cycle 15 avait justifié l'absence de `conversation:updated` sur le chemin de lien par
« le handler web remonte lui-même la conversation depuis cet événement ». C'est exact. Le
cycle 16 avait déjà découvert que cette justification masquait un `lastMessageAt` serveur
périmé. Elle en masquait un second, d'une autre nature : le même handler **n'applique pas le
compteur de non-lus**, donc l'argument ne couvrait jamais `conversation:unread-updated` — il
n'a jamais prétendu le couvrir, mais sa présence en tête du docstring l'a fait lire comme un
solde de tout compte sur la synchronisation de la liste des conversations.

**Leçons :**
1. **Vérifier ce que le handler client fait, pas ce que son nom suggère.** `handleLinkMessageNew`
   « remonte la conversation » : il écrit `lastMessage` et `lastMessageAt`, réordonne, et
   s'arrête là. Trente lignes à lire. L'argument du docstring serveur était exact sur ces deux
   champs et muet sur tous les autres. Règle : une omission serveur justifiée par « le client
   le fait » doit citer le CHAMP que le client écrit, pas l'événement qu'il traite.
2. **Le badge de non-lus n'est pas un compteur périmé, c'est un compteur FAUX.** Distinction
   opérationnelle : une donnée périmée finit par converger et n'induit personne en erreur
   pendant ce temps. Ici la conversation saute visiblement en tête de liste avec un nouvel
   aperçu — le client AFFIRME donc qu'il s'est passé quelque chose — pendant que la pastille
   affirme le contraire. Deux signaux contradictoires dans le même composant valent moins
   qu'un seul signal absent. Prioriser sur ce critère, pas sur « la donnée est-elle correcte
   au refetch ».
3. **Deux copies qui ne diffèrent que par un PRÉDICAT sont l'annonce d'un défaut de plus.**
   `_isSender` (deux identités) contre `p.id !== senderId` (une seule) : chacune correcte chez
   elle, donc rien ne dépareille à la lecture d'un seul fichier — exactement le camouflage
   décrit au cycle 14 (#1). Quand la fusion doit choisir entre deux prédicats, vérifier si
   l'un DOMINE l'autre (ici : les espaces d'ObjectIds ne se recoupent jamais, donc le large est
   strictement équivalent au étroit là où l'étroit était correct). Alors ce n'est pas un
   compromis, c'est une preuve — et il faut l'écrire, sinon le prochain lecteur la reprendra
   pour de la prudence et rétrécira.
4. **Un repli qui ressemble à une précaution défensive peut être la fonctionnalité.**
   `ROOMS.user(participant.userId ?? participant.id)` se lit comme un garde-fou et se supprime
   au premier « nettoyage ». C'est en réalité la seule chose qui rend le chemin de lien
   servable : ses participants sont ANONYMES, sans `User.id`. Règle : tout `?? fallback` dont
   la branche droite est le cas NOMINAL d'un appelant doit être verrouillé par un test qui
   nomme cet appelant.
5. **Quatrième cycle consécutif sur la même racine — la règle du cycle 16 (#2) tient, mais elle
   arrive trop tard.** Elle dit d'auditer les `private` dont le docstring décrit une garantie
   produit. Ici l'une des deux copies n'était même pas dans une méthode : c'était un bloc
   inline de 20 lignes au milieu d'un `_broadcastNewMessage` de 200. Formulation élargie :
   **toute obligation destinataire qui n'a pas de nom appelable est inatteignable**, qu'elle
   soit `private` ou simplement non extraite. Le critère de repérage n'est pas le mot-clé,
   c'est « existe-t-il un identifiant qu'un autre écrivain peut appeler ? ».

## 2026-08-08 (7) — Une table d'énumération se juge sur la NATURE de ses lignes, pas sur leur nombre

Le cycle 17 annonçait la clé « ce que TOUT message doit à ses DESTINATAIRES » et produisait six
lignes. Les six étaient des `SERVER_EVENTS.*`. La clé annoncée était produit, la clé réellement
appliquée était technique — « ce que le manager Socket.IO émet » — et la notification, qui ne
passe par aucun émetteur socket, ne pouvait pas apparaître comme une absence dans une table
dont chaque ligne était un nom d'événement.

**Leçons :**
1. **Relire une table d'énumération en demandant : mes lignes sont-elles toutes du même TYPE
   TECHNIQUE ?** Si oui, la clé appliquée n'est pas la clé annoncée, et tout ce qui vit dans un
   autre mécanisme est invisible. Ici : six événements socket, zéro écriture en base, zéro
   push. Le test tient en une question et se pose avant d'écrire la ligne « reste ouvert ».
2. **Classer les canaux par QUI ils atteignent, pas par ce qu'ils transportent.** Room live,
   file hors ligne et pastille de non-lus ne parlent qu'à un client déjà OUVERT. La
   notification est le seul canal qui atteigne quelqu'un qui ne regarde pas. Sur cette échelle,
   son absence dominait les cinq autres obligations réunies — et l'ordre de priorité n'était
   lisible sur aucune table triée par mécanisme.
3. **Rendre une unité atteignable ne suffit pas si elle porte une hypothèse sur qui l'appelle.**
   Extraire l'éventail aurait servi la route de lien authentifiée et laissé la route ANONYME
   muette, `if (!sender) return` butant sur un expéditeur sans ligne `User`. Règle : avant de
   rendre appelable un corps `private`, lire ce corps en se demandant ce qu'il suppose du
   NOUVEL appelant — pas seulement ce qu'il fait pour l'ancien.
4. **Un défaut découvert sur un chemin périphérique est souvent déjà en production sur le
   chemin principal.** L'abandon sur expéditeur anonyme se manifestait sur le chemin de lien,
   mais il frappait aussi tout anonyme envoyant par socket `message:send`. Quand on trouve une
   hypothèse implicite, vérifier qui d'autre la viole DÉJÀ avant de la traiter comme le défaut
   d'un seul appelant.
5. **Quand le correctif de correctness et l'optimisation sont le même changement, on a trouvé
   le bon endroit.** `senderProfile` rend nommable un acteur absent de `User` ET supprime une
   lecture `User` par destinataire. Deux motifs indépendants convergeant sur un seul paramètre
   est un signal fort ; deux motifs qui exigent deux paramètres différents en est un contraire.
6. **Un paramètre mort peut être la trace d'une intention perdue, pas seulement du bruit.**
   `createMentionNotificationsBatch` recevait `senderUsername`/`senderAvatar` sans jamais les
   lire, pendant que la méthode qu'elle appelle rechargeait l'utilisateur. L'information qui
   manquait pour servir un acteur sans compte traversait l'API depuis toujours. Avant de
   supprimer un paramètre inutilisé, se demander ce qu'il aurait résolu s'il avait été lu.

## 2026-08-08 (8) — `public` ne veut pas dire atteignable : ce sont les DÉPENDANCES qui enferment

Les quatre cycles précédents butaient tous sur des méthodes `private`, et la règle qui en est
sortie (cycle 17 #5 : « toute obligation destinataire qui n'a pas de nom appelable est
inatteignable ») visait le mot-clé de visibilité. Celui-ci bute sur une méthode **`public`**,
dont le docstring annonce même « source unique partagée par les DEUX émetteurs ». Elle était
malgré tout hors de portée des deux routes de lien, parce qu'elle vit sur l'objet qui détient
`io` et `connectedUsers` — que nulle route ne détient.

**Leçons :**
1. **Chercher ce qu'une unité EXIGE avant de chercher qui l'expose.** Le verrou était double :
   sa classe d'accueil (dépendances) et son paramètre (`Message` Prisma complet, dont elle ne
   lisait que deux champs, et qu'un appelant légitime ne construit pas). Une signature qui
   demande plus que ce qu'elle lit est un verrou aussi solide qu'un `private`. Corollaire de
   méthode : lire le CORPS pour établir la liste réelle des champs lus, puis ramener le
   paramètre à cette liste — c'est ce qui rend l'unité appelable par construction.
2. **Un docstring qui compte ses appelants (« les DEUX émetteurs ») est un invariant daté.**
   Le chiffre était juste quand il a été écrit et faux depuis qu'un troisième transport existe.
   Un dénombrement dans un commentaire ne se met pas à jour tout seul : le lire comme une
   affirmation à vérifier, pas comme une description.
3. **Un prédicat de présence se juge contre la clé sous laquelle la carte a été REMPLIE.**
   `!!p.userId && connectedUsers.has(p.userId)` se lit comme prudent ; il est en fait
   impossible à satisfaire pour un anonyme, que `AuthHandler._registerUser` indexe sous son
   `Participant.id`. Rien dans le prédicat ne le signale — il faut aller lire l'écrivain de la
   Map. Règle : devant tout `map.has(x)`, remonter à l'unique site qui fait `map.set(...)` et
   comparer les clés, population par population.
4. **Un numérateur et son dénominateur doivent être énumérés par la MÊME clé.**
   `getLatestMessageSummary` comptait `totalMembers` par `Participant.id` (anonymes inclus) et
   ne pouvait alimenter `deliveredCount` que pour des `User.id`. Un rapport dont les deux
   termes n'ont pas la même population ne dégrade pas : il devient inatteignable. Quand un
   ratio produit (« remis à tous », « lu par tous ») semble bloqué, comparer d'abord les clés
   d'énumération des deux termes, avant de chercher un événement manquant.
5. **Une remarque entre parenthèses dans « reste ouvert » peut porter le vrai sujet.** Le cycle
   18 nommait le câblage manquant et signalait l'exclusion des anonymes en aparté, « le câblage
   devra décider si c'est voulu ». Câbler sans corriger aurait livré un accusé structurellement
   incapable d'acquitter quoi que ce soit sur les conversations concernées. Règle : traiter
   chaque parenthèse d'un « reste ouvert » comme un point à instruire au même titre que la
   ligne principale — celui qui l'a écrite n'avait pas fini de la vérifier.

## 2026-08-08 (9) — Un remède dicté par le cycle précédent peut corriger le défaut nommé ET pétrifier ses voisins

**Contexte** — Cycle 21. Le cycle 20 laissait une consigne précise : le chemin d'édition écrit
`validatedMentions` avec `extractMentions` (handles bruts) là où la création utilise
`extractMentionsWithParticipants`, donc éditer un message efface ses mentions par nom
d'affichage. Le remède était dicté dans la foulée : « lui faire appeler `resolveMessageMentions`
avec une variante *remplacement* (purge des lignes existantes + écriture même vide) ».

**Ce qui s'est passé** — Écrite telle quelle, la variante corrigeait le défaut nommé et laissait
passer deux défauts qui vivaient dans la MÊME quinzaine de lignes, parce que la purge est
précisément ce qui les cause :

1. `Mention.mentionedAt` est l'axe de tri de l'inbox. Purger pour recréer donne un horodatage
   neuf aux mentionnés QUI N'ONT PAS BOUGÉ : une mention de trois jours remonte en tête parce
   que l'auteur a corrigé une faute de frappe.
2. Après une purge, « qui est nouveau ? » n'a plus de réponse — l'ensemble précédent est
   détruit. Le code notifiait donc l'ensemble complet à chaque édition : dix corrections, dix
   pushes à quelqu'un déjà nommé au premier envoi.

Les deux tombent ensemble dès qu'on RÉCONCILIE au lieu de re-créer : lire l'ensemble précédent
(une requête sur un chemin qui en fait déjà cinq), ne supprimer que les partants, ne créer que
les entrants — qui sont alors exactement le lot à notifier.

**Confirmation par l'expérience** — une seconde session a traité ce même cycle en parallèle
(PR #2640) en suivant la prescription à la lettre : purge en bloc puis recréation. Elle a corrigé
D1 et laissé D2 et D3 intacts — et son commentaire de route affirmait même « seul un nouveau
mentionné apprend quelque chose » au-dessus d'un appel qui passait l'ensemble complet. La
prescription ne s'est pas contentée d'omettre les deux voisins : elle a produit une intention
écrite que le code ne tenait pas.

**Règle** — Un « reste ouvert » qui prescrit son propre remède l'a écrit en connaissant le
symptôme, pas le code. Traiter la prescription comme une hypothèse à vérifier contre le bloc
réel : relire les lignes qu'elle remplace et se demander ce que l'opération prescrite (ici : la
purge) cause d'autre. Les leçons 5 et 8 disaient de ne pas s'arrêter à la ligne principale d'un
« reste ouvert » ; celle-ci ajoute que la SOLUTION qu'il propose mérite la même défiance que le
diagnostic.

**Corollaire d'intégration** — quand deux sessions livrent le même cycle en parallèle, la fusion
ne se tranche pas par « qui est arrivé en premier » ni par « qui en a fait plus ». Comparer
défaut par défaut : ici l'API de la PR arrivée première (deux exports nommés, cœur commun sans
écriture) était la meilleure, et les correctifs de la seconde (réconciliation, abstention sur
panne, `reconciled`) étaient les bons. Prendre la structure de l'une et les corrections de
l'autre — jamais écraser l'une par l'autre.

**Corollaire — un correctif de persistance n'est fini qu'une fois le PAYLOAD vérifié.** L'unité
apprend à s'abstenir (service absent, panne) au lieu de détruire ; l'appelant qui recopie
mécaniquement son résultat vide dans sa réponse HTTP et sa diffusion socket rejoue l'effacement
un étage plus haut, et le client le cache (`staleTime: Infinity` côté web). Une valeur vide
« parce qu'établie vide » et une valeur vide « parce qu'on n'a rien pu établir » doivent être
DISTINGUABLES dans le type de retour, sans quoi aucun appelant ne peut faire la différence.

## 2026-08-08 (10) — Un ÉNUMÉRATEUR d'audience ne répond pas à la question qu'un test d'ADMISSION pose

**Contexte** — Cycle 28. Les deux lots de notification de mention poussaient un extrait du contenu
à tout utilisateur nommé, sans regarder la visibilité du post. Toutes leurs voisines filtraient
déjà (`createStoryCommentNotificationsBatch`, `createFriendContentNotificationsBatch`,
`getVisibilityFilteredRecipients`, `resolveBroadcastRecipients`) — la leçon « un contrôle unanime
chez tous les voisins rend son absence invisible chez le dernier » (2026-08-08 (3)) s'applique
telle quelle, et c'est bien elle qui a fait trouver le trou.

**Ce que celle-ci ajoute** — le réflexe naturel, une fois le trou vu, est de RÉUTILISER la garde du
voisin. Ç'aurait été faux ici, et faux d'une manière qui ne se voit pas en lisant le code appelé.

Les gardes existantes sont des **énumérateurs** : « auteur → à qui pousser ? », par dépliage de son
graphe. Une mention pose la question **inverse** : l'ensemble à juger est ARBITRAIRE (n'importe
quel `@handle` du texte, ami ou non), donc il faut un test d'**admission**, « celui-là a-t-il le
droit ? ». Les deux se ressemblent — même table `visibility`, mêmes six modes — et diffèrent
exactement là où ça compte : pour `PUBLIC`, un énumérateur rend `friendIds`, parce qu'on ne pousse
une publication qu'aux contacts. C'est un choix de **ciblage**, pas une règle de droit — un post
public se LIT par n'importe qui. Réutiliser cette réponse aurait privé de sa notification un
inconnu légitimement nommé dans un post public : le cas le PLUS courant, cassé par un correctif de
sécurité, sans qu'aucun test existant ne le signale.

**Règle** — Avant de réutiliser une garde voisine, identifier la QUESTION qu'elle répond, pas la
table qu'elle consulte. « Qui sont mes destinataires ? » et « celui-ci a-t-il le droit ? » se
partagent les données et divergent sur les cas permissifs. Deux indices qu'on est en face d'un
énumérateur et non d'un test d'admission : il ne prend pas l'utilisateur à juger en paramètre, et
son cas le plus ouvert rend quand même une liste FINIE.

**Corollaire — une garde optionnelle-avec-défaut-permissif n'est pas une garde.** Le voisin le plus
proche prenait `visibility?` avec défaut `PUBLIC` : l'oublier rouvre le trou en silence, et rien ne
le signale. Rendre le paramètre REQUIS déplace la faute au build et la rend impossible à commettre.
Le prix est visible et se paie une fois (9 harnais ont dû déclarer leur audience) ; le prix de
l'optionnel est invisible et se paie à chaque nouvel appelant.

**Corollaire — séparer le FAIT de la LIVRAISON avant de choisir ce qu'on filtre.** La tentation était
de filtrer aussi les lignes `PostMention`. Mais une ligne consigne un fait sur le texte (« ce post
nomme Carol »), vrai quelle que soit l'audience, et elle ne se reconstruit pas — personne ne relit
le texte après coup. La notification, elle, est une livraison à quelqu'un. Conditionner le fait sur
l'audience du moment aurait perdu la mention dès que l'auteur élargit sa visibilité. Vérifier
plutôt que le CONSOMMATEUR du fait filtre déjà (ici `getMentionsByPost` ne classe que des candidats
sortis d'un feed déjà filtré) : c'est ce qui permet de restreindre le correctif à la livraison.

## 2026-08-09 (11) — Une même question posée sous plusieurs FORMES dérive par le nom, pas par le code

**Contexte** — Cycle 31. « Celui-là a-t-il le droit de lire ce post ? » avait trois implémentations,
imposées par la manière dont la question se pose : une clause `where` pour les requêtes de liste, un
verdict pairwise pour un destinataire unique, un filtre borné pour un lot de candidats arbitraires.
Trois formes légitimes — mais la troisième s'était mise à répondre avec une AUTRE audience (amis
stricts au lieu d'amis ∪ contacts DM), et personne ne l'a vu pendant des cycles.

**Ce qui a permis la dérive** — le nom. `filterPostAudience` ne dit pas DE QUELLE audience il parle.
Ses deux voisines, elles, le disent (`canUserConsumePost`, `canUserInteractWithPost`) : le cycle 29
avait posé la règle « un point d'entrée choisit son audience en la NOMMANT », et c'est exactement la
fonction qui ne la suivait pas qui a dérivé. Un nom qui décrit le MÉCANISME (« filtre une audience »)
au lieu du VERDICT (« qui peut consommer ») laisse deux lectures coexister sans jamais se contredire.

**Règle** — Quand une même règle métier existe en plusieurs formes techniques, aucune ne doit porter
un nom générique. Chacune nomme le verdict qu'elle rend ; la forme (lot / unitaire / clause `where`)
est un détail d'implémentation, jamais le nom.

**Corollaire — l'anti-dérive est un test de CONFORMITÉ, pas une fusion.** La tentation, une fois la
divergence vue, est de n'en garder qu'une. C'eût été faux : les deux formes diffèrent par leurs coûts
d'accès (matérialiser les co-membres contre trancher en pairwise), et c'est leur raison d'être. Faire
traverser les MÊMES fixtures aux deux, depuis le même double de graphe, verrouille l'accord sans
détruire la raison d'avoir deux implémentations. Si les fixtures venaient de doubles distincts,
l'accord ne prouverait rien.

**Corollaire — la sous-livraison mérite la même défiance que la fuite.** Les cycles 28 à 30 ont tous
corrigé des fuites, et l'écart restant avait été noté comme « conservateur, donc pas urgent ». Il ne
l'était pas : un contact DM voyait le post dans son feed, recevait la notification de réponse, et
rien à la mention. Une garde trop stricte ne se signale par aucune alerte — juste par un utilisateur
qui ne comprend pas pourquoi il n'a pas été prévenu.

**Corollaire — brancher une garde neuve est le meilleur détecteur de garde absente.** Le trou grave de
ce cycle (`previousCommenterIds`, ensemble arbitraire filtré par une table locale qui rendait `true`
sur `FRIENDS`) n'a pas été trouvé en relisant du code, mais en cherchant où réutiliser l'outil qu'on
venait de construire. Et la leçon 10 s'applique à nouveau, dans l'autre sens : ici la table locale
RESSEMBLAIT à une garde d'admission alors qu'elle n'était correcte que pour un seau d'énumérateur.
Vérifier d'où vient l'ensemble filtré, pas seulement qu'un filtre existe.

**Corollaire — un `?` avec défaut permissif ment aussi dans les harnais.** Le cycle 28 promettait que
rendre le paramètre requis déplace la faute au build. Faux ici : `services/gateway/tsconfig.json`
exclut `**/__tests__/**`, donc les harnais ne sont typés que par ts-jest, en diagnostics lâches. La
requiredness protège la PRODUCTION (routes, services), pas la suite. Avant d'annoncer « le build
l'attrapera », vérifier que le fichier concerné est bien dans le `include` du tsconfig.

**Corollaire — un délégué Prisma absent d'un double transforme un refus d'ACL en exception avalée.**
Trois harnais « prouvaient » qu'un inconnu était refusé alors qu'ils prouvaient seulement que
`prisma.participant` était `undefined`. Quand une garde apprend à lire une table de plus, les doubles
qui la taisent continuent de passer — au vert, et pour la mauvaise raison. Compléter les doubles fait
partie du correctif, pas de son nettoyage.

## 2026-08-09 (12) — Un défaut permissif retiré d'une signature se réinstalle chez l'appelant

**Contexte** — Cycle 32. Le cycle 31 avait rendu `visibility` requis sur
`createStoryCommentNotificationsBatch`, en écrivant que « la faute appartient au build ». Son unique
appelant passait `post.visibility ?? 'PUBLIC'`. Le défaut n'avait pas disparu : il avait changé
d'étage, là où plus rien ne le regarde. Même motif deux fois dans `routes/posts/interactions.ts`,
avec un cast en prime — `(post as { visibility?: string }).visibility ?? 'PUBLIC'` — alors que la
tranche ACL autoritative était chargée **trois lignes plus haut** pour la garde d'interaction.

**Règle** — rendre un paramètre requis n'est pas fini tant que ses appelants n'ont pas été lus. Un
`?? <valeur permissive>` au point d'appel restaure exactement ce qu'on vient de retirer, et il
échappe à tout : au type (la valeur est fournie), au test (le comportement ne change pas), à la
relecture (il est dans un autre fichier). Chercher le motif `?? '<défaut>'` sur le nom du paramètre
dans tout le dépôt fait partie du correctif.

**Corollaire — un cast au point d'appel est l'aveu qu'on devine une valeur qu'on possède ailleurs.**
`(post as { visibility?: string })` disait que la forme rendue par `likePost` n'était pas sûre de
porter le champ. La réponse n'est pas de choisir un défaut pour ce cas, c'est de lire la valeur là
où elle est certaine — ici `postAcl`, déjà en main. Un cast qui rend un champ optionnel est un
signal de provenance douteuse, pas un problème de typage.

**Corollaire — la requiredness protège les harnais pour les ARITÉS, pas pour les objets.** Le cycle
31 a conclu qu'elle ne protège pas la suite (tsconfig exclut `__tests__`, ts-jest en diagnostics
lâches). C'est vrai pour un paramètre-objet (`TS2345` est dans `ignoreCodes`), faux pour un
paramètre positionnel : `TS2554` (mauvais nombre d'arguments) n'y est pas, et le build a désigné
lui-même les deux harnais de `SocialEventsHandler` qui omettaient l'audience. Le choix entre
signature positionnelle et paramètre-objet décide donc aussi de qui surveille les tests.

## 2026-08-09 (13) — Une borne qui n'apparaît pas dans le résultat ment sur ce qu'elle rend

**Contexte** — Cycle 32. Quatre lectures de graphe bornées à 500 lignes alimentent les fan-out de
notification. La borne est légitime — elle tient le coût sur un post viral. Mais une liste rendue à
la borne exacte est **indiscernable** d'une liste complète : le seau paraît entier, et personne
n'apprend que le 501e destinataire n'a jamais été notifié.

**Ce que ça ajoute au corollaire du cycle 27** (« une valeur vide *établie* et une valeur vide
*qu'on n'a pas pu établir* doivent être distinguables dans le type de retour ») : le même
raisonnement vaut pour une valeur PLEINE. « Complet » et « arrêté à la borne » sont deux vérités
différentes sur l'audience réelle, et un `string[]` n'en porte qu'une.

**Règle** — tout `take`/`limit`/`slice` qui borne un ensemble de destinataires doit rendre sa
saturation avec l'ensemble, et la consigner. Sans quoi le défaut ne se manifeste que sous la forme
« je n'ai rien reçu », côté utilisateur, des mois plus tard.

**Corollaire — regarder le TRI avant de juger la gravité.** Le cas le plus grave n'était pas le post
viral (troncature ponctuelle, destinataires différents à chaque fois) mais le fan-out de publication
trié `updatedAt desc` : borne fixe + tri stable = **toujours les mêmes** contacts, les plus anciens,
qui n'apprennent aucune publication de cet auteur. Un tri stable transforme une troncature en
exclusion permanente.

## 2026-08-09 (14) — Un commentaire qui NOMME le chemin qu'il ne câble pas détourne les audits suivants

**Contexte.** Trois unités partagées (`processExplicitLinks`, `reconcileEditedMentions`,
`emitMentionCreated`) portaient, en tête de leur câblage sur
`PUT /conversations/:id/messages/:messageId`, la phrase : « transport PRIMAIRE du client iOS, qui
édite via `PUT /messages/:id` ». Le chemin **nommé** et le chemin **câblé** n'étaient pas le même
— et c'est le chemin nommé, `routes/messages.ts`, qu'iOS appelle réellement
(`MessageService.editMessage`). Il n'appelait aucune des trois unités.

**Pourquoi c'est pire qu'un commentaire simplement faux.** La leçon du 2026-08-07 (3) disait qu'une
garantie énoncée dans un commentaire n'est pas une garantie du système. Le corollaire est plus
mordant : un commentaire qui nomme précisément un chemin, avec sa route et son fichier client, se lit
comme la **preuve** que ce chemin a été audité. Il ne se contente pas de ne rien garantir — il
désarme le prochain audit, qui trouve son propre sujet déjà traité et passe. Deux cycles ont relu ces
lignes.

**Ce qui l'a rendu possible.** Deux routes portent le même verbe métier sous des chemins
quasi-homographes : `PUT /messages/:messageId` et `PUT /conversations/:id/messages/:messageId`.
Abrégées toutes deux en « la route REST d'édition », elles sont indiscernables en prose. Le raccourci
`PUT /messages/:id` désignait la première et annotait la seconde.

**Règle.**
1. Une affirmation sur QUI appelle un chemin se vérifie côté client, pas côté serveur : `grep` dans
   `apps/*` et `packages/MeeshySDK` sur l'endpoint littéral. Trente secondes.
2. Quand deux routes partagent un verbe métier, ne jamais les abréger dans un commentaire : chemin
   complet **et** fichier (`PUT /messages/:messageId` — `routes/messages.ts`). L'ambiguïté d'un
   raccourci est exactement ce qui a permis de câbler l'une en croyant câbler l'autre.
3. Corollaire pour l'audit : lorsqu'une unité partagée est introduite « pour que le prochain
   transport ne l'oublie pas », énumérer les transports EXISTANTS depuis les points d'appel de
   l'unité — pas depuis ses commentaires. Ici, `grep reconcileEditedMentions` rendait 2 sites sur 4.

## 2026-08-09 (15) — Élargir QUI peut faire un geste périme tous les endroits qui identifiaient l'acteur par l'objet

**Contexte** — Cycle 37. Les cycles 33/34 ont unifié l'admission à l'édition et, ce faisant, **élargi**
la population des éditeurs : `admitMessageEdit` rend `asModerator: true` pour un éditeur non-auteur.
Le changement était volontaire, testé, documenté. Ce qu'il a cassé se trouvait ailleurs : la file de
rejeu hors ligne du handler socket excluait l'acteur en passant `message.senderId` — le
`Participant.id` de l'**auteur**. Tant que seul l'auteur peut éditer, auteur et acteur sont la même
personne et le code est juste. Après l'élargissement, la personne exclue devient **la cible**, et
l'auteur hors ligne n'apprend jamais que son message a été modéré.

**La règle** — un changement de permission n'est pas terminé quand la garde est unifiée. Élargir QUI
peut faire un geste invalide **toute identité dérivée de l'objet plutôt que du contexte
d'authentification**. Après avoir élargi une admission, chercher les endroits qui écrivent
l'équivalent de `message.senderId`, `post.authorId`, `conversation.createdBy` là où un `userId` de
requête est attendu : chacun était correct par coïncidence, et ne l'est plus.

**Pourquoi ça survit à la revue.** Trois choses se sont additionnées.

1. **Le nom du paramètre validait le geste.** La signature était positionnelle et le paramètre
   s'appelait `senderParticipantId` : un nom qui décrit la valeur que l'appelant a sous la main, pas
   le rôle que la fonction en fait (exclure l'acteur). Un appelant qui cherche quoi passer trouve
   `message.senderId`, et le nom du paramètre le confirme au lieu de le questionner. Corollaire de la
   leçon du 2026-08-09 (12) sur positionnel-vs-objet : **nommer un paramètre d'après son RÔLE, jamais
   d'après la valeur qu'on s'attend à y voir passer.**
2. **La docstring affirmait la règle d'AVANT.** L'en-tête du handler disait encore « only the message
   author can edit their own message ». C'est elle qui rendait `message.senderId` cohérent au
   relecteur : si seul l'auteur édite, l'auteur EST l'acteur. Une garde qu'on déplace dans une unité
   partagée laisse derrière elle des docstrings qui décrivent l'ancienne règle — les mettre à jour
   fait partie du déplacement, pas de la finition.
3. **Le jumeau portait déjà le correctif, sans test.** `handleMessageDelete`, quinze lignes plus bas
   dans le même fichier, écrit « Skip the DELETER, not the author » et explique pourquoi. Le
   raisonnement était formulé, exact, et à portée de regard — mais **aucun test ne le tenait**, donc
   rien ne le reliait à son frère. Un correctif sans test ne protège que la ligne qu'il touche ; le
   test, lui, se cherche par grep et fait remonter le jumeau. Corollaire opérationnel : **quand on
   corrige un chemin dont il existe un jumeau évident (edit/delete, create/update, socket/REST),
   écrire le test des DEUX côtés — celui du jumeau déjà correct est la seule chose qui le fera
   apparaître au prochain audit.**

**Corollaire sur les tests — une exclusion à deux mécanismes se teste en désarmant l'autre.** Ici
l'acteur est écarté deux fois : par son identité, et par sa présence (`connectedUsers.has`). Un
éditeur qui parle par socket est connecté, donc la présence l'écartait déjà : le mécanisme cassé
n'avait plus aucun effet observable sur lui. Un test qui laisse l'acteur dans la carte de présence
passe au vert avec ou sans le correctif. Il faut retirer l'acteur de `connectedUsers` — état
irréaliste en production, seul état où la question posée est celle qu'on mesure.

## 2026-08-09 (16) — Un identifiant passé à une diffusion n'est pas une étiquette : c'est une requête sur un graphe

Le cycle 15 a montré qu'élargir QUI peut faire un geste périme les endroits qui identifiaient
l'acteur par l'objet muté. Ce cycle a trouvé le **miroir** du même défaut, en cherchant précisément
l'original : `DELETE /posts/:postId` passait le **contexte d'authentification** là où une **propriété
de l'objet** est attendue. Une seule cause pour les deux sens : acteur et cible ont longtemps
coïncidé, et rien dans les signatures ne disait laquelle des deux on demandait.

1. **Un paramètre qui sert à DÉPLIER une audience n'est pas décoratif.** `broadcastPostDeleted(postId,
   authorId)` ressemble à un payload — deux chaînes qu'on recopie. `authorId` sert en réalité à
   `getFriendIds(...)` : il **choisit les destinataires**. S'y tromper ne produit pas un champ faux
   dans un message reçu, ça produit un message **reçu par les mauvaises personnes et par personne
   d'autre**. Corollaire : **quand un paramètre alimente une requête (graphe social, audience,
   filtrage), le dire dans la docstring du destinataire** — l'appelant ne peut pas le deviner de la
   signature, et l'erreur est silencieuse des deux côtés.
2. **Le témoin qui doit passer au vert fait partie du test.** Sur les trois cas de modération, un
   quatrième test — l'auteur qui supprime lui-même — était **vert dès le départ**, exprès. Sans lui,
   les trois autres passeraient au vert en écrivant n'importe quel identifiant constant : c'est ce
   témoin qui prouve que la suite mesure « l'auteur » et non « une chaîne ». **Un test de
   discrimination a besoin des deux côtés de la discrimination**, même quand un seul est rouge.
3. **Une fixture infidèle asseyait le défaut.** Un test existant mockait `deletePost` en rendant un
   document soft-deleté **sans `authorId`** — ce que Prisma ne fait jamais — et affirmait ensuite que
   la diffusion recevait l'id de l'acteur. Il ne verrouillait pas un comportement voulu : il
   verrouillait **ce que sa propre fixture rendait possible**. Corollaire : **une fixture qui omet un
   champ que la source rend toujours n'est pas une simplification, c'est une hypothèse cachée** — et
   c'est elle qui décidera du jour où on croira devoir « casser un test qui passait ».
4. **Un raccourci qui saute un service en saute plusieurs choses à la fois, et on les découvre une
   par une.** `DELETE /admin/posts/:postId` écrit `deletedAt` sans passer par
   `PostService.deletePost`. Un cycle précédent y avait trouvé les usages de sons jamais libérés — et
   avait **laissé un commentaire nommant le raccourci**. Ce cycle y a trouvé la diffusion absente ;
   restent la désactivation des liens de partage et la ligne d'audit. **Quand on répare une omission
   causée par un contournement de service, inventorier TOUT ce que le service fait au même moment**,
   plutôt que la seule omission qui a été signalée : les autres sont déjà là, et chacune attendra son
   propre incident.
## 2026-08-08 (9) — Faire entrer une population dans le numérateur ne la fait pas entrer dans la diffusion qui l'annonce

Le correctif précédent a fait acquitter la remise par un participant anonyme connecté. Sa
diffusion, elle, est restée sur `if (!p.userId) continue` : l'anonyme acquittait sans jamais
apprendre que la remise avait eu lieu. Le test qui accompagnait le correctif affirmait même
« l'acquitteur anonyme n'a pas de room personnelle » — alors qu'`AuthHandler` lui en fait
rejoindre une, sous un commentaire écrit en réparant exactement ce défaut sur la pastille de
non-lus. La même boucle existait en trois copies verbatim, dont deux ne chargeaient même pas
l'identité de repli.

**Leçons :**
1. **Un correctif d'inclusion se vérifie sur la CHAÎNE entière, pas sur l'étape corrigée.**
   Filtre → écriture → diffusion : élargir le filtre et l'écriture sans élargir la diffusion
   produit un état correct en base que personne ne voit. Après avoir fait entrer une population
   dans un traitement, dérouler les étapes suivantes une par une en se demandant laquelle
   l'énumère encore par l'ancienne clé.
2. **Une assertion négative (`not.toContain`) fige une croyance, pas un comportement.** Elle
   n'échoue jamais tant que la croyance reste fausse dans le code — donc elle protège le défaut
   au lieu du contrat. Avant d'écrire `not.`, chercher le site qui produirait la chose niée :
   ici un `socket.join` documenté à trois fichiers de distance, qui contredisait l'assertion.
3. **Corriger une occurrence d'un motif dupliqué crée une asymétrie plus difficile à voir qu'un
   défaut uniforme.** La forme juste vivait depuis un cycle dans `emitUnreadCountsToRecipients`,
   à un fichier des trois copies fausses. Quand un correctif révèle un motif recopié, chercher
   les copies AVANT de refermer le cycle et les faire converger — sinon le prochain cycle
   redécouvrira le même défaut sous un autre nom.
4. **Un `select` restrictif est un révélateur d'angle mort.** `select: { userId: true }` prouve
   que l'auteur n'a pas choisi d'exclure le participant sans compte : il ne l'a pas vu. Une
   projection qui rend un cas IMPOSSIBLE à traiter est un diagnostic plus fiable que le code
   qui la consomme.
5. **Deux routines parallèles peuvent instruire le même « reste ouvert » en même temps.** Ce
   cycle a trouvé son sujet déjà mergé sur `main` à mi-parcours. Ce qui a sauvé le travail n'est
   pas le code écrit mais le diagnostic : relire ce qui venait d'atterrir a fait apparaître le
   défaut résiduel que le correctif jumeau n'avait pas vu. Règle : après un `git pull` qui
   révèle une collision, ne pas jeter — comparer, et publier la différence.
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

## 2026-08-09 (17) — Un schéma de réponse ne valide pas la sortie du handler : il la RÉÉCRIT, sans rien lever

Routine messaging, cycle 41. `GET /signal/keys/:userId` rendait chaque clé décodée en `Uint8Array`
alors que son schéma de réponse — et la colonne, et le client iOS — déclarent du base64. Fastify
sérialise un 200 **à travers** le schéma déclaré (fast-json-stringify) : un champ typé `string` ne
**rejette** pas une valeur non-string, il la **coerce** par `String(value)`. `String(Uint8Array)`
étant la liste décimale des octets, le fil portait `"97,110,45,105,…"` là où le client attendait
`"YW4tabc…="`. iOS décodait la `String` sans erreur puis `Data(base64Encoded:)` rendait `nil` :
E2EE mort pour tous les pairs, silencieusement, depuis toujours.

**Règle** — un schéma de réponse n'est pas une garde, c'est une **transformation**. TypeScript ne
relie pas l'objet rendu par un handler au schéma déclaré dans `response: { 200: … }` : aucune erreur
de compilation. Le sérialiseur ne lève pas non plus : il coerce. Entre les deux, **zéro alarme** —
et la valeur produite reste du bon *type JSON*, donc elle traverse aussi le décodeur du client. À
chaque frontière de sortie où un schéma déclare un ENCODAGE (base64, hex, ISO-8601, data-URI),
vérifier que le handler rend cet encodage-là, pas la valeur décodée « équivalente ».

**Corollaire — se demander pourquoi on décode.** Ici, la colonne, le schéma et le client étaient
d'accord sur le base64 : les vingt lignes de décodage ne servaient **aucun** consommateur. Une
conversion sans lecteur en aval n'est pas neutre — elle est exactement le site où l'encodage se perd.

**Corollaire — mocker un SCHÉMA, c'est mocker un comportement, pas isoler une frontière.** Le
fichier de tests voisin remplaçait `getPreKeyBundleResponseSchema` par
`{ type: 'object', additionalProperties: true }` « pour simplifier », ce qui retirait précisément
l'étape qui abîme les données. Ses six tests sur la route assertaient `statusCode` et `success`,
jamais la forme d'un champ, et restaient verts. Un test de route qui n'assertera jamais la VALEUR
d'un champ ne peut pas remplacer un test qui traverse le sérialiseur réel. Deuxième aveuglement
structurel trouvé dans ce même fichier en deux cycles (cycle 40 : doubles Prisma indifférents au
`where`) — quand un fichier de tests a menti une fois par construction, relire ce qu'il mocke
d'autre.

**Corollaire — consommer une ressource appartient à la route qui la DISTRIBUE.**
`POST /signal/session/establish` mettait à `null` la pré-clé à usage unique du destinataire alors
que sa réponse ne porte aucun matériel de clé : personne ne recevait ce qu'elle détruisait. Ce n'est
pas une consommation, c'est une destruction — et un vecteur d'épuisement offert à tout participant.
Avant d'écrire « marquer comme utilisé », vérifier que la même route rend bien la chose à quelqu'un.
## 2026-08-09 (17) — Rattraper la troisième omission d'un raccourci, c'est reconnaître qu'il faut supprimer le raccourci

Le cycle 16 fermait sur une tête précise : `DELETE /admin/posts/:postId` écrit `deletedAt` sans
passer par `PostService.deletePost`, « restent la désactivation des liens de partage et la ligne
d'audit ». Les deux existaient encore. Mais l'information qui compte n'est pas *lesquelles* : c'est
que c'était la **troisième fois** — usages de sons (cycle N), diffusion temps réel (cycle 16),
audit + liens (ici) — que le même raccourci se fait rattraper **un effet à la fois**.

1. **Un compteur d'incidents sur un MÊME site est un diagnostic, pas une statistique.** Trois
   omissions successives au même endroit ne disent pas « ce site est malchanceux », elles disent
   que la liste des obligations n'existe **nulle part** : il fallait relire `deletePost` en entier
   pour la reconstituer, et personne ne le refait au moment d'écrire un `prisma.post.update`. Le
   correctif n'était donc pas d'ajouter les deux effets manquants — c'était de **nommer la liste**
   (`applyPostRemovalEffects`) pour qu'un quatrième effet ajouté demain s'applique aux deux chemins
   sans que quiconque ait à s'en souvenir. Règle : **au deuxième rattrapage sur le même
   contournement, arrêter de rattraper et dédupliquer** ; au troisième, c'est déjà tard.
2. **Le jumeau était déjà là et montrait la forme à copier.** `broadcastPostRemoval` — créé au
   cycle 16 pour la moitié VOLATILE du retrait (ce qui s'annonce) — attendait son symétrique pour
   la moitié DURABLE (ce qui s'écrit). Un helper partagé qui ne couvre qu'une moitié d'un geste est
   une invitation lisible : chercher l'autre moitié avant d'ajouter du code à côté de lui.
3. **Un schéma OpenAPI peut documenter une garantie que le code ne tient pas, et c'est indétectable
   par les tests.** La route accepte `reason` avec la description « Reason for deletion (for audit
   trail) ». La raison n'allait que dans un `fastify.log.info` — jamais dans `AdminAuditLog`, la
   table que la console interroge. Aucun test ne pouvait échouer : le champ était bien accepté, bien
   validé, bien journalisé. **Un champ dont la description nomme une DESTINATION est une assertion
   testable** — grep les champs d'API décrits par leur destinataire (« for audit trail », « for
   analytics », « for moderation ») et vérifier que la destination est atteinte.
4. **La conséquence produit de l'omission des liens n'est pas « un lien mort ».** `TrackingLink`
   n'est pas soumis au `onDelete: Cascade` (rien ne cascade sur un soft-delete). Un post retiré
   **pour motif de modération** gardait donc ses `/l/<token>` actifs : le contenu sanctionné restait
   atteignable **par le chemin même de sa diffusion**. Quand un effet manquant touche un objet de
   partage, ne pas raisonner en « donnée incohérente » — dérouler qui, dehors, tient encore une
   poignée sur le contenu.

**Reste ouvert** — `applyPostRemovalEffects` n'écrit d'audit que si l'acteur n'est pas l'auteur
(règle produit héritée : se supprimer soi-même n'est pas un acte de modération). Or
`services/gateway/CLAUDE.md` pose « Admin audit trail required for all admin actions », et la route
console exige `canModerateContent` pour être empruntée. Les deux lectures se défendent ; trancher
demande une décision produit, pas un correctif — ne pas la prendre en passant.

**Piste pour le cycle suivant, trouvée en appliquant la règle 1 à la classe entière.** Le même
défaut existe sur les MESSAGES, et à une échelle pire. `TrackingLink` porte un `messageId` : un
message qui contient un lien court en est la cible. Or la suppression d'un message a **quatre**
écrivains — `MessageHandler.ts:991`, `MaintenanceService.ts:527`, `messages-advanced.ts:554`,
`messages.ts:584` — et **aucun** ne bascule `isActive: false`. Les trois fichiers de routes/handler
connaissent pourtant `TrackingLinkService` : ils s'en servent à la CRÉATION et à l'ÉDITION, jamais à
la suppression. Un message effacé laisse donc ses `/l/<token>` actifs, et ils continuent de compter
des clics vers un contenu retiré. Quatre écrivains sans unité commune, c'est la même cause qu'ici
d'un cran plus grave : commencer par nommer la liste (le pendant de `applyPostRemovalEffects` pour
`Message`), pas par corriger les quatre sites.

## 2026-08-09 (18) — Une piste laissée au cycle suivant est une hypothèse, pas une consigne

Le cycle 17 fermait sur une piste très précise : `TrackingLink` porte un `messageId`, quatre
écrivains suppriment un message, aucun ne bascule `isActive: false`, « nommer la liste ». En la
suivant, le diagnostic tient — et le correctif qu'elle suggère est une **régression**. Désactiver
`where: { messageId }` aurait coupé, dans le cas le plus courant, un lien qu'un autre message
toujours affiché porte encore.

1. **Une piste écrite au cycle N-1 a été formulée par quelqu'un qui n'avait pas ouvert le code du
   correctif.** Elle vaut par la ZONE qu'elle désigne, jamais par le geste qu'elle propose : à
   l'instant où elle a été écrite, seul le défaut était établi. La lire comme une consigne, c'est
   hériter d'une confiance que personne n'a payée. Règle : **reprendre la piste comme une
   hypothèse à réfuter d'abord** — la première demi-heure d'un cycle qui hérite d'une piste va à
   *vérifier que le correctif suggéré est le bon*, pas à l'écrire.
2. **Une colonne qui NOMME une relation ne la porte pas forcément.** `TrackingLink.messageId` se
   lit comme « le message de ce lien ». Ses deux écrivains disent autre chose : l'un filtre
   `messageId: null` (premier arrivé, jamais réécrit), l'autre écrase sans garde (dernier arrivé).
   Une même ligne étant réutilisée par plusieurs messages (`findExistingTrackingLink` la rend à
   toute la conversation), la colonne est une **trace de passage**, pas une appartenance. Avant de
   décider sur une colonne de relation, **lire ses écrivains, pas son nom** : deux écrivains aux
   politiques opposées sur le même champ prouvent à eux seuls qu'il ne modélise rien d'exclusif.
3. **Quand une relation est reconstituée depuis deux index dérivés, il faut lire les deux.** Un
   token vit soit dans le contenu réécrit (`m+<token>`, chemin des syntaxes explicites), soit dans
   `metadata.trackingLinks` (chemin des URLs brutes) — jamais les deux, parce que les deux chemins
   de minting n'écrivent pas au même endroit. Un décompte qui n'en lit qu'un est faux pour la
   moitié des liens, silencieusement.
4. **Choisir le sens dans lequel une heuristique a le droit de se tromper.** Le préfiltre Mongo est
   volontairement TROP LARGE et l'exactitude est refaite en JS ; à la panne, le lien reste ACTIF.
   Les deux décisions vont dans le même sens : couper à tort casse un message vivant et rien ne le
   rouvre, ne pas couper ne coûte qu'un clic compté en trop. **Avant d'écrire un best-effort,
   nommer laquelle des deux erreurs est réparable** — et faire pencher le code de ce côté-là.
5. **Une file `mockResolvedValueOnce` dimensionnée sur le nombre d'appels d'un handler couple le
   test à sa structure interne.** Deux tests ont échoué non par assertion mais par FUITE : un
   `Once` non consommé (le correctif ayant déplacé un appel) contaminait le test suivant, qui
   recevait un `null` destiné à son prédécesseur et rendait 404 au lieu de 200 — un symptôme qui ne
   désigne pas sa cause. Quand un test casse dans un fichier qu'on n'a pas touché, **soupçonner la
   file de mocks du test PRÉCÉDENT** avant de soupçonner le correctif.

**Piste pour le cycle suivant** — troisième colonne de la table de divergence, laissée ouverte en
connaissance de cause : `conversationMessageStatsService.onMessageDeleted` n'est appelé que par
`DELETE /conversations/:id/messages/:messageId`. Les deux autres chemins de suppression ne
décrémentent aucun compteur : les statistiques de conversation dérivent à chaque message supprimé
depuis le composer web ou depuis `DELETE /messages/:id`. Ne PAS l'ajouter en passant — la méthode
exige du message des informations que les deux autres routes ne lisent pas (types MIME des pièces
jointes, `messageType`, contenu), et c'est un service de compteurs dont il faut d'abord vérifier
les semantiques d'incrément/décrément avant de les diffuser à trois appelants. Appliquer la
leçon 1 à cette piste-ci : la vérifier avant de l'écrire.


---

# Cycle 45b — Un vert local ne dit rien sur l'arbre poussé

## 1. Après une fusion résolue à la main, l'index et le disque divergent en silence

En résolvant la fusion, le module concurrent a été retiré par `git rm --cached` **et** `rm`, mais
son test unitaire seulement par `rm`. Résultat : un fichier **toujours suivi par git** qui importait
un module supprimé.

Rien ne le signalait. La suite complète passait (633/633) — le fichier n'était plus sur le disque,
donc jest ne le voyait pas. `tsc --noEmit` passait pour la même raison. La CI, elle, part de
**l'arbre versionné** et aurait échoué.

**Un `git status` avant de pousser n'est pas une formalité de comptable** : c'est la seule vue qui
distingue « supprimé du disque » de « supprimé du dépôt ». Après toute résolution manuelle mêlant
`git rm`, `git checkout --theirs` et `rm`, lire `git status --short` ET
`git ls-tree -r HEAD --name-only | grep <ce-qu-on-a-supprimé>`.

**Corollaire, plus général** : quand le bug EST une divergence entre le disque et le versionné, on
ne peut pas le vérifier depuis le disque. Vérifier l'artefact réellement expédié —
`git archive <sha> | tar -x` dans un répertoire neuf, puis inspecter là. C'est ce qui a confirmé le
correctif ici.

## 2. « Le test passe » ne veut pas dire « le test verrait la régression »

Deux tests écrits pour ce cycle passaient au VERT sur du code **volontairement défectueux**, dans
deux fichiers différents et pour la même raison structurelle : le double `io` de Socket.IO déverse
toutes les chaînes dans un `io.to` unique. `expect(io.to).toHaveBeenCalledWith(room)` prouve alors
qu'**un** émetteur a adressé cette room, **jamais lequel** — et sur ce chemin, un second émetteur
déjà correct visait la même room.

La méthode qui l'a établi vaut plus que le constat : **re-casser volontairement le défaut et
relancer le test.** S'il reste vert, il ne couvre rien. À faire systématiquement quand un test est
écrit pour verrouiller un correctif dont l'audience est aussi atteinte par un émetteur voisin.

Trois doubles étaient concernés, dont un (`target.to.mockReturnValue(target)`) qui rabattait toute
chaîne sur son **premier** salon : un émetteur chaîné y était indiscernable d'un émetteur ayant
oublié tous les salons sauf le premier. **Un double qui simplifie l'API qu'il simule fabrique des
faux verts** — s'il modélise `to()`, il doit modéliser le chaînage.

## 3. Deux sessions sur le même défaut : comparer les correctifs, pas les horodatages

Livraison en parallèle du même défaut par deux sessions (PR #2708 et celle-ci). L'arbitrage n'est ni
« qui est arrivé en premier » ni « garder les deux » : c'est **défaut par défaut**. Le correctif
arrivé premier couvrait deux sites de plus ; il est conservé intégralement, le module concurrent de
cette session supprimé. **Deux helpers rivaux pour une même règle valent moins que l'un ou
l'autre** — c'est exactement la condition qui avait produit les quatre copies divergentes au départ.

Ne PAS réimposer un choix de structure différent (ici, chaîner plutôt que boucler) quand l'autre
session l'a explicitement argumenté et que le gain est marginal. En revanche, **ce que l'autre
session n'a pas fait reste à faire** : ici, la fidélité de ses propres tests.

## Leçon 89 — un champ « contexte d'affichage » déjà consommé par les clients n'est PAS une donnée oubliée en route (2026-08-10, routine messaging, cycle 53)

Audit du cœur temps-réel TS. Le cycle précédent venait de brancher les quatre producteurs ancrés
sur un message pour qu'ils héritent de `Message.expiresAt`. La story étant le contenu éphémère
canonique, la symétrie sautait aux yeux : **six** producteurs reçoivent déjà `postExpiresAt` de
leurs appelants et le déposent dans `context.postExpiresAt` — une ligne au-dessus de la colonne
`Notification.expiresAt` que les sept lectures d'inbox honorent. Toute la forme du défaut jumeau
était là : « l'échéance arrive au producteur et s'arrête juste avant la colonne ».

**C'était faux.** `context.postExpiresAt` est une fonctionnalité livrée sur les DEUX clients : le
web en tire « · expirée » (`notification-helpers.ts`), iOS en tire `expiryLabel` et
`isLinkedContentExpired`. Le produit montre délibérément la notification d'une story périmée,
marquée. Estampiller la colonne l'aurait masquée côté serveur et rendu mort le code des deux
clients. Le vrai défaut était sept jours plus loin et d'un cran plus sévère : le **hard-delete** du
balayage, seul chemin de destruction de post du gateway — que le backlog du cycle 52 nommait
correctement, et que la relecture « plus élégante » avait déplacé.

**Leçons :**

1. **Avant de déplacer une donnée d'un champ vers un autre, chercher qui LIT le champ de départ —
   chez les clients, pas seulement dans le service.** Un `context.<clé>` a un consommateur par
   définition : c'est ce que le mot « contexte » veut dire dans ce modèle. Le grep qui tranche
   traverse `apps/web` et `packages/MeeshySDK`, pas `services/`. Une symétrie qui se vérifie
   entièrement côté serveur peut être fausse pour une raison qui ne vit que côté client.
2. **Deux entités éphémères ne se ressemblent pas parce qu'elles ont toutes deux un `expiresAt`.**
   Ce qui décide, c'est ce que la ligne MONTRE et ce que sa cible RÉPOND. La notification de message
   ne porte qu'un libellé générique et sa cible est détruite à l'échéance → masquer. Celle de story
   porte un vrai extrait, un acteur, une vignette, et `getPostById` ne filtre pas l'expiration →
   montrer, marqué. La forme du schéma suggère la symétrie ; seule la donnée la confirme ou la
   réfute.
3. **Une piste héritée peut être fausse sur un MOT et vraie sur le reste.** « Les stories expirées
   ne retirent pas leurs notifications » : *expirées* est faux, *ne retirent pas* est vrai. Réfuter
   une piste n'est pas la jeter — c'est trouver lequel de ses mots ne tient pas. Et quand la
   relecture « améliore » l'énoncé d'origine, se demander laquelle des deux versions a lu le code.
4. **La règle qu'on croit devoir inventer est souvent écrite trois lignes plus bas, pour son
   voisin.** La passe portait déjà, au-dessus de `releasePosts`, l'exigence exacte du cas :
   « placé AVANT les suppressions, et il REJETTE volontairement — ni relation ni cascade, donc
   supprimer après un échec laisserait des lignes que plus aucun chemin n'atteindrait ».
   `context.postId` a la même forme que `SoundUsage.postId`. Avant d'arbitrer un ordre ou un
   contrat d'erreur, lire les effets VOISINS du même bloc : ils ont déjà tranché la même question.
5. **Un plafond change de sens quand l'entrée change de nature.** Le plafond de drainage était un
   garde-fou anti-boucle tant que l'entrée était UN post. L'entrée devenue « une heure
   d'expirations de toute la plateforme », le même plafond devient atteignable — et l'avertissement
   qui suffisait devient un silence qui orpheline. Élargir une signature oblige à relire ses bornes,
   pas seulement son corps.

## Leçon 90 — avant d'étendre un mécanisme, vérifier qu'il s'exécute (2026-08-10, routine messaging, cycle 54)

Le backlog demandait d'étendre le balayage du contenu éphémère aux posts `STATUS`, que rien ne
nettoie. La tête était juste. Mais en lisant ce que ce balayage faisait des `STORY` — le type qu'il
connaît — il s'est avéré qu'il n'en faisait rien : son filtre de soft-delete était `deletedAt: null`
sur une colonne dont l'état vivant est ABSENT, donc il n'appariait aucun post, donc la seconde passe
(qui exige un `deletedAt` non nul) ne voyait que les stories supprimées à la main. Trois cycles de
travail — purge des médias G7, libération des usages de sons, retrait des notifications du cycle 53 —
avaient été branchés sur un chemin mort, et chacun avait été validé par des tests qui doublent
Prisma et ne peuvent donc pas voir qu'un `where` n'apparie rien.

**Leçons :**

1. **Étendre un mécanisme suppose qu'il marche. Le vérifier coûte une lecture ; ne pas le vérifier
   coûte le cycle entier.** Avant d'ajouter un cas à une passe/un job/un handler, lire son chemin
   nominal en entier et se demander « qu'est-ce qui prouve que ceci s'exécute aujourd'hui ? ». Un
   job périodique n'a pas d'utilisateur pour signaler qu'il ne fait rien : son silence est
   indistinguable de son succès. Ici le tell était dans le code même — `softDeleted` retourné,
   journalisé, et jamais autre chose que 0.
2. **Un double de base de données ne teste jamais qu'un prédicat apparie.** Les suites qui couvrent
   cette passe étaient nombreuses, précises et vertes : elles vérifient l'ORDRE des effets, les
   `$in`, les cascades. Aucune ne pouvait attraper un `where` qui ne matche rien, parce que le
   double rend ce qu'on lui dit de rendre. Le prédicat lui-même n'est vérifiable que par lecture,
   contre la sémantique RÉELLE du connecteur — ou par un test d'intégration sur une vraie base,
   qu'aucune de ces suites n'est.
3. **Quand un dépôt a payé un piège une fois, chercher ses derniers exemplaires.** `deletedAt: null`
   sur MongoDB avait déjà vidé le feed en production, ce qui a produit `NOT_DELETED` dans son propre
   module ET un commentaire de post-mortem. Le cycle précédent venait de corriger la même erreur sur
   `firstMessageSentAt` en revue pré-merge. Un `grep "deletedAt: null"` sur le modèle concerné aurait
   trouvé le survivant en une commande — et il en restait exactement un. **Un piège documenté est une
   requête à lancer, pas seulement une leçon à retenir.**
4. **Réparer une chose morte peut en éteindre une vivante.** `getStories` renvoie à un auteur ses
   stories périmées pendant sept jours, sous garde `deletedAt: NOT_DELETED` — fonctionnalité qui ne
   marchait QUE parce que le soft-delete était inert. La réparer telle quelle aurait vidé « Mes
   stories » en une heure. Avant de rendre effectif un code qui ne s'exécutait pas, énumérer qui
   dépendait de son inertie : chercher les lectures gardées par le champ que le code mort allait
   se mettre à écrire.
5. **Une sonde de fidélité qui ne fait tomber que les témoins « de forme » dénonce le témoin « de
   comportement ».** La sonde D2b faisait rougir les deux assertions sur la forme du `where` et
   laissait VERT le témoin de bout en bout — parce que son double rendait la même ligne quelle que
   soit la question. Quand une sonde épargne le témoin le plus intégratif, ce n'est pas que celui-ci
   est redondant : c'est qu'il ne discrimine pas. Faire honorer le filtre par le double, puis
   re-sonder.
6. **Comparer à une BASELINE mesurée, pas à un total mémorisé.** L'environnement portait 20 suites
   qui ne compilent pas pour une raison sans rapport. Annoncer « 620 vertes » contre les « 639 »
   d'un cycle précédent aurait été ininterprétable. Relancer la suite complète sur l'arbre propre
   (`git stash`) et comparer les LISTES de suites en échec transforme une impression en preuve —
   et ne coûte qu'un second passage.

## Leçon 91 — un compteur dénormalisé et son registre par acteur se contredisent en silence (2026-08-10, routine messaging, cycle 57)

`Message.viewOnceCount` était incrémenté par un `update` inconditionnel à chaque appel de la route
`consume`. Deux instructions plus bas, le même gestionnaire écrivait
`MessageStatusEntry.viewedOnceAt` — la vérité par participant — et ne la relisait jamais. Le
compteur mesurait des OUVERTURES là où tous ses lecteurs (`isFullyConsumed`, l'annonce à la room,
la disparition du média) le lisent comme un nombre de SPECTATEURS.

**Leçons :**

1. **Quand un agrégat et un registre par acteur coexistent, vérifier lequel des deux est écrit
   sans consulter l'autre.** C'est la forme jumelle de la leçon 89 : là, un champ avait un
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

## Leçon 92 — un backlog nomme un IDIOME à propager ; la question utile est « où n'apparie-t-il RIEN ? » (2026-08-10, routine messaging, cycle 59)

Le cycle 58 léguait un candidat précis : appliquer le prédicat défensif
`OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]` aux 119 lectures de `Message.deletedAt`.
Suivi tel quel, c'était 119 fichiers touchés pour **zéro défaut observable** : le cycle 58 venait de
rendre complète la discipline d'écriture qui rend ces 119 filtres exacts.

Reformulée — *sur quelle colonne le filtre naïf n'apparie-t-il RIEN aujourd'hui ?*, ce qui se réduit à
*une colonne optionnelle dont AUCUN créateur n'écrit la valeur* — la même question rend quatre sites,
dont une **porte d'accès fermée à toute une population d'utilisateurs** : `canAccessConversation`
filtrait `bannedAt: null` sur un modèle dont les neuf créateurs omettent la colonne. Les seuls
participants que cette garde laissait entrer étaient ceux qui avaient été bannis **puis débannis** —
les seuls à porter un `null` explicite. Et comme seul un contexte d'auth anonyme porte un
`participantId`, la branche concernée était celle de tous les arrivants par lien de partage.

**Leçons :**

1. **Un idiome à propager n'est pas un défaut à corriger.** Une entrée de backlog qui dit « appliquer
   X partout » décrit un GESTE, pas un symptôme. Avant de l'exécuter, la retourner en question sur
   l'état du monde : *où est-ce que l'absence de X se voit ?* Les sites nommés par le backlog étaient
   précisément ceux où ça ne se voyait pas — leur défaut venait d'être fermé par l'autre bout.
2. **La forme greppable de ce piège n'est pas le filtre, c'est le couple filtre/créateurs.** Un
   `{ champ: null }` dans un `where` n'est suspect que si l'on a vérifié que les créateurs de la ligne
   omettent le champ. La vérification est mécanique — `grep "<Model>.create"` puis lire chaque `data`
   — et elle tranche : six créateurs sur sept qui écrivent la colonne disent que le filtre marche
   presque partout ; **zéro sur neuf** disent qu'il ne marche nulle part. Le second cas coûte une
   ligne à réparer et casse une fonctionnalité entière ; c'est celui qu'il faut chercher d'abord.
3. **Écriture ou lecture : le choix se décide sur les lignes DÉJÀ en base, pas par symétrie avec le
   cycle précédent.** Le cycle 58 a réparé par l'écriture (nommer le marqueur, l'étaler chez les
   créateurs) parce que ses lignes fautives étaient rares. Transposer ce geste ici n'aurait rien
   réparé : les participants anonymes déjà enregistrés sont exactement ceux dont l'accès est cassé.
   **Une discipline d'écriture répare l'avenir ; un prédicat défensif répare le passé.** Demander
   « qui est déjà dehors ? » avant de choisir la moitié.
4. **Une garde qui paraît redondante ne l'est peut-être que sur le chemin nominal.** `bannedAt: null`
   semble recouvert par `isActive: true`, puisqu'un bannissement écrit `isActive: false` — d'où la
   tentation de simplement retirer la garde cassée. Un troisième écrivain la rend porteuse :
   `routes/me/delete-account.ts` rallume `isActive` à la restauration d'un compte sans regarder
   `bannedAt`. Avant de retirer un filtre au motif qu'un autre le recouvre, chercher **tous** les
   écrivains du champ qui recouvre, pas seulement celui qui porte le nom du geste.
5. **Un test qui compare un `where` à sa copie attendue ÉPINGLE le défaut quand celui-ci est dans le
   `where`.** Trois témoins de ce cycle affirmaient `toHaveBeenCalledWith({ where: { …, usedAt: null } })`
   ou son équivalent : ils passaient exactement parce que la clause était fausse, et ils auraient
   rougi à sa réparation. Le remède n'est pas de les supprimer mais de leur rendre leur intention en
   comportement — ici, un double qui ÉVALUE la clause contre des documents nus, où une clé absente de
   l'objet est une colonne absente du document (`__tests__/helpers/mongo-where.ts`, sur le patron de
   `notification-where.ts`). C'est la seule forme de double qui peut voir « cette clause n'apparie
   rien ».
6. **Une sonde qui VIDE l'invariant teste la direction opposée du correctif.** Vider `unsetOrNull` en
   `{}` fait tomber 8 témoins — dont le refus d'un participant banni resté actif. Ce n'est pas du
   bruit : c'est la preuve que le harnais attrape aussi un prédicat trop PERMISSIF, pas seulement un
   prédicat trop strict. Un correctif qui n'a de sonde que dans le sens « j'ai oublié une branche »
   ne dit rien de ce qui se passe si quelqu'un neutralise la garde.
7. **Réparer un mécanisme mort peut être un ACTE DESTRUCTEUR — et alors le bon cycle est celui qui
   s'abstient.** Le cinquième site trouvé, `cleanupOrphanedAttachments`, porte le même défaut à la
   ligne près. Le corriger arme un effacement irréversible de fichiers sur des données qu'aucune
   commande de ce conteneur ne peut inspecter. Le corriger « pour la cohérence du lot » aurait été le
   geste le plus coûteux du cycle. Documenter le défaut, dire pourquoi on ne le touche pas, et nommer
   le préalable (un essai à blanc contre la base) est un livrable complet — pas un aveu.

## Leçon 93 — écrire le JUMEAU d'une implémentation existante n'est pas la recopier : c'est la première occasion de la juger (2026-08-10, routine messaging, cycle 62)

Le cycle devait porter sur le web une règle qu'iOS appliquait depuis longtemps
(`resolvedLastMessagePreview`). Le jumeau TypeScript a été écrit en miroir strict, ses 17 témoins
traduits un par un du fichier Swift, et tout est passé du premier coup. **Le miroir était fidèle et
la règle était fausse.**

Elle disait : « si la langue d'origine appartient au prisme du lecteur, afficher l'original ». Or
un prisme est une préférence **ORDONNÉE**. Cette formulation par appartenance bat la langue
PRIMAIRE dès que la langue d'origine occupe un rang inférieur — ce que produit mécaniquement la
locale appareil, entrée en 4e priorité. Prisme `['fr','en']`, message anglais, traduction française
disponible : elle rendait « Hello ». `CLAUDE.md` disait déjà l'inverse mot pour mot, et le chemin
du CORPS des messages appliquait déjà la bonne règle en ne comparant qu'à la langue de TÊTE.

**Leçons :**

1. **Un miroir de tests hérités ne peut pas voir un défaut hérité.** Les 17 témoins traduits du
   Swift verdissaient parce qu'ils encodaient la même règle que le code — j'en avais même écrit un,
   « rend l'aperçu brut même si la langue d'origine n'est pas la PREMIÈRE du prisme », qui
   *affirmait* le défaut. Traduire une suite de tests, c'est importer sa couverture ET ses angles
   morts. Le seul témoin qui pouvait trancher était un témoin **neuf**, écrit depuis la règle
   PRODUIT et non depuis le code source.
2. **Un court-circuit par APPARTENANCE dans une préférence ORDONNÉE est un bug de rang, toujours.**
   `preferred.contains(x)` jeté avant la boucle qui parcourt `preferred` annule l'ordre pour le cas
   `x`. La forme est greppable et le diagnostic mécanique : *cet élément a-t-il un rang ? alors il
   doit concourir à son rang, pas avant la boucle.* La bonne écriture est de le tester À
   L'INTÉRIEUR de la boucle.
3. **Quand deux chemins implémentent la même règle, celui qui est le plus vieux et le plus vu est
   l'arbitre — pas celui qu'on est en train de porter.** Le corps des messages comparait à la SEULE
   langue de tête ; la ligne de liste comparait à la liste entière. Il ne s'agissait pas de choisir
   entre deux conventions défendables : le premier était d'accord avec `CLAUDE.md`, le second non.
   **Avant de porter une règle, chercher son autre implémentation dans le dépôt et les faire
   s'expliquer.**
4. **Le témoin qui a vu le défaut est celui qui n'a PAS neutralisé son environnement.** C'est le
   test de composant, dans jsdom, qui a refusé de verdir — parce que `navigator.language` y vaut
   `'en-US'` et injecte donc une 4e langue dans le prisme, reproduisant exactement la condition
   réelle (locale appareil ≠ langue in-app). Un test qui aurait figé `navigator.language` « pour
   isoler l'unité » n'aurait rien vu, et la sonde de fidélité le confirme : le défaut de règle fait
   tomber 2 témoins shared **et 2 témoins web**, ces derniers uniquement grâce à cet environnement
   non neutralisé. Neutraliser l'environnement rend le test déterministe ; ça peut aussi le rendre
   aveugle au seul cas qui compte.
5. **Un défaut de RÈGLE se répare sur toutes ses copies, dans le même cycle.** Corriger le seul
   jumeau TypeScript aurait fait afficher deux textes différents pour un même compte selon le
   client — précisément la dérive que le jumeau existait pour empêcher. iOS a été corrigé avec, et
   la règle est montée d'un cran : elle vit maintenant dans `CLAUDE.md` § « Règles critiques du
   Prisme », pas seulement dans deux commentaires de code.
6. **« Le backlog sous-estimait le défaut » est un résultat de cycle, pas une digression.** L'entrée
   annonçait « il manque le résolveur côté web ». Le balayage préalable a montré que la donnée
   n'atteignait aucune couche où un résolveur aurait pu la lire (type absent, transformer qui jette,
   rendu brut) — et c'est en câblant ces quatre couches qu'on a heurté le défaut de règle, invisible
   tant qu'aucun appelant réel ne fournissait un prisme à plus d'une entrée. Re-prouver un candidat
   de backlog contre le code réel n'est pas une formalité d'ouverture : c'est ce qui change ce que
   le cycle trouve.

## Leçon 94 — la donnée déjà PAYÉE et jetée est une classe de défaut, pas un accident (2026-08-10, routine messaging, cycle 64)

Le cycle 62 avait nommé `routes/conversations/search.ts` « correctif mécanique » pour le cycle
suivant. Il l'était. Mais la forme du défaut, elle, s'est révélée être une **récidive** — et le
fichier portait déjà, à trois lignes de l'endroit exact, le commentaire d'un correctif antérieur
décrivant la même faute (`metadata.location`, Lot 3 : « la donnée était payée puis perdue »).

1. **Un `include` Prisma sans `select` rapporte TOUS les scalaires ; un mapping manuel n'en garde
   que ce qu'on a tapé.** Les deux ensembles divergent en silence, et rien — ni le compilateur, ni
   le schéma de réponse, ni un test — ne signale l'écart. La requête coûte le même prix qu'avant ;
   seul le client est privé. **Chercher ce motif là où un objet est reconstruit à la main à partir
   d'un résultat Prisma : la question n'est pas « que renvoie-t-on ? » mais « que rapporte la
   requête qu'on ne renvoie pas ? ».**
2. **Le premier correctif peut créer l'incohérence que le second doit fermer — dans le même
   geste.** Poser la carte d'aperçu traduite (plafonnée à 300) à côté d'un aperçu original NON
   tronqué faisait dépendre le poids de la ligne de la langue du lecteur. Ce n'est pas un
   élargissement de périmètre : c'est la conséquence directe du correctif, et la refuser aurait
   livré une réponse incohérente avec elle-même. **Après avoir posé un champ dérivé, relire ses
   voisins immédiats : celui qui ne subit pas le même traitement devient une anomalie parce qu'on
   vient d'en poser un qui le subit.**
3. **Un mock d'objet-module qui ÉNUMÈRE ses exports est un couplage caché à la liste des imports de
   la cible.** Ajouter un import à la route a rendu `resolveUserLanguagesOrdered` `undefined` dans
   un test voisin, qui a répondu 500 sur 4 témoins — un échec dont le message ne nomme jamais la
   cause. La forme robuste existait déjà dans le dépôt (`conversation-core.test.ts`) :
   `...jest.requireActual(module)` puis surcharge du SEUL double voulu. **Ne jamais énumérer les
   exports d'un module partagé dans un `jest.mock` : doubler ce qu'on veut contrôler, laisser
   passer le reste.**
4. **La moitié client se vérifie AVANT de conclure, même quand on ne peut pas la compiler.** Le web
   n'avait rien à faire (le transformer du cycle 62 propageait déjà, et l'écran de recherche ne rend
   aucun aperçu) ; iOS s'arrêtait à un pas de l'arrivée (`toConversation` propageait, mais le
   ViewModel de recherche lisait l'aperçu brut). Les deux réponses sont sorties du même balayage —
   et sans lui, le cycle aurait reproduit à l'identique, une route plus loin, le défaut que le cycle
   62 venait de corriger. **« Non gatable ici » décide de la façon de PROUVER un changement, jamais
   de la nécessité de le chercher.**

## Leçon 95 — un schéma de réponse qui ment ne dégrade pas : il fait tomber la route entière (2026-08-11, routine messaging, cycle 67)

Le cycle 66 laissait comme tête « le mensonge de type » : `Message.translations` est déclaré
`readonly MessageTranslation[]` alors que Prisma en rend une carte Mongo. Chercher à démêler le
type aurait été un chantier de contrat. Chercher **ce que le mensonge produit** a trouvé, en une
heure, une route qui répond 500 en production.

1. **Un mensonge de type se chasse par ses SITES, pas par sa définition.** La question utile n'est
   pas « comment démêler les deux formes ? » mais « qui recopie le résultat Prisma tel quel dans
   une réponse ? ». Elle est greppable (`translations: true` en `select`, puis remonter à ce que
   la route renvoie), elle est finie — dix routes ici — et elle a séparé les huit qui appellent le
   transformateur des deux qui ne l'appellent pas. Démêler le type reste à faire ; il n'aurait rien
   trouvé de plus, et beaucoup plus tard.
2. **`fast-json-stringify` JETTE, il ne coerce pas — donc un champ mal formé casse la RÉPONSE, pas
   le champ.** C'est contre-intuitif : on s'attend à un `translations` vide ou tronqué, on obtient
   un 500 sur l'endpoint entier. Ça change le diagnostic (« la liste d'épingles ne marche plus »
   ne ressemble pas à un problème de traductions) et ça change la gravité. **Avant de conclure
   qu'un champ mal typé « dégrade », faire tourner le vrai schéma de réponse sur la vraie valeur :
   trois lignes de node, et la réponse n'est pas devinable.**
3. **Un fixture de test qui n'existe pas en production est pire qu'une absence de test.** Les
   quatre témoins de la route posaient `translations: null` — le seul cas qui ne casse pas ; le
   fixture du fil posait `translations: []` — une forme que Prisma ne rend JAMAIS. Les deux suites
   étaient vertes et décrivaient fidèlement un monde où le défaut n'existe pas. **Quand un champ
   vient d'une colonne, le fixture doit porter la forme de la COLONNE, pas une forme plausible.**
4. **Deux défauts sur la même surface se masquent l'un l'autre, et le second n'a aucune chance
   d'être trouvé par l'utilisateur.** La bannière web lisait `data.messages[0]` sur une enveloppe
   `{success, data:[…]}` : elle ne s'affichait jamais. Sans épingle traduite, la route répondait
   200 et la bannière restait vide « parce qu'il n'y a rien à épingler » ; avec, la requête
   échouait en 500 et la bannière restait vide pareillement. **Un symptôme d'absence — un écran qui
   ne montre rien — n'a pas de signature : ne jamais s'arrêter au premier défaut qui l'explique.**
5. **Un composant que toutes les suites remplacent par `() => null` n'est pas testé : il est
   caché.** `PinnedMessageBanner` était `jest.mock`é dans les deux seules suites qui le montent.
   Le mock est légitime — ces suites testent autre chose — mais l'absence de suite PROPRE au
   composant l'était moins. **La forme est greppable : un composant `jest.mock`é partout et testé
   nulle part est un candidat de défaut, pas une commodité de test.**
6. **Poser une donnée sur un fil, c'est hériter de ses exclusions.** Corriger le Prisme de la
   bannière mettait pour la première fois `translations[].isEncrypted` sous ses yeux ; sans
   l'exclusion du chiffré, le correctif aurait affiché du base64 dans les conversations chiffrées —
   le défaut exact que le cycle 65 venait de fermer côté iOS. Ce n'est pas un élargissement de
   périmètre : c'est la conséquence directe du geste. **Après avoir branché un champ sur un rendu,
   chercher qui d'autre rend ce champ et RECOPIER ses exclusions, pas ses valeurs.**
7. **Quand le vrai défaut est un mensonge que le compilateur ne peut pas tenir, le témoin le plus
   durable ne porte sur aucune route.** Le contrat `translations` ↔ `messageSchema`, vérifié en
   compilant le vrai schéma, protège toute route future déclarant `messageSchema` — y compris
   celles qui n'existent pas encore. Corriger deux routes ferme deux défauts ; épingler l'invariant
   ferme la classe.

## Leçon 110 — un champ dénormalisé que personne n'écrit ne « dérive » pas : il MENT dès la première lecture (2026-08-11, routine messaging, cycle 71b)

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
4. **Le nom d'événement surchargé — voir la leçon 109, écrite le même jour par la session
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

## Leçon 97 — « je ne peux pas compiler ici » n'est pas « ce n'est pas gatable » (2026-08-11, routine messaging, cycle 72)

Le cycle 71 a diagnostiqué un `sdk-tests` rouge sur `main`, prouvé la cause par l'arithmétique,
écrit le correctif en prose — et **ne l'a pas posé**, au motif que le conteneur n'a pas de chaîne
Swift. Il notait pourtant, dans le même document, que « `sdk-tests.yml` tourne sur les PR ». Les
deux phrases coexistaient sans se rencontrer : le gate était identifié comme bon pour vérifier du
Swift déjà écrit, pas comme autorisation d'en écrire.

1. **La question utile est « existe-t-il un gate qui compile ceci ? », jamais « puis-je le compiler
   ici ? ».** Elles ont divergé pendant cinq cycles, et la seconde a coûté un `main` rouge laissé
   en l'état une journée entière alors que le correctif tenait en deux fichiers. Avant de reporter
   un travail pour cause d'environnement, **énumérer les workflows qui touchent le chemin
   concerné** — `on: pull_request` suffit, l'absence de toolchain locale ne décide de rien.
2. **La règle « ne pas poser sur `main` du code non gaté » (leçon 95) porte sur `main`, pas sur une
   branche.** L'appliquer à une PR la transforme en interdiction de travailler. Une PR EST le
   dispositif qui rend le code gatable ; s'en priver au nom de la prudence inverse la règle.
3. **Un défaut de témoin se répare en le liant à sa source de vérité, pas en recalant son
   littéral.** `slideTransitionDuration` a bougé deux fois, et deux fois laissé derrière elle des
   témoins rouges décrivant un comportement inchangé. Recaler sur 1,2 aurait armé la troisième
   occurrence. Le prix est assumé et doit être payé explicitement : lier à la SSOT rend certains
   témoins **tautologiques**, et il faut alors leur rendre leur portée par d'autres assertions
   (ici : la largeur reste celle de la fenêtre et non celle du slide, et elle respire avec le zoom).
4. **Un correctif de témoin oblige à relire le code qu'il traverse — c'est là que le vrai défaut
   se trouve.** Dériver les instants d'échantillonnage imposait de relire `applyOpening` à côté de
   `applyClosing`, et l'asymétrie a sauté aux yeux : l'un pose des `CABasicAnimation`, l'autre écrit
   des valeurs **modèle**. Un remplissage `fillMode = .forwards` + `isRemovedOnCompletion = false`
   recouvre la valeur modèle indéfiniment. **Chercher ce motif partout où un instantané piloté par
   le playhead cohabite avec une animation autonome sur la même propriété.**
5. **Le conflit d'une animation se raisonne par keyPath, jamais par nom d'effet.** `.zoom` et
   `.slide` sont deux effets distincts qui écrivent tous deux `sublayerTransform` : une entrée
   `.zoom` masque une sortie `.slide` aussi sûrement que la sienne. Un retrait indexé sur l'effet
   aurait laissé la moitié du défaut en place.
6. **Établir la portée d'un défaut de rendu en balayant TOUS les chemins de rendu, avant de
   conclure.** Ici trois : aperçu du composer (touché), lecteur (indemne — son canvas naît en
   `.play`, `applyOpening` n'y passe jamais), export MP4 (indemne — il n'écrit que des valeurs
   modèle). Sans ce balayage, le rapport aurait annoncé « les fermetures ne marchent pas », ce qui
   est faux, au lieu de « **la surface où l'auteur vérifie ses transitions est la seule qui les
   avale** » — l'aperçu mentait sur l'export, et c'est ce qui rend le défaut coûteux.
7. **Quand le pixel n'est pas observable, assertionner la CAUSE.** `presentationLayer()` exige un
   render server qu'aucun test unitaire n'a. Assertionner `animation(forKey:)` n'est pas un repli
   sur l'implémentation : le remplissage attaché **est** le défaut, et sa présence est exactement
   ce qui rend la valeur modèle invisible.
8. **Un correctif partiel doit nommer ce qu'il laisse ouvert, avec l'arithmétique faite.** Retirer
   l'entrée à `progress > 0` tronque une ouverture encore en vol sur un slide de 2 s (fenêtre 1,2 s,
   seuil de chevauchement 2,4 s). Moins grave que le défaut remplacé, mais réel — et l'arbitrage
   entre relever le plancher de durée, comprimer la fenêtre de sortie, ou l'assumer est **produit**,
   pas technique. Le cycle le mesure, le documente en tête du suivant, et ne tranche pas.


## Leçon 111 — un champ servi à un instant où sa valeur n'existe pas encore n'est pas « en retard » : il est FAUX pour toujours (2026-08-11, routine messaging, cycle 73)

Le cycle 69 a branché le Prisme Linguistique sur la ligne de liste : `lastMessageTranslations` est
posé par les trois chemins REST et par le temps réel, filtré au prisme de CHAQUE destinataire. Le
câblage était juste. Ce qu'il n'a pas regardé, c'est **à quel INSTANT** la valeur est lue.

1. **Un aperçu servi à l'ENVOI ne peut pas porter une traduction qui atterrit deux secondes plus
   tard.** Le pipeline est asynchrone par construction (ZMQ → NLLB → persistance → diffusion), donc
   `Message.translations` vaut `null` au moment exact où le fan-out d'aperçu le lit. Le champ n'est
   pas « pas encore à jour » : rien ne repasse jamais, donc il est faux définitivement. **Après avoir
   branché un champ sur un rendu, chercher QUAND il est écrit — pas seulement QUI l'écrit
   (leçon 110, point 2, qui posait la moitié de la question).**
2. **Un défaut conditionnel au parcours est plus coûteux qu'un défaut constant.** Ouvrir la
   conversation traduisait la ligne, ne pas l'ouvrir la laissait dans la langue de l'expéditeur : le
   même compte, sur le même appareil, voyait deux comportements selon ce qu'il avait fait avant.
   C'est indébuggable côté support et invisible en test manuel — celui qui vérifie a forcément
   ouvert la conversation.
3. **« Le client reçoit l'événement » ne veut pas dire « le client s'en sert ».** Le lecteur sur
   l'écran de liste recevait bien `message:translation` : `AuthHandler` fait rejoindre TOUTES les
   rooms de conversation à l'authentification. Mais iOS le range dans le cache MESSAGE
   (`cacheTranslation`) et web ne l'écoute que depuis la vue conversation. **Vérifier le CONSOMMATEUR,
   pas l'abonnement** — la room prouve l'arrivée, jamais l'usage.
4. **Un émetteur qui n'est pas une mutation humaine ne mérite pas la même audience.** Une édition
   change la ligne pour tout le monde ; une traduction ne la change que pour les lecteurs de cette
   langue-là, et seulement tant que le message traduit est encore le dernier. Réutiliser le fan-out
   existant SANS ces deux bornes aurait payé N fan-outs complets par message sur le chemin le plus
   chaud du service. **Le bon test d'audience n'est pas « qui est participant ? » mais « pour qui le
   payload CHANGE-t-il ? »** — et ici la réponse se lit sur la carte SORTIE, pas sur les préférences
   en entrée : un lecteur hors de la langue reçoit un objet identique à l'octet près.
5. **Re-servir un état périmé est pire que ne rien servir.** Sans la garde `onlyIfLatestIs`, une
   traduction arrivée après un message plus récent aurait fait RECULER la ligne de liste sur
   l'avant-dernier message. Un correctif de convergence qui n'ordonne pas ses écritures fabrique une
   régression que le défaut d'origine n'avait pas.
6. **Prouver le ROUGE par mutation quand les témoins sont écrits après le correctif.** Trois témoins
   de portée sur six et un témoin de câblage sur quatre sont tombés en neutralisant les gardes ; les
   autres verrouillent ce qui ne doit PAS changer et sont non-discriminants seuls, ce qui est leur
   fonction. **Le dire explicitement dans le rapport vaut mieux que laisser croire que dix témoins
   ferment dix défauts.**
7. **Un défaut trouvé dans la lane d'une AUTRE routine se documente, il ne se corrige pas.** Android
   ne décode ni `lastMessageTranslations` ni `lastMessageOriginalLanguage` — même famille de défaut,
   même surface, mais `apps/android/` appartient à la routine de parité. Le corriger ici aurait
   produit un conflit de fichiers avec une session qui travaille sur les mêmes écrans. La tête
   instruite coûte cinq minutes et vaut plus qu'une PR en conflit.

## Cycle 74 — Un témoin d'égalité n'est pas du remplissage : c'est le seul qui voit les faux verts

1. **Une valeur par défaut non déterministe dans un `init` rend TOUT `XCTAssertNotEqual` entre deux
   instances vacuoirement vert.** `MeeshyConversation.init` défaute `lastMessageAt` à `Date()`, et
   ce champ est replié dans `renderFingerprint` : deux instances construites séparément diffèrent
   toujours. Trois témoins `_changes` sont donc partis verts en verrouillant zéro comportement — ils
   auraient passé sur le code d'AVANT le correctif. **Avant d'écrire un témoin qui compare deux
   instances, lire les DÉFAUTS de l'init** : toute horloge, tout `UUID()`, tout compteur y suffit à
   fabriquer un faux vert.
2. **Corollaire de construction : dériver les variantes d'UNE fabrique paramétrée, jamais construire
   deux objets « pareils ».** « Pareils » est une intention ; « même fabrique, un seul paramètre qui
   change » est une garantie, et elle survit à l'ajout d'un futur champ non déterministe.
3. **Les témoins non-discriminants seuls sont ce qui attrape les faux verts des autres.** Ici, seuls
   les deux témoins d'ÉGALITÉ (stabilité du hash, indépendance à l'ordre d'insertion) pouvaient voir
   le problème — et ils l'ont vu, en CI, sur la première passe. Le cycle 73 notait déjà qu'ils
   « verrouillent ce qui ne doit PAS changer » ; ce cycle montre qu'ils verrouillent aussi la
   validité des témoins voisins.
4. **Un portillon de mémoïsation est un contrat, et un champ affiché mais non replié est un rendu
   MORT, pas une approximation.** `.equatable()` empêche SwiftUI d'appeler `body` : le champ oublié
   n'est pas « rafraîchi en retard », il n'est jamais rafraîchi. Toute évolution qui rend un champ
   VIVANT (le cycle 73 a rendu `lastMessageTranslations` re-émis en temps réel) doit rouvrir le hash
   qui le mémoïse — la mémoïsation reste sinon calibrée sur l'hypothèse d'avant.
5. **Hasher un dictionnaire : trier les clés, combiner chaque composant séparément.** `Dictionary`
   n'a pas d'ordre d'itération stable (hash non déterministe ⇒ portillon qui s'ouvre au hasard,
   c'est-à-dire un défaut MASQUÉ et non corrigé), et une concaténation `clé+valeur` confond
   `["a":"bc"]` et `["ab":"c"]`.
6. **Sans toolchain locale, le RED se prouve par inspection ET se dit comme tel.** Le raisonnement
   sur `keys.sorted().joined(",")` était juste et le témoin headline est passé ; ce que l'inspection
   ne pouvait PAS voir, c'est la validité du dispositif de test lui-même. **Une preuve par lecture
   couvre le code sous test, jamais le harnais qui l'exerce** — d'où l'obligation d'attendre la CI
   avant de conclure, et de ne jamais merger sur la seule foi de l'inspection.

## Leçon 113 — vérifier le SITE d'appel ne vérifie pas le TYPE qu'il traverse (2026-08-11, routine messaging, cycle 74b)

Le cycle a branché `messageSocket.userUpdated` dans `ConversationSyncEngine`, en copiant le
voisin immédiat (`messageSocket.conversationUpdated`, dix lignes plus haut) qui compile. Ça a
quand même cassé `main` :

    error: value of type 'any MessageSocketProviding' has no member 'userUpdated'

`messageSocket` n'est pas un `MessageSocketManager` mais un `MessageSocketProviding` — un
PROTOCOLE, déclaré 735 lignes plus haut (`private let messageSocket: MessageSocketProviding`).
Le publisher existait bien sur la classe concrète ; il n'existait pas sur le protocole que ce
fichier-là traverse.

1. **Le voisin qui compile prouve que SON symbole est dans le protocole, pas que le vôtre y
   sera.** `conversationUpdated` compilait parce que quelqu'un l'avait ajouté au protocole en son
   temps. Copier la forme d'un appel copie sa syntaxe, jamais ses prérequis de type.
2. **Ajouter un membre à un protocole casse ses CONFORMANTS, pas seulement l'appelant.** Ici deux
   `MockMessageSocket` (SDK et app). Le réflexe `rg "(class|struct).*: *NomDuProtocole"` fait
   partie du correctif, pas d'une vérification optionnelle après coup.
3. **Une relecture attentive n'est pas une relecture typée.** La même passe a bien attrapé deux
   vrais défauts par lecture seule — un `try` à droite d'un ternaire (refusé par Swift) et une
   mutation de dictionnaire pendant son itération. Elle a raté celui-ci parce qu'elle vérifiait
   ce que le code FAIT sans vérifier ce que chaque symbole EST. **Sans toolchain, la question
   « quel est le TYPE de ce receveur ? » se pose explicitement, une commande par receveur
   nouvellement touché** — `rg "let messageSocket"` la répondait en une seconde.
4. **Le coût est asymétrique et connu d'avance** : `sdk-tests` ne tourne qu'APRÈS le merge dans
   cette routine (dispatch = 403), le job dure ~40 min, et une erreur de compilation tue le
   build AVANT que la moindre cible de test compile — donc les 12 témoins Swift du cycle n'ont
   rien prouvé du tout à la première passe. Un symbole nouveau traversant un protocole mérite sa
   vérification explicite avant le merge, pas après.


## Leçon 112 — un miroir cross-plateforme se prouve par mutation, et sa règle se nomme des DEUX côtés (2026-08-11, routine messaging, cycle 75)

Le `_seq` du SyncEngine existait sur iOS et nulle part ailleurs. Le porter au web n'était pas
« réécrire la même chose en TypeScript » : c'était décider ce qui, dans la règle, est du contrat et
ce qui est de la plateforme.

1. **Un défaut de rattrapage coûte ce que coûte la politique de fraîcheur de la plateforme.** Le même
   event manqué se rattrape tout seul sur un client qui relit périodiquement, et ne se rattrape
   JAMAIS sur un client en `staleTime: Infinity`. Avant de chiffrer l'impact d'un trou temps réel,
   lire la politique de cache du consommateur — c'est elle qui transforme « en retard » en
   « perdu pour la session ».
2. **Une couverture qui ressemble à la bonne n'est pas la bonne : vérifier sur QUEL signal elle
   écoute.** `refetchOnReconnect: 'always'` était déjà posé globalement et semblait fermer la
   fenêtre de coupure. Il écoute le `onlineManager` — la transition réseau du NAVIGATEUR. Un
   redémarrage gateway, un drop de load balancer, un échec d'upgrade de transport ne bougent pas
   `navigator.onLine` : la socket tombe, le navigateur se croit en ligne, rien ne se déclenche.
   **Deux mécanismes nommés « reconnect » peuvent observer deux mondes disjoints.**
3. **La variante plausible-mais-fausse d'un correctif de synchro, c'est presque toujours de RÉINITIALISER
   trop tôt.** Purger le curseur de séquence sur l'event `disconnect` de la socket paraît hygiénique
   et détruit exactement la preuve que la reconnexion doit révéler : le premier `_seq` d'après la
   coupure est ce qui MESURE le trou. Le curseur ne se purge que sur un changement d'IDENTITÉ
   (token, logout) — le seul moment où sa valeur cesse d'avoir un sens. Écrire ce mutant en test
   avant de coder : ici il n'a fait tomber qu'UN témoin, et sans ce témoin le correctif serait
   passé vert en ne détectant plus rien après la première coupure.
4. **Un compteur GLOBAL par utilisateur impose un lockstep émission/observation.** `_seq` n'est pas
   par event : un client qui n'observe qu'un sous-ensemble des events estampillés voit un trou à
   chaque event non observé. Porter l'observation d'UN seul event n'est correct que parce que
   l'émetteur est unique — fait à vérifier, pas à supposer. La note qui protège la suite ne va pas
   dans le client qu'on vient d'écrire : elle va chez l'ÉMETTEUR, seul endroit que touchera
   forcément celui qui étendra la couverture.
5. **Un jumeau qui ne se nomme que dans un sens n'est pas un jumeau.** Le fichier web pointait le
   Swift ; le Swift ne pointait rien. Celui qui fait évoluer la règle ouvre le fichier de SA
   plateforme — la référence doit exister aux deux extrémités, sinon elle ne sert que ceux qui
   n'en ont pas besoin.
6. **Établir la portée par balayage de TOUTES les surfaces voisines, avant de conclure.** Trois
   surfaces web pouvaient porter le même défaut ; les messages avaient déjà leur rattrapage sur le
   front `false → true` du socket, les notifications non (corrigé), la liste de conversations non
   plus (documentée en tête du cycle suivant). Sans ce balayage, le rapport aurait annoncé « le web
   n'a pas de rattrapage », ce qui est faux, au lieu de nommer la seule surface restante.

## Leçon 116 — `args` passé à Workflow doit être vérifié en tête de script, jamais consommé les yeux fermés (2026-08-11, mini-chantier follow-ups audio immersif iOS)

Un script `Workflow` lancé avec `args: {"worktree": "/chemin/reel"}` et lisant `const WORKTREE = args.worktree` a vu CHAQUE prompt dispatché aux 14 sous-agents contenir littéralement `cd undefined` — `args` ne s'est pas propagé malgré un appel conforme à la doc de l'outil.

Conséquence observée : les agents ont dû deviner le bon worktree eux-mêmes (`git worktree list` + correspondance de nom/branche). Trois follow-ups sur quatre (implémentation ET revue) ont deviné juste grâce au nom de branche fraîchement créée — mais l'agent de gate final, sans commit ni branche à faire correspondre, a été induit en erreur par la mémoire du projet (qui mentionne un worktree du MÊME chantier parent, déjà mergé, sous un nom proche) et a fait tourner le gate complet sur l'ancien worktree : zéro signal utile après ~50 tool calls et 53s.

Ce qu'il faut en retenir :
1. **Après tout lancement de `Workflow` avec `args`, lire le `promptPreview` du tout premier agent du journal AVANT de faire confiance au reste du run** — un `cd undefined` ou toute valeur manifestement fausse dans le premier prompt dispatché signale qu'`args` ne s'est pas propagé ; mieux vaut le savoir après le premier agent qu'après les 14.
2. **Un chemin absolu critique (worktree, fichier cible) gagne à être interpolé DANS le texte du script au moment de l'écrire, en plus (ou à la place) de son passage via `args`** — une constante littérale ne peut pas se perdre en transit.
3. **Un agent à qui il manque un repère se rabat sur la mémoire projet, pas sur l'incertitude explicite** — et la mémoire peut nommer un chemin qui n'est plus le bon (chantier voisin, déjà clos). Un prompt qui dépend d'un chemin doit soit le vérifier lui-même en première étape (`test -d "$WORKTREE" || exit 1` avant tout `cd`), soit refuser de deviner.
4. **Un sous-agent qui lance une commande longue en arrière-plan doit bloquer dessus jusqu'à un signal terminal réel, jamais retourner "j'attendrai la suite" comme conclusion.** Celui de ce run a fini par répondre "je vais attendre les notifications" comme texte FINAL après plusieurs tentatives de `sleep`/`Monitor` — un sous-agent n'est jamais réveillé plus tard dans le même appel `agent()` : soit il bloque en synchrone jusqu'à la fin réelle du process qu'il surveille, soit son tour se termine sans résultat exploitable et l'orchestrateur doit le traiter comme tel, pas comme un résultat définitif.


## Leçon 117 — un mutant qui n'a pas été appliqué se lit EXACTEMENT comme un mutant survivant (2026-08-11, routine messaging, cycle 76)

Le RED se prouvait par mutation : `sed` sur le fichier, relance des témoins, restauration.
Trois mutants lancés, **deux annoncés survivants** — donc deux règles porteuses
apparemment non couvertes. La conclusion naturelle était « mes témoins ne discriminent
pas, il faut les renforcer ».

C'était faux. Les deux `sed` avaient une indentation de motif erronée (8 espaces là où le
code en a 4, les lignes vivant dans une closure). Ils n'ont RIEN remplacé. Les témoins
tournaient contre le code d'origine et passaient.

1. **« N passed » après une mutation n'est une information que si la mutation a eu lieu.**
   `sed`/`perl -pi` échouent SILENCIEUSEMENT sur un motif non trouvé : code de sortie 0,
   fichier inchangé. Un mutant se VÉRIFIE avant de se juger — `git diff --stat` sur le
   fichier muté, et mutation par NUMÉRO DE LIGNE (`sed -i '148s|.*|...|'`) après
   localisation au `grep -n`. Refait ainsi, tous les mutants sont tombés du premier coup.
2. **Le faux négatif pousse à SUR-tester, pas à sous-tester** — c'est ce qui le rend
   coûteux sans avoir l'air dangereux. On ajoute des témoins redondants pour une règle
   déjà couverte et on ne découvre jamais que l'instrument de preuve était cassé. « Mon
   témoin nommé pour CETTE règle ne tombe pas alors qu'il devrait » est un signal sur le
   HARNAIS avant d'être un signal sur le témoin.

## Leçon 118 — recharger un module pour remettre à zéro son état partagé recharge aussi son React

Le cooldown du delta-sync vit au niveau module (plusieurs écrans montent la même liste).
Pour isoler les témoins, premier réflexe : `jest.resetModules()` + `await import(...)`.

Les témoins de fonction pure passaient ; les `renderHook` tombaient sur
`TypeError: Cannot read properties of null (reading 'useContext')` — qui se lit comme un
`QueryClientProvider` manquant, alors que le provider était là.

`resetModules` vide le registre : le module fraîchement importé résout un `react` et un
`@tanstack/react-query` **différents** de ceux que le fichier de test importe
statiquement. Deux instances de React ⇒ dispatcher nul.

**L'état partagé d'un module se remet à zéro par la porte que la PRODUCTION utilise, pas
en détruisant le module.** Le garde lit `Date.now()` : un `jest.spyOn(Date, 'now')` qui
avance de dix minutes entre les tests le rouvre exactement comme le temps réel — sans
toucher au registre, sans export test-only dans le code de production. (La version
retenue de ce cycle a réglé le même besoin autrement : garde porté par une `WeakMap`
clé par `QueryClient`, donc naturellement isolé par client de test.)

## Leçon 119 — la variante « plausible et plus complète » d'une garde se teste contre la FEATURE qu'elle pourrait éteindre

Le cycle a proposé, par-dessus la version retenue, un cliquet sur le compteur de non-lus :
« le delta peut toujours BAISSER le badge, il ne peut le MONTER que s'il apporte un
`lastMessageAt` plus récent ». Le raisonnement tenait, le cas visé était réel (instantané
serveur antérieur à un `mark-as-read` en vol), et la règle avait ses cinq témoins verts.

Elle était fausse, et c'est un témoin PRÉEXISTANT de l'autre session — « the delta is
server truth » — qui l'a fait tomber, pas une relecture.

1. **Transposer une règle d'une plateforme à l'autre demande de transposer aussi son
   INTERRUPTEUR.** iOS clampe sur `userState.lastReadAt` ; `markAsUnread` marche
   précisément parce qu'il EFFACE cette frontière, ce qui désarme le clamp et rend la main
   au serveur. Une transposition basée sur `unreadCount` + `lastMessageAt` reproduit la
   condition mais PAS son moyen de désarmement — donc elle éteint silencieusement le
   « marquer comme non lu » cross-device, une feature qu'aucun témoin du cycle ne
   regardait. **Avant d'écrire une garde qui refuse une valeur serveur, chercher quelle
   ACTION UTILISATEUR produit légitimement cette valeur.**
2. **Comparer les coûts des deux erreurs, pas seulement leurs probabilités.** Un badge
   rallumé une seconde et réparé par le `conversation:unread-updated` suivant est un faux
   transitoire auto-réparant ; un mark-as-unread jamais affiché est un faux PERMANENT.
   Une garde n'est justifiée que si le mal qu'elle empêche survit plus longtemps que celui
   qu'elle cause.
3. **Une garde se coupe à la portée qu'on peut PROUVER.** La moitié « conversation
   ouverte » est démontrable sans frontière locale (l'écran la montre, le handler socket
   la clampe déjà) et a été conservée. La moitié « conversation fermée » demande de faire
   voyager la frontière de lecture jusqu'au modèle web : chantier de contrat, documenté et
   laissé ouvert, pas approximé par un proxy.

---

## Leçon 120 — une room n'est pas une audience : chercher QUAND le client la rejoint (2026-08-11, routine messaging, cycle 77)

`message:attachment-updated` diffusait dans `ROOMS.conversation(...)` depuis toujours, et
ça se relit comme correct : l'événement concerne une pièce jointe D'UN message DE cette
conversation, donc la room de la conversation. C'est un raisonnement sur le SUJET de
l'événement, pas sur l'audience réelle de la room.

Ce qui décide, c'est **le moment où le client rejoint cette room**. iOS n'émet
`conversation:join` qu'à l'OUVERTURE du fil (`roomsToRejoinOnConnect` ne rejoue que les
rooms déjà tenues) : au lancement de l'app, un lecteur resté sur la liste n'est dans AUCUNE
room de conversation. Une diffusion « à la room » n'atteint donc pas « les participants »,
elle atteint « ceux qui ont ouvert ce fil depuis le lancement ».

Trois gestes, dans cet ordre :

1. **Vérifier ce que le client FAIT du delta, pas seulement s'il l'écoute.** Ici le SDK
   applique le patch sans regarder quel fil est ouvert (`ConversationSyncEngine`, cache
   par conversation, no-op si le message est absent) alors que le ViewModel, lui, filtre
   sur la conversation courante. Deux écouteurs, deux portées : élargir l'audience n'a de
   valeur que parce que le PREMIER existe. Sans lui, on aurait payé de la bande passante
   pour rien.
2. **Un événement asynchrone doit se demander ce que portait la copie MISE EN FILE.** Le
   `message:new` d'une note vocale part avant Whisper : il porte la pièce jointe sans
   transcription. Rejouer ce `message:new` seul à la reconnexion, c'est garantir la
   version non enrichie — l'enrichissement doit sa PROPRE entrée de file.
3. **Élargir une audience oblige à re-poser la question du filtrage par destinataire.**
   `message:new` trime ses traductions par langue du lecteur ; ce delta ne le peut pas,
   parce que les clients REMPLACENT la carte de traductions au lieu de la fusionner — un
   sous-ensemble effacerait les langues déjà en cache. La bonne réponse n'est pas toujours
   « fais comme le voisin » : c'est « regarde la sémantique d'application côté client ».

Corollaire pour le balayage : `grep "to(ROOMS.conversation("` ne rend pas une liste de
fautes, il rend une liste de **questions**. Chaque site se juge sur trois audiences — dans
le fil, sur la liste, hors ligne — et sur ce que le client fait de l'événement dans
chacune.

## Leçon 121 — l'ORDRE d'une page décide si sa troncature est une perte ou une pagination (2026-08-11, routine messaging, cycle 77)

`GET /conversations?updatedSince=` plafonne à 100 lignes et triait par `lastMessageAt`
décroissant. Le tri venait de l'écran de liste, où il est juste ; appliqué à une page
FILTRÉE par `updatedAt`, il n'a aucun rapport avec le filtre.

Conséquence : les lignes coupées ne sont pas « les moins récemment mises à jour », donc un
client qui avance son watermark au max des `updatedAt` reçus les enjambe — définitivement,
jusqu'à sa prochaine réconciliation complète (24 h). Le web avait traité le symptôme côté
client (page pleine ⇒ relecture complète) ; la cause était un `orderBy` à quatre mots.

**Règle : quand une page est filtrée par un curseur, elle doit être TRIÉE par ce même
curseur, croissant.** Alors les lignes coupées sont exactement celles que le curseur
suivant demandera, et la troncature devient une pagination naturelle — sans une ligne de
code client. Un tri hérité d'un autre usage de la même route est le premier endroit où
regarder quand un delta « perd » des lignes.

Deux bornes à écrire noir sur blanc :

- **Le résidu des ÉGALITÉS survit.** Avec une borne stricte (`gt`), plus de `limit` lignes
  portant la même milliseconde débordent d'une page qu'on ne sait pas reprendre. Le dire
  dans le code, et laisser au client la détection de la page pleine plutôt que la
  supprimer en croyant le défaut clos.
- **L'ordre est conditionnel au filtre.** Une page ordinaire garde la récence : la même
  route sert deux besoins, et trier par `updatedAt` un écran de liste lui rendrait ses
  conversations les plus vieilles en tête.

## Leçon 122 — une page PLEINE n'est jamais une preuve de fin ; demander plus que le plafond détruit la preuve (2026-08-11, routine messaging, cycle 78)

`deltaSyncCore` (iOS) demandait `limit=500` à une route plafonnée à 100. On lit ça comme de
l'hygiène — « le serveur cappe, tant pis ». C'en est l'inverse : **la seule façon de savoir
qu'une page a été coupée est de la comparer au plafond, et demander plus que le plafond rend
cette comparaison impossible**. Une page à 100 devenait indistinguable d'une fenêtre épuisée.

Trois règles à reprendre partout où un curseur pagine :

1. **Demander EXACTEMENT le plafond serveur** — ou mieux, **lire ce que le serveur ANNONCE**.
   La version retenue sur `main` (PR #2863) fait `pagination?.hasMore ?? (count >= limit)` : le
   comptage n'est que le repli. Une preuve déclarée par la source bat une preuve déduite ; ne
   déduire que lorsque la source se tait.
2. **Sur une page qui laisse du reste, NE PAS AVANCER LE CURSEUR** — puis escalader. L'ordre est
   le contenu du correctif : une escalade partant d'un curseur déjà trop haut hérite du trou
   qu'elle existe pour fermer. Et c'est parce que le curseur n'a pas bougé qu'une escalade
   ÉCHOUÉE (offline) laisse la fenêtre entière rejouable au lieu d'un trou définitif.
3. **Si on choisit de paginer plutôt que d'escalader, reprendre au max de la page est FAUX.**
   La coupure peut tomber au milieu d'un groupe partageant la même valeur de curseur ; une borne
   stricte `gt` posée sur le max enjambe les survivantes du groupe. Le seul curseur sûr est la
   plus haute valeur STRICTEMENT inférieure au max de la page. Et il reste un cas qu'aucun
   curseur ne franchit — toute la page à une seule valeur — où l'escalade est la seule réponse.

Distinction qui vaut au-delà de ce cas : **une borne de fréquence sur un entretien PÉRIODIQUE ne
doit jamais throttler une RÉPARATION.** `fullReconcileInterval` (24 h) borne la purge des
fantômes ; il n'a rien à dire à un `fullSync` que le delta vient de réclamer parce qu'il sait sa
fenêtre incomplète.

Côté test : une pagination ne se teste pas contre un mock qui rend la MÊME page à chaque appel —
la boucle passe au vert quoi qu'elle fasse. Il faut une file de réponses.

## Leçon 122b — arriver deuxième sur la même tête ne donne aucun droit de réécriture (2026-08-11, routine messaging, cycle 78)

Ce cycle a écrit, testé et fait passer la CI sur une correction de la page delta tronquée.
Pendant la CI, une session parallèle a mergé la PR #2863 : même défaut, correction plus simple et
mieux instrumentée. Le merge a conflité sur les quatre fichiers.

La tentation est de « fusionner intelligemment » — garder sa propre mécanique en résolution de
conflit. C'est un piège à trois détentes :

1. **Deux mécanismes pour une règle ne se superposent pas.** Leur contrat testé disait « le
   curseur n'avance pas » ; le mien avançait pour paginer. Garder les deux, c'est faire échouer
   leurs témoins — donc les retirer — donc écraser leur travail en prétendant l'intégrer.
2. **Le code déjà mergé a une propriété que le mien n'a pas : il est sur `main`.** Il a été revu,
   il a passé sa CI, d'autres branches partent déjà de lui. Le remplacer par une variante lors
   d'une résolution de merge est une décision d'architecture prise dans le pire endroit possible.
3. **Ce qu'on jette, on le documente.** Le récit, les deux bornes trouvées (reprise sous le
   groupe du haut, résidu des égalités) et le coût mesuré de l'escalade systématique valent plus
   que le code retiré : ils deviennent une tête instruite CONTRE le comportement en place.

Règle : quand `main` a déjà fermé la tête qu'on instruit, on prend `main`, on retire sa propre
plomberie devenue sans consommateur, et on convertit son travail en instruction. On ne se sert
pas d'un conflit comme d'un droit de veto.

Corollaire de cadence : **relire `main` avant d'OUVRIR une tête, pas seulement avant de merger.**
Une tête écrite dans `todo.md` n'est pas une réservation ; trois routines lisent la même liste.


## Leçon 123 — une invalidation qui ne matche aucun cache est une PANNE, et sa correction n'est pas de la rebrancher (2026-08-11, routine messaging, cycle 78)

`use-reactions-query.ts` invalidait `conversations.lists()` sur chaque réaction, commentaire
explicite à l'appui (« réaction ajoutée = conversation modifiée »). La sidebar lit
`conversations.infinite()` : préfixes disjoints, donc **l'intention déclarée n'a jamais été
exécutée**. C'est pire que du code mort : le commentaire fait foi pour le prochain lecteur.

Le réflexe est de rebrancher sur la bonne clé. Deux questions AVANT :

1. **L'intention est-elle vraie ?** Ici non : une ligne de liste ne porte rien qui dérive des
   réactions. Le piège était un homonyme — `ConversationList` rend bien un `reaction`, mais
   c'est l'emoji de PRÉFÉRENCE de conversation, sans aucun rapport. Vérifier ce que la vue
   AFFICHE, pas ce que le nom suggère.
2. **Que coûterait la version qui marche ?** Sur un cache `infinite`, une invalidation relit
   TOUTES les pages chargées. Rebrancher aurait réintroduit, sur chaque réaction, le refetch que
   le cycle précédent venait de retirer du chemin de focus.

Quand les deux réponses sont « non » et « cher », le correctif est la SUPPRESSION. Une
invalidation morte qu'on répare sans rouvrir son intention devient une régression de perf
présentée comme un correctif.

Corollaire de test : une `invalidateQueries` ne refetch que les requêtes ACTIVES. Un témoin qui
pose son cache à la main (`setQueryData`, `fetchQuery`) reste muet et passe au vert sans rien
prouver. Il faut monter de VRAIS observateurs — et sur les DEUX formes de clé, pour que le
témoin échoue aussi bien sur l'invalidation morte que sur sa « correction » coûteuse.

## Leçon 124 — un fichier d'état PARTAGÉ entre routines ne s'écrit que par la routine qui le possède (2026-08-11, routine messaging, cycle 78)

Ce cycle a écrit `tasks/lane-cursor.md` en finalisation, par mimétisme avec les cycles
précédents. Ce fichier est l'état de la routine **Android** (`lane=…`, `android_streak=…`,
sa source de vérité déclarée dans `tasks/android-parity-ios-debt-agent-prompt.md`). Pendant le
même run, cette routine l'a avancé de `streak 2` à `streak 3` : le merge de `main` a conflité,
et une résolution distraite (« garder HEAD ») aurait effacé le compteur d'une autre routine.

Deux règles :

1. **Avant d'écrire un fichier de tâches, chercher qui le DÉCLARE comme sa source de vérité.**
   Un `rg` sur le nom du fichier dans `tasks/` répond en une commande. Écrire dedans « parce
   que le cycle précédent l'a fait » n'est pas une raison — il faut vérifier que le cycle
   précédent était la même routine.
2. **Sur conflit dans un fichier qu'on ne possède pas : prendre `--theirs`, sans discussion**,
   et retirer sa propre écriture plutôt que tenter une fusion des deux états. Un compteur de
   streak n'a pas de fusion sensée.

Corollaire, valable au-delà des fichiers d'état : quand plusieurs routines tournent en
parallèle sur le même dépôt, `git merge origin/main` en fin de cycle n'est pas une formalité —
c'est le moment où l'on découvre ce que les autres ont fait. Ce cycle y a découvert que la PR
#2860 avait livré, en parallèle, la moitié du lot qu'il documentait comme « reste ouvert » :
il a fallu corriger la note AVANT de merger, sinon `todo.md` sortait du cycle avec une
affirmation fausse.
## Leçon 120 — un fichier de test non enregistré au pbxproj ne s'exécute pas, et rien dans le gate ne le dit (2026-08-11, plan message-more-jumps-to-views, Task 3)

Un plan a livré `MessageMoreJumpsToViewsGuardTests.swift` avec ses trois gardes, deux
commits verts, un RED et un GREEN « observés ». Le fichier n'était dans aucune cible :
`Meeshy.xcodeproj` énumère ses sources explicitement (aucun
`PBXFileSystemSynchronizedRootGroup`) et `meeshy.sh` ne lance JAMAIS `xcodegen`. Preuve
définitive dans le bundle produit pendant le run : `nm -a MeeshyTests.xctest/MeeshyTests`
donnait **0** symbole pour la classe, contre 11 pour un témoin voisin.

1. **`-only-testing:` sur une classe inexistante ne fait PAS échouer xcodebuild.** Le run
   sort « vert », et le rouge attendu de la phase RED se confond avec une erreur de
   sélection. Un rouge n'est valable que s'il imprime une ligne
   `Test Case '-[MeeshyTests.<Classe> …]' failed` AVEC le message d'assertion attendu.
2. **Le manifeste `-only-testing` n'est pas une preuve d'exécution.**
   `discover_test_classes()` le construit en grepant les SOURCES : une classe orpheline y
   figure toujours. Seuls font foi le symbole dans `MeeshyTests.xctest` ou une ligne
   `Executed N tests` nommant la classe. Le gate le vérifie désormais lui-même
   (`verify_test_classes_are_compiled`), et un orphelin le rend ROUGE.
3. **« Ne jamais committer le churn pbxproj » ≠ « ne jamais committer le pbxproj ».**
   Appliquée en bloc avant chaque `git add`, la règle jette l'ajout de référence d'un
   fichier NEUF et fait naître mort tout test créé par un plan. Distinguer : churn
   (réordonnancements, UUID régénérés, build number réécrit) → jeter ; 4 lignes nommant le
   fichier neuf (`xcodegen generate` en produit exactement 4, 0 suppression) → committer.

## Leçon 125 — une consigne héritée d'un cycle précédent ne dispense pas de lire l'en-tête du fichier qu'elle prescrit de changer (2026-08-12, routine messaging, cycle 81)

Le cycle 80 léguait une action nommée et argumentée : « ajouter un trigger `pull_request` restreint
aux chemins `apps/ios/**` » pour que la routine cesse de merger du Swift non compilé. L'appliquer
aurait annulé une décision **délibérée, datée et mesurée** — l'en-tête d'`ios-tests.yml` documente
son retrait au 2026-07-27 sur les runs #3728-#3741 : le trigger PR ajoutait 24-49 min de pure
attente de runner et ralentissait la suite **pour `dev` et `main` aussi**.

1. **Une prescription héritée est une hypothèse, pas un mandat.** Elle a été écrite par un cycle qui
   n'avait pas le fichier sous les yeux. Le fichier, lui, porte souvent la contre-mesure.
2. **Chercher la trace de décision AVANT de l'annuler**, et la chercher là où elle vit : l'en-tête du
   workflow, pas seulement `decisions.md`. Ici le paragraphe s'appelait littéralement
   « TRIGGER SCOPE (2026-07-27, measured on runs #3728-#3741) ».
3. **Le bon livrable, quand la prescription tombe, est la tête du cycle suivant** — les deux portes
   restantes (`macos-15-xlarge`, nommé « the RIGHT fix » par le fichier lui-même ; ou `actions: write`),
   avec la question qui les relie peut-être en une seule. Pas un revert silencieux, pas un abandon.
4. Corollaire du cycle 80 (fiche gwcontract-11) sous un autre angle : **le dépôt est une source, pas
   seulement un registre.** Au 80 il contenait déjà le correctif à écrire ; au 81 il contenait déjà la
   raison de ne pas écrire celui qu'on prescrivait.

## Leçon 126 — un test intermittent sur du code qui n'a pas bougé nomme une course, et la course est en général dans la production (2026-08-12, routine messaging, cycle 81)

`StoryUploadQueueTests.test_uploadSucceeds_dequeuesItsWriteAheadIntent` était rouge sur `dev` avec
deux runs verts antérieurs sur le MÊME code (fichier inchangé depuis `0737b063`). Le réflexe
« stabiliser le test » (attendre la queue plutôt que l'UI) aurait éteint le signal et laissé le
défaut.

1. **Intermittent + source figée ⇒ ordonnancement, pas régression.** Le seul travail utile est de
   trouver les deux choses que rien n'ordonne. Ici : le retrait de l'intent write-ahead
   (`Task.detached`) et la déclaration de succès à l'UI (`activeUploads`, toast, slot), sur le
   chemin de succès de `StoryViewModel.launchUploadTask`.
2. **Un `Task.detached` qui retire un garde de durabilité APRÈS que l'action gardée a réussi est un
   défaut de correction, pas une optimisation.** Le commentaire du site disait déjà ce que l'intent
   protège (« sinon le boot suivant re-publierait ») : le détacher ouvre une fenêtre où l'app meurt
   avec l'intent en base et la story déjà en ligne — le drain de boot la republie.
3. **Chercher le chemin jumeau avant de conclure au choix délibéré.** Le drain hors-ligne
   (`executeQueuedPublish`) awaitait ce même retrait depuis toujours : l'incohérence interne au
   fichier prouve la dette. Deux gestes opposés sur la même invariante, c'est l'un des deux qui a
   tort.
4. **Détacher ce qui doit l'être, awaiter ce qui doit l'être — dans le même correctif.** L'acteur
   (retrait de l'intent) s'awaite : c'est un saut d'acteur, et il ORDONNE. L'IO synchrone
   `nonisolated` (suppression du dossier médias) reste détachée : aucun boot n'en dépend une fois
   l'intent parti. Tout awaiter aurait mis du `FileManager` sur le MainActor ; tout détacher était le
   défaut d'origine.

## Leçon 127 — un contournement client bien commenté est le procès-verbal d'un défaut serveur (2026-08-12, routine messaging, cycle 82)

`bubble-stream-page.tsx` portait la phrase exacte : « Sessions ANONYMES exclues : la route
mark-as-read est JWT-only (allowAnonymous: false) — chaque flush partirait en 401 », trois lignes
après avoir expliqué qu'un écran privé de ce hook voit « son compteur croître indéfiniment ». Tout
était écrit : la cause, l'effet, et jusqu'au nom de l'option fautive. Personne n'avait suivi la
flèche jusqu'au serveur.

1. **Un commentaire qui EXPLIQUE pourquoi le client renonce à un appel nomme une cause serveur.**
   Le grep qui trouve `allowAnonymous`, `JWT-only`, `401`, `403` dans les commentaires du CLIENT est
   un détecteur de défauts backend, et il est bon marché.
2. **Deux moitiés d'une même capacité peuvent vivre dans deux fichiers et ne jamais se rencontrer.**
   Ici le serveur COMPTAIT les non-lus d'un anonyme et les lui POUSSAIT (trois sites délibérés,
   commentés, testés) mais aucune route ne lui permettait de les ACQUITTER. Chaque moitié était
   défendable seule ; c'est leur asymétrie qui était le défaut. Chercher la moitié manquante :
   « qui écrit ce que ce chemin lit ? », « qui remet à zéro ce que ce chemin incrémente ? ».
3. **Deux verrous en série s'auditent séparément.** La porte (`allowAnonymous: false`) répondait 403
   AVANT la clé (la garde `where: { userId }`). Corriger la clé seule n'aurait rien changé et le
   test serait resté rouge sans qu'on sache pourquoi ; corriger la porte seule aurait ouvert sur un
   403 plus tardif. Prouver CHAQUE verrou par sa propre mutation.
4. **`authContext.userId` ne contient pas toujours un `User.id`.** La branche anonyme d'auth y écrit
   `participant.id`. Tout `where: { userId: authContext.userId }` sur `Participant` est donc suspect
   par construction — il compare un id de participant à une colonne d'utilisateur. Le résolveur
   partagé (`resolveCallerParticipant`) existe désormais ; la dette restante est nommée dans
   `tasks/todo.md`.

## Leçon 128 — un double de test qui n'ÉVALUE pas le `where` valide les deux versions du code (2026-08-12, routine messaging, cycle 82)

Le défaut du cycle 82 a traversé des suites vertes pendant des mois parce que chaque test doublait
`participant.findFirst` par un `mockResolvedValue({ id })` constant : la garde juste et la garde
fausse rendaient le même participant. Le dépôt possédait DÉJÀ le remède —
`src/__tests__/helpers/mongo-where.ts` (`findFirstIn`), écrit pour le piège absent-vs-null — et son
en-tête dit la règle mieux que moi : « Un test qui compare la clause reçue à celle qu'il attend
passe aussi bien avec une clause juste qu'avec une clause fausse ».

1. **Chercher le helper AVANT d'écrire le double.** J'ai commencé par une fonction `clauseMatches`
   maison, avec un `if (key === 'bannedAt') return true` — une triche qui aurait masqué exactement la
   garde de bannissement que j'ajoutais. Le helper du dépôt, lui, distingue `null` d'absent et
   n'aurait rien laissé passer.
2. **Le corollaire côté fichiers de test EXISTANTS** : quatre doublaient le module `access-control`
   en ENTIER, donc rendaient `undefined` toute fonction nouvellement exportée. Le réflexe « ajouter
   la fonction au mock » aurait recréé le problème une couche plus loin ; `jest.requireActual` +
   override de la seule fonction voulue garde la règle réelle sous le test.
3. **Un test qui pinne une requête SUPPRIMÉE doit être réécrit, pas rafistolé.** `mark-unread`
   relisait deux fois le même participant ; un test verrouillait le second `null`. La bonne
   réécriture ne remplace pas l'assertion par une équivalente : elle affirme la nouvelle vérité —
   une seule résolution, et le refus tombe PLUS TÔT (`participant.findFirst` appelé une fois,
   `message.findFirst` jamais).


## Leçon 129 — un callback dont le corps n'est que des gardes est un défaut, pas un no-op délibéré (2026-08-12, routine messaging, cycle 86)

`ConversationLayout.onUserTyping` filtrait l'écho de soi, filtrait les autres conversations… puis se
terminait. Rien n'écrivait. La forme est traître parce qu'elle a l'air FINIE : deux `return` gardés,
des paramètres préfixés `_` qui signalent « volontairement inutilisés », des deps cohérentes. Le
hook d'à côté exposait pourtant `handleUserTyping`, seul écrivain de l'état que l'en-tête rend — et
personne ne l'avait déstructuré.

1. **Un `useCallback` remis à une couche transport et dont AUCUNE branche n'écrit ni n'appelle est
   presque toujours une moitié de câblage perdue.** Le test bon marché : « ce callback produit-il un
   effet observable dans au moins un chemin ? ». Si la réponse est non, chercher la fonction qu'il
   aurait dû appeler — elle est en général exportée par un hook du même fichier.
2. **Un préfixe `_` sur un paramètre est une AFFIRMATION, pas une preuve.** Ici `_username` et
   `_isTyping` — les deux valeurs qui portent toute l'information — étaient marqués inutilisés par
   la personne qui venait justement d'oublier de les utiliser.
3. **Une fonctionnalité qui marche sur une surface et pas sur l'autre masque la panne au test
   manuel.** `use-stream-socket.ts` tient sa PROPRE copie du handler typing et la câble juste : les
   indicateurs marchaient sur l'accueil, donc « les indicateurs marchent ». Quand deux surfaces
   réimplémentent le même câblage, vérifier les DEUX, ou n'en garder qu'une.

## Leçon 130 — un test qui écrit « may or may not » n'est pas un test, c'est la note de son auteur (2026-08-12, routine messaging, cycle 86)

Deux tests de `useConversationTyping` s'appelaient « should stop typing on conversation change if
active » et « should stop typing on unmount if active ». Ni l'un ni l'autre n'assertait quoi que ce
soit sur `stopTyping` ; tous deux portaient un commentaire du type « The cleanup effect may or may
not call stopTyping depending on React's cleanup timing ». Ils étaient verts, comptés dans la suite,
et nommaient exactement le comportement cassé.

1. **Un titre qui promet un comportement et un corps qui n'affirme rien, c'est pire qu'un test
   absent** : le nom occupe la place, et une recherche « est-ce testé ? » répond oui.
2. **« Ça dépend du timing de React » est la formulation d'une hypothèse non instruite.**
   L'ordonnancement des nettoyages et des effets est déterministe et documenté (tous les nettoyages
   avant tous les effets) : il se raisonne, il ne s'invoque pas comme une incertitude.
3. **Le repérage est mécanique** : `rg -l "may or may not|peut ou non" __tests__/` et, plus large, un
   `it(...)` dont le corps ne contient aucun `expect`. Les deux se cherchent en une commande.
4. Corollaire de la leçon 128 sous un autre angle : là-bas le double validait les deux versions du
   code ; ici c'est l'ABSENCE d'assertion qui les validait toutes les deux.

## Leçon 131 — dans un clone superficiel, « en avance / en retard » est une fiction, et `merge-base` le dit (2026-08-12, routine messaging, cycle 86)

Au démarrage, `git log --oneline origin/main..HEAD` annonçait 334 commits d'avance et 340 de retard,
avec un `origin/main` daté de trois jours plus tôt portant des numéros de PR INFÉRIEURS à ceux de la
branche. Tout invitait à conclure à une divergence à réconcilier — et donc à un merge inutile et
risqué. La branche et `main` étaient en réalité **le même commit**.

1. **Le signal qui tranche est `git merge-base HEAD origin/main` qui ÉCHOUE** (aucun ancêtre commun).
   Deux branches d'un même dépôt en ont toujours un : son absence ne dit pas « divergence », elle dit
   « historique tronqué ». Confirmer avec `git rev-parse --is-shallow-repository` et
   `wc -l .git/shallow`.
2. **Le piège d'écriture** : `git merge-base A B | xargs git log -1` sur une sortie VIDE exécute
   `git log -1` sans révision, donc affiche HEAD — et fabrique la preuve rassurante que HEAD est
   l'ancêtre commun. Ne jamais piper un `merge-base` dans `xargs` sans garde.
3. **L'autorité est le distant, pas le ref local.** `git ls-remote --heads origin main` a répondu en
   une commande que `main` valait exactement HEAD. Un `git fetch` ordinaire n'avait pas corrigé le
   ref local greffé ; `git update-ref` sur le sha du distant, si.
4. Corollaire : une routine qui commence par « où en est ma branche ? » doit poser cette question au
   DISTANT tant qu'elle n'a pas vérifié la profondeur du clone.

## Leçon 132 — deux sessions de la même routine peuvent écrire le même correctif en parallèle ; la tête instruite ne réserve rien (2026-08-12, routine messaging, cycle 87)

Le cycle 86 a légué une « Priorité 1 » nommée et argumentée. Deux sessions l'ont lue et l'ont
implémentée **en même temps** : celle-ci (`claude/keen-hamilton-tpltop`) et
`claude/keen-hamilton-8m3aqm`, qui a mergé la sienne sur `main` pendant que celle-ci finissait la
vérification. Les deux ont convergé au nom de méthode près — `retractTypingIn`, même signature à id
déjà normalisé, même ordre, même refus de re-résoudre la conversation. Découvert seulement au
`git fetch` final, après trois commits.

1. **Une tête instruite est une file de lecture, pas un verrou.** Elle dit quoi faire ensuite, elle
   ne dit à personne que quelqu'un d'autre l'a commencé. Tant qu'il n'existe pas de mécanisme
   d'exclusion, l'ordre de priorité est un aimant à collisions : plusieurs sessions démarrent par
   l'item 1.
2. **`git fetch origin main` AVANT d'écrire, pas seulement avant de merger.** Le coût est d'une
   seconde ; le coût de l'omission est un correctif entier à jeter. À refaire aussi en cours de
   route sur les cycles longs.
3. **Quand la collision est constatée, la version mergée gagne — sans rejouer les arbitrages.**
   Ici main avait fait deux choix différents des miens (dépendance optionnelle plutôt que requise ;
   `try/catch` au point d'appel plutôt que dans la retraction). Tous deux défendables. Les
   re-litiger aurait produit du churn sur du code déjà revu et mergé, pour une préférence.
4. **Ce qui doit survivre, c'est ce que l'autre n'avait pas.** Mes trois tests de `retractTypingIn`
   (main n'en avait aucun : sa couverture passait entièrement par `ConversationHandler`) et deux
   garanties de coût qu'il n'affirmait pas. Un merge « je prends tout de main » les aurait perdus ;
   un merge « je garde tout de moi » aurait écrasé son travail. Le tri se fait test par test.
5. **Un test à moi affirmait un contrat que la version retenue ne tient pas** (« la retraction ne
   rejette jamais » — vrai chez moi, faux chez main qui garde chez l'appelant). Le garder tel quel
   l'aurait rendu rouge ; le supprimer aurait perdu la couverture. **Le réécrire pour affirmer ce
   que la version retenue garantit vraiment** (l'ordre untrack-avant-I/O) est la seule issue qui ne
   perd rien. Un test importé d'une implémentation concurrente doit être relu contre CELLE qui reste.

---

## Leçon 133 — un rollback « inconditionnel » qui écrit `undefined` dans React Query ne défait rien (2026-08-12, routine messaging, cycle 88)

**Contexte.** Deux mutations de réaction gardaient leur rollback derrière `if (context?.previousData)`,
ce qui laissait vivre l'état FABRIQUÉ par `onMutate` sur un cache vide. Le correctif évident —
retirer le garde et appeler `setQueryData(key, context?.previousData)` — a laissé les tests
**ROUGES**.

**La leçon.** `setQueryData(key, undefined)` est un **no-op** : React Query interprète `undefined`
comme « ne rien changer » (même règle que pour un updater qui renvoie `undefined`). Restaurer
l'ABSENCE de donnée n'est pas une écriture, c'est un `removeQueries`. Un instantané optimiste a donc
deux états de restauration, pas un :

| `previousData` | Restauration correcte |
|---|---|
| une valeur | `setQueryData(key, previousData)` |
| `undefined` | `removeQueries({ queryKey, exact: true })` |

**Généralisation.** Chaque fois qu'un rollback prétend « remettre exactement l'état d'avant », se
demander si « l'état d'avant » pouvait être *rien*. Beaucoup d'API traitent l'absence comme une
non-instruction plutôt que comme une valeur ; le cas vide est alors le seul que le rollback ne
couvre pas — et c'est précisément celui où `onMutate` a inventé le plus.

**Ce qui l'a attrapé.** Le test RED écrit AVANT le correctif, et surtout re-lancé APRÈS : sans lui,
le rollback inconditionnel aurait été committé comme une correction, avec sa jolie explication, sans
rien corriger du tout. Un correctif qui semble évident mérite quand même son passage au vert.

---

## Leçon 134 — un test peut passer par FUITE de mock, et le correctif qui le casse a raison (2026-08-12, routine messaging, cycle 88)

**Contexte.** Après avoir gardé le `reconnect()` de montage sur les diagnostics de connexion, deux
tests jusque-là verts sont tombés : « should attempt reconnection on mount if token available » et
son jumeau anonyme. Ni l'un ni l'autre ne posait de diagnostics — ils héritaient d'un
`mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true })` posé par un test « Initial
State » **soixante lignes plus haut**.

**La leçon.** `jest.clearAllMocks()` remet à zéro les APPELS, pas les IMPLÉMENTATIONS (`mockReturnValue`
survit ; il faut `resetAllMocks` / `mockReset`). Un `beforeEach` qui n'appelle que `clearAllMocks`
laisse donc chaque test hériter des stubs de ses prédécesseurs — dans l'ORDRE de déclaration, ce qui
rend la fuite invisible tant qu'on lance le fichier entier.

**Le réflexe à avoir.** Quand un correctif fait tomber un test qui ne le concerne pas
frontalement, se demander d'abord *pourquoi ce test passait avant*. Ici la réponse était : parce que
le code de production **ignorait** la valeur que le test ne posait pas. Le test n'affirmait donc rien
sur la précondition qu'il prétendait couvrir. Le corriger = rendre la précondition EXPLICITE, pas
neutraliser le correctif.

**Signature à reconnaître.** Un test qui devient sensible à un mock qu'il ne configure pas est un
test dont la précondition était implicite. C'est vrai à chaque fois qu'on rend un code de production
*plus* attentif à son état : les tests qui passaient par indifférence deviennent des tests qui
passent par hasard.

---

## Leçon 135 — cartographier ce que l'environnement NE PEUT PAS exécuter, et l'écrire dans la tête de cycle (2026-08-12, routine messaging, cycle 88)

**Contexte.** Trois cycles de suite (86, 87, 88) ont buté sur l'absence de toolchain Swift pour les
242 « source guards » iOS. Le cycle 88 a découvert une seconde zone morte : les tests du translator
sont incollectables parce que `numpy`/`torch` s'installent depuis l'index PyTorch, **bloqué par le
proxy** — quatre tentatives d'installation (pip système, pip du venv `uv`, `uv pip`) avant de le
constater.

**La leçon.** Une zone non exécutable n'est pas un échec ponctuel, c'est une **propriété stable de
l'environnement**. Ne pas la consigner condamne chaque cycle suivant à la redécouvrir au prix de
plusieurs minutes et d'un faux espoir. La tête de cycle porte désormais un tableau explicite
(iOS ✗, translator ✗, gateway/web ✓ + prérequis d'installation).

**Corollaire sur ce qu'on livre quand même.** L'impossibilité de tester n'interdit pas de corriger —
elle change le standard de preuve. Le retrait du doublon audio du translator a été livré parce que
sa sûreté est établie par **lecture des deux côtés du contrat** (producteur, et consommateur
`extractAudioBinaryFrames` qui résout par index borné), pas parce qu'on l'espérait sans risque. Ce
qui est dû dans ce cas, c'est de l'ÉCRIRE : le commit et le dossier de cycle disent tous deux que ce
correctif-là n'est pas couvert par un test vert. Un correctif non testé qui se présente comme testé
est le vrai défaut.

---
## Leçon 136 — une question d'identité réputée « à trancher » est presque toujours déjà tranchée par le handler JUMEAU (2026-08-12, routine messaging, cycle 88)

Le cycle 87 a instruit le join anonyme, prouvé le défaut, écarté le faux gel qui semblait le
protéger — puis s'est arrêté sur une question qu'il a jugée non tranchable seul : quelle identité
mettre dans le `userId` d'un `conversation:joined` pour un participant sans compte ? Le `SocketUser`
anonyme porte `id` ET `participantId` ; « envoyer la mauvaise fait d'un accusé une désinformation
d'identité » ; trancher « demande de lire ce que les clients font ». L'item est reparti au cycle
suivant, non livré.

La réponse tenait en deux `grep` et n'exigeait aucune toolchain :

1. **Le handler jumeau l'envoyait déjà.** `handleConversationLeave` émet `conversation:left` avec la
   clé de `socketToUser` — `participant.id` pour un anonyme. La paire join/leave partage un payload
   et une sémantique : si l'un expédie cette identité en production depuis toujours, l'autre n'a
   aucune décision à prendre, il a une divergence à supprimer. **Chercher le geste symétrique AVANT
   de déclarer une question ouverte** : leave/join, add/remove, subscribe/unsubscribe.
2. **Les clients ne lisaient pas le champ.** `rg "conversation:joined"` rend cinq sites ; les trois
   consommateurs (web `use-socket-cache-sync`, iOS `ConversationSyncEngine` et `ParticipantsView`)
   n'utilisent que `conversationId`. Le seul contrat est que le champ soit PRÉSENT — le struct Swift
   le déclare non optionnel, donc l'omettre casserait le décodage. Une question d'identité se pose à
   qui la lit ; quand personne ne la lit, il n'y a pas de désinformation possible, seulement une
   convention à respecter.
3. **Et une troisième source disait la même chose** : `ROOMS.user(userId ?? id)`, la room personnelle
   que ce socket a DÉJÀ rejointe, plus l'en-tête de `getUnreadCount` qui documente accepter un
   `Participant.id`. Trois sites concordants, zéro ambiguïté résiduelle.

La leçon de méthode, et elle est plus large que ce cas : **« il faudrait lire les clients » est une
tâche de dix minutes, pas un motif de report.** Le cycle 87 a écrit trois paragraphes pour expliquer
pourquoi il ne tranchait pas — plus de travail que la vérification elle-même. Quand un dossier
s'arrête sur « demanderait de lire X », faire la lecture de X est le pas suivant, pas un blocage à
léguer. Le blocage LÉGITIME (leçon 43) est celui qui exige une machine ou un accès qu'on n'a pas :
compiler du Swift, déclencher un workflow sur une porte fermée. Lire un fichier dans le dépôt qu'on
a déjà cloné n'en fait pas partie.

---

## Leçon 137 — la leçon 132 s'est reproduite en pire : le `git fetch` d'ouverture ne protège de rien, seul celui d'AVANT-CHAQUE-ITEM protège (2026-08-12, routine messaging, cycle 88)

Le cycle 87 avait perdu UN correctif à une session concurrente et en avait tiré la leçon 132, dont
le point 2 disait déjà : « `git fetch origin main` AVANT d'écrire, pas seulement avant de merger.
À refaire aussi en cours de route sur les cycles longs. » Le cycle 88 a ouvert par un `git fetch`
propre — `origin/main` valait exactement HEAD, aucune collision en vue — puis a travaillé trois
heures sans en refaire un. Pendant ce temps, `claude/keen-hamilton-...` (session
`013bGFApHREf7fPySWkrZZ5Y`) livrait la PR #2884 : **les trois mêmes correctifs**, plus deux autres
de la même liste. Découvert au `mergeable_state: "dirty"` de ma propre PR, après six commits et une
CI complète.

1. **Un `fetch` d'ouverture ne dit rien de l'avenir.** Il atteste qu'à l'instant T personne n'avait
   commencé — pas que personne ne commencera. Sur un cycle de plusieurs heures, c'est l'information
   la moins utile du lot. La vérification qui protège est celle qu'on fait **juste avant d'écrire
   chaque item**, et **juste avant d'ouvrir la PR**.
2. **Le coût croît avec la qualité du travail.** Trois correctifs RED-prouvés, 654 suites vertes,
   une PR de 200 lignes, une CI complète de 13 minutes : tout cela était déjà sur `main`, écrit par
   quelqu'un d'autre, avant que ma CI ne finisse. Plus la routine travaille proprement, plus une
   collision non détectée coûte cher.
3. **Le salvage se fait test par test, arbitrage par arbitrage** (leçon 132.3–132.5). Ici : trois
   implémentations quasi identiques → main partout ; deux de mes tests affirmaient MES arbitrages
   (cible canonique rendue, clé de cache normalisée) que main a tranchés autrement → supprimés, pas
   « défendus » ; un seul test m'a survécu, le cas capitalisé (`'FR'`) que la couverture de main ne
   portait pas. **Un cycle entier pour un test.**
4. **Ce qu'il reste à construire.** Tant qu'aucun mécanisme d'exclusion n'existe, la seule défense
   praticable est procédurale et doit vivre dans la tête de cycle, pas dans une leçon qu'on relit
   après coup : *avant d'écrire l'item N, `git fetch origin main && git log --oneline -15 origin/main`
   et chercher le mot-clé de l'item.* Une seconde de commande contre trois heures de travail.

---

## Leçon 138 — un garde d'ordonnancement doit être clé sur l'UNITÉ qu'il protège, pas sur son conteneur (2026-08-12, routine messaging, cycle 89)

`_isStaleTranslationResult` protégeait une vraie course (deux éditions rapprochées, réponses ZMQ
dans le désordre) avec un garde clé sur le MESSAGE. Mais l'unité que le pipeline traite, écrit et
rend, c'est le couple **(message, langue)** : une requête porte N langues, le translator les rend
une par une, `Message.translations` les range une par une, et une retraduction peut n'en viser
qu'une seule.

1. **Un garde trop large ne « protège trop » pas — il détruit.** Périmer par message faisait tomber
   des résultats parfaitement valides pour des langues qu'aucune tâche récente n'avait redemandées.
   Et un résultat jeté ici est perdu pour toujours : rien ne retente une traduction absente.
2. **Le test qui le prouve doit faire vivre DEUX tâches**, une par langue, avec des `taskId`
   distincts. Un test à une seule tâche valide indifféremment le garde large et le garde étroit —
   c'est la leçon 128 (« un double qui n'évalue pas le `where` valide les deux versions du code »)
   appliquée à un garde plutôt qu'à une requête.
3. **La même erreur de granularité se répétait un étage plus bas**, dans `ZmqTranslationClient` :
   `removePendingRequest` soldait la REQUÊTE au premier résultat, alors que ce qui se solde est une
   LANGUE. Même conteneur, même unité, même défaut — trouver l'un doit faire chercher l'autre.
4. **Écrire la clé composite, jamais la déduire.** Les deux côtés (enregistrement, lecture)
   normalisent par le SSOT `normalizeLanguageCode` : le demandeur dit `'pt-BR'`, le translator rend
   `'pt'`. Une clé composite dont les deux moitiés ne sont pas produites par la même fonction est un
   garde qui ne se déclenche jamais — ou toujours.

---

## Leçon 139 — un code défensif qui « nettoie avant » est presque toujours une redondance devenue destructive (2026-08-12, routine messaging, cycle 89)

La retraduction supprimait `Message.translations[langue]` et **persistait** cette suppression avant
d'envoyer la requête ZMQ, sans rollback. Le commentaire disait « cela permet de remplacer les
traductions existantes par les nouvelles » — une justification qui était fausse au moment où elle a
été écrite : `_saveTranslationToDatabase` remplace la clé quoi qu'il s'y trouve.

1. **Vérifier l'écrivain AVAL avant de croire le nettoyeur AMONT.** La question à poser n'est pas
   « pourquoi supprime-t-on ? » mais « que se passerait-il si on ne supprimait pas ? ». Ici : rien,
   sauf sur le chemin d'échec, où la suppression est la seule chose qui reste.
2. **Un nettoyage préalable sans rollback est un pari sur le succès du réseau.** Le mode de panne
   n'est pas « l'utilisateur voit brièvement l'ancienne traduction » (bénin) mais « la traduction
   correcte n'existe plus nulle part » (définitif). Entre les deux, le choix ne se discute pas.
3. **La redondance était déjà documentée à côté** : quatre transports d'édition écrivent
   `translations: null` dans l'écriture du CONTENU, et un test du cycle 35 verrouille précisément ce
   choix (« ne réécrit pas la ligne une seconde fois pour invalider ce que la première a déjà
   vidé »). Le bloc supprimé était la seconde écriture que ce test interdisait — un étage plus bas,
   hors de sa portée.
4. **Un correctif qui RETIRE du code doit se prouver par un test d'ABSENCE d'écriture**
   (`expect(prisma.message.update).not.toHaveBeenCalled()`), pas seulement par la survie de la
   donnée : sinon un futur « nettoyage » revient sans que rien ne le dise.

---

## Leçon 140 — deux exclusions voisines dans le même handler peuvent devoir porter sur des identités OPPOSÉES (2026-08-12, routine messaging, cycle 89)

Dans `handleMessageDelete`, deux fan-outs se suivent à dix lignes d'intervalle et excluent chacun
quelqu'un. La file hors ligne exclut **l'ACTEUR** (un modérateur supprime, l'auteur doit l'apprendre
— corrigé à un cycle précédent, avec un commentaire de quinze lignes). Le recalcul du badge de
non-lus exclut **l'AUTEUR** (ses propres messages n'ont jamais compté dans ses non-lus ; le
modérateur, lui, est un destinataire à rafraîchir).

1. **Copier l'exclusion du voisin est le réflexe à combattre.** Les deux lignes se ressemblent, le
   commentaire d'à côté est long et convaincant, et il dit l'inverse de ce qu'il faut faire ici.
   L'exclusion se dérive de la question « de qui l'état ne peut PAS changer ? », jamais de « qui le
   code voisin exclut-il ? ».
2. **Réutiliser l'unité partagée ne dispense pas de rejouer son contrat.** `emitUnreadCountsToRecipients`
   nomme son paramètre `senderId` parce que ses trois appelants d'origine sont des chemins d'ENVOI.
   Sur un chemin de SUPPRESSION, le même paramètre reste juste — mais parce que l'auteur est le bon
   exclu, pas parce que le nom du paramètre le suggère.
3. **Un paramètre trop large invite au cast, et le cast masque le contrat.** `_updateUnreadCounts`
   exigeait un `Message` complet pour n'en lire que `senderId` ; le chemin de suppression, qui ne
   dispose que d'un `select` étroit, ne pouvait l'appeler qu'en mentant (`as Message`). Réduire le
   paramètre à ce que l'unité lit vraiment a supprimé le cast — et rendu l'exclusion visible sur la
   ligne d'appel.

---

## Leçon 141 — un test rouge sur du code que personne n'a touché ne prouve pas un défaut, il prouve un DÉSACCORD (2026-08-12, routine messaging, cycle 89)

`main` était rouge : 8 suites gateway, 35 tests, depuis un lot d'intégration de 48 fichiers de test.
Le job `Test gateway` échouait sur `main` ET sur toute PR — donc plus rien ne pouvait être mergé,
par personne. Aucun des 35 échecs n'était un défaut de production.

1. **Mesurer le DELTA avant de diagnostiquer quoi que ce soit.** Le premier réflexe utile n'est pas
   de lire le test rouge, c'est de le rejouer sur `main` en checkout détaché avec le MÊME
   `node_modules`. Liste identique, comptes identiques ⇒ la branche est hors de cause, et la
   question change complètement de nature. Cinq minutes qui évitent de chercher un défaut chez soi.
2. **Trancher en lisant ce que la production justifie d'elle-même.** Six des huit suites portaient,
   en face, un commentaire de production expliquant pourquoi la forme attendue par le test était
   exactement celle qu'un correctif avait retirée : `deletedAt: null` qui n'apparie rien sur Mongo,
   `currentUses + 1` qui est une course, `userId` nu qui n'est pas un credential, « pas de requête
   DB » qui était le trou de sécurité. Le test décrivait le BUG. Un dépôt qui documente ses
   correctifs à l'endroit du correctif rend cet arbitrage mécanique — c'est le retour sur
   investissement des commentaires-qui-expliquent-pourquoi.
3. **Un double de test incomplet produit un échec qui ACCUSE la production.** Trois des huit
   suites échouaient uniquement parce qu'il manquait une méthode au double (`updateMany`,
   `connect`, `findFirst`) : la méthode réelle levait, le `catch` avalait, et le test rendait
   « `internal_error` » ou « 0 appel ». Le symptôme désigne la production ; la cause est dans le
   mock. Signature à reconnaître : *tous* les cas d'une méthode rendent la même erreur générique.
4. **Ne jamais écrire de production pour satisfaire un test imaginé.** `sendNotificationToUser`
   n'existait nulle part, dans aucune version, et rien ne l'appelait. Lui donner une implémentation
   aurait produit du code mort — sous garantie de test, donc protégé de toute suppression future.
   Le test part.
5. **Réparer la CI d'autrui n'est pas une digression quand elle bloque la sienne.** La règle « ne
   pas élargir le périmètre » cède devant un fait simple : tant que `main` est rouge, aucun travail
   ne peut être livré. Le repérer tôt (au premier échec de CI) coûte une passe ; le repérer tard
   coûte le cycle.

## Leçon 142 — la leçon 137 s'est reproduite une TROISIÈME fois : le grain du `fetch` doit être celui de l'ITEM, pas celui du cycle (2026-08-12, routine messaging, cycle 90)

**Contexte.** Le cycle 90 a ouvert par `git fetch origin main` (`f96478ff`), lu la tête, et attaqué
les trois défauts restants du pipeline de traduction. Une heure plus tard, RED prouvé et GREEN
obtenu sur les trois, le `fetch` d'avant-PR a rapporté `ee547fa8` : **une session parallèle
(`claude/keen-hamilton-sr0nsc`, PR #2890) avait livré les trois MÊMES défauts**, plus la moitié WS
de la priorité 3, et était déjà sur `main`.

C'est la troisième occurrence (leçons 132, 137, celle-ci). Et cette fois la consigne de la tête
était explicite — « `git fetch` AVANT d'écrire CHAQUE item » — et elle a quand même échoué.

**Pourquoi elle a échoué : le mot « item » n'a pas de grain défini.** La tête présentait la
priorité 2 comme UN bloc de trois défauts d'un même fichier. Je l'ai traitée comme un item, donc
un `fetch`, donc une heure de fenêtre aveugle. La session parallèle, elle, a livré ce bloc en une
passe. Deux lectures honnêtes du même mot, un doublon intégral.

**La règle praticable, cette fois mesurable :**

> `git fetch origin main && git log --oneline -5 origin/main` **avant chaque `Write`/`Edit` de
> production, et de toute façon si plus de ~15 min se sont écoulées depuis le dernier fetch.**
> Un bloc de trois correctifs, ce sont TROIS fetchs, pas un.

Le coût d'un `fetch` est de deux secondes. Le coût d'un doublon a été, cette fois encore, une
heure d'implémentation et de tests entièrement jetée.

**Le salvage a été intégralement négatif — et c'est le résultat normal.** Les 10 tests écrits
passaient tous contre l'implémentation de `main`, ce qui prouve que les deux sessions avaient la
même lecture du défaut ; mais les 7 tests de la session parallèle couvraient strictement plus
(forme canonique, retry partiel, erreur nommant les langues manquantes, double livraison). **Rien
n'a survécu.** Ne pas chercher à sauver par principe : comparer les couvertures, et si l'autre
version domine, jeter sans regret. Ce qui se garde, c'est la LEÇON, pas le code.

**Deux points où la version parallèle était objectivement meilleure — à retenir comme motifs :**

1. **Un plafond FIFO doit être renégocié quand sa clé gagne une dimension.** Passer
   `latestRetranslationTask` de `messageId` à `(messageId, langue)` multiplie le nombre d'entrées
   par le nombre de langues. À plafond constant (5000), l'éviction couvrait N fois moins de
   MESSAGES — et une entrée évincée se lit « jamais retraduit », donc « jamais périmé » : **le
   garde se désarmait tout seul sous charge.** J'avais fait la mise à l'échelle de la clé sans
   toucher au plafond. Règle : toute clé qui gagne une dimension oblige à relire son plafond.
2. **Un retry après succès partiel ne doit redemander que ce qui manque.** Re-pousser les N langues
   quand N−1 sont revenues duplique le travail du worker pool ML — exactement l'incident que le
   deadman sans retry des pipelines voix documente déjà.


---

## Leçon 143 — un doublon de DÉFAUT n'est pas un doublon de CORRECTIF : comparer la couverture, pas l'intitulé (2026-08-12, routine messaging, cycle 91)

Quatrième occurrence de la collision décrite par les leçons 132, 137 et 142 : le cycle 91 a
implémenté les deux priorités de la tête du cycle 90 pendant qu'une session parallèle livrait le
cycle 90. Le `fetch` d'avant-PR l'a révélé, comme la fois précédente.

Ce que la leçon 142 dit du grain du `git fetch` reste juste, et n'a une fois de plus pas été
appliqué. Mais elle prescrit aussi ce qu'il faut faire APRÈS la collision — « comparer les
couvertures, et si l'autre version domine, jeter sans regret » — et le cycle 90 en avait tiré le
raccourci « le salvage est intégralement négatif, c'est le résultat normal ». **Ce raccourci est
faux, et l'appliquer ici aurait coûté un correctif que personne d'autre n'avait écrit.**

Les deux moitiés du travail doublonné ont eu des verdicts opposés :

| Moitié | Verdict | Raison |
|---|---|---|
| pastille de non-lus sur la suppression REST | jetée | même défaut, même site, et leur union discriminée (`authorId` requis sur `'deleted'`, absent de `'edited'`) fait tenir la règle par le TYPE là où le champ optionnel écrit ici ne faisait que la rattraper |
| rattrapage des accusés après coupure socket | **conservée** | même défaut, **couverture disjointe** : leur correctif vit dans `use-conversation-messages-rq.ts`, donc web-only ; celui-ci vit sur `conversation:join`, donc les trois clients |

**Règle : sur une collision, ne pas comparer les intitulés de défaut — comparer la SURFACE
réparée.** « Les accusés ne se rattrapent pas après une coupure » nomme le même défaut dans les
deux sessions ; il était réparé pour un client sur trois d'un côté et pour trois sur trois de
l'autre. Deux clients n'étaient réparés par personne, et l'auraient encore été si le doublon avait
été jeté sur son titre.

**Corollaire — le grain de la couverture est presque toujours « quel client / quel transport ».**
C'est la question qui a servi à trancher ici, et c'est la même qui a fait naître
`emitUnreadCountsToRecipients`, `broadcastMessageMutation` et `broadcastLinkMessage` : un correctif
posé dans un fichier de client ne répare qu'un client, un correctif posé sur l'événement serveur
les répare tous. **À couverture égale, préférer le site partagé ; à site égal, préférer le type qui
interdit l'oubli.** Les deux moitiés ci-dessus illustrent chacune une des deux moitiés de cette
règle, en sens inverse.

---

## Leçon 144 — une promesse à DÉTRUIRE se décide là où l'information est et s'exécute là où elle est déjà écrite (2026-08-12, routine messaging, cycle 93)

Le cycle 93 devait faire respecter `isViewOnce`/`maxViewOnceCount` : le budget de spectateurs était
compté exactement, `isFullyConsumed` calculé et diffusé, les clients masquaient le média — et rien
n'effaçait jamais. La tête du cycle posait explicitement la question du chemin : *le balayage, ou
la consommation elle-même ?*, avec une préférence annoncée pour la seconde (« plus juste, pas de
fenêtre résiduelle »).

**Les deux réponses étaient fausses prises isolément, et l'énoncé binaire était le piège.**

- La **consommation** est la seule à SAVOIR que le budget vient de s'épuiser. Un balayage devrait
  recalculer `viewOnceCount >= maxViewOnceCount ?? 1` sur toute la collection, à la minute, pour
  redécouvrir ce qu'un appel de route venait de lui apprendre.
- La consommation est aussi la plus mauvaise place pour **EFFACER**. Le client attend
  `consumeViewOnce` AVANT de révéler la bulle, et le média n'est pas toujours déjà en cache :
  effacer dans la foulée prend le contenu des mains du destinataire à l'instant précis où il vient
  de payer sa vue. Personne ne l'aurait vu en relisant le serveur — il fallait aller lire l'ordre
  d'appel côté iOS.

Le correctif pose une ÉCHÉANCE (`expiresAt = now + grâce`) et laisse le balayage éphémère du cycle
précédent exécuter. Zéro seconde implémentation de la destruction : fichiers, clair, traductions,
effets de retrait et annonce `message:deleted` étaient déjà écrits, testés et câblés.

**Règle : quand la promesse est une destruction, séparer DÉCIDER et EXÉCUTER, et chercher
l'exécutant existant AVANT d'en écrire un second.** Le point de décision est là où l'information
naît ; le point d'exécution est là où la destruction est déjà correcte. Les relier par un champ que
les deux connaissent coûte une ligne.

**Corollaire, et c'est lui qui aurait pu faire une régression silencieuse :** quand deux promesses
écrivent la MÊME échéance, l'écriture ne doit jamais la repousser. Un message à la fois éphémère
(30 s) et à vue unique aurait vu sa grâce de 5 min écraser son échéance de 30 s — la promesse
faible annulant la forte, sans qu'aucun test de l'une ou l'autre ne rougisse. Le prédicat
n'apparie donc que l'absence, le nul et les échéances POSTÉRIEURES ; l'idempotence vient en prime,
sans qu'aucun appelant ait à s'en souvenir.

## Leçon 145 — « ce n'est pas le contenu » est un motif de mise hors périmètre qui doit être VÉRIFIÉ champ par champ (2026-08-12, routine messaging, cycle 93)

Le cycle 92 avait exclu `metadata` de la destruction éphémère au motif que « ce n'est pas le
contenu du message », et consigné l'exclusion en dette assumée — la bonne pratique, en apparence :
nommer ce qu'on ne fait pas plutôt que l'emporter en passant.

Le motif était faux. `MessageProcessor.saveMessage` range dans `metadata.location` les coordonnées
d'un lieu partagé, **en clair**, et dans `metadata.postReplyTo` l'instantané figé du post cité. Une
position GPS survivait donc à l'échéance du message qui la portait, en clair et pour toujours,
pendant que le TEXTE du même message était détruit — exactement la fuite au repos que la passe
avait été écrite pour fermer, laissée ouverte sur le champ le plus sensible.

Le second « reste nommé » de la même dette (« les lignes de localisation, `MessageLocation` ») **ne
correspondait à aucun modèle** : la localisation vit dans ce même `metadata`. Les deux dettes
étaient la même, et se sont fermées d'un `metadata: null`.

**Règle : une dette assumée hérite de la fiabilité de son MOTIF, pas de celle de sa formulation.**
Un champ fourre-tout (`metadata`, `payload`, `extra`, `data`) n'a pas de contenu par nature — il a
celui que ses écrivains y mettent. Avant de l'exclure d'un traitement de sécurité, énumérer ses
ÉCRIVAINS (`grep` sur les affectations, pas sur les lectures) et décider champ par champ. Ici la
liste tenait en deux entrées et l'une d'elles suffisait à renverser la décision.

---

## Leçon 146 — un commentaire qui JUSTIFIE une destruction est une prémisse, et une prémisse peut périmer sans que personne ne réécrive la phrase (2026-08-12, routine messaging, cycle 97)

Le cycle 96 avait retenu qu'un commentaire qui **nomme un suivi** est une promesse, au même titre
qu'un champ de schéma. Le cycle 97 trouve l'autre moitié de la règle, et elle mord plus fort : un
commentaire qui **donne la raison** d'un geste destructeur est une PRÉMISSE, et une prémisse est
datée.

`ExpiredStoriesCleanupService` détruisait, avec chaque contenu éphémère périmé, tout post le
repostant — cascade accompagnée de sa justification, écrite noir sur blanc : « *a repost of a story
dead for 7+ days has no value (stories are ephemeral)* ». Elle était **vraie le jour de son
écriture** : un repost ne faisait alors que RÉFÉRENCER sa source, et privé d'elle il n'affichait
plus rien.

Une fonctionnalité postérieure l'a rendue fausse — l'INSTANTANÉ, qui duplique médias, audio, effets
et texte de toute source éphémère dans le repost. Et son propre commentaire dit exactement
pourquoi : *« so a repost that merely referenced it via repostOfId would render EMPTY once the
source is gone »*. **Les deux commentaires se contredisent, à trois cents lignes l'un de l'autre,
dans le même fichier de service et son voisin, depuis des mois.** L'API expose `targetType`, donc
« reposter un statut en POST PERMANENT » est un geste ordinaire ; quatorze jours plus tard le
balayage effaçait ce post permanent, ses commentaires, ses notifications — et, depuis le cycle 96
qui venait de brancher la récupération disque sur cette passe, ses OCTETS.

**Règle : relire la JUSTIFICATION de chaque suppression comme on relit un champ de schéma —
« cette phrase est-elle encore vraie aujourd'hui ? ».** Une prémisse périmée ne lève aucune alerte,
ne casse aucun test et n'apparaît dans aucun audit : elle a l'air d'une décision.

**Corollaire de méthode.** Cinq cycles d'affilée (92 à 96) ont cherché la PROMESSE au dernier
maillon — *qui, côté serveur, fait respecter ce que ce champ annonce ?* — et cinq fois la réponse a
été « personne ». Le cycle 97 montre que la question symétrique n'avait jamais été posée : non pas
« qui fait respecter la promesse ? » mais « **qui vérifie que ce qu'on détruit méritait de
l'être ?** ». Le premier filtre trouve les fuites ; le second trouve les PERTES, qui sont
irréversibles.

**Corollaire technique, gratuit et à ne pas rater.** Le correctif ne pouvait pas se limiter à
épargner le repost : l'épargner en laissant son `repostOfId` viser une ligne détruite n'aurait fait
que déplacer le défaut sur le motif déjà poursuivi trois fois (`TrackingLink.targetId`,
`Notification.context.postId`). Couper le pointeur AVANT la destruction a fermé trois choses d'un
seul geste — le pointeur pendant, le routage des réactions vers un id disparu, et la PROFONDEUR des
chaînes de reposts que la cascade d'un seul niveau ignorait. Ce dernier point était un P2014 en
puissance sur `Post.repostOf` (`onDelete: NoAction`), c'est-à-dire **la construction exacte dont la
même passe corrige déjà le jumeau trois lignes plus haut** pour la self-relation des réponses de
commentaires. Quand un remède est déjà écrit dans le fichier qu'on modifie, chercher qui d'autre a
la même forme.

---

## Leçon 147 — un CURSEUR est une promesse de couverture, et rien ne la vérifie jamais (2026-08-12, routine messaging, cycle 98)

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

## 2026-08-12 — « Transparence jusqu'au bord » : un scrim ne répare jamais un contenu tronqué

Trois passages sur la même capture, le même jour. Le symptôme rapporté a d'abord été lu comme
« du contenu déborde sous la Dynamic Island » → un scrim noir a été posé ; puis « enlever la
barre noire » → le scrim a été retiré ; puis « enlever la couleur unie derrière dynamic island
pour avoir de la transparence jusqu'en bordure d'écran comme sur les autres vues ».

**Ce que la capture disait et que deux passes n'ont pas lu.** La bulle du haut était coupée NET,
en plein milieu, sur une ligne horizontale. Une coupe à mi-bulle n'est pas un contenu qui se
repose contre un inset — c'est un contenu **clippé aux bornes de la vue**. Le `MessageListView`
(`UIViewControllerRepresentable`) était posé DANS la safe area : la liste s'arrêtait sous l'îlot,
et la bande restante ne montrait plus que le dégradé de fond — plat, donc lu comme « couleur
unie ». Peindre cette bande (scrim) ne pouvait que déplacer le problème : la demande était que le
CONTENU y passe, comme il passe sous le verre des écrans à `CollapsibleHeader`.

**La règle.** Devant « il y a une bande de couleur en haut », distinguer d'abord *une couche
peinte en trop* de *du contenu qui manque*. Le discriminant est dans l'image : un bord franc au
milieu d'un élément = clipping ; un élément entier posé sous la limite = inset. Le premier se
répare en étendant la vue, jamais en la recouvrant.

**Le piège technique qui va avec.** Une fois la vue étendue par `.ignoresSafeArea`, l'inset haut
réel n'est plus lisible ni par le `GeometryReader` ni par le contrôleur hébergé (SwiftUI cesse de
le propager). Il doit venir de la fenêtre (`DeviceLayout.safeAreaTop`) et être passé en paramètre
— sinon la pill de jour, ancrée au `safeAreaLayoutGuide`, remonte silencieusement sous l'îlot et
défait le correctif du même jour. Sur une liste inversée (`scaleY: -1`), penser en plus que le
HAUT visuel est `contentInset.bottom`, et couper `contentInsetAdjustmentBehavior` (`.never`) :
l'ajustement automatique d'UIKit pose la safe area du mauvais côté du flux.

## Leçon 225 — Compter les ÉCRIVAINS avant les lecteurs, et une non-régression se prouve par DIFF quand le typage est éteint

Deux réflexes, sortis du même lot (cycle 100, `CallParticipant.connectionQuality`).

**1. Un champ sans écrivain ne dort pas : il se ramifie.** Le champ était déclaré QUATRE fois de
quatre façons incompatibles — `Json?` (Prisma), interface objet (type partagé), `z.number()` (Zod),
`{type:'number', 0-100}` (OpenAPI) — et les fixtures en portaient une CINQUIÈME, une chaîne
(`'good'`). Ces cinq formes ont coexisté des mois sans qu'un seul test tombe, **parce que rien ne
l'écrivait** : la valeur était toujours `null`, et `null` satisfait les cinq. Devant un champ
suspect, ne pas commencer par ses lecteurs : **compter ses écrivains**. Zéro écrivain ⇒ énumérer
toutes ses déclarations et les confronter. Leur divergence mesure le temps pendant lequel rien n'a
traversé la chaîne.

**2. Un signal de typage éteint n'interdit pas de prouver une non-régression — il interdit
seulement de la prouver par un vert.** `tsc --noEmit` sur `apps/web` rend un mur de diagnostics
pré-existants ; le cycle 99 avait refusé le lot pour cette raison. La preuve s'obtient en
DIFFÉRENÇANT : lancer `tsc` avec le lot, puis sur la base restaurée (`git stash`), et comparer les
deux sorties ligne à ligne. Trois conditions, sans lesquelles la preuve ne vaut rien :
- **reconstruire les dépendances des DEUX côtés** (`prisma generate` + build de `packages/shared`),
  sinon on compare deux fois contre un `dist` qui ne correspond à aucune des deux versions ;
- **comparer les SITES, pas le total** — un total identique peut cacher un ajout et un retrait ;
- **savoir que l'ordre des membres d'une union est instable** d'une exécution de TypeScript à
  l'autre : ces différences-là sont du bruit d'affichage, pas des diagnostics.

**Corollaire d'honnêteté** : un compteur de diagnostics pré-existants n'est PAS un indicateur de
santé comparable d'un cycle à l'autre (ici 1 760 contre les 1 224 consignés au cycle 99, sans que
l'écart ait été instruit). Il n'est valable qu'entre deux mesures prises dans le MÊME
environnement, au cours de la même session.

## Leçon 226 — Un champ mort à l'ÉCRITURE et un champ mort tout court ne se traitent pas pareil

Suite directe de la leçon 225. Compter les écrivains d'un champ ne suffit pas à décider de son
sort : **zéro écrivain n'implique pas zéro lecteur**, et c'est le lecteur qui décide du geste.

Trois colonnes voisines de `Message`, déclarées au même endroit, dans le même bloc de commentaire,
partageant exactement le même défaut d'écriture (`updateMessageComputedStatus` est un no-op assumé
depuis le passage aux curseurs) :

| Champ | Écrivains | Lecteurs clients | Geste |
|---|---|---|---|
| `receivedByAllAt` | 0 | **0** — aucun décodeur sur les 4 plateformes | RETIRÉ, déclarations comprises |
| `deliveredToAllAt` | 0 | iOS, Android, SDK (`DeliveryStatusResolver`) | **CALCULÉ** à la lecture |
| `readByAllAt` | 0 | idem — `!= null` y vaut « tous ont lu » | **CALCULÉ** à la lecture |

La note de suivi laissée par le cycle précédent disait « ils sortent ENSEMBLE, avec leurs
déclarations, ou pas du tout ». Les retirer ensemble aurait cassé trois décodeurs pour supprimer un
défaut qui se répare. **Le tri ne se fait pas sur la déclaration — qui les rassemble — mais sur la
CONSOMMATION, qui les sépare.**

**Le symptôme à reconnaître** : quand un champ mort à l'écriture a de vrais lecteurs, la branche
qui le teste est morte elle aussi, silencieusement, chez chaque client. `if readByAllAt != nil ||
readCount >= recipientCount` : la première moitié de la condition n'a jamais été vraie depuis le
passage aux curseurs, et rien ne l'a signalé parce que la seconde couvrait tous les cas. Un champ
sans écrivain ne casse pas ses lecteurs — **il les fait tourner à vide.**

**Corollaire, appliqué dans le même lot** : ne pas ajouter de garde défensive qu'aucun test ne peut
rougir. `totalMembers > 0 && count >= totalMembers` semblait prudent ; la mutation-proof l'a
démentie — `totalMembers` ne vaut zéro que si l'ensemble des destinataires évalués est vide, auquel
cas les maxima sont `null` de toute façon. Une garde qui survit à sa propre mutation est du code
mort qu'on vient d'écrire. La supprimer, et écrire à sa place le commentaire qui explique
pourquoi elle n'est pas nécessaire.

## Leçon 227 — Un TEST est un lecteur CIRCULAIRE : il ne prouve pas un contrat, il prouve une production

Suite directe des leçons 225 et 226. La colonne « lecteurs » qui décide du geste doit **exclure les
tests**. Un test qui lit un champ ne démontre pas qu'un consommateur en dépend — il démontre
seulement que le producteur le produit, ce qu'on savait déjà.

`MessageResponse.metadata` avait six sections, dont trois purement fabriquées (`deliveryStatus` à
`{recipientCount: 1, deliveredCount: 1, readCount: 1}` en dur, `performance` à des fractions
arbitraires du temps total, `context` payé par deux balayages du contenu). Aucun transport ne le
transmettait : `_sendResponse` remplace la réponse entière par `buildMessageAckData(data)`. Ses
seuls lecteurs sur toute la durée de vie du champ étaient **six assertions Jest**.

**Le symptôme à reconnaître — ce que le test ÉVITE d'affirmer.** L'assertion s'appelait
`should include delivery status in metadata` et vérifiait `status === 'sent'`. Elle s'arrêtait là :
jamais `deliveredCount`, jamais `readCount`. Écrire `expect(...deliveredCount).toBe(1)` aurait sauté
aux yeux comme absurde dans un groupe de douze. **Le test savait, et a contourné sans le dire.**

**La méthode** : devant un champ que seuls des tests lisent, lire les assertions AVANT de conclure au
contrat, et regarder ce qu'elles n'affirment pas. Le sous-ensemble du champ qu'aucune assertion ne
touche est précisément celui que son auteur savait déjà faux.

**Corollaire de vérification** : quand le geste est un RETRAIT, la mutation-proof consiste à
RÉINTRODUIRE la chose sous sa forme la plus creuse (`metadata: {}` suffit contre `toBeUndefined()`).
Si le compte de témoins qui rougissent n'est pas exactement le compte de témoins ajoutés, un
d'entre eux ne tient rien.

## Leçon 228 — L'unanimité des LECTURES est ce qui rend un trou d'ÉCRITURE invisible

Suite des leçons 225 à 227, mais le geste est inverse : là où elles trient un champ mort par sa
CONSOMMATION, celle-ci porte sur une règle **vivante et partout appliquée** — sauf à un endroit.

`deletedAt: null` était écrit dans chaque lecture de message du service : la liste, la recherche,
et la liste des messages ÉPINGLÉS, cent lignes sous les deux routes d'épinglage qui, elles, ne
l'écrivaient pas. Épingler un message supprimé répondait donc 200, écrivait sur un tombstone, et
diffusait `message:pinned` dans la room ET dans la file de rattrapage hors-ligne.

**Pourquoi ça ne se voyait pas — et c'est le cœur de la leçon.** Ce n'est pas MALGRÉ l'unanimité
des lectures, c'est À CAUSE d'elle. Aucune lecture ne rendant plus jamais la ligne fautive :

| Surface | Ce qu'elle montre du défaut |
|---|---|
| Base | La colonne est écrite, mais aucune requête ne la relit |
| Réponse HTTP | `200`, indiscernable du succès nominal |
| Liste des épinglés | Vide — elle filtre `deletedAt: null` |
| **Le fil temps réel** | **Le seul endroit où le défaut existe** |

Un `where` manquant à l'écriture ne produit donc pas une donnée fausse qu'on peut lire : il produit
un **événement** qui nomme un objet qu'aucune lecture ne rendra plus. Et l'événement ne se répare
pas tout seul — le client qui l'applique à son cache (web `handleMessagePinned`, iOS `updatePinned`)
n'a plus AUCUNE source pour le détromper, et la file hors-ligne le rejoue à chaque reconnexion
jusqu'à son TTL.

**La méthode** : devant une règle appliquée par toutes les lectures, ne pas conclure à l'invariant.
Lister les ÉCRITURES et vérifier une par une. Une règle n'est un invariant que si le chemin qui
CRÉE l'état la porte aussi.

**Corollaire de symétrie, prouvé par mutation** : quand un geste a deux sens (épingler/dépingler,
bloquer/débloquer, archiver/désarchiver), la garde va sur les DEUX. N'en garder qu'un rouvre le trou
par l'autre. La mutation-proof doit le montrer séparément — ici, retirer la garde du `PUT` fait
rougir exactement ses 2 témoins, celle du `DELETE` exactement les 2 autres, sans recouvrement. Un
recouvrement aurait signifié qu'un seul des deux tenait vraiment.

**Corollaire de non-geste, du même cycle** : l'épingle qui SURVIT à une suppression (épingler puis
supprimer) reste en base, inatteignable. La nettoyer demandait la même ligne dans les QUATRE chemins
qui écrivent `deletedAt` — la duplication en N exemplaires dont un finit par manquer. Elle n'est
visible nulle part et le tombstone part au balayage : **pas de défaut observable, pas de geste.**
Fermer la porte au point de lecture vaut mieux que la répéter à N points d'écriture.

## Leçon 229 — Un balayage d'audit grepe une FORME, pas une valeur

Découvert en corollaire de la leçon 228, et vérifié sur le dépôt.

`participants.ts` porte la trace explicite d'un audit d'audience passé : « Thread-only À JUSTE
TITRE, vérifié plutôt que déduit — noté ici pour qu'un prochain balayage de `to(ROOMS.conversation(`
ne le rouvre pas. » Le balayage cherchait donc cette FORME. Or les deux seules lignes du service à
composer leur room à la main — `` to(`conversation:${conversationId}`).emit('message:pinned', …) ``
— sont exactement celles qui portaient le défaut du cycle : **l'audit ne pouvait pas les voir.**

Écrire par la constante (`ROOMS.conversation()`, `SERVER_EVENTS.X`) n'est donc pas une préférence de
style : c'est ce qui rend un site VISIBLE au prochain balayage. Un site qui recompose la valeur à la
main est exclu de tous les audits futurs de sa propre famille, silencieusement, et pour toujours.

**Corollaire de vérification** : quand le correctif remplace une chaîne littérale par la constante
qui vaut la même chose, les tests existants qui assertent la chaîne LITTÉRALE sont la preuve
d'équivalence — ils doivent rester verts sans être touchés. S'il faut les modifier, la substitution
n'était pas neutre.

## Leçon 230 — Un `void` détache la promesse : le `try/catch` qui l'entoure n'en garde que la moitié

Suite directe de la leçon 227 (« un TEST est un lecteur CIRCULAIRE »), appliquée à une famille
entière : les canaux latéraux *fire-and-forget*.

Le motif est partout dans la gateway — l'ACK est déjà parti, l'écriture est déjà commitée, et un
effet de bord best-effort part sans être attendu :

```ts
try {
  void this._createPostReactionNotification(postId, emoji, userId);
} catch (error) { onError?.(error); }
```

**Le `try/catch` ne couvre RIEN de ce qui compte ici.** Il attrape un `throw` SYNCHRONE — un double
de manager sans la méthode, un délégué Prisma absent. Le rejet ASYNCHRONE de la promesse, lui, passe
à côté : `void` l'a détachée, et sous le `--unhandled-rejections=throw` par défaut de Node 22 un
rejet sans écouteur **termine le process**. Un aléa MongoDB sur un canal dont tout le contrat est
d'être best-effort fait tomber toutes les WebSockets de la gateway.

**Pourquoi les deux sites fautifs étaient invisibles — et c'est le cœur.** Chacun avait un témoin
qui prouvait la moitié rassurante :

| Site | Ce que le test existant prouvait | Ce qu'il ne regardait pas |
|---|---|---|
| `PostReactionHandler` | `createPostLikeNotification` rejette → avalé | le `prisma.post.findUnique` AU-DESSUS, nu |
| `broadcastMessageMutation` | `enqueue` qui `throw` **synchronement** → reporté | un `enqueue` `async` qui **rejette** |

Dans les deux cas le témoin porte sur la seule moitié déjà gardée. Sa présence ne signale pas le
trou : **elle le masque**, parce qu'elle fait lire « ce cas est couvert » là où il fallait lire « ce
cas-CI est couvert ».

**Le commentaire est un lecteur, pas une preuve.** Le site fautif portait :
`// _createPostReactionNotification handles errors internally; void to be explicit.`
C'était FAUX à moitié — le callee gardait son appel de notification (`.catch`) et laissait son
`findUnique` nu. Un commentaire qui affirme une propriété du COLLABORATEUR vieillit sans que rien ne
le rouge ; seule une garde locale ne dépend de personne.

**La règle** : `void p` exige `p.catch(...)`, toujours, sans exception et sans raisonnement sur
l'implémentation actuelle du callee. Deux gardes, parce qu'il y a deux modes d'échec disjoints :
le `try/catch` pour l'APPEL, le `.catch` pour la PROMESSE RENDUE. Aucun ne subsume l'autre.

**Corollaire d'interface structurelle** : quand la dépendance est déclarée structurellement
(`MessageMutationManager` = « tout objet portant cette méthode »), « l'implémentation actuelle avale
ses erreurs » n'est pas une garantie que le fichier POSSÈDE — n'importe quelle implémentation
conforme peut rejeter. La garantie doit vivre du côté qui la promet, pas du côté qui l'honore par
hasard. C'est l'argument qui rend le durcissement de `broadcastMessageMutation` obligatoire alors
même que son callee de production ne rejette pas aujourd'hui.

**Corollaire de balayage** : la famille se grepe (`^\s*void ` dans `services/gateway/src` — 36 sites),
mais le grep ne TRIE pas. Deux raisons, et elles tirent en sens inverse :
- un `.catch` peut être plusieurs lignes plus bas dans la même chaîne (`messagePostSaveEffects`,
  `MessagingService`) — le détecteur naïf les déclare fautifs à tort ;
- un call site sans `.catch` est parfaitement sûr si son callee garde TOUT (`CallService`,
  `server.ts`, les `void (async () => { try {` qui ouvrent sur un `try`).

Le tri se fait donc en LISANT chaque callee jusqu'à sa première instruction non gardée. Sur ce
dépôt : 36 sites, 2 fautifs — et plusieurs des 34 corrects portent déjà, en commentaire, le nom
exact du danger Node 22. Le savoir était présent ; il n'avait simplement jamais été appliqué en
balayage.

**Corollaire de témoin** : le témoin d'un rejet abandonné n'est PAS la valeur de retour — `void` sur
une promesse rejetée laisse l'appelant résoudre normalement. C'est l'événement `unhandledRejection`
du process, sondé après deux tours de boucle (Node ne le signale qu'une fois la file de microtâches
vidée). Écrire l'assertion sur le retour aurait produit un test vert des deux côtés de la mutation.

---

## Leçon 231 — Une garde LOCALE sur un défaut GLOBAL rassure autant qu'une garde globale

**Contexte** : cycle 106. `ShareExtensionSourceGuardTests.test_extension_doesNotOpenTheHostAppWithAnUnparsedDeepLink`
interdit à l'extension de partage d'émettre un deep link `contactId=`, et énonce la raison en clair :
« DeepLinkParser ne comprend que text=/url= ; l'extension poste elle-même ». Cette garde est juste,
verte, et documentée. Pendant qu'elle veillait, `MeeshyAppIntents.swift` émettait deux `contactId=`
et `MeeshyWidgets/` cinq autres formes d'URL inconnues du routeur — sept hosts émis, trois routés.

**La leçon** : quand une garde nomme une limite d'un composant **partagé** (« le parseur ne comprend
que X », « ce service n'accepte que Y »), la limite ne concerne PAS la cible gardée — elle concerne
**toute cible qui parle à ce composant**. Une garde posée à un seul endroit donne le sentiment que la
classe de défaut est traitée, alors qu'elle n'en couvre qu'un émetteur. Et elle rend le trou plus
difficile à voir qu'une absence totale de garde : un audit qui tombe sur elle conclut « déjà traité ».

**Le réflexe** : devant une garde dont le message cite le contrat d'un composant partagé, chercher
les AUTRES appelants de ce composant AVANT de passer. Ce n'est pas une enquête, c'est un grep.

**Corollaire de forme (payé comptant)** : le découpeur de commentaires recopié de garde en garde dans
ce dépôt traite `//` comme un début de commentaire de ligne — il EFFACE donc `meeshy://` avant toute
recherche. Une garde bâtie dessus balaie zéro occurrence et passe au **vert** sans rien avoir
vérifié. Toute garde qui COMPTE des occurrences doit refuser explicitement un balayage vide
(`XCTAssertFalse(emitted.isEmpty, …)`) : sans cette assertion, son silence est indiscernable d'un
succès. Le bug a été trouvé en portant l'algorithme de la garde hors de Swift pour le faire tourner —
contrôle applicable dès qu'une garde ne peut pas être exécutée localement.

**Corollaire de nommage** : le host d'un deep link décrit ce que la surface MONTRE, pas ce qu'elle
PORTE. `meeshy://contact/{id}` transporte un identifiant de **conversation** (`publishFavoriteContacts`
écrit `conv.id` dans `FavoriteContact.id`). Lire le nom au lieu de suivre l'écrivain aurait produit
une route vers `.userProfile`, c'est-à-dire un 404 à la place d'un no-op.

---

## Leçon 232 — Une règle tenue par ses lecteurs CANONIQUES n'est pas tenue ; deux lecteurs corrects sont un camouflage

**Contexte** : cycle 107. `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` est nommée
dans `CLAUDE.md` comme la source de vérité iOS du Prisme Linguistique pour l'aperçu de conversation, avec
sa jumelle gateway. Elle est appelée par `ThemedConversationRow` (la ligne de liste) et par
`GlobalSearchViewModel` — les deux lecteurs que n'importe qui citerait si on demandait « où l'aperçu
s'affiche-t-il ? ». Les deux sont corrects, testés, et portent des commentaires qui expliquent la règle.
Pendant ce temps `WidgetDataManager.formatLastMessage`, `SharePickerView` et `WidgetPreviewView` lisaient
`lastMessagePreview` brut et affichaient le dernier message dans la langue de l'expéditeur — dont un sur
l'écran d'accueil, hors de portée de toute résolution ultérieure.

**La leçon** : la leçon 231 disait qu'une garde LOCALE sur un défaut GLOBAL rassure autant qu'une garde
globale. Le onzième membre de la famille en est la version sans garde du tout : **une règle appliquée par
ses lecteurs canoniques est PLUS difficile à auditer qu'une règle appliquée nulle part.** Un audit qui
cherche « le Prisme est-il appliqué à l'aperçu ? » tombe sur `ThemedConversationRow`, lit le commentaire,
et conclut « oui ». La réponse juste à cette question n'est jamais un exemple — c'est un **dénombrement**.

**Le réflexe** : devant une règle de présentation dont le dépôt nomme le résolveur, ne pas chercher si
le résolveur est APPELÉ. Grepper le champ BRUT qu'il consomme, et trier les lecteurs un par un. Ici :
`resolvedLastMessagePreview` → 2 appels de production ; `.lastMessagePreview` → 6 fichiers. C'est l'écart
entre les deux chiffres qui EST le défaut, et il se lit en deux greps.

**Corollaire de sortie de périmètre** : la surface la plus grave n'est pas la plus visible, c'est la
**dernière** — celle après laquelle plus personne ne peut résoudre. Un texte publié dans un App Group,
poussé dans une notification, ou gravé dans un export a quitté le domaine où la règle existe. Toute
fonction qui écrit hors de l'app est un point de résolution OBLIGATOIRE, jamais un simple relais.

**Corollaire de cohérence intra-écran** : le même fichier peut se contredire. `ThemedConversationRow`
résolvait à l'affichage mais calculait son test d'existence (`hasText`, qui arbitre entre texte, pièce
jointe et position) sur le champ brut. Deux valeurs différentes pour une même ligne : la place d'un
texte réservée pour un texte qui ne s'affichera pas. Un test d'existence doit porter sur la valeur
RENDUE, pas sur celle dont elle dérive.

**Corollaire de balayage** (repris de la 231, payé à nouveau) : la garde qui dénombre doit refuser un
balayage vide. `XCTAssertFalse(readers.isEmpty)` ET la présence de chaque entrée d'allowlist — sans quoi
un découpeur de commentaires trop gourmand, ou une arborescence déplacée, rendent la garde verte en
n'ayant rien vérifié.

## Leçon 233 — Une fonctionnalité dont personne ne lit l'écriture ne rate pas discrètement : elle RÉPOND SUCCÈS

Cycle 108, routine messaging. Deux fonctionnalités de masquage personnel — « supprimer pour moi »
(`UserMessageDeletion`) et « effacer l'historique » (`UserConversationPreferences.clearHistoryBefore`)
— étaient livrées de bout en bout du côté ÉCRITURE : routes REST documentées dans Swagger, écriture en
base, bump de version, diffusion Socket.IO vers les autres appareils du compte, modèles iOS qui
décodent le champ, helpers `filterDeletedMessages`/`getDeletedMessageIds` dans `@meeshy/shared`. Aucune
requête de lecture ne consultait ni l'une ni l'autre. `deletedAt: null` — la pierre tombale du
« supprimer pour TOUT LE MONDE » — était le seul filtre de toutes les surfaces.

Le résultat n'est pas « la fonctionnalité ne marche pas ». C'est que l'API **répond**
`{"success": true, "data": {"message": "Message deleted from your view"}}` à une opération qu'elle n'a
aucun moyen d'honorer. Le mensonge est dans la réponse, pas dans un silence.

**Ce qui rend ce défaut invisible à un audit ordinaire** : chaque preuve d'existence qu'on cherche
existe. La route existe. La colonne existe. La diffusion existe. Le décodeur client existe. Le helper
de filtrage existe. Sept sur huit maillons sont là, et le huitième est le seul qui produise un effet
observable. Un grep du nom de la fonctionnalité rend une dizaine de fichiers et rassure.

**Le réflexe** : devant tout champ « personnel » (masquage, préférence de visibilité, opt-out), ne pas
demander « le champ est-il écrit / transporté / décodé ? ». Demander : **quelles requêtes le LISENT
au moment de servir ?** Le grep qui tranche est celui du nom de la colonne restreint aux chemins de
lecture — et un résultat vide côté lecture, avec des résultats côté écriture, est le diagnostic
complet. Corollaire du dénombrement de la 232 : ici l'écart n'est pas 2 sur 6, c'est **0 sur N**.

**Corollaire de conception** : un filtre personnel appliqué par recopie à N sites est un filtre qu'un
N+1ᵉ site oubliera. Il doit être UNE fonction (`applyPersonalHistoryFilter`) dont la propriété
centrale est qu'elle ne peut que RÉTRÉCIR : fusionner par spread aurait écrasé la borne du curseur de
pagination et l'allowlist d'ids du mode `around` — un filtre de confidentialité qui, mal fusionné,
rend PLUS de lignes qu'avant. Deux bornes basses se fusionnent en gardant la plus stricte ; un
`id` scalaire devient une allowlist d'un élément, jamais un `notIn` (qui transformerait « ce message »
en « tous sauf les masqués »).

**Corollaire de posture d'échec** : masquer est une courtoisie, afficher la conversation est le
produit. Une recherche de masquage qui échoue doit dégrader vers « ne rien masquer » et servir, pas
faire échouer la lecture — l'inverse exact d'un contrôle d'autorisation. Écrire ce choix dans le code,
sinon le prochain lecteur le prendra pour un oubli.

---

## Leçon 234 — Un delta bâti sur la clause de la LISTE ne peut annoncer que des arrivées

**Contexte** : cycle 111. `GET /conversations?updatedSince=` est le canal de rattrapage des deux
clients. Il réutilise le `whereClause` de la liste — conversation `isActive: true`, participant
actif sans `deletedForMe`. Quatre sorties de vue (fermeture, leave, ban, delete-for-me depuis un
autre appareil) ne pouvaient donc revenir dans aucune réponse. Les deux clients fusionnant en
upsert, la ligne restait affichée jusqu'à la réconciliation complète : 24 h de part et d'autre,
cliquable, sur une conversation où le serveur répond 403.

**La leçon** : les leçons 231 à 233 cherchaient toutes un dénombrement — combien de lecteurs
appliquent la règle sur combien. Ici le dénombrement ne pose même pas la bonne question : **la
clause qui décide ce qu'on SERT est exactement celle qui rend une DISPARITION inexprimable.** Ce
n'est pas un lecteur oublié, c'est un vocabulaire absent. Un endpoint delta dont le `where` est
recopié depuis la liste est un demi-canal par construction, et il le reste quel que soit le nombre
de ses appelants.

**Le réflexe** : devant un endpoint delta, ne pas demander « le filtre est-il correct ? ». Demander
**« quelle valeur de quel champ ferait SORTIR la ligne, et par quel canal le client l'apprend-il ? »**
Si la réponse est « aucun », le canal a besoin d'un second flux — pas d'un `where` amendé, qui
servirait des lignes que le client ne sait pas lire comme des départs.

**Corollaire — l'écriture qui ne bouge pas l'horodatage.** Un `leave` ou un `ban` n'écrit QUE la
ligne `Participant` ; `Conversation.updatedAt` ne bouge pas. Un stream de tombstones qui interroge
la CONVERSATION ne les verrait jamais, et son test passerait au vert sur le seul cas (la fermeture)
qui, lui, bump l'horodatage. Avant d'écrire une requête de disparition : chercher quelle TABLE
l'événement a réellement touchée. Le nom de l'entité affichée n'est pas une réponse.

**Corollaire — le filtre d'appartenance s'inverse pour une sortie.** Le stream « conversations
fermées » ne doit PAS filtrer sur un participant ACTIF : un banni porte `isActive: false`, et c'est
précisément lui qui doit voir la ligne partir. Recopier le filtre d'appartenance de la liste dans la
requête de tombstones cache la sortie à celui qu'elle concerne — un défaut qui se lit comme une
précaution.

**Corollaire de troncature (leçon 122, repayée sans remise)** : une liste de disparitions n'a AUCUN
curseur de reprise — il n'existe pas de « page suivante » de départs à demander. Quand elle déborde,
le seul geste est l'ESCALADE vers la relecture complète, et le débordement se prouve par une sonde
`cap + 1` : une fenêtre de très exactement `cap` tombstones est COMPLÈTE, et l'annoncer tronquée
relit toute la liste pour rien.

**Corollaire de posture (leçon 233, confirmée)** : une recherche de tombstones qui échoue rend
« je ne peux pas affirmer l'exhaustivité » (`truncated: true`, liste vide) et sert la liste. Faire
échouer la LISTE parce qu'on n'a pas su calculer une purge inverse le compromis : afficher les
conversations est le produit, en retirer une est une courtoisie.

**Corollaire de sérialisation (troisième instance dans ce dépôt)** : `fast-json-stringify` retire
tout champ absent du schéma de réponse. Un témoin de route ne peut pas voir ce trou — il lit l'objet
AVANT sérialisation. Tout champ neuf d'une enveloppe Fastify a besoin de SON témoin sur le schéma,
dans le paquet qui le déclare. Le schéma concerné documentait déjà l'incident `cursorPagination` en
commentaire ; la déclaration manquante n'en a pas moins failli être livrée.

---

## Leçon 235 — Écraser un document de travail est une SUPPRESSION, et `cat >` ne la montre pas

**Le geste** : ce cycle a « créé » son plan avec `cat > tasks/todo.md`, sans avoir lu le fichier.
`tasks/todo.md` contenait 12 559 lignes — l'historique de tous les cycles précédents. Le plan en
faisait 40. La différence est partie dans le commit, et la PR affichait `12 527 deletions` pour un
travail qui en comptait six.

**Ce qui rend le défaut invisible sur le moment** : rien n'échoue. `cat >` ne demande pas
confirmation, ne prévient pas que la cible existe, ne dit pas ce qu'elle pesait. `git add -A`
avale la suppression sans la distinguer d'un ajout. La suite de tests reste verte — aucun test
ne lit `tasks/todo.md`. Les trois signaux qu'on consulte d'ordinaire (erreur, diff des fichiers
touchés, tests) sont tous au vert, et le seul qui parle est le COMPTE de lignes, qu'on ne
regarde qu'en ouvrant la PR.

**Le détail qui aggrave** : le fichier écrasé se terminait par
« Réparation tasks/todo.md : la résolution de fusion avait supprimé 5522 lignes du document de
main — restauré + sections annexées ». Le document portait la trace écrite du même accident, et
l'écrasement l'a emportée avec le reste. Une leçon rangée UNIQUEMENT dans le fichier qu'elle
protège ne protège rien : elle disparaît par le geste même qu'elle décrit. C'est pourquoi
celle-ci vit dans `lessons.md`.

**Le réflexe** : un document de travail PARTAGÉ et CUMULATIF (`todo.md`, `lessons.md`,
`decisions.md`, `CHANGELOG.md`) ne s'écrit jamais en mode troncature. On y AJOUTE — `cat >>`,
ou un `Edit` ancré sur la fin. `cat >` / `Write` sont réservés aux fichiers qu'on crée, et
« créer » se vérifie AVANT d'écrire, pas après.

**La garde qui tranche, et elle est arithmétique** : avant de pousser, lire
`git diff --stat <base>...HEAD` et confronter le nombre de suppressions à ce qu'on croit avoir
retiré. Un travail purement additif qui affiche des milliers de suppressions n'est pas « du bruit
de lockfile » — c'est un fichier emporté, et il faut le nommer. La même arithmétique attrape le
lockfile réellement modifié par un `bun install` de confort, qu'un `git add -A` embarque aussi.

**Corollaire de réparation** : restaurer depuis `git show <base>:<chemin>` et RE-ANNEXER sa
section, plutôt que de rejouer le geste dans l'autre sens. Le document appartient au dépôt, pas
au cycle en cours ; un cycle n'y ajoute qu'un chapitre.

---

## Leçon (2026-08-13) — `tasks/todo.md` est ÉPHÉMÈRE : vide en fin de session

Directive user : `tasks/todo.md` doit être remis À VIDE après chaque session — c'est un
brouillon de travail, pas une archive. Ne JAMAIS y préserver/concaténer l'historique des
sessions précédentes (et donc ne pas s'alarmer de l'« écraser ») ; la mémoire durable du
projet vit dans `tasks/lessons.md`, les specs et les CLAUDE.md.

---

## Leçon 236 — Un filtre de lecture est une réponse à une QUESTION, jamais une notification

**Contexte** : cycle 112. `personalHistoryFilter` est la moitié LECTURE de « supprimer pour moi »
(`UserMessageDeletion`, `clearHistoryBefore`). Sa docstring dit, à juste titre, qu'elle est le seul
endroit où ces deux faits deviennent un filtre Prisma, et le dépôt l'a câblée partout : liste,
recherche, fil, `/sync`. Elle était néanmoins insuffisante, et pas par un lecteur oublié — par
NATURE. Les trois routes qui ÉCRIVENT la table (`delete-for-me` message, son lot, `restore-for-me`)
ne diffusaient rien. Masquer un message sur son iPhone le laissait affiché sur son iPad et sur le
web, indéfiniment.

**La leçon** : les cycles 105 à 111 cherchaient des lecteurs manquants (« N lecteurs appliquent la
règle sur M ») ou un vocabulaire manquant (leçon 234, le delta qui ne sait pas dire « parti »). Ici
le filtre est complet, tous ses lecteurs sont câblés, et le défaut subsiste :
**un filtre de lecture ne peut que rétrécir ce qu'une NOUVELLE requête rend. Il n'a AUCUNE prise sur
une ligne que le client détient déjà.** Un client qui ne re-lit pas n'apprend jamais — et un client
temps réel ne re-lit, précisément, jamais.

**Le réflexe** : devant un filtre de lecture per-user, ne pas demander « tous les lecteurs
l'appliquent-ils ? ». Demander **« qui apprend ce fait, et par quel canal ? »** Compter les canaux,
pas les lecteurs. Il en faut DEUX et ils ne se subsument pas :
- une **diffusion** vers `user:{id}` pour les appareils en ligne ;
- un **stream de rattrapage** pour ceux qui étaient hors ligne au moment du geste.
Un filtre de lecture n'est ni l'un ni l'autre : c'est la réponse à une question qu'il faut d'abord
avoir posée.

**Corollaire — l'écriture per-user est per-USER, pas per-DEVICE.** Le symptôme se déguise en succès
parce que l'appareil émetteur applique le geste en optimiste : le développeur qui teste sur UN
appareil voit exactement le comportement attendu. Toute table portant `userId` en clé (et non
`deviceId`) doit son écriture à la room de l'utilisateur. C'est le contrat que
`conversationPreferencesSync` avait déjà gravé pour `UserConversationPreferences` — et que les trois
routes sœurs de `UserMessageDeletion` n'avaient jamais repris. Le remède est le même : **un écrivain
unique**, qui persiste ET rétracte ET diffuse, pour qu'un quatrième site d'écriture ne puisse pas
n'en honorer qu'une partie.

**Corollaire — une APPARITION ne s'écrit pas comme une tombstone inversée.** Le retour en vue
(`restore-for-me`) ne peut PAS voyager dans le stream de disparitions : la ligne
`UserMessageDeletion` est SUPPRIMÉE par le restore, donc rien ne reste à interroger « depuis
`since` », et le client qui avait retiré la bulle n'en détient plus le contenu. Le seul message
honnête est une ADRESSE (« cette conversation a changé, va relire »), pas une donnée. Ne pas
chercher la symétrie : les deux directions ont des formes différentes parce que l'une retire ce que
le client a et l'autre rend ce qu'il n'a plus.

**Corollaire — le stream de rattrapage interroge la table de l'ÉVÉNEMENT.** Repayé de la leçon 234
sans remise : un `delete-for-me` n'écrit QUE `UserMessageDeletion`, `Message.updatedAt` ne bouge
pas. Un stream branché sur `Message` ne verrait jamais ces disparitions, et son test passerait au
vert sur les suppressions globales, qui, elles, y sont visibles.

**Corollaire — l'id SERVI et l'id du CURSEUR peuvent être deux ids différents.** La tombstone porte
le `messageId` (le client indexe par message) ; le keyset ordonne des lignes `UserMessageDeletion`
et doit départager par l'id de CETTE table. Un lot de 100 masquages écrit 100 lignes à la même
milliseconde : départager par `messageId` marcherait par accident, départager par la ligne est
correct par construction.

**Corollaire de posture (leçons 233/234, troisième confirmation)** : un stream de disparitions qui
échoue rend « je ne peux pas affirmer l'exhaustivité » (`truncated: true`) et sert le reste du
rattrapage. Faire échouer `/sync` parce qu'on n'a pas su calculer un retrait inverserait le
compromis — servir le rattrapage est le produit, en retirer une bulle est une courtoisie.

---

## Leçon 237 — Un plafond de LIGNES ne borne un poids que tant que la ligne a un poids borné

**Contexte** : cycle 113. `GET /sync` est le canal de rattrapage des appareils qui reviennent en
ligne. Sa page était plafonnée à 1000 lignes depuis A3.1, et ce plafond suffisait : la ligne
comptait six champs scalaires, donc 1000 lignes pesaient une taille prévisible. Le cycle 111 a
étoffé le select pour que le client puisse écrire une ligne RENDABLE — `translations` (une copie du
contenu PAR langue du Prisme), `metadata`, `reactionSummary`, le bloc expéditeur, et les pièces
jointes avec leurs propres `transcription`/`translations`. Toutes ces tailles sont écrites par
l'utilisateur, aucune par le schéma. Le cap n'a pas changé d'une ligne, et il a pourtant cessé de
borner quoi que ce soit : la même page pouvait désormais peser quelques kilo-octets ou plusieurs
dizaines de mégaoctets, sur le canal appelé précisément au retour de veille, en cellulaire, par un
appareil qui vient de se reconnecter.

**La leçon** : un plafond exprimé dans une UNITÉ (des lignes) ne protège une AUTRE grandeur (des
octets) que par l'intermédiaire d'un facteur de conversion — le poids d'une ligne. Ce facteur est
une hypothèse, il n'est écrit nulle part, et **l'enrichissement qui l'invalide ne touche pas le
plafond**. Rien ne rougit : la constante est toujours là, le test de pagination passe toujours, le
diff qui a cassé la borne ne contient pas le mot « cap ». Le réflexe n'est donc pas « le plafond
est-il au bon niveau ? » mais **« ce plafond est-il exprimé dans l'unité que je cherche à borner,
et si non, qui garantit le facteur ? »**. Élargir un `select` est le geste qui invalide ce facteur
le plus souvent, et c'est un geste qu'on croit purement additif.

**Corollaire — le second critère d'arrêt s'emprunte, il ne s'invente pas.** La page savait déjà
s'arrêter à mi-parcours : `truncated: true` + `nextCursor` + watermark tenu à `since`, tout le
protocole était en place et honoré par les clients. Il ne manquait qu'un second déclencheur. Devant
une borne à ajouter, chercher d'abord le mécanisme d'arrêt EXISTANT : une seconde condition sur un
chemin déjà éprouvé coûte trois lignes, là où un nouveau mode de troncature demanderait aux clients
d'apprendre un vocabulaire de plus.

**Corollaire — une page budgétée reste un PRÉFIXE du tri.** Les lignes sont ordonnées par le keyset
`(updatedAt, id)` et le curseur reprend derrière la dernière. Écarter une ligne lourde « au milieu »
pour en faire tenir deux légères ferait un trou qu'AUCUNE position keyset ne saurait réclamer — il
n'existe pas de curseur qui dise « reprends ici, mais reviens aussi chercher celle-là ». Un budget
tronque par la fin, jamais par le tri.

**Corollaire — servir AU MOINS une ligne, toujours.** Un élément plus lourd à lui seul que le budget
rendrait une page vide accompagnée de `truncated: true` et d'un curseur inchangé : la même requête,
indéfiniment. Le rattrapage ne progresserait plus jamais, et le seul symptôme visible serait une
synchronisation qui tourne sans rien appliquer — pas une erreur, pas un log. Dépasser le budget
d'une ligne est le moindre mal ; ne plus avancer n'en est pas un. **Tout filtre placé entre une
lecture paginée et sa livraison doit se demander ce qui se passe quand il rejette TOUT.**

**Corollaire — deux retraits qui se ressemblent, des conséquences opposées sur le curseur.** Dans ce
même handler, deux mécanismes retirent des lignes de la page, et ils ne s'ancrent pas pareil :
- le **masquage personnel** livre-comme-absent — la ligne a été traitée, le curseur DOIT passer
  derrière elle, sinon une page entièrement masquée ferait boucler la synchronisation sur place ;
- le **budget** n'a pas livré du tout — le curseur ne doit SURTOUT PAS passer derrière, la borne
  serveur étant stricte, la ligne serait perdue définitivement.
Le curseur s'ancre donc sur la dernière ligne **livrée** pour l'un et sur la dernière ligne **lue**
pour l'autre. Ce qui garde la distinction vivante n'est pas un commentaire, c'est l'ORDRE :
le budget tranche AVANT que la page de référence du curseur soit figée, le masquage APRÈS.

**Corollaire — l'exemption se justifie par la NATURE, pas par la commodité.** Les streams de
tombstones ne sont pas budgétés, et la bonne raison n'est pas « ils sont petits » : c'est que leur
ligne est faite de scalaires de taille fixe, donc leur plafond de lignes EST un plafond de poids et
le restera. C'est exactement la propriété que le stream principal a perdue. Formuler l'exemption
ainsi la rend révisable : le jour où l'on ajoutera un champ variable à un tombstone, la phrase
cessera d'être vraie et se lira comme telle.

**Le coût de mesure se borne tout seul.** Mesurer en sérialisant chaque ligne semble reproduire la
dépense qu'on veut éviter — mais on s'arrête au premier dépassement, donc on ne sérialise jamais
plus que le budget plus une ligne, là où la page entière représentait un `JSON.stringify` non borné
(que l'ETag faisait d'ailleurs déjà, sur la totalité, à chaque appel).

---

## Leçon 238 — Un contrat livré et testé des DEUX côtés peut n'avoir aucun récepteur sur une plateforme

**Contexte** : cycle 114. Le delta `GET /conversations?updatedSince=` est upsert-only : sa clause
serveur exige une conversation active et un participant actif sans `deletedForMe`, donc une
conversation qui SORT de la vue (fermée, quittée, bannie, supprimée-pour-moi depuis un autre
appareil) ne revient dans aucune page. Le gateway l'avait compris et livre ces disparitions hors
page — `meta.deletedConversationIds`, un module dédié (`utils/delta-tombstones.ts`), une posture
d'échec pensée, des tests. Le web les consomme, avec ses propres tests. Tout le contrat était écrit,
des deux côtés. **iOS ne les voyait pas du tout** : l'enveloppe de la page delta
(`OffsetPaginatedAPIResponse`) ne portait pas `meta`, et le bloc était jeté au décodage. Une
conversation quittée depuis un autre appareil restait affichée — et trouvable en recherche —
jusqu'à la réconciliation complète, 24 h.

**La leçon** : l'absence d'un champ dans un type `Decodable` est le mode de défaillance le plus
silencieux qui soit. `JSONDecoder` ignore les clés inconnues **par conception** : la réponse arrive,
le décodage RÉUSSIT, et l'information s'évapore. Aucun log, aucune exception, aucun test rouge —
côté client il ne s'est rien passé, et côté serveur tout s'est bien passé. Une paire
émetteur/récepteur ne se vérifie donc JAMAIS en lisant l'émetteur, si complet soit-il : la seule
preuve qu'un canal existe est **un call site qui lit le champ**.

**Corollaire — quand un module serveur cite un client par son nom, vérifier que le client le cite en
retour.** `delta-tombstones.ts` nommait iOS explicitement (« Elle reste en cache local jusqu'à la
réconciliation complète : 24 h côté iOS (`fullReconcileInterval`) comme côté web »). Lue vite, la
phrase se prend pour la description d'un consommateur ; elle décrit en réalité le REPLI que le
module existe pour rendre inutile. Un commentaire serveur qui mentionne un client atteste que
l'auteur y a pensé, pas que le client a été câblé. Le grep qui tranche part du champ, pas du module.

**Corollaire — le TYPE D'ENVELOPPE est le point de coupure invisible.** Le SDK « supportait » déjà
`meta` : `APIResponseMeta` existait, avec ses tombstones de stories, ses tests de rétro-compat, et
son test « une clé inconnue ne casse pas le décodage ». Sauf que ce `meta` vivait sur
`PaginatedAPIResponse` (curseur), et que le delta des conversations passe par
`OffsetPaginatedAPIResponse` (offset) — un type frère qui ne l'avait jamais reçu. Grepper le NOM du
mécanisme (`meta`, `deletedStoryIds`) rendait « c'est supporté » ; l'écart était dans QUELLE
enveloppe. **Quand deux types portent la même responsabilité à un détail près, un champ ajouté à
l'un est une divergence par défaut, pas une omission visible.**

**Corollaire — retirer d'une liste ne suffit pas quand la donnée vit dans deux magasins.** La
boucle `removedIds` existait et n'invalidait que le cache des messages : l'index FTS local gardait
la conversation, qui restait TROUVABLE après avoir quitté la liste. Et le ré-index du même lot
l'aurait ressuscitée — une ligne servie par la page puis déclarée partie par les tombstones est
active dans `deltaConversations`. **Tout retrait doit s'énumérer par MAGASIN, et tout ré-index qui
suit un retrait dans le même tour doit filtrer ce qui vient d'être retiré.**

**Corollaire — un curseur PERSISTÉ et un curseur RECALCULÉ n'ont pas le même droit d'avancer.** Le
web garde son signal d'escalade (`shouldReconcile`) distinct de son curseur, et il le peut : il le
recalcule depuis son cache à chaque exécution. iOS le persiste. Une troncature de tombstones —
qui n'a AUCUN curseur de reprise, donc aucun « page suivante » de disparitions à demander — doit
donc y retenir le watermark en plus d'escalader : seul un `since` resté en place redemandera les
sorties coupées si l'escalade échoue. Transposer la règle du jumeau sans regarder la NATURE de son
curseur aurait rendu ces disparitions irréclamables.

**Confirmation immédiate, cycle 114-bis — la même leçon, deux fois dans le même run.** Cherchant la
suite de ce correctif, le balayage est reparti du même réflexe (« quel champ le serveur envoie-t-il
que le client ne lit pas ? ») et a trouvé le second cas en quelques minutes : les quatre événements
d'appartenance portent un `memberCount` ABSOLU, documenté quatre fois côté serveur comme « à POSER,
pas à incrémenter », honoré par le web (`applyMemberCount`) — et déclaré sur AUCUN des quatre
structs Swift, qui faisaient exactement le `± 1` que le contrat interdit. Deux instances en une
séance disent que ce n'est pas un accident mais une CLASSE, et elles donnent son test :

> **Un champ ajouté à un payload existant n'a de récepteur nulle part tant qu'on ne l'a pas grepé
> par son NOM dans chaque client.** Ni la doc du serveur, ni les tests du serveur, ni les tests de
> l'autre client ne le prouvent — et le langage du client (`Decodable` optionnel, `JSONDecoder` qui
> ignore les clés inconnues) est précisément conçu pour que cette absence ne fasse aucun bruit.

Corollaire de méthode : **le commentaire serveur qui explique POURQUOI un champ existe est un
détecteur de bug client**. « à POSER, pas à incrémenter », « un client qui décrémente ne se rattrape
jamais » — cette phrase n'est pas descriptive, elle prescrit un comportement client, donc elle
nomme le bug qu'elle veut empêcher. Grepper les prescriptions écrites dans les types partagés
(`packages/shared/types/`) et vérifier chacune chez CHAQUE client est un audit à part entière, bon
marché, et qui ne demande d'exécuter aucun code.

---

## Leçon 239 — Une MÊME variable qui porte deux colonnes selon l'appelant : le filtre ne plante pas, il rend vide

Cycle 115 (`gwcontract-09`, ouverture de `GET /sync` aux sessions anonymes).

`authContext.userId` porte un `User.id` pour un compte et un `Participant.id` pour une session
anonyme. La RLS de `/sync` filtrait `Participant.userId` — qui est **NULL pour tout anonyme**.
Retirer le seul `allowAnonymous: false` aurait donc produit une route qui répond **200 avec des
streams vides**, sans erreur, sans log, sur le canal dont le métier est précisément de dire « voici
ce que tu as manqué ». Le silence aurait été indiscernable d'un « rien n'a changé » (leçon 233,
même famille).

**Le symptôme à reconnaître** : une variable dont le NOM désigne une entité (`userId`) mais dont la
VALEUR dépend de qui appelle. Elle traverse le code sans jamais se contredire, parce que rien
n'oppose son nom à la colonne qu'elle finit par filtrer. Le remède n'est pas un commentaire, c'est
une **union discriminée** — `{kind:'user', userId} | {kind:'anonymous', participantId}` — qui oblige
chaque lecteur à dire laquelle des deux colonnes il interroge, et rend la confusion inexprimable
plutôt qu'improbable.

**Corollaire — la fiche qui annonce un crash peut se tromper de mécanisme, et sa garde devient du
code mort RASSURANT.** La fiche d'audit annonçait que `currentSeq(userId)` planterait sur un
sessionToken non-ObjectId, et prescrivait une garde `/^[0-9a-f]{24}$/`. Vérification faite,
l'anonyme porte un `Participant.id`, ObjectId parfaitement valide : la garde n'aurait jamais été
franchie, et son test serait resté vert pour toujours en prouvant qu'on ne plante pas sur un cas
impossible. Le court-circuit reste, mais pour la raison qui tient debout : `UserEventSeq` est
indexée par `User.id`, donc la question n'a pas de réponse à poser. **Avant d'écrire une garde
dictée par une fiche, exécuter mentalement le chemin qu'elle décrit sur le code réel** — une garde
mal motivée survit à la revue et fossilise l'erreur d'analyse.

**Corollaire — un plancher d'historique se pose sur la colonne qui NAÎT, pas sur celle qui BOUGE.**
La même fiche prescrivait, pour interdire l'historique d'un lien `allowViewHistory:false`, de
remonter le watermark : `sinceDate = max(sinceDate, joinedAt)`. Cela ne ferme rien. `since` borne
`updatedAt` ; un message écrit AVANT la jointure et **réédité** depuis porte un `updatedAt` récent,
franchit le plancher, et repart avec tout son contenu. La borne d'un droit d'accès à l'historique
est `createdAt >= joinedAt` — exactement la colonne que la route de lecture utilise déjà. Règle
générale : **quand une borne exprime un DROIT, elle porte sur la date qui ne se réécrit pas ; une
date `@updatedAt` ne borne qu'une fenêtre de synchronisation.**

**Corollaire — la règle appartient à la LIGNE, pas au TYPE d'identité.** Le plancher de lien de
partage est porté par `Participant.shareLinkId`, que le participant soit anonyme ou inscrit. En
cherchant à ne le poser que pour les anonymes, on aurait laissé ouverte la même fuite pour tout
utilisateur inscrit entré par le même lien — un trou qui existait déjà, et qui ne se voyait pas
parce qu'on l'avait rangé sous « fiche sessions anonymes ». **Quand on s'apprête à conditionner une
règle sur un type d'identité, chercher d'abord quelle COLONNE la porte : si c'est une colonne, tous
ceux qui l'ont y ont droit.**

**Corollaire — « je n'ai pas pu lire » et « il n'y a rien à lire » ne se dégradent pas pareil.** Le
stream des disparitions personnelles annonce `truncated: true` quand sa lecture échoue (« redemande
depuis la même position »). Pour un anonyme, ce stream n'existe pas : `UserMessageDeletion` est
attachée à `User`. Le rendre `truncated` aurait fait redemander indéfiniment une page qui n'a rien à
livrer. Et pour le plancher d'historique, l'arbitrage est **inverse** de celui du masquage : le
masquage est une courtoisie (son échec dégrade vers « on sert »), le plancher est un contrôle
d'accès (son échec doit retirer les conversations concernées). **La posture d'échec se déduit de ce
que la règle PROTÈGE, jamais de ce que le module voisin fait.**

---

## Leçon 240 — Une fiche d'audit qui prescrit un SAC D'OPTIONS a déjà oublié une des options

Cycle 116 (`gwcontract-05`, `notification:read-bulk`).

La fiche prescrivait un payload `{ conversationId?, postId?, types?, all? }`. Le code réel marque en
masse sur **trois** clés de contexte — `conversationId`, `postId`, **`friendRequestId`**. La
troisième n'est pas dans le sac. Un client écrit d'après la fiche aurait ignoré ce scope **en
silence** : `data.conversationId` absent, `data.postId` absent, `data.types` absent → aucune branche,
aucun avertissement, et « X vous a envoyé une demande d'amitié » restant non lue sur les autres
appareils après y avoir répondu. Exactement le défaut que l'événement était censé fermer, rouvert par
la forme de son propre payload.

**Le symptôme à reconnaître** : un payload dont toutes les clés sont optionnelles. Sa cardinalité
réelle n'est écrite NULLE PART — ni dans le type, ni dans le code client, qui se contente de tester
les clés qu'il connaît. Rien ne peut donc signaler qu'il en manque une : ni le compilateur, ni un
test (on ne teste pas la branche qu'on n'a pas écrite), ni une relecture (le sac a l'air complet, il
a l'air complet quel que soit son contenu). Le sac admet en prime deux états absurdes que personne
n'a voulus : `{}` — « rien » ou « tout » ? — et `{all:true, conversationId:'x'}`.

**Le remède est une union discriminée, et le bénéfice n'est pas le typage : c'est que l'énumération
des cas devient une PHRASE que quelqu'un doit écrire.** `{kind:'context', contextKey, contextValue}`
oblige à répondre « quelles clés ? » une fois, à un endroit, et le `contextKey` transporté est
littéralement celui que la requête serveur interpole — les deux dérivent du même couple, un client ne
peut plus rejouer un prédicat que la base n'a pas appliqué. Corollaire de méthode : **avant d'écrire
le payload dicté par une fiche, énumérer sur le CODE les valeurs qu'il devra porter.** Ici, un grep
de trois secondes sur les appelants de `markContextNotificationsAsRead` rendait la troisième clé.
Quatrième fois qu'une fiche se trompe sur un mécanisme qu'elle décrit (cf. leçon 239 et ses
corollaires) — la fiche dit QUOI fermer, jamais COMMENT, et son « comment » se vérifie sur le code.

**Corollaire — un champ « pratique » dans un payload est une invitation à un bug qu'on a déjà
prévu.** La même fiche avertissait, deux étapes plus loin, du risque de double-décrément sur
l'appareil acteur. Mettre un `count` dans l'événement — évident, informatif, gratuit — c'était offrir
au client le décrément exact qu'il ne doit pas faire : son cache est PARTIEL, il matche moins de
lignes que le serveur n'en a marquées. Le champ est omis, et le compteur reste tenu par l'événement
absolu émis juste après. **Ne pas fournir la donnée est la seule garde qu'aucun appelant futur ne
peut contourner par distraction.**

---

## Leçon 240 — Trois porteurs d'une même donnée, et aucun geste qui les touche tous

Cycle 114-ter (non-lu iOS, signalement utilisateur « ça affiche 99 puis ça tombe »).

Le compteur de non-lu d'une conversation était tenu en local par TROIS porteurs — cache disque,
store RAM, lignes `@Published` — plus un quatrième pour le badge d'icône. Chacun était correct pris
isolément, chacun avait ses tests, et le va-et-vient venait de ce qu'AUCUN geste ne les écrivait
tous : selon qui republiait en dernier, la ligne montrait 0 ou 99.

> **Un défaut de cohérence ne se voit dans aucun des fichiers concernés.** Il n'existe que dans le
> tableau « qui écrit quoi, sur quel geste » — un tableau que personne ne dessine tant qu'il n'y a
> pas de bug. Le dessiner est le diagnostic ; le code ne le contient nulle part.

Deux corollaires de méthode, tous deux vérifiés ici :

1. **Une règle partagée ne l'est que là où on l'appelle.** `reconcileUnread` existait, était pure,
   testée, et documentée « source de vérité » — appliquée par UN seul des trois porteurs. Nommer
   une fonction « la règle » ne la propage pas ; seul un appel le fait. Le test qui compte n'est pas
   « la règle est-elle juste ? » mais « combien de sites la contournent ? », et il se répond par un
   grep du nom de la fonction, pas par la lecture de sa doc.
2. **Un garde-fou qui protège un champ ne protège que ce champ.** Le store version-gate `userState`
   pour défendre les mutations optimistes en vol — mais le non-lu ne participe PAS au versionnement
   (`applyReadReceipt` ne bumpe jamais `version`, par conception). Le garde-fou était donc
   structurellement inopérant sur lui, à l'égalité de version, c'est-à-dire toujours. **Quand une
   structure porte deux champs régis par des horloges différentes, un garde-fou écrit pour l'une est
   un trou pour l'autre** — et il se lit comme une protection.

Corollaire produit, distinct des deux précédents : **« j'ai lu » et « ma pastille s'éteint » sont
deux décisions, pas une.** La première engage l'utilisateur vis-à-vis des autres (accusés de
lecture, exactitude de ce qu'on déclare avoir vu) ; la seconde n'engage que son propre écran. Les
avoir confondues a produit les deux bugs symétriques à un an d'écart : d'abord un accusé
sur-déclaré, ensuite une pastille qui ne s'éteignait plus. Les séparer explicitement — un chemin
local sans réseau, un chemin serveur gaté par l'exactitude — les résout tous les deux à la fois.

## Leçon 241 — Un code mort qui décrit un CONTRAT a des jumeaux vivants ; c'est eux qu'il faut aller voir

Cycle 118 (`socket-validator.ts`, décodeur `notification:new` web).

Deux cycles de suite, la question posée sur `socket-validator.ts` était « le retirer ou le
brancher ? ». Elle n'avait pas de réponse : son schéma exige `createdAt` à la RACINE, la gateway
l'émet sous `state` depuis le regroupement. Le brancher aurait rejeté 100 % des notifications
réelles. **Une question binaire dont aucune branche ne tient est le signe qu'on n'a pas lu l'objet,
seulement son étiquette** — ici « validateur de sécurité », qui invite à débattre de sécurité au
lieu de comparer un schéma à un payload. Le grep de trois secondes qui tranchait — comparer
`NotificationEventSchema` à `formatNotification()` — n'a été fait ni au cycle 116 ni au 117.

**Mais le vrai enseignement est ailleurs.** Un fichier mort qui encode une FORME de données n'est
presque jamais seul : il est le résidu d'une migration, et une migration laisse le même résidu
partout où la forme était écrite. Ici, trois artefacts portaient la forme plate — le validateur
(mort), **le décodeur du singleton (vivant, à chaque notification)**, et la fixture de son test
(vivante, et c'est elle qui rendait le vert). Le mort était le seul inoffensif.

**Règle : devant du code mort qui décrit un contrat, ne pas décider de son sort — chercher d'abord
qui d'autre écrit ce contrat.** La valeur du fossile n'est pas dans son sort, elle est dans la date
qu'il donne : il dit « à une époque, l'équipe croyait que la forme était celle-ci », et il suffit
alors de demander qui le croit ENCORE.

**Corollaire — le champ qui dégrade vers une valeur plausible est plus dangereux que celui qui
jette.** Le décodeur lisait quatre champs au mauvais endroit. `isRead` retombait sur `false` et
`readAt` sur `null` : *justes* pour une notification neuve — donc invisibles. `createdAt` retombait
sur `new Date()` : l'horloge de l'APPAREIL substituée à l'horodatage serveur, une valeur qui a
toujours l'air correcte et qui pilote pourtant le regroupement par jour, le « il y a X » et
l'anti-doublon des toasts. Et `title`/`subtitle`, simplement pas recopiés, faisaient retomber
l'affichage sur un repli client — dans une autre langue que celle que le serveur avait résolue,
alors que le Prisme désigne le titre serveur comme source unique. **Quand un décodeur a un défaut
par champ, chercher d'abord les champs dont le défaut est CRÉDIBLE : ceux-là ne remonteront jamais
en bug.**

**Corollaire — une fixture de test inventée fige le contrat qu'on croyait avoir, pas celui qu'on a.**
`makeNotificationData()` construisait un payload plat, et un test affirmait explicitement
`state.createdAt === createdAt` racine — il PROUVAIT le décalage en le nommant. CLAUDE.md le dit
déjà (« use real schemas/types in tests, never redefine them ») ; ce qui manquait, c'est le motif de
reconnaissance : **une fixture écrite à la main pour un payload de FIL doit citer son émetteur**
(ici `{...formatNotification(raw), title, subtitle}`), sans quoi elle ne teste que la cohérence du
client avec lui-même.

**Corollaire — retirer un fossile, c'est aussi retirer ce qu'il rendait attirant.**
`sanitizeNotification()` n'avait qu'un appelant : le validateur mort. Elle RECONSTRUISAIT `context`
avec 4 clés sur 21 — quiconque l'aurait « juste rebranchée » aurait perdu en silence
`callSessionId`, `postId`, `parentCommentId`, `firstAttachmentUrl`, donc la navigation. Un fossile
avec une jolie façade (`@author Security Team`, « Rejection of malformed messages ») ne se contente
pas d'être inutile : il se propose. Le laisser en place en documentant qu'il est mort ne suffit pas
— deux cycles l'ont fait, et le troisième a failli le brancher.

## Leçon 242 — Avant de RÉTABLIR un fichier cassé sur main, chercher qui d'autre est déjà en train de le réparer

Cycle 122 (`MessageDayStickyOverlay.swift`).

`main` ne compilait plus : #2982 avait supprimé trois enums du fichier en laissant leurs cinq
lecteurs en place. Diagnostic correct, réparation immédiate — j'ai rétabli le fichier dans son état
d'avant #2982, poussé, notifié. **Trois minutes plus tard**, #2984 fusionnait le VRAI correctif :
elle gardait la simplification voulue et ne remettait que le seul symbole dont les appelants ont
besoin. Les deux réparations ont atterri dans le même lot ; la mienne est passée en dernier, donc
elle a gagné le fichier — et réintroduit 105 lignes que l'équipe venait de retirer deux fois. Il a
fallu un quatrième commit pour rendre le fichier à sa forme voulue.

**Ce qui manquait n'est pas un test, c'est un regard.** Une casse de compilation sur `main` est
publique et gênante pour tout le monde : la probabilité que quelqu'un d'autre soit déjà dessus est
ÉLEVÉE, et elle croît avec l'ancienneté de la casse. Le geste de trois secondes qui l'aurait dit :

```bash
git ls-remote origin 'refs/heads/*' | grep -i <mot-clé-du-fichier-cassé>
# et, sur les branches candidates : le run CI du gate concerné est-il vert ?
```

Ici `claude/meeshy-header-icons-overflow-fe1mna-fixed` — le suffixe `-fixed` disait tout — portait
un run « iOS Tests » **vert** deux minutes avant mon push.

**Règle : réparer la casse d'un autre est légitime ; le faire sans regarder si la réparation existe
déjà ne l'est pas.** Avant tout rétablissement d'un fichier qu'on n'a pas écrit, énumérer les
branches distantes qui le touchent et lire leur verdict CI. S'il y en a une verte, l'ATTENDRE ou la
reprendre — jamais en écrire une seconde en parallèle.

**Corollaire — « rétablir l'état d'avant » est la réparation la plus grossière, pas la plus sûre.**
Elle a l'air conservatrice parce qu'elle revient à du code qui a compilé. Mais elle annule aussi
tout ce qui a été DÉLIBÉRÉMENT changé depuis, et elle le fait en silence : ni conflit, ni test
rouge, puisque l'API publique était identique des deux côtés — c'est précisément ce qui a rendu
l'écrasement invisible au compilateur. La réparation minimale n'est pas « remettre le fichier
d'hier », c'est **remettre le plus petit symbole qui manque à ses lecteurs**, ce qu'a fait #2984.

**Corollaire — un gate qui n'a pas conclu n'est pas un gate.** L'origine de toute la séquence est
`iOS compile (PR gate)` de #2982, `cancelled` à l'instant même de la fusion. La casse n'a donc
jamais été vue par personne avant d'être sur `main`, et `ios-tests.yml` ne tournant pas sur les
pushes vers `main`, rien ne l'a rattrapée ensuite. Un `cancelled` se lit comme un rouge, jamais
comme un vert absent.
## Leçon 244 — Un filtre qui ne filtre que le déjà-chargé ne gaspille pas : il MENT

Cycle 123 (`GET /notifications`, onglets de la cloche web).

Sept paramètres de filtrage partaient du web vers une route qui ne les déclarait pas. Fastify les
retirait de `request.query` sans bruit. La lecture facile — celle qui a laissé l'écart ouvert un
cycle de plus — est « des octets envoyés pour rien, à nettoyer un jour ». Elle est fausse, et c'est
la SUITE qui compte : il fallait bien que quelque chose filtre, et ce quelque chose était
`matchesFilter`, appliqué **aux pages déjà chargées**.

**Sur une liste paginée, filtrer le déjà-chargé n'est pas une approximation du filtrage — c'est une
autre opération, qui rend une réponse d'une autre nature.** « Aucune mention » ne voulait pas dire
« vous n'avez pas de mention » mais « aucune mention parmi les vingt dernières notifications », et
rien n'allait chercher les autres. L'utilisateur, lui, lit la première phrase. Un onglet vide n'était
pas une réponse, c'était une fenêtre.

**Règle de reconnaissance : devant un filtre client, demander sur QUOI il s'applique. S'il s'applique
à une collection paginée, il ment — et il ment d'autant plus fort que l'utilisateur a d'historique**,
c'est-à-dire exactement chez les utilisateurs qui comptent. Le corollaire vaut pour tout chiffre
dérivé de la même collection : ici les pastilles de comptage des onglets et le sous-titre
« N notifications » mentaient de la même façon, et personne ne les avait rangés avec le filtre parce
qu'ils ne s'appellent pas « filtre ». **Un filtre et un compteur posés sur la même collection
partagent leur défaut ; corriger l'un sans l'autre laisse l'écran incohérent avec lui-même.**

**Corollaire — une signature qui accepte un paramètre non honoré est la CAUSE, pas la conséquence.**
`fetchNotifications(options: Partial<NotificationFilters> & …)` admettait `priority`,
`conversationId`, `startDate`, `endDate`, `sortBy`, `sortOrder`. Le type disait « tu peux filtrer
là-dessus » ; le serveur n'en savait rien. Tant que la signature les accepte, personne n'a de raison
de vérifier qu'ils arrivent quelque part — et un appelant futur les passera de bonne foi. Le
correctif durable n'est pas de les faire honorer (construire un filtre sans lecteur est le défaut
symétrique) : c'est de faire dire au type **ce que la route accepte réellement**, et rien d'autre.

**Corollaire — filtrer côté serveur crée un danger neuf du côté temps réel.** Le socket insérait
chaque notification dans TOUTES les listes en cache (`setQueriesData` sur un préfixe). Tant que
toutes les listes voyaient la même chose, c'était juste ; dès qu'une liste porte un filtre, l'écriture
aveugle y injecte ce que le serveur n'aurait jamais servi — le temps réel contredisant le filtre que
la liste vient d'appliquer. **Quand on rend une liste sélective, il faut relire tous ses ÉCRIVAINS,
pas seulement son lecteur.** La sélection était déjà disponible au bon endroit : dans la clé de la
query, qui la transporte par construction.

**Corollaire — deux `switch` identiques dans un même fichier ne sont pas une duplication de style.**
`countByFilter` et `matchesFilter` recopiaient ligne pour ligne le groupement d'alias
(`user_mentioned` et `mention` sous « mentions »). Rien n'avait encore divergé — mais le jour où le
filtre part au serveur, il faut envoyer CETTE table, et une table qui existe en deux exemplaires n'a
pas de nom à envoyer. La duplication ne coûtait rien tant que la règle restait locale ; elle a coûté
le droit de la déplacer.

## Leçon 245 — Un miroir d'état a besoin d'un chemin de retour, pas seulement d'un chemin d'aller

Cycle 15 temps réel (`ConnectionService.state.isConnected`, web).

Un handler `offline` mettait le miroir de connexion à `false` sans toucher au socket — geste
délibéré et correct : la bannière doit réagir à la seconde où le réseau tombe, sans attendre que
Socket.IO s'en aperçoive. Le défaut n'est pas là. Il est dans ce qui manquait **en face** : rien ne
pouvait remettre le miroir à `true` quand le socket, lui, n'était jamais tombé.

**Un miroir pessimiste est un pari sur l'existence d'un événement de retour.** Ici le pari était
faux par construction : le seul événement capable de relever le drapeau (`connect`) n'est JAMAIS
émis sur un socket déjà connecté, et la fonction censée le provoquer (`connect()`) sortait en
silence sur exactement cette condition. Le chemin d'aller était instantané, le chemin de retour
n'existait pas.

Deux règles à en tirer :

1. **Quand on écrit une mise à jour optimiste ou pessimiste d'un état MIROIR, écrire le chemin de
   retour dans le même geste.** Pas « ça se réparera au prochain événement » — il faut nommer
   l'événement et vérifier qu'il peut se produire dans l'état où le miroir vient d'être mis. Ici la
   mise à `false` rendait précisément impossible l'événement censé la défaire.

2. **La réconciliation va au POINT DE PASSAGE, pas au point de déclenchement.** La réparation était
   tentante dans le handler `online` — c'est là que le symptôme se voit. Mais `connect()` est
   traversé par tous les appelants (handler `online`, orchestrateur, `ensureConnection`) : réparer
   au point de déclenchement aurait laissé les deux autres sur la même impasse, c'est-à-dire aurait
   reproduit la configuration « un contrôle correct répété en N endroits dont l'un finit par
   manquer » (leçons des cycles 13 et 14).

**Le signal de recherche** : un booléen d'état écrit à `false` dans un handler qui ne touche pas la
ressource qu'il décrit. Chercher ensuite, explicitement, la ligne qui le remet à `true` — et vérifier
qu'elle est atteignable depuis l'état écrit. Si la remise à `true` vit derrière une garde que la mise
à `false` vient de rendre infranchissable, le miroir est piégé.

**Ce qui rendait la panne invisible** : le socket continuait à livrer les messages ENTRANTS. La seule
chose cassée était ce qui LISAIT le miroir — ici `useAutoRetryFailedMessages`, dont `isReady` est
l'unique déclencheur, donc la file des messages en échec silencieusement gelée. Un état miroir faux
ne se manifeste pas là où il est faux, mais chez ses lecteurs : recenser les lecteurs fait partie du
diagnostic, pas de la rédaction.

---

## Leçon 246 — Quand deux éléments se disputent une bande, la géométrie sépare ; l'exclusion mutuelle ampute

**Symptôme.** La pastille de jour d'une conversation et la rangée du header flottant vivaient toutes
deux juste sous l'encoche. Le 12/08 le chevauchement est signalé, le 13/08 au soir il est « résolu »
par une EXCLUSION MUTUELLE : la pastille n'apparaît que pendant le défilement actif, moment où le
header s'efface entièrement en retour. Retour user le lendemain : « remets la gestion des dates et
l'affichage du header comme c'était avant hier soir ».

**Ce que l'exclusion mutuelle coûte, et qu'on ne voit pas en l'écrivant.** Elle a l'air élégante :
un seul occupant à la fois, plus aucun pixel en conflit, et le code se lit comme une invariante
propre. Mais elle paie ce zéro-conflit avec la DISPONIBILITÉ des deux éléments — chacun devient
absent pendant toute la fenêtre de l'autre. Ici : plus de retour, d'avatar ni de titre dès que le
doigt touche la liste ; et la date qui s'évanouit à l'arrêt, c'est-à-dire exactement au moment où on
la LIT. Aucun des deux n'était en trop, et c'est là le point : on n'arbitre pas entre deux éléments
que le produit veut tous les deux, on leur donne chacun leur bande.

**Le remède était déjà là — et il avait été jeté.** L'offset de 60 pt (padding haut du header +
rangée de contrôles + marge) posait déjà la pastille SOUS le header depuis le 12/08. Il a été
supprimé au profit de l'exclusion, au motif qu'un « grand offset fixe » ne permettait pas de poser
la pastille près de l'encoche. C'est un objectif esthétique qui a désarmé une solution
fonctionnelle : la contrainte réelle n'était pas « près de l'encoche », c'était « lisible et sans
chevauchement ».

**Règle : face à deux éléments qui se chevauchent, chercher d'abord la séparation SPATIALE
(offset, bande, colonne) ; ne réserver l'exclusion temporelle qu'aux éléments dont le produit
accepte l'absence.** Un test de disponibilité écrit avant l'arbitrage l'aurait dit : « le header
est-il joignable pendant un défilement ? », « la date est-elle lisible à l'arrêt ? » — deux
questions auxquelles l'exclusion répond non, et qu'aucune garde de chevauchement ne pose.

**Ce qui méritait d'être gardé.** Le signal de défilement construit pour l'exclusion
(`onScrollingActiveChanged`, drag ou décélération) était bon ; c'est son USAGE qui était trop
large. Rebranché sur la seule grappe d'ACTIONS du header — appel, recherche — il devient la loi
`ScrollMotion`, généralisée aux quatre en-têtes à liste : une vue en mouvement ne montre pas ses
boutons d'action, mais elle garde son identité et ses repères de lecture. Un signal juste mal
appliqué se réoriente ; il ne se jette pas avec la solution qu'il servait.

---

## Leçon 247 — Une valeur passée à une couche qui la REJOUERA est une copie, pas une référence

Cycle 16 temps réel (`ConnectionService`, `auth` du socket, web).

`io(url, { auth: { token } })` se lit comme « connecte-toi avec ce jeton ». Ce que la bibliothèque
en fait est autre chose : elle **garde la charge et la rejoue à chaque tentative de reconnexion**,
pour toute la vie du socket. Le jeton n'était donc pas un paramètre d'appel, c'était une copie
gelée d'un état qui, lui, continuait de tourner — rafraîchissement silencieux sur 401, pré-contrôle
d'expiration, rotation de session anonyme. Le socket rejouait un jeton mort à chaque essai, et
notre propre boucle de backoff le rejouait après lui : verrouillage complet sur une session dont
les identifiants valides étaient en stockage depuis le début.

**La règle** : quand une configuration est remise à une couche qui la RÉUTILISERA sans nous
redemander, une valeur littérale est un instantané. Si la source de cette valeur peut changer avant
la prochaine réutilisation, il faut passer le moyen de la relire — un callback, un getter — et pas
son contenu du moment. La plupart des bibliothèques offrent les deux formes ; la forme littérale est
celle des exemples de documentation, donc celle qu'on copie, donc celle qui se retrouve en
production alors que le cas d'usage réel exigeait l'autre.

**Le signal de recherche** : chercher les options passées à une construction (`io(...)`,
`SocketManager(config:)`, un client HTTP avec en-têtes par défaut, un intercepteur monté une fois)
qui contiennent un jeton, une URL signée, un identifiant de session. Puis demander : cette valeur
peut-elle changer pendant que l'objet vit ? Si oui, l'objet est déjà scellé sur une version périmée.

**Le rustinage impératif est le fossile du bug.** Le code contenait déjà
`socket.auth = { token: newToken }` dans un handler — quelqu'un avait vu le symptôme et repoussé la
valeur à la main. Un tel geste ne couvre que le chemin où il est écrit ; ici celui où la passerelle
avait PU émettre `auth:token-expired`, donc où le socket était encore connecté, tandis que les
rotations REST n'y passaient jamais. **Quand on trouve une ligne qui repousse manuellement une
valeur dans un objet déjà construit, on a trouvé la trace d'un état gelé — et le correctif n'est pas
d'ajouter le même geste aux autres chemins, c'est de dégeler la source.** Corollaire à verrouiller
par un test : une fois la source dégelée, ce rustinage devient *nuisible* — réassigner la valeur
remplace le résolveur et restaure exactement la panne d'origine.

**Deuxième moitié, même famille que la leçon 245** : le rafraîchissement réussissait, et rien ne
prévenait la couche temps réel. Un démarrage à jeton expiré ne crée aucun socket ; les seuls
réveils restants étaient les actions SORTANTES de l'utilisateur (envoyer, rejoindre). **Un lecteur
passif ne déclenche rien** — et sur une messagerie, l'écran d'accueil est un écran de lecture pure.
Quand on se repose sur « une action de l'utilisateur finira par relancer ça », nommer l'action, puis
vérifier qu'elle existe sur l'écran où le défaut se produit.

## Leçon 248 — Quand une démolition est inconditionnelle, la reconstruction doit rendre compte

Cycle 17 temps réel (`MessageSocketManager`, `SocialSocketManager`, iOS).

`forceReconnect()` s'écrivait en deux lignes qui se lisent comme un tout : `suspendTransport()`
puis `connect()`. Démolir, rebâtir. Mais les deux gestes n'ont pas la même force : le premier
réussit **toujours**, le second peut sortir sans rien faire — trois `guard`/`return` précoces
(jeton absent, jeton expiré, URL nulle). Et comme `connect()` rendait `Void`, l'appelant ne pouvait
pas distinguer « rebâti » de « rien fait ».

**Ce qui rend l'écart mortel, ce n'est pas la démolition du socket, c'est ce qu'elle emporte
AVEC lui.** `suspendTransport()` met `manager = nil` — et le `manager` portait la boucle de retry
interne de Socket.IO (`reconnectAttempts(-1)`), c'est-à-dire le mécanisme qui, jusqu'à cette ligne,
garantissait qu'on finirait par revenir. Tant que ce filet existait, un `connect()` stérile n'était
qu'un délai. Une fois le filet détruit, le même `connect()` stérile est un **état terminal**.

**La règle** : quand un chemin détruit une ressource de reprise avant d'en installer une nouvelle,
l'installation doit rapporter son succès, et l'appelant doit posséder le cas d'échec. Un `Void` sur
une fonction de reconstruction est le point aveugle — il fait passer « je n'ai rien pu faire » pour
« c'est fait ».

**Le signal de recherche** : chercher les paires `teardown(); rebuild()` où `rebuild` contient des
`guard ... else { return }`. Puis demander : que possédait l'objet détruit, en plus de lui-même ?
Un timer, une boucle de retry, un observateur, une souscription ? C'est cela qu'on perd, et c'est
rarement ce que le nom de la fonction laisse croire.

**Corollaire — une suppression défensive doit dire à quelle condition elle est sûre.** Le garde
« ne pas reconnecter pendant un appel » protégeait un socket de signalisation **vivant**. Écrit
comme un `return` sec, il s'appliquait aussi quand ce socket était déjà tombé — c'est-à-dire
exactement au cas où l'appel avait le plus besoin qu'on le rebâtisse. Une garde qui préserve
quelque chose doit vérifier que ce quelque chose est encore là.

**Deuxième moitié — le backoff exponentiel mesure la santé du SERVEUR, jamais celle du lien.**
L'échelle grimpait une fois par retour de réseau et ne retombait que sur connexion réussie. Or
`offline → online` est une information **neuve et positive** : le lien vient de revenir. La traiter
comme une preuve à charge, c'est facturer à l'utilisateur la qualité de sa couverture — après
quelques tunnels, il émerge en réseau stable avec la reconnexion suivante repoussée d'une minute,
au moment précis où elle deviendrait possible. **Un backoff compte les tentatives infructueuses,
pas le temps passé hors ligne**, et tout signal positif le remet au plancher.

**Troisième point, sur la méthode — vérifier la bibliothèque AVANT d'écrire le filet de sécurité.**
La piste initiale de ce cycle était un chien de garde sur les `heartbeat:ack` manquants, pour
détecter un socket zombie (transport mort sans événement `disconnect`). Le fichier lui-même
documentait le danger. La source de socket.io-client-swift 16.1.1 dit autre chose :
`SocketEngine.checkPings()` réarme un contrôle toutes les `pingInterval + pingTimeout` et appelle
`closeOutEngine(reason: "Ping timeout")` — le cas était déjà couvert, et le correctif aurait été du
code mort sophistiqué. **Quand un correctif consiste à surveiller ce qu'une dépendance surveille
peut-être déjà, aller lire sa source est moins cher que de livrer le doublon.** Une dépendance
épinglée (`exact: "16.1.1"`) se lit en une requête ; c'est le prix d'une hypothèse non vérifiée.

---

## Leçon 249 — Un schéma de réponse est un FILTRE, pas une documentation : ce qu'il oublie n'existe plus sur le fil

Fastify sérialise la réponse **à travers** le schéma déclaré : toute propriété absente de
`properties` est retirée de la charge, sans avertissement, sans log, sans erreur de type. Un schéma
de réponse ne décrit donc pas ce que la route rend — il **décide** ce qu'elle rend.

`conversationPreferencesSchema` énumérait les onze champs de préférence et oubliait `version`. Le
résultat n'était pas une documentation incomplète : c'était la suppression, sur les trois surfaces
REST à la fois, du compteur monotone sur lequel tous les clients arbitrent (`incoming.version <=
local -> drop`). Tout le reste de la chaîne était pourtant correct et se lisait comme si le contrat
tenait : la passerelle incrémente bien `version` à chaque écriture, la diffusion socket le porte, le
type partagé le documente comme « payload complet incluant `version` », le modèle Swift le déclare
« populated by the gateway ». Le seul maillon qui ne le disait nulle part était celui qui l'effaçait.

**Le signal qui aurait dû alerter plus tôt** : iOS refait un `GET` juste après son `PUT` dans le
**seul** but de récupérer ce champ, avec un commentaire expliquant l'adaptateur. Du code écrit
exprès pour aller chercher une valeur est la preuve que quelqu'un a cru qu'elle arrivait. Quand ce
code existe et que la valeur est toujours `nil`, ce n'est pas le lecteur qu'il faut suspecter.

**Règle** : quand une donnée est censée traverser une frontière HTTP, la vérifier sur le **fil**
(un test d'injection qui lit `res.json()`), pas dans le handler. Un test qui assert le retour du
handler passe au vert sur une charge que le client ne recevra jamais. Corollaire pour la revue :
tout ajout de colonne destinée aux clients se relit dans DEUX fichiers — le writer et le schéma de
réponse.

**Deuxième moitié — une union dont on ne traite que N-1 branches est une panne, pas une couverture
partielle.** `user:preferences-updated` porte trois scopes ; le web en traitait deux, la troisième
sortant de la fonction sans rien faire, sous un commentaire annonçant une « phase ultérieure ». Le
commentaire est ce qui a fait tenir l'oubli : il transformait un trou en jalon. Mais la ligne
`UserConversationPreferences` est **par utilisateur, pas par appareil** — la diffusion était le seul
chemin par lequel un épinglage fait sur le téléphone pouvait atteindre un onglet ouvert, et rien
d'autre n'allait le combler. **Quand un client déclare consommer un événement, la question n'est
jamais « combien de branches sont traitées » mais « que se passe-t-il pour l'utilisateur sur celles
qui ne le sont pas ».** Ici : la liste gardait son état et son tri jusqu'à un rechargement de page.
## Leçon 250 — Un durcissement de sécurité qui exige « une ligne existante » exclut par construction l'appelant légitime qui n'en a pas encore une (2026-08-14, routine appels audio/vidéo)

Audit du calling stack (`services/gateway/src/socketio/CallEventsHandler.ts`) : le bouton
« Refuser » d'un appel entrant était cassé depuis le durcissement de sécurité du 2026-07-10b.
`call:end` exigeait `resolveActiveCallParticipantId` — une ligne `CallParticipant` ACTIVE pour CE
call précis, pour fermer une faille réelle (un appelant resté dans la room après avoir quitté ce
call pouvait le raccrocher pour l'autre). Mais `call:join` est le SEUL chemin qui crée cette ligne
pour un callee — `call:initiate` n'en crée une que pour l'initiateur. Un callee qui tape « Refuser »
avant d'avoir jamais rejoint n'a donc JAMAIS eu de ligne à trouver : le check légitime le rejetait
au même titre qu'un imposteur. Résultat silencieux : `ack` jamais vérifié côté client (aucun
callback enregistré), l'appelant continuait de sonner jusqu'au timeout 60s au lieu de voir le refus.

**Le signal de reconnaissance** : une autorisation qui teste « CE user a-t-il déjà une ligne dans
CETTE table » exclut structurellement deux populations différentes qu'on confond trop vite en une
seule catégorie « non autorisé » — celui qui n'a JAMAIS eu de ligne (légitime mais pas encore
inscrit) et celui qui EN A EU une et l'a quittée (exactement la fraude que le check visait). Le
correctif du 2026-07-10b avait raison de fermer la seconde ; il a fermé la première par le même
geste parce que le test ne distingue pas « absent » de « parti ».

**La règle** : avant de resserrer une autorisation sur « a une ligne active », énumérer TOUS les
chemins qui peuvent légitimement atteindre ce contrôle sans qu'une ligne existe encore — pas
seulement ceux qui en ont une et l'ont perdue. Ici il suffisait de relire quel événement crée la
ligne (`call:join`) contre quel événement porte le contrôle (`call:end`) pour voir l'écart : le
premier ne couvre pas tous les appelants qui peuvent légitimement déclencher le second.

**Le correctif reste étroit à dessein** : la voie de secours (`resolvePreJoinDeclineParticipantId`)
ne s'active que si (a) `resolveActiveCallParticipantId` a échoué, (b) `reason === 'rejected'`
explicitement — jamais pour un `call:end` générique —, (c) l'appel n'a jamais été décroché
(`!answeredAt`), (d) l'appelant n'a AUCUNE ligne pour ce call, même quittée (sinon il retombe sur le
chemin strict), et (e) il est un membre de la conversation. Élargir la portée « pour être sûr » (par
exemple accepter n'importe quel `reason`, ou sauter la vérification de membership) aurait rouvert
exactement la faille du 2026-07-10 — un inconnu qui devine un `callId` pourrait y mettre fin.

**Corollaire côté web, même cycle** : `call-store.ts`'s `beforeunload` émettait `CALL_END`
inconditionnellement — correct tant que 1:1 était le seul mode (raccrocher termine forcément
l'appel pour les deux), devenu faux le jour où les appels de groupe ont supprimé le plafond à deux
participants (`b06d54681`, la veille). Fermer un onglet dans un appel à 5 terminait l'appel pour les
4 autres. Le correctif n'a touché AUCUNE logique serveur : `CallService.leaveCall()` distinguait déjà
1:1 (`isDirectCall` → toute sortie termine l'appel) de groupe (seule la sortie du DERNIER participant
le termine) — le bug entier tenait dans le nom d'un seul événement émis côté client
(`CALL_END` → `CALL_LEAVE`). **Un event socket au nom générique (« end ») porté par un flux qui
n'a plus le contexte qui le rendait sûr (1:1 devenu N:N) doit être ré-audité au moment où ce contexte
change — pas seulement au moment où on l'écrit.**
## Leçon 251 — « Sans persistance » ne veut pas dire « sans état » : un événement de DÉBUT sans fin est un bail perpétuel

`LocationHandler` s'ouvrait sur « Real-time only — no Prisma persistence », et en
tirait deux conclusions dont une seule était juste. Pas de table : correct, il n'y
en a pas au schéma. Pas d'état **en mémoire** non plus : c'est ce saut-là qui
coûtait cher. Le handler validait, diffusait, oubliait.

Or un partage de position est un **bail** : il a une date de fin annoncée
(`expiresAt`, jusqu'à 8 heures) et un titulaire dont la présence conditionne la
validité. Un serveur qui n'en garde rien ne peut faire aucune des trois choses
qu'un bail exige — le résilier quand le titulaire disparaît, le laisser expirer à
son terme, ou dire à un tiers qu'il existe. Il ne restait qu'un chemin : que le
titulaire vienne lui-même le résilier. Un chemin que l'arrêt forcé, le crash et la
perte de réseau ne prennent jamais — c'est-à-dire les trois façons ordinaires dont
une session mobile se termine.

**La règle** : tout événement `X-started` qui porte une durée ou un propriétaire
crée un état, que le serveur le range quelque part ou non. S'il ne le range pas,
l'état existe quand même — chez les clients, sans personne pour l'invalider. Le
choix n'est pas « avec ou sans état » mais « état côté serveur, ou état orphelin
côté clients ».

**Le signal de recherche** : chercher les paires `X-started` / `X-stopped` où le
`stopped` n'a qu'UN seul émetteur, et où cet émetteur est le geste explicite d'un
utilisateur. Puis demander les trois questions du bail : qui le résilie si le
titulaire meurt ? qui le fait expirer ? qui l'annonce à un arrivant ? Un `stopped`
à émetteur unique répond « personne » aux trois.

**Corollaire — le voisin qui a déjà raison est le meilleur gabarit.** Le même
codebase retracte la frappe sur `disconnecting` depuis longtemps
(`StatusHandler.handleSocketDisconnecting` → `typing:stop`). La position en direct
était le seul état éphémère par socket à ne pas l'avoir, et le correctif est le
même geste au même point d'accroche. Avant d'inventer une politique, chercher
l'état frère qui a déjà survécu à la question : sa forme est déjà validée en
production, et la copier rend le tout lisible d'un coup.

**Corollaire — l'absence d'état et la fin d'un état se ressemblent dans le
résultat et s'opposent dans ce qu'elles demandent.** Après un redémarrage de la
passerelle, le registre est vide alors que des partages tournent. Traiter « pas
d'entrée » comme « session terminée » — la lecture naïve — ferait mourir tous les
partages en cours à chaque déploiement. Une session **inconnue** doit passer ; seule
une session **connue et échue** doit être coupée. La même distinction que
`truncated` fait dans `/sync` entre « je n'ai pas pu lire » et « il n'y a rien à
lire », et elle se pose partout où un registre volatil sert d'autorité.

**Corollaire — un `leave` applicatif n'est pas un départ.** La symétrie tentait
d'étendre la retraction à `conversation:leave`, comme pour la frappe. Elle aurait
été fausse : côté client, `leave` signifie « j'ai quitté cet écran », pas « j'ai
quitté le groupe ». Retracter là aurait tué le partage en arrière-plan, qui est
précisément l'usage principal de la fonction. **Deux états éphémères qui partagent
un cycle de vie n'en partagent pas forcément tous les points d'accroche** : la
frappe n'a de sens que sur l'écran, la position en a hors de lui.

## Leçon 252 — Un arbitre de concurrence ne vaut que s'il garde TOUTES les portes d'écriture (2026-08-14, routine temps réel, cycle 19)

Le cycle 17 avait doté les préférences de conversation d'un compteur monotone `version`, l'avait
fait traverser le sérialiseur REST, et avait posé `applyRemotePreferences()` comme portillon des
diffusions socket : `incoming.version <= local -> drop`. Correct, testé, documenté. Et pourtant
l'état pouvait toujours rembobiner — parce que la ligne du store web a **deux** écrivains, et que
l'arbitre n'en gardait qu'un. Les quatre bascules optimistes (`togglePin`, `toggleMute`,
`toggleArchive`, `setReaction`) posaient la réponse de leur `PUT` **sans condition**, juste à côté
du portillon qu'elles ne franchissaient pas.

**Le signal de reconnaissance** : dès qu'on introduit un arbitre (`version`, `updatedAt`, un LWW,
un numéro de séquence), la question à se poser n'est pas « mon écrivain passe-t-il par l'arbitre ? »
mais « **combien d'écrivains cette case a-t-elle, et lesquels ne le franchissent pas ?** ». Un
arbitre partiel est plus dangereux qu'aucun arbitre : il donne l'impression que la course est
traitée, et concentre l'attention sur le chemin gardé. Ici la porte non gardée était la plus
fréquente des deux — chaque action de l'utilisateur y passait.

**Le corollaire de la rétractation.** Le même raisonnement vaut pour le `catch` d'une écriture
optimiste. Rétracter en restaurant l'instantané capturé AVANT la requête suppose que rien n'a écrit
entre-temps — supposition fausse exactement dans les cas que l'arbitre existe pour traiter. Sur un
état immuable, l'identité référentielle tranche sans coût : ne rétracter que si l'entrée locale est
TOUJOURS l'objet que cette écriture a posé. Un échec réseau ne doit jamais annuler une action sans
rapport avec lui.

**La réserve qui évite la sur-correction** : l'arbitrage ne s'applique QUE si la valeur entrante
porte effectivement l'arbitre. Une réponse antérieure à l'ajout du champ n'a pas de version, et la
jeter au motif que `undefined ?? 0 <= 0` perdrait l'écriture — un déploiement mixte cassé par la
correction elle-même. « Absent = version 0 » est la bonne convention côté LOCAL (une ligne jamais
diffusée est sous toute version que le serveur peut émettre) et la mauvaise côté ENTRANT.

**Corollaire de refactor** : les quatre bascules étaient quasi identiques sur ~40 lignes chacune.
Le cycle 17 l'avait noté et repoussé. Tant que la duplication tient, une correction de course doit
être appliquée quatre fois — et une cinquième bascule naîtra sans elle. Factoriser d'abord
(`writeOptimistic(conversationId, patch, request)`), corriger ensuite, à un seul endroit.

## Leçon 253 — `Task { @MainActor in }` sur une méthode déjà @MainActor ne change pas OÙ elle tourne, seulement QUAND (2026-08-14, routine appels audio/vidéo)

Audit du calling stack, volet PushKit : `AppDelegate.application(_:didFinishLaunchingWithOptions:)`
appelait `VoIPPushManager.shared.register()` via `Task { @MainActor in VoIPPushManager.shared.register() }`.
Le commentaire juste au-dessus explique noir sur blanc pourquoi cet appel a été déplacé dans
`AppDelegate` : PushKit exige que `PKPushRegistry` existe, délégué câblé, AVANT qu'un push VoIP
puisse être livré — y compris au lancement déclenché par iOS lui-même pour livrer ce push. Le code
fermait la course une fois (sortir du SwiftUI `.task` gated sur l'auth), puis la rouvrait par le
mécanisme même censé la garder fermée : `Task { @MainActor in }` depuis un contexte DÉJÀ MainActor
(`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, prouvé par l'appel voisin
`BackgroundTaskManager.shared.registerTasks()` qui, lui, tourne en direct sans wrapper) ne fait
qu'enfiler `register()` sur l'executor pour le tour de run-loop suivant — il tournera bien sur
MainActor, mais pas avant que `didFinishLaunchingWithOptions` ait fini de s'exécuter et rendu la
main. Un push VoIP livré à l'instant du lancement peut donc encore arriver avant que le registre
existe : exactement le trou que le déplacement dans `AppDelegate` prétendait combler.

**Le signal de reconnaissance** : un commentaire qui justifie l'EMPLACEMENT d'un appel par une
contrainte de TIMING (« doit exister avant X »), suivi d'un wrapper `Task { @MainActor in }` autour
de cet appel — le wrapper est presque toujours un réflexe de prudence copié d'un site où l'isolation
n'était pas garantie, pas une nécessité du site courant. Avant d'employer une méthode @MainActor
sous `Task { @MainActor in }`, vérifier si le contexte appelant est DÉJÀ MainActor (build setting
`SWIFT_DEFAULT_ACTOR_ISOLATION`, ou un appel voisin non-wrappé qui le prouve empiriquement) — si
oui, le wrapper ne fait que différer l'exécution, jamais la sécuriser.

**La règle** : sur un chemin de lancement dont le contrat impose « doit tourner AVANT que l'OS ne
puisse livrer X », un appel synchrone @MainActor s'invoque en direct depuis un contexte déjà
MainActor — jamais via `Task { @MainActor in }`, qui réintroduit la fenêtre que le placement du
code visait justement à fermer. Le correctif est symétrique de la Leçon 248 (même passe d'audit) :
là, un flag `callUsesCallKit` oublié rouvrait une fenêtre de 2s d'audio mort au rejoin ; ici, un
wrapper `Task` de trop rouvre une fenêtre de course PushKit — dans les deux cas, le code AVAIT déjà
la bonne intention documentée en commentaire, et l'implémentation la contredisait silencieusement.

## Leçon 254 — Une garde de liaison évaluée UNE fois avant une boucle suppose que le lien tient jusqu'au bout, alors que la file existe précisément parce qu'il a déjà lâché (2026-08-14, routine temps réel, cycle 20)

`SocketIOOrchestrator.processPendingMessages()` lisait `getSocket()` en tête de fonction, vérifiait
`connected`, puis parcourait toute la file d'envoi. Un seul contrôle pour N tentatives réseau
séquentielles, chacune pouvant durer jusqu'à 10 s d'attente d'ack.

**Le signal de reconnaissance** : une garde de ressource posée AVANT une boucle qui consomme cette
ressource à chaque tour n'est pas une garde, c'est un pari sur sa stabilité. Et le pari est ici
perdant par construction : **la file n'existe QUE parce que le lien a déjà lâché une fois**. Le
contexte qui déclenche la boucle est aussi celui qui la fait échouer. Chaque fois qu'une structure
de rattrapage (file hors ligne, backlog de retry, queue de reprise) est vidée par une boucle,
demander : « la condition qui a rempli cette file peut-elle revenir pendant que je la vide ? » La
réponse est presque toujours oui.

**L'aggravation qui rend le défaut coûteux** : la boucle retirait l'entrée de la file
(`shift()`) et annulait sa minuterie d'expiration AVANT de tenter l'envoi. Sur lien mort, l'appel
d'envoi rendait `{ success: false }` immédiatement, sans rien émettre — donc toute la file
s'effondrait en une rafale, **des échecs sans aucune tentative réelle**. La règle : ne retirer un
travail de sa file qu'une fois la ressource constatée disponible ; sinon un échec de ressource
devient un échec de travail, et le travail perd le budget que sa file lui donnait.

**La frontière à ne pas franchir** : remettre en file après une tentative RÉELLE (ack en erreur,
coupure survenue pendant l'attente) ferait tourner la boucle indéfiniment sur un lien vivant. La
distinction est « le lien était-il mort AVANT que je tente ? » — pas « ai-je échoué ? ».

**Corollaire d'ordre — une file qu'on peut doubler n'est pas une file.** Le chemin d'envoi direct
du même fichier ne regardait que la liaison, jamais le reliquat : un message tapé pendant le vidage
partait avant des messages plus anciens encore en attente. Sur une messagerie, l'inversion est
définitive — l'horodatage serveur est le seul ordre que porte le fil, et il entérine l'arrivée.
Dès qu'une boîte d'envoi existe, la règle est : **tant qu'elle contient quelque chose, on entre par
la queue**. La liaison ne décide plus que de la suite (attendre une reconnexion, ou relancer le
vidage sur-le-champ) — et cette relance n'est pas optionnelle, faute de quoi on échange une
inversion d'ordre contre un blocage.

**Corollaire `finally`** : une sortie anticipée ajoutée au milieu d'une fonction qui pose un verrou
booléen en tête (`isProcessingQueue = true`) doit s'accompagner du passage sous `try/finally`.
Un verrou de vidage laissé à `true` ne scelle pas un tour, il scelle la file pour la session.

## Leçon 255 — Un event à PLUSIEURS émetteurs : vérifier qu'ils émettent la MÊME forme (2026-08-15, routine temps réel, cycle 22)

Deux matrices mécaniques (events serveur × écouteurs clients, events client ×
handlers serveur) répondent à « qui écoute quoi » et ne trouvent RIEN quand le
défaut est ailleurs : un event dont **deux** émetteurs construisent la charge
utile **séparément**. La matrice le voit émis, elle le voit écouté, et elle est
verte — alors qu'une des deux formes est illisible pour le client.

`message:translation` : le retour ZMQ émettait un `TranslationEvent`, la branche
CACHE de `translation:request` émettait `{ messageId, translatedText, … }`. Le
web sort par un `return` nu, iOS échoue son `decode`. Résultat : traduire à la
demande ne marchait QUE sur cache MISS.

**Règle.** Quand un `SERVER_EVENTS.X` a plus d'un site d'émission, la charge
utile appartient à un constructeur unique, pas à chaque site. C'est la même
conclusion que le cycle 8 (corps REST des liens de partage, payload construit
deux fois par route) — la troisième récidive de la même famille.

**Corollaire de détection.** Un client qui IGNORE une charge utile qu'il ne sait
pas lire a raison de l'ignorer, et tort de le faire sans un mot. Le `return` nu
est ce qui rend ce défaut invisible : ni erreur, ni log, ni métrique. Journaliser
le rejet (avec les clés reçues) ne change pas le comportement et transforme un
défaut muet en défaut diagnosticable.

**Corollaire de test.** Le test qui couvrait la branche cassée assertait la forme
cassée (`expect.objectContaining({ translatedText })`). Un test écrit APRÈS
l'implémentation fige ce que le code fait ; il faut qu'il énonce ce que le
CLIENT lit. Récidive exacte du D4 du cycle 7.

## Leçon 256 — Un correctif qui ajoute une AUDIENCE doit hériter des bornes de l'audience voisine (2026-08-15, routine temps réel, cycle 23)

Le cycle 22 a ajouté au bon endroit la 3e audience de `message:translation` (les
lecteurs hors ligne) et a fermé un vrai trou. Mais il l'a livrée **sans le
filtre de langue** que la 2e audience — `emitConversationPreviewUpdate`, dans la
MÊME fonction, dix lignes plus bas — applique depuis toujours via
`onlyIfPreviewCarriesLanguage`. Résultat : `L × P` entrées en file là où `P`
suffisent, dont `L−1` illisibles par construction pour leur destinataire.

**La règle.** Quand on ajoute une audience à un événement qui en a déjà une,
la question n'est pas seulement « qui manque ? » mais « **quelles bornes les
audiences existantes portent-elles, et pourquoi ?** ». Une borne déjà écrite à
côté est une connaissance métier déjà payée ; ne pas l'hériter, c'est la
redécouvrir plus tard par le symptôme. Le voisinage physique dans le fichier est
ici le signal : deux `await` consécutifs sur le même événement, l'un borné,
l'autre non.

**Pourquoi c'est resté invisible.** L'entrée surnuméraire ne casse RIEN de
visible : le client la reçoit, la met en cache sous une clé
(`messageId_targetLanguage`) qu'il n'affichera jamais, et se tait. Il n'y a ni
erreur, ni log, ni test rouge. Le coût est ailleurs — dans la file **partagée
avec les vrais messages**, et surtout dans le repli mémoire plafonné à 50
entrées, où la dilution fait évincer de VRAIS messages au profit de traductions
illisibles. **Un défaut de VOLUME sur une ressource partagée se paie chez le
voisin, jamais chez le coupable** : c'est ce qui le rend introuvable par le
symptôme.

**Corollaire de prédicat — filtrer sur l'APPARTENANCE, jamais sur la TÊTE.**
La tentation est de ne servir que la langue de rang 1 du lecteur. Elle est
fausse : un prisme `['de','en']` a besoin de son entrée `en`, qui est son repli
le jour où la traduction allemande échoue. Un prisme est une CASCADE, et filtrer
une cascade sur son premier terme échange de la bande passante contre une
régression fonctionnelle silencieuse — visible seulement en cas d'échec partiel,
c'est-à-dire jamais en test nominal.

**Corollaire d'échec ouvert.** Un filtre bâti sur une donnée qui peut manquer
(ici un prisme non résoluble : invité anonyme, préférences vides) doit échouer
OUVERT. L'asymétrie des coûts le dicte : une entrée de trop est invisible, une
traduction perdue est un défaut produit. Écrire le cas « je ne sais pas » comme
« je n'envoie pas » transforme un trou de données en trou de fonctionnalité.

**Corollaire de détection généralisé (suite de la Leçon 255).** La leçon 255
prescrivait de vérifier la FORME des events à émetteurs multiples. Le balayage
mécanique de ce cycle l'a sortie verte partout — parce que l'émetteur Socket.IO
est TYPÉ : TypeScript interdit déjà la divergence de forme. Le prédicat utile
n'est donc pas « plusieurs émetteurs » mais « **plusieurs émetteurs dont au
moins un CONTOURNE le typage** » (nom d'event en littéral de chaîne). Affiner un
prédicat d'audit qui ne trouve plus rien vaut mieux que le relancer tel quel.

## Leçon 257 — Une autorisation se lit contre l'autorité à la LIVRAISON, jamais contre une copie prise à l'enfilement (2026-08-15, routine temps réel, cycle 26)

`enqueueForOfflineParticipants` décide l'audience de la file de rejeu au moment
où il enfile, sur l'appartenance de cet instant-là. `_drainPendingMessages`
livrait, jusqu'à 48 h plus tard, sans rien revérifier. Or **entre l'enfilement
et la livraison il y a exactement l'absence** — c'est-à-dire la fenêtre pendant
laquelle on quitte un groupe, s'en fait retirer, s'y fait bannir. Résultat : le
contenu d'une conversation livré après la fin de l'autorisation qui le
justifiait, et cette conversation ressuscitée dans une liste dont on venait de
la retirer.

**La règle.** Tout canal DIFFÉRÉ (file, rejeu, notification programmée, digest,
webhook retenté) sépare la décision d'audience de l'acte de livraison. Le droit
d'un destinataire à ce qu'il reçoit doit être évalué à l'instant le plus TARDIF
possible — la livraison — parce que c'est le seul instant où la réponse est
encore vraie. Une audience calculée en amont est une donnée périmée qui a l'air
d'une décision.

**Corollaire — une garde à la sortie vaut mieux que N purges à l'entrée.** La
réaction naturelle était de purger la file depuis chacune des quatre routes qui
mettent fin à une appartenance. C'est une cinquième copie d'une obligation qui
en comptait déjà quatre (la dérive exacte que `enqueueForOfflineParticipants`
documente après cinq réimplémentations), ça oublie la transition suivante par
construction, et ça garde une course résiduelle (un enfilement en vol juste
après la purge). Un point de sortie unique couvre les quatre routes ET celles
qui n'existent pas encore, sans qu'aucune ait à s'en souvenir. **Quand N
écrivains doivent honorer une garantie, l'implémenter chez le LECTEUR unique.**

**Corollaire de détection — le silence d'une capacité absente.** Ce qui a rendu
le défaut invisible n'est pas un oubli discret mais son contraire : les quatre
routes font toutes, visiblement et avec commentaire, le geste d'éviction de la
room. Une lecture qui les compare voit quatre fermetures cohérentes du canal
VIVANT et repart rassurée. Rien ne nommait le canal DIFFÉRÉ — pas même une
méthode de purge sur `RedisDeliveryQueue` qu'on aurait pu constater jamais
appelée. **Une capacité manquante ne laisse aucune trace à trouver ; on ne la
trouve qu'en énumérant les canaux depuis la GARANTIE, pas depuis le code.** Le
prédicat d'audit utile : « pour chaque transition d'autorisation, quels canaux
peuvent encore porter du contenu d'avant ? » — et la réponse doit inclure ceux
qui ne se déclenchent que plus tard.

**Corollaire d'asymétrie — ouvert sur la PANNE, fermé sur la RÉPONSE.** Une
garde d'autorisation posée devant une opération DESTRUCTIVE (ici le drain a déjà
vidé la file quand la garde s'exécute) ne peut pas être fermée sur l'erreur : ce
serait détruire l'arriéré de tout le monde à chaque hoquet de base — et une
tempête de reconnexions est précisément le moment où la base est sous pression.
Une RÉPONSE « non membre » fait autorité et doit être honorée ; une ABSENCE de
réponse n'autorise rien à conclure. Distinguer les deux n'est pas une faiblesse
de la garde : c'est ce qui l'empêche d'introduire un mode de perte de données
que l'état d'avant — ouvert à 100 % — n'avait pas.

**Corollaire de test (suite de la Leçon 255).** Deux témoins voisins prouvaient
« rien ne s'est passé » par l'ABSENCE d'appel à `prisma.participant.findMany`.
Ce prédicat cesse de prouver quoi que ce soit dès qu'un second appelant partage
ce mock. Un témoin qui asserte sur un mock PARTAGÉ doit nommer l'appel qu'il
vise (ici : la seule des deux lectures qui demande `select.bannedAt`), sinon il
se transforme en faux rouge — ou, plus tard et bien pire, en faux vert.
