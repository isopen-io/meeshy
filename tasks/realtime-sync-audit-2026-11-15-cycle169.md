# Cycle 169 — le site était gardé, et c'est le MOMENT qui ne l'était pas

*2026-11-15. Branche `claude/exciting-planck-jexwib`, repartie de la tête de
`dev` (`c9de00aeec`).*

**Livré** : #18615 — le plancher d'historique relu au DRAIN, pas seulement à
l'enfilement.

---

## Comment le cycle a été ouvert, et ce qu'il a CÉDÉ

Le relevé de départ est parti du suivi explicite du cycle 165, qui laissait six
issues derrière lui. La première candidate était #18623 — les deux canaux
frères, `transcription:ready` et `audio-translation:*`, que l'audit adversarial
du lot précédent avait mesurés non gardés **dans la même fonction**.

Le relevé des PR ouvertes a rendu **#18656, sur la branche sœur
`claude/exciting-planck-kexumt`, ouverte à 13 h 00, titre « …appliquent le
plancher d'historique (Closes #18623) »**. Ce cycle n'avait alors rien écrit :
règle de tranchage du dépôt — **celui qui n'a rien écrit cède** — donc #18623
est abandonnée sans négociation, et le cycle prend la jumelle que personne ne
revendiquait. La décision se lit depuis ce que git et GitHub montrent, elle ne
se discute pas.

## Le constat

#18613 (cycle 165) a posé le plancher là où il MANQUAIT : `attachment-updated`
était le cinquième porteur de texte déclaré et le seul à ne jamais interroger la
loi. Celle-ci porte sur autre chose — non pas le SITE qui pose le plancher, mais
le **MOMENT où tous le posent**.

| producteur | pose le plancher | quand |
|---|---|---|
| `broadcastMessageMutation` | oui | à l'enfilement |
| `deliverTextTranslation` | oui | à l'enfilement |
| `emitAttachmentUpdated` (#18613) | oui | à l'enfilement |
| **le DRAIN** | **non** | — |

Le drain ne relisait que `isActive` et `bannedAt`. Et son propre doc-comment
énonçait, depuis l'origine, la règle qu'il n'appliquait pas :

> « Une autorisation se lit donc contre l'autorité au dernier instant possible,
> jamais contre une copie prise à l'enfilement. »

C'est la forme du cycle 165 rejouée : **un commentaire juste qui décrit un site
qui ne l'est pas** — sauf qu'ici le commentaire ne décrit pas le voisin, il
décrit l'unité QU'IL COIFFE.

## Pourquoi l'enfilement ne peut pas suffire

Le plancher est MUTABLE vers le haut : `PATCH …/participants/:id/rights` accepte
`historyVisibleFrom: string | null`, et **`null` RÉVOQUE l'octroi**. Le
discriminant est celui que le dépôt nomme déjà (§ « Une règle appliquée à
l'ÉCRITURE n'est pas appliquée ») : *quand ce que la règle décide change plus
souvent que le moment où elle s'exécute, la décision persistée est un état FAUX
jusqu'à la prochaine écriture.* Une entrée vit 48 h ; un octroi se révoque en
une requête.

**Et rien ne compense — c'est ce qui distingue cette garde de celle de
l'appartenance.** Les quatre routes qui mettent fin à une participation SORTENT
les sockets de la cible de `conversation:<id>` : le canal vivant se ferme à
l'instant même, et seule la file survit. Une révocation de plancher n'expulse
aucune socket, ne touche pas la file, et n'invalide rien. Il n'y a de mécanisme
en face à AUCUN étage.

## Ce que le lot a découvert en l'écrivant, et qui a corrigé sa propre mise en scène

Le premier jeu de témoins mettait en scène un **membre ordinaire** dont l'octroi
est révoqué. Quatre témoins de garde sur cinq restaient VERTS, et ils avaient
raison : `historyFloorFor` règle le rang iv par « rien ne borne qui n'est entré
par aucun lien » — un membre entré sans lien n'a **aucun** plancher, donc lui
révoquer son octroi ne lui retire rien.

La forme qui porte la question est l'**invité de lien dont le lien ferme
l'historique** et à qui un administrateur a accordé la vue depuis une date :
révoquer, c'est le faire retomber sur son `joinedAt`.

> **Une garde ne se met pas en scène depuis son énoncé, mais depuis la loi
> qu'elle interroge.** « L'octroi est révoqué » est le geste ; il ne produit un
> plancher que posé sur une participation que quelque chose borne déjà. Le
> témoin qui ne tombe pas sous la mutation qu'il nomme dit, ici, que la fixture
> est hors de la question — pas que la garde est inutile.

## Trois lectures, trois propriétaires, et les postures DIVERGENT

| lecture | possédée par | échec |
|---|---|---|
| la ligne PARTICIPANT | partagée par les deux gates d'autorisation | **OUVERT** — arbitrage d'origine, INCHANGÉ |
| la ligne du LIEN | le gate de plancher | **FERMÉ**, borné aux participations dont le lien décidait |
| la DATE du message | le gate de plancher | **FERMÉ**, borné aux conversations qui ONT un plancher |

Le fail-OPEN de la première n'a pas été touché, et c'est délibéré : **on ne
change pas en silence la posture d'une lecture qu'on emprunte.** Sous cette
panne-là, ce que le plancher laisserait passer est de toute façon strictement
INCLUS dans ce que l'appartenance laisse déjà passer — le même échec rejoue déjà
l'arriéré des conversations quittées.

Le fail-CLOSED des deux autres est la posture des PRODUCTEURS sur la même
question (`messageReadership` → `'unknown'` n'émet rien et n'enfile rien). Il
est payable pour une raison mesurable : **il n'est payé que par les lecteurs qui
ONT un plancher.** Un membre, un administrateur, un rôle de plateforme
privilégié n'en ont aucun, et le lot entier passe sans qu'une date soit
regardée.

## La leçon du cycle : une lecture PARTAGÉE n'impose pas une posture PARTAGÉE

Deux gardes du rejeu interrogent la même ligne `Message` : la VIVACITÉ (#16685,
« ce message existe-t-il encore ? ») et le PLANCHER (« ce message est-il
lisible par CE lecteur ? »). La seconde ne demande qu'une colonne de plus
(`createdAt`) sur une requête que la première fait déjà, et le drain est le
chemin de la tempête de reconnexions : la partager était évident.

Ce qui ne l'était pas : **les deux arbitrent la même absence à l'OPPOSÉ.**

| garde | ce qui manque | verdict |
|---|---|---|
| vivacité | la preuve que le message est MORT | fail-OPEN |
| plancher | la preuve que le message est LISIBLE | fail-CLOSED |

Les enfermer dans un `catch` commun aurait imposé au second la posture du
premier écrit — et c'est le fail-open qui aurait gagné, la vivacité existant
d'abord. **La garde de confidentialité qu'on ajoute aurait été désarmée par la
lecture qu'on lui a fait partager, sans qu'un seul témoin ne tombe.**
`queuedMessageFacts` rend donc `'unreadable'` et ne décide RIEN ; chaque
consommateur arbitre chez lui. Détail :
`tasks/lessons/2026-11-15-une-lecture-partagee-n-impose-pas-une-posture-partagee.md`.

## Preuves

| preuve | résultat |
|---|---|
| mutation par mutation (7 mutations) | voir le tableau ci-dessous |
| `src/socketio` | **151 suites / 2 499 témoins** (150 / 2 475 au cycle 165) |
| `tsc --noEmit` gateway | **EXIT=0**, lu hors pipe |

### Le ROUGE, UNE MUTATION À LA FOIS

C'est la mesure que le cycle 165 a nommée — *un ROUGE en BLOC prouve qu'au moins
une garde porte, jamais que chacune porte* — et elle a payé du premier coup :

| mutation de production | témoins qui tombent |
|---|---|
| la garde ENTIÈRE retirée | 12 |
| le court-circuit « aucun plancher » rendu inconditionnel | 12 |
| le fail-closed sur LIEN illisible retiré | 1 |
| le fail-closed sur lecture TOMBÉE retiré | 1 |
| le fail-closed sur ligne ABSENTE retiré | 1 |
| la borne rendue EXCLUSIVE (`<=`) | 1 |
| **le cadrage texte de l'arbitrage PAR ENTRÉE retiré** | **0 → 1** |

**La septième ne faisait tomber personne**, et la cause n'était pas une garde
décorative : un lot fait UNIQUEMENT d'annonces de mort sort au court-circuit du
dessus et n'atteint jamais cet arbitrage. Les deux cadrages ont l'air de se
doubler ; ils gardent deux choses — le court-circuit garde le COÛT, celui-ci
garde le VERDICT. Le cas qui les sépare est le lot **MIXTE** (une édition et une
suppression du même message, soit le cas NORMAL d'une absence), et rien ne le
couvrait : sans ce témoin, la suppression d'un message sous plancher aurait
disparu pour toujours.

> **Deux gardes qui expriment la même condition à deux endroits ne sont
> redondantes que sur les entrées qui atteignent les deux.** La mutation qui ne
> fait tomber personne nomme exactement l'ensemble qui n'atteint que la
> première.

## L'audit adversarial, et ce qu'il a changé

Le lot est un lot de CONTRÔLE D'ACCÈS : il passe par `auditeur-adversarial`
avant fusion (directive porteur du 2026-10-03). Verdict rendu : **À CORRIGER**,
« non bloquant pour la confidentialité, bloquant pour la disponibilité ». Aucun
chemin par lequel du texte sous plancher sort encore du drain n'a été trouvé —
mais deux choses que le lot PERDAIT, et une affirmation fausse.

### Le constat qui comptait : les trois raisons n'étaient pas de même nature

Le lot faisait passer ses trois `reason` par la même branche, hors de
`dropEntry`, sous la justification « il n'y a rien à faire relire au client ».

| `reason` | ce que la garde SAIT | la phrase est-elle vraie ? |
|---|---|---|
| `below-history-floor` | le message EST sous le plancher | **oui** |
| `floor-unreadable` | on ne sait pas quel est le plancher | **non** |
| `message-date-unreadable` | on ne sait pas de quel côté il tombe | **non** |

Les deux dernières sont des aveux d'IGNORANCE, donc des **pertes** — le drain
est destructif, l'entrée a déjà quitté Redis. Leur conversation n'étant nommée
nulle part, une panne transitoire (base sous pression, secondaire en retard)
faisait perdre DÉFINITIVEMENT et en silence tout l'arriéré texte d'un lecteur
borné. **C'est l'arbitrage que le gate d'appartenance a explicitement refusé
d'avoir — « échangerait une fuite rare contre une perte probable » — que le lot
réintroduisait un étage plus bas.**

Et la correction ne coûte aucune confidentialité : la relecture REST passe par
`historyFloorClause`, donc elle ne peut pas servir ce que la garde vient de
refuser.

> **Un refus et une perte se journalisent, se signalent et se récupèrent
> différemment — et un code de raison qui les range ensemble les rend
> indistinguables pour tout le code en aval.** La question à poser à une garde
> fail-closed n'est pas seulement « refuse-t-elle au bon moment ? » mais
> **« sait-elle POURQUOI elle refuse, et l'appelant peut-il encore le
> savoir ? »**

### Et mon témoin du troisième signal NE POUVAIT PAS TOMBER

Il assertait `count > 0` vide dans une scène où `pending-messages:delivered`
**n'est pas émis du tout** (`authorized.length === 0` ⇒ `return`). L'audit l'a
mesuré en exécutant la mutation : pousser les refus dans `undelivered` — c'est
l'inverse exact de ce que le témoin prétendait garder — **ne faisait tomber
aucun des 1 396 témoins du sous-arbre.**

C'est la leçon 261 dans sa forme la plus nue : *l'assertion passait pour une
raison qui n'était pas celle qu'elle nommait.* La scène juste est un lot MIXTE
sur DEUX conversations, où l'événement EST émis, avec `conversationIds` assert
en ÉGALITÉ — et la propriété tombe désormais dans les **deux** sens (M8 : un
refus prouvé qui nomme ; M9 : une ignorance qui se tait).

### Les trois autres, corrigées dans la même passe

| # | constat | correction |
|---|---|---|
| C2 | « ne compte dans AUCUN des trois signaux » est faux du troisième : `freezeMessageStatus` gèle `deliveredAt` par FENÊTRE DE TEMPS, donc un message refusé est marqué remis par l'avancée du curseur d'un VOISIN | c'est **#18614**, antérieur et hors périmètre — nommé sur place pour que le commentaire ne promette plus ce que `freezeMessageStatus` défait |
| C4 | « elle n'en coûte AUCUNE requête » est faux : `HISTORY_FLOOR_PARTICIPANT_SELECT` porte `user`, une **RELATION** (pas un composite), que le connecteur Mongo charge par une requête de plus | l'affirmation est corrigée — une lecture `User` par drain, non retirable (rôle plateforme, rang ii), assumée et nommée |
| C5 | la lecture des faits de message, posée AVANT le gate d'appartenance, remettait dans la requête les ids des conversations quittées ou bannies — l'inverse de ce que le commentaire d'ordre du drain revendique | elle vit désormais ENTRE les deux gates, et l'appelant REÇOIT les faits |
| C6 | `participations.length === 0` : mort chez son appelant, mais fail-OPEN pour un second appelant d'une fonction EXPORTÉE | retiré (il était déjà redondant — `loadHistoryFloorsOrFail([])` rend vide sans requête) |

Deux constats appellent un lot à eux et sont devenus des issues : **#18680**
(une perte de rejeu n'est récupérable que sur le WEB — iOS et Android
n'écoutent pas `pending-messages:delivered`, donc le mécanisme que ce lot vient
de réparer ne profite qu'à un client sur trois) et **#18681** (le rejeu révèle
l'EXISTENCE d'un message sous plancher par les familles sans texte, ce qui
demande un verdict de produit et non un correctif).

## Ce que le cycle a CÉDÉ ou n'a pas pris

| # | ce que c'est | pourquoi pas ce lot |
|---|---|---|
| #18623 | les deux canaux frères non gardés | **cédé** — PR #18656 de la branche sœur, ouverte avant toute écriture d'ici |
| #18614 | le drain accuse la remise par FENÊTRE DE TEMPS | autre sous-système (accusés), autre arbitrage |
| #18616 | la seconde instance de `RedisDeliveryQueue`, jamais drainée ni purgée | voisin, cause distincte |
| #18617 | `POST /links/:identifier/messages` rend 500 au renvoi | piège armé, hors du chemin de rejeu |
| #18618 | rien n'ordonne le direct contre le drain | demande une décision de contrat |
| #18619 | la file enfile l'adresse NUE d'une pièce liée au lecteur | trouvé par deux audits sur trois — lot à lui seul |

## Le résidu assumé, écrit pour ne pas être redécouvert comme un défaut

Sous une PANNE de la lecture des participations, les deux gates se taisent et le
lot repart sans filtre. C'est l'arbitrage d'origine de cette lecture, écrit sur
place et non modifié par ce lot. Ce n'est pas une issue : la fuite de plancher
qu'il laisse passer est strictement incluse dans la fuite d'appartenance que le
même échec autorise déjà, et la refermer exigerait de rouvrir cet arbitrage-là —
ce qui est une décision, pas un correctif.
