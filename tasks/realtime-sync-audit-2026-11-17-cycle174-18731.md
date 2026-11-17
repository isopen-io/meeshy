# Cycle 174 — le curseur affirmait un préfixe qu'il n'avait pas vérifié, et la mutation a trouvé le témoin manquant

*2026-11-17. Branche `claude/exciting-planck-8rzxd0`, repartie de la tête de
`dev` (`7c431fd73`). Nom de fichier suffixé par son issue, comme aux cycles 171
à 173 — un nom de fichier partagé FUSIONNE en silence (#18632).*

*Numéro 174 : relevé sur TOUT ce que les sessions ont écrit — journaux (`173`
deux fois, suffixés par leurs issues) ET issues — jamais sur un compte de
fichiers. Leçon du cycle 173.*

**Livré** : #18731 — le curseur de livraison devient le préfixe CONTIGU de la
remise.

---

## Le relevé avant d'écrire

La directive de la branche poussée tôt se LIT, pas seulement s'émet. Avant la
première ligne :

- `git diff --name-only origin/dev...<branche>` sur les 25 branches les plus
  récentes ⇒ **aucune** n'écrit `MessageReadStatusService.ts`,
  `read-exactness.ts` ni `freezeMessageStatus.ts` ;
- `git log --all --grep="#18731"` ⇒ cité par le lot de #18701, jamais pris ;
- PR ouvertes ⇒ #19245 (brouillon) couvre la famille notifications/push
  (#19210–#19226), hors de ce chemin.

Puis **commentaire d'allocation publique sur l'issue avant d'écrire** — la
primitive adoptée au cycle 172, parce qu'un numéro d'issue est un espace de noms
que personne n'alloue.

Le cycle 173 avait laissé #18731 « désormais instruisable ». Sa raison était
bonne et sa prémisse à moitié fausse : il pensait que le coût à arbitrer était
une requête de relecture sur le chemin de reconnexion, à payer faute de savoir à
quelle fréquence le déclencheur se produit. En ouvrant le site, le coût s'est
révélé **déjà payé par la lecture** — et l'asymétrie n'était pas où l'issue la
plaçait.

---

## Le défaut n'était pas entre deux modules, il était entre deux lignes

L'issue décrit « ce qui est SERVI » (corrigé par #18701) contre « ce qui est
ÉCRIT ». Ouvert, le défaut est **interne à `markMessagesAsReceived`, entre deux
écritures du MÊME appel** :

| écriture | périmètre, depuis #18614 |
|---|---|
| `freezeMessageStatus({ messageIds })` | l'ensemble EXACT des messages remis |
| `_advanceCursor({ messageId })` | le plus RÉCENT de l'accusé, **sans regarder ce qu'il franchit** |

#18614 a rendu le GEL exact et n'a pas touché au CURSEUR. Les deux écritures du
même appel ont alors cessé de parler du même ensemble — et `resolveReceivedAt`
lit le curseur **en repli du gel**, donc pour un message sans entrée figée,
c'est l'approximation qui décidait.

Le scénario n'exige aucune panne : le `LTRIM` à 500 de `RedisDeliveryQueue`
évince les arrivées les plus anciennes AVANT le drain, qui ne les voit jamais.
M1 (10:00) évincé, M2 (10:05) parti, drain à 11:00 ⇒ le curseur porte la
position de M2, POSTÉRIEURE à M1. **Le trou est sous la borne, quelle que soit
la borne choisie.** Seule la contiguïté le voit — et c'est ce que la LECTURE
faisait déjà, depuis `computeContiguousReadPrefix`.

## La forme

`_computeExactDeliveredCursorTarget`, jumelle exacte de
`_computeExactReadCursorTarget`. Trois décisions la portent, et chacune est un
arbitrage, pas une mécanique :

| décision | pourquoi |
|---|---|
| **le gel d'abord, le curseur ensuite** | `if (!advanced) return 0` faisait dépendre l'écriture DURABLE du verdict de fraîcheur de son INDEX. Un accusé que la garde écarte ne gravait rien — y compris les messages qu'il était le seul à nommer |
| **la preuve est l'entrée FIGÉE, jamais la liste rapportée** | une liste déclarée est un sous-ensemble strict du réel ; et le gel est best-effort (rend `0` sans jeter), donc croire la liste ferait avancer le curseur sur une preuve non écrite. **Fail-closed sur l'index, jamais sur la donnée durable** |
| **la fenêtre s'ancre sur la POSITION** | ancrer sur `lastDeliveredAt` (11:00) exclurait M1 (10:00) : la mutation la plus plausible du lot rouvre exactement le trou qu'il ferme |

`computeContiguousReadPrefix` a perdu son `Read` : la fonction était déjà
générique, et les deux curseurs s'en servent pour la même raison. Un nom qui ne
nomme qu'un de ses deux usages est une invitation à en écrire une jumelle.

Les quatre appelants EN LIGNE gardent la FENÊTRE. Le discriminant reste
`options?.messageIds` — la distinction `bridgeComputed` / `bridgeNotComputed`,
jamais une longueur.

---

## Ce que ce cycle a appris, et qui vaut plus que le lot

### Une mutation qui ne rougit pas accuse le TÉMOIN avant d'absoudre le code

Sept mutations ont été jouées. Six ont rougi. La septième — remplacer
`messageId: target` par `messageId` dans l'avance — est restée **verte**, et
c'était juste : avec un préfixe VIDE, `if (target)` porte à lui seul tout le
verdict, donc la valeur passée ne change rien. Le témoin principal du lot
n'exerçait **que le préfixe vide**.

Le cas manquant est le préfixe **PARTIEL** — M1 prouvé, M2 non, M3 rapporté —
la seule forme où la CIBLE se distingue du plus récent, et la plus plausible en
production (un drain après un trou ancien). Il est désormais couvert, et M2
rougit.

> **Une mutation verte est une mesure, pas un soulagement.** Elle dit soit « la
> ligne est morte », soit « le témoin ne l'atteint pas » — et la seconde est de
> loin la plus fréquente. La question à lui poser n'est pas « le code
> est-il bon ? » mais **« quelle forme d'entrée ferait cette ligne compter, et
> l'ai-je écrite ? »**. C'est la version exécutable de « un témoin de RANG
> s'écrit sur un rang AUTRE que le premier » (leçon 261) : au rang trivial, la
> règle juste et la règle fausse rendent le même verdict.

### Et une mutation se vérifie APPLIQUÉE avant d'être lue

Trois des sept premières mutations ont d'abord rendu « vert » sans avoir été
appliquées du tout — le motif `perl` ne matchait pas, ou matchait la JUMELLE
(`_computeExactReadCursorTarget`, trente lignes plus haut, dont le corps est
presque identique). Un lot qui ajoute une jumelle rend tout remplacement textuel
ambigu **par construction**, et l'ambiguïté se résout du côté qui rassure.

La forme juste ancre le remplacement sur le nom de l'unité visée et **échoue
bruyamment** quand elle ne trouve pas sa cible (`assert old in tail`). Même
famille que « un gate rend DEUX verdicts » : un outil de mesure qui ne peut pas
dire « je n'ai rien fait » rend toujours le verdict qu'on espérait.

### Un doc-comment qui EXEMPTE se relit quand un appelant change

`FreezeMessageStatusParams.messageIds` portait « Réservé à `readAt` : un message
récupéré est livré même s'il n'a jamais été affiché, **donc la fenêtre reste
correcte pour `deliveredAt`** ». Faux deux fois : #18614 l'a ouvert à
`deliveredAt` sans relire la phrase, et sa justification ne vaut que pour un
lecteur EN LIGNE — elle est fausse du rejeu hors ligne, c'est-à-dire du défaut
que #18614 corrigeait. La phrase affirmait l'absence du défaut, posée sur le
paramètre qui le corrigeait.

C'est la famille des affirmations (cycles 86 bis, 93, 94, 107) avec la variante
du cycle 107 bis : elle n'était pas fausse au départ, elle l'est DEVENUE — et un
doc-comment ne rougit jamais.

---

## Preuve

- `MessageReadStatusService.contiguousDeliveryCursor.test.ts` : **10 témoins
  verts**, 6 prouvés rouges avant implémentation (les 4 autres sont les gardes
  de non-régression : le gel a lieu, la remise contiguë avance, le mode fenêtre
  est intact), **7 mutations rouges** après ;
- `src/__tests__/unit/services` + `read-exactness` : **12 634 verts**, 686
  suites ;
- `src/socketio` + `src/__tests__/unit/socketio` : **3 660 verts**, 269 suites ;
- `tsc --noEmit` **EXIT=0**, lu comme code de sortie et jamais à travers un pipe.

**2 échecs PRÉEXISTANTS, hors périmètre** : `UploadProcessor.heif-conversion`.
Vérifié par `git stash` — ils échouent à l'identique sans ce lot, le conteneur
n'ayant pas le support codec HEIC de `sharp`. Même constat qu'au cycle 173, sur
un sous-ensemble plus petit.

## Suivis

- **La fenêtre du gel en mode FENÊTRE s'ancre sur `lastDeliveredAt`**, l'horloge
  murale — `freezeMessageStatus({ since: prevDeliveredAt })`, trois sites.
  **Instruit avant d'être recopié**, parce qu'un suivi hérité est une
  AFFIRMATION (leçon du cycle 107), et la première rédaction de ce paragraphe
  disait « sans conséquence mesurée ». Mesure :

  | chemin | invariant |
  |---|---|
  | FENÊTRE pur | **tenu** — la borne HAUTE est `at`, qui devient la borne BASSE du suivant. Aucun trou |
  | EXACT | **rompu** — l'ack fige un SOUS-ENSEMBLE et pousse quand même l'horloge à `now` |

  Donc le trou n'existe que là où un ack avance l'horloge sans avoir figé toute
  la fenêtre qu'elle recouvre, c'est-à-dire sur le seul chemin EXACT. Et ce lot
  le DÉPLACE sans le créer : avant lui, le curseur sautait toujours à `now`, et
  un M1 évincé était perdu pour le gel à jamais ; après lui, le préfixe VIDE
  n'avance plus rien, donc la fenêtre suivante le recouvre et le GUÉRIT. Reste
  le préfixe PARTIEL — cible M1, trou M2 — où la position (10:00) et l'horloge
  (11:00) divergent : le gel fenêtre suivant part de 11:00 et saute M2.

  Impact BORNÉ, et il faut le dire : `resolveReceivedAt` a `readAt` en dernier
  repli, et le gel de LECTURE part d'un curseur de lecture distinct ; un M2 lu
  récupère donc son `receivedAt`. L'écart ne vit que dans l'état « remis, pas
  encore lu ». Le correctif est d'ancrer la fenêtre sur la POSITION, comme ce
  lot vient de le faire pour le balayage — strictement plus large, donc sûr, le
  gel étant write-once. **Issue #19261**, pas corrigé ici : ce lot gouverne le
  curseur, celui-là gouverne la fenêtre du gel, et mêler les deux rendrait la
  mesure « rien n'a été perdu » invérifiable.
- **Un participant SANS curseur balaie depuis le début de la conversation**, et
  les messages antérieurs à son arrivée y sont des trous permanents. Son curseur
  de livraison démarre donc par le chemin EN LIGNE, pas par le drain. Ancrer sur
  `Participant.joinedAt` ou sur `historyFloorFor` coûterait une lecture et une
  dépendance à une loi d'accès fail-closed ; l'issue ne le demande pas.
- **Toujours pas de transaction** entre l'avance et le gel. Le lot en retourne
  la portée : un processus qui meurt entre les deux laisse désormais le GEL
  écrit et le curseur en retard, là où l'ancien ordre laissait un curseur en
  avance sans entrées. Le second trou mentait, le premier se tait.
