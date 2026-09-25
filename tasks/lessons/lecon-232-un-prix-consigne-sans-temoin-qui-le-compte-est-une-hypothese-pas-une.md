## Leçon 232 — un prix consigné sans témoin qui le compte est une hypothèse, pas une donnée (2026-08-17, routine messagerie, cycle 63)

Le cycle 62 a fermé trois des quatre émetteurs de `conversation:unread-updated`
et rangé le quatrième — `broadcastReadStatus` — en **arbitrage de coût** :
« le corriger coûterait les 5 requêtes de la passe à CHAQUE accusé de lecture,
sur l'un des chemins les plus chauds du service ». Consigné comme un fait,
formulé comme un fait, et il a tenu un cycle entier.

Mesuré au cycle suivant, il était faux **deux fois**, et les deux erreurs sont
génériques :

1. **« à chaque appel » ignorait les gardes du site d'appel.** Le gate à zéro
   non-lu — que les deux émetteurs frères portaient déjà — range le cas
   DOMINANT du côté gratuit : lire une conversation la vide, la passe n'est pas
   appelée, et l'effacement y est correct. Seul le cas RARE paie.
2. **« 5 requêtes » était le coût NOMINAL de la passe, pas le coût de son appel
   ICI.** L'appelant lisait déjà le curseur pour calculer le compteur qu'il
   émet — exactement celui que la passe irait relire. Passé en paramètre, il
   fait tomber le prix à 4, et donne au passage une garantie qu'aucune des deux
   lectures séparées n'offrait : pont et compteur du même événement calculés sur
   le MÊME instantané de curseur.

La règle :

> **Le coût nominal d'une opération n'est pas le coût de son appel sur un chemin
> donné.** Les gardes du site d'appel et ce que l'appelant tient DÉJÀ en main en
> font partie. Un prix estimé hors de son site d'appel surcompte
> systématiquement — et il surcompte dans le sens qui fait NE PAS livrer.

Corollaire opérationnel, et c'est lui qui coûte le moins cher à appliquer :
**quand un carnet de pistes porte un chiffre qui a servi à ne pas livrer, le
cycle qui reprend la piste commence par écrire le témoin qui compte.** Un témoin
de compteurs Prisma coûte une heure ; il a ici renversé un arbitrage vieux d'un
cycle, et il reste ensuite comme garde de non-régression — la mesure ne se perd
pas, contrairement à l'estimation.

Deux notes de méthode, tirées du même lot :

- **Vérifier qu'un témoin de coût garde bien ce qu'il semble garder.** Celui du
  cas gratuit ne tombe PAS quand on retire le gate du site d'appel : la
  gratuité tient par deux gardes indépendantes (le site d'appel, et le premier
  étage de la passe). Le témoin reste juste — le prix EST nul — mais c'est le
  témoin de COMPORTEMENT qui garde l'intention. Mesuré sous mutation, consigné
  dans le fichier, plutôt que laissé à découvrir.
- **Une économie de requête peut valoir surtout par sa cohérence.** Ne pas
  relire une donnée qu'on tient supprime aussi la fenêtre pendant laquelle une
  écriture concurrente ferait diverger les deux lectures. L'argument de
  justesse survit à l'argument de performance ; le citer d'abord.

### Quand deux sites doivent choisir entre deux mensonges, le défaut est dans le VOCABULAIRE

La piste n°1 du cycle 62 était formulée comme un arbitrage de PRIX : « le pont
devrait être recalculé ici, il est effacé à la place ; le corriger coûterait la
passe à chaque accusé de lecture ». Trois cycles auraient pu se perdre à mesurer
ce coût. La vraie question était ailleurs : **le contrat savait-il seulement
dire ce que ce site voulait dire ?** Il ne le savait pas — `bridge` avait deux
formes de fil (présent / absent) pour trois faits (voici / il n'y en a pas / je
n'ai pas calculé). Chaque émetteur était donc forcé de choisir entre deux
mensonges, et le débat glissait naturellement vers le prix du moins pire.

Règle : devant une piste énoncée comme « corriger ici coûterait N requêtes »,
poser d'abord « que SAIT-ON, au juste, et le contrat peut-il l'exprimer ? ».
Ici la réponse a fermé la piste à ZÉRO requête — le serveur n'a besoin d'aucune
lecture pour savoir que l'acte qu'il diffuse vient d'invalider le pont qu'il
annonce.

### Le sens du SILENCE doit être le sens INOFFENSIF

Corollaire structurel du même lot. Un protocole où l'OMISSION détruit fabrique
un défaut à chaque émetteur qui n'a pas été mis au courant — et ces émetteurs-là
ne se signalent JAMAIS, puisque leur code ne change pas et que leurs témoins
restent verts. Le cycle 62 a corrigé un émetteur ; il en restait quatre.

Inverser la polarité (l'effacement devient un ACTE EXPLICITE, `null` ; le
silence ne fait plus rien) ne corrige pas un défaut de plus : ça retire à la
classe entière son terrain. Un émetteur futur qui ignore tout du champ ne peut
plus détruire par omission. Préférer systématiquement cette inversion à la
correction site par site — elle coûte le même lot et elle ferme la classe.

Compatibilité, au passage : la valeur EXPLICITE doit reproduire ce que les
clients déployés faisaient déjà face au silence. Ici `null` = « efface », ce que
les clients faisaient de l'omission — donc aucune migration, aucun drapeau, et
un client ancien reste correct partout où l'effacement est voulu.

### Un correctif qui BORNE son travail doit dire ce qu'il advient de ce qui est HORS borne

Le cycle 62 a plafonné sa passe de ponts à une page de liste, et a écrit — dans
le code et dans son carnet — que « les conversations plus anciennes gardent leur
compteur exact ; seul leur pont attend le prochain `GET /conversations` ».
Le code ne différait pas ce travail : il l'ANNULAIT. Hors borne, l'émission
sortait la forme courte, que les clients lisent comme un ordre d'effacement.
La borne avait donc troqué un effacement GLOBAL contre un effacement de la
QUEUE — sans qu'aucun témoin ne puisse le voir, la charge émise étant
RIGOUREUSEMENT identique dans les deux cas.

Règle : quand on pose une borne, le témoin à écrire n'est pas « ce qui est DANS
la borne est traité » — c'est **« ce qui est DEHORS est INTACT »**. Et si les
deux cas produisent la même sortie observable, la borne n'est pas bornée : elle
est destructrice, et il manque un état au contrat.

### Un flake qui ne rougit jamais SEUL est un budget, pas une régression

Piste ouverte quatre cycles (« le flake non identifié de `packages/shared` »),
fermée en trois runs. `behaviour-matrix.test.ts` parcourt le dépôt ENTIER en
synchrone : ~4,2 s de temps de test contre le `testTimeout` de 5 s par défaut de
Vitest. Seul il passe ; en suite complète, les 82 autres fichiers se disputent le
CPU et il dépasse.

Deux marqueurs suffisent à reconnaître la classe et à éviter la chasse au
fantôme : (1) le message est « Test timed out », qui ne désigne AUCUNE
assertion ; (2) le test passe isolément, de façon reproductible. Alors ne pas
chercher une régression — MESURER le temps du test seul et le comparer au
timeout. Et retenir que la marge de ces témoins-là se resserre à CHAQUE fichier
de test ajouté au dépôt : un lot un peu large les fait tomber sans les toucher.

### Deux passes sur la même piste : intégrer les DEUX moitiés, pas choisir un gagnant

Le 2026-08-17, deux passes de la routine ont traité la piste n°1 du cycle 62 le
même jour, sans se voir. L'une (`…-ndx3vw`) a RECALCULÉ le pont de la lecture
partielle sur le curseur qui venait de bouger ; l'autre (`…-mz6seg`) a donné au
contrat le VOCABULAIRE qui lui manquait (le troisième état, « je n'ai pas
calculé »). Le conflit git portait sur cinq lignes du même émetteur.

Le réflexe — garder « sa » version, ou prendre celle d'en face en bloc — aurait
perdu la moitié du travail dans les deux sens. Elles répondaient à des questions
différentes qui se ressemblaient :

- le recalcul montre qu'un pont JUSTE vaut mieux que pas de pont ;
- le vocabulaire montre qu'un incident de passe ne doit RIEN détruire.

Sans le premier, le site rendait `null` là où un pont exact était calculable
pour quatre requêtes. Sans le second, `undefined` sur une passe TOMBÉE effaçait
le pont en cache — la posture best-effort revendiquée par les quatre émetteurs
(« le pont est un confort, la pastille est le produit ») n'était pas tenue.

Règle : devant un conflit entre deux lots qui visaient la même piste, ne pas
arbitrer sur l'auteur ni sur l'ancienneté. Écrire ce que CHAQUE version rend
possible et que l'autre ne rend pas — si les deux listes sont non vides, la
résolution est une composition, pas un choix. Ici : implémentation de l'un,
grammaire de l'autre.

Corollaire, sur son propre raisonnement : ce lot avait argumenté que garder
l'ancien pont est faux (vrai, le pont porte son propre `unreadCount`) et en
avait conclu qu'il fallait l'effacer. La démonstration était juste et la
conclusion trop courte — **montrer qu'une option est mauvaise ne prouve pas que
la sienne est la meilleure**, seulement qu'il en reste au moins une autre.

### Les deux discriminants qui trahissent un troisième état (addendum, cycle 63 ter)

Le troisième état ne tient que si les LECTEURS savent le lire. Deux pièges, un
par plateforme, et aucun ne se signale à la compilation :

1. **Swift — `decodeIfPresent` seul ne peut PAS porter la distinction.** Il rend
   `nil` pour une clé absente comme pour un `null` explicite : il aplatit
   exactement les deux formes qu'on vient de séparer. Le discriminant est
   `container.contains(.bridge)`.
2. **JS — le discriminant est la PRÉSENCE de la clé (`'bridge' in data`), pas sa
   valeur.** `undefined` et l'absence sont indiscernables à la lecture d'une
   propriété. Corollaire de test, à connaître : un payload fabriqué en mémoire
   avec `bridge: undefined` PORTE la clé, donc il efface — sur le fil la
   question ne se pose pas, JSON ne transportant pas `undefined`.

Et un corollaire de témoins, jumeau de la leçon 231 : un témoin qui fige le
payload ENTIER alors qu'il parle de la room, du lecteur ou du compteur **gèle une
forme dont il ne parle pas**. C'est le mécanisme exact qui a laissé la forme
courte devenir destructrice sans qu'aucune couleur ne change. `objectContaining`
pour ce dont le témoin parle ; la forme du contrat a ses propres témoins.
