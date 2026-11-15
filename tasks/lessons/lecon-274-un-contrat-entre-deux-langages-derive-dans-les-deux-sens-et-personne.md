## Leçon 274 — un contrat entre deux langages dérive dans les DEUX sens, et personne ne le lit jamais en entier (2026-08-24, cycle 124)

> **Rédigée 272, renumérotée 274.** Deux fois de suite `main` a pris le numéro visé pendant que
> ce lot attendait son vert — 272 pour la leçon 241i, puis 273 pour la leçon jumelle du même
> cycle 124. Le corollaire opératoire de la leçon 272 vise « l'écart entre rédiger et
> committer » ; la fenêtre réelle est plus large — **c'est l'ATTENTE DU VERT**, invisible depuis
> la branche, et elle dure aussi longtemps que la CI.

**Le constat.** Deux cycles de suite ont clos leur lot sur la même ligne, mot pour mot :
`prePersistMessage` (NSE iOS) lit `userInfo["content"]`, une clé que le payload push ne porte
pas. Deux fois nommé, deux fois différé au motif « Swift, non exerçable ici ».

Le motif était réel — et il ne couvrait que la moitié Swift. La moitié TypeScript n'avait
jamais été regardée, et la regarder prend une commande : lister les clés que la NSE LIT, lister
les clés que la passerelle ÉMET, et faire le diff.

> **Quatre clés lues jamais émises, deux clés émises jamais lues.**

Les deux plus instructives ne sont pas celles du suivi :

- `senderName` était lu par `prePersistMessage` alors que la passerelle émet
  `senderDisplayName` — que **la ligne 563 du MÊME fichier** lit correctement, pour le cadrage
  Communication. Deux lecteurs de la même donnée, dans le même fichier, dont un seul connaît le
  nom réel de la clé.
- `createdAt` et `messageType` sont émis depuis GW5 avec le commentaire « persistance NSE »,
  c'est-à-dire pour ce consommateur précis, et **il ne les a jamais lus**. La bulle était
  ordonnée par l'horloge du device.

> **Un helper à un appelant est un inventaire (leçon 271) ; un CHAMP à zéro lecteur est une
> intention.** La mesure du cycle 122 — « `translatedContent` n'est lu par aucun client » —
> passait pour l'anomalie d'un lot. C'est la forme NORMALE d'un contrat dont les deux moitiés
> vivent dans deux langages qu'aucun type ne relie : chaque côté est relu par des gens qui
> lisent ce côté-là.

### Corollaire — le correctif évident était le mauvais, et le cycle précédent disait pourquoi

Émettre `content` clôt le suivi en une ligne, et rouvre exactement la fuite que le cycle 123
venait de fermer : le texte NU d'un message protégé repartirait sur le canal push pendant que
la bannière affiche son placeholder. La passerelle a RAISON de ne pas l'émettre.

Ce qui débloque n'est pas d'ajouter la donnée manquante mais de remarquer qu'elle est **déjà
là** : le corps de la bannière EST le texte servi — descendu dans le Prisme, masqué s'il le
faut. Il ne manquait que sa LANGUE, et le DROIT de le prendre pour le message.

> **Devant un consommateur qui lit une clé absente, la question n'est pas « comment la lui
> envoyer ? » mais « qu'a-t-il déjà en main qui réponde à son besoin ? ».** La première mène à
> élargir la charge — donc à rouvrir ce que les gardes de confidentialité viennent de fermer ;
> la seconde mène à un discriminant.

### Corollaire — la PRÉSENCE d'un champ peut être le discriminant

`messageOriginalLanguage` n'est émise que quand le corps servi EST le contenu du message. Sa
présence autorise l'enregistrement local ; son absence l'interdit. Aucune énumération sur le
fil, aucun booléen à contredire, et le consommateur ne peut pas se tromper de branche : il n'a
pas de branche à choisir.

C'est la troisième projection de `PreviewPrismBasis` — le type du cycle 123 qui dit ce que
l'aperçu EST — après « qu'est-ce qui le TRADUIT ? » et « que transporte-t-on à CÔTÉ ? ». Un type
somme bien posé répond à plus de questions que celle pour laquelle on l'a écrit ; le chercher
avant d'ajouter un drapeau.

### Corollaire — écrire un placeholder dans une base locale n'est pas écrire un texte

Le corps servi peut être « ⏱️ 💬 24h », « 🎵 Audio · 0:34 » ou « Nouveau message ». Affiché
dans une bannière, chacun est correct ; **écrit dans la ligne `MessageRecord.content`, chacun
affirme que le message DIT cela** — et la bannière disparaît en trois secondes quand
l'enregistrement, lui, reste jusqu'à une synchro REST qui peut ne jamais venir.

> **Une bulle sans texte vaut mieux qu'une bulle qui ment.** Le repli d'un cache n'est pas le
> repli d'un affichage : le second est vu puis oublié, le premier est relu.

Même règle sur la LANGUE : l'ancien code écrivait `"en"` en repli sur un champ que le Prisme du
lecteur consulte ensuite. Un texte espagnol déclaré anglais n'est pas un défaut d'affichage,
c'est une fausse déclaration dans une source de vérité.

### La méthode, réutilisable telle quelle

Pour toute frontière entre deux langages (push, deep link, App Group, fichier partagé) :

```
clés LUES par le consommateur   \
                                 >  diff, dans les DEUX sens
clés ÉMISES par le producteur   /
```

Les deux listes s'obtiennent par `grep`. Le diff est la mesure — et **les deux directions
comptent** : les clés lues jamais émises sont des pannes, les clés émises jamais lues sont des
intentions perdues, et rien dans le code ne signale ni les unes ni les autres.

### Corollaire de harnais — ce qu'un script ÉCRIT n'est pas ce qu'on a voulu écrire

Le lot a été poussé avec une erreur de compilation Swift d'un seul caractère : la fin du fichier
de témoins portait `\n` LITTÉRAL (deux caractères, barre oblique inverse puis « n ») au lieu
d'une fin de ligne — un `+ "\\n"` d'un script Python lancé en heredoc, où l'échappement est
consommé DEUX fois (une par le shell pour le heredoc, une par Python).

Elle n'était pas rattrapable ici : aucune chaîne Swift dans le conteneur. Elle l'était en
revanche par une commande d'une seconde, et c'est elle qu'il fallait passer :

```bash
tail -c 20 <fichier> | od -c     # ce que le script a VRAIMENT écrit
```

> **Quand on génère du code par un script plutôt qu'en l'éditant, la relecture ne porte plus sur
> l'intention mais sur l'OCTET.** Un `Edit` montre son résultat ; un `python3 <<'PY'` ne montre
> que « appended ». La différence n'est pas cosmétique : c'est la seule couche où l'échappement
> peut se perdre, et elle est invisible à toute relecture du script lui-même.

La mesure consolante : le build iOS a rendu **2 erreurs, toutes deux ce caractère** — donc le
helper et ses quatorze témoins compilent. Un gate rouge qui ne nomme qu'une chose est un gate
qui a tout le reste au vert.

### Corollaire — deux passes qui divergent sur une CONCEPTION ne divergent pas sur la MESURE

Ce lot a convergé avec le cycle 124 (PR #3465), mergé sur `main` pendant qu'il était en CI. Les
deux passes ont instruit le même suivi, trouvé le même défaut, et posé **le même prédicat**
(base `message-content` + verrou `notificationLocKey` + garde `showPreview`). Elles ont divergé
sur une seule question, et c'est celle qui décidait tout :

> **Quel texte la NSE a-t-elle le droit d'enregistrer — celui qui est SERVI, ou celui qui est
> le message ?**

Cette passe répondait « le servi », et en tirait qu'il ne fallait PAS émettre `content` : le
texte nu d'un message protégé repartirait sur le canal push. **L'objection était fausse**, et
#3465 le démontre — le couple n'est posé que sous la garde qui existait déjà. La bonne question
n'était pas *« ce champ peut-il fuir ? »* mais *« sous quelle garde ? »*.

Et #3465 a raison sur le fond, pour une raison de MODÈLE : `MessageRecord.content` EST le champ
d'origine, `originalLanguage` son étiquette. Y écrire le texte servi produit un enregistrement
cohérent mais **faux sur sa propre sémantique** — un message espagnol traduit en français y
serait enregistré comme un message français.

> **Quand deux passes divergent, comparer d'abord les MESURES, pas les conclusions.** Ici les
> mesures étaient identiques ; tout l'écart tenait à ce qu'on croit qu'un champ SIGNIFIE. Une
> divergence de conception qui survit à une mesure commune est presque toujours une divergence
> sur le sens d'un nom.

**Ce que la passe perdante garde quand même** — et c'est la seule question utile après une
convergence :

- **la MÉTHODE** : le diff du contrat dans les DEUX sens, dont la moitié « émis, jamais lu »
  n'était nommée par personne — ni par les deux suivis, ni par #3465 ;
- **la JUMELLE** : #3465 pose son prédicat EN LIGNE dans `createMessageNotification`, quand les
  TROIS éventails pré-enregistrent une bulle. Extrait en site partagé, il sert les trois ;
- **les trois champs restants** (`senderDisplayName`, horodatage serveur, type du fil).

> **Une passe qui perd sa conception ne perd pas son lot.** Reprendre la conception gagnante EN
> ENTIER, puis se demander ce qui reste vrai par-dessus — c'est presque toujours non vide, et
> c'est ce qui distingue une convergence d'un abandon.

**Mesure de refactor obligatoire** : après avoir déplacé la garde de #3465 dans le helper
partagé, la mutation qui la retire fait tomber **7 témoins, dont les 4 de #3465**. Un refactor
qui déplace une règle doit prouver qu'elle tombe encore DEPUIS SON NOUVEAU SITE — sans quoi on
a déplacé le code et perdu la garde.

---
