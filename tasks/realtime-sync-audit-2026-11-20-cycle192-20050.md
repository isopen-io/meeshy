# Cycle 192 — borner une lecture qui compose un COMPLÉMENT, c'est choisir entre perdre et fuir

*2026-11-20, à la suite directe du cycle 191 (#20020, branche
`claude/exciting-planck-cgf6zu`). Branche `claude/exciting-planck-qvri7u`,
PR #20071. Livre **#20050**, le suivi le plus sensible que le 191 a laissé.
Numéroté 192 : 190 et 191 sont pris par d'autres sessions du même jour — un
identifiant qui ne s'alloue pas collisionne (#5102).*

---

## Le fait du cycle n'est pas le correctif : c'est que le lot précédent n'avait pas de PR

Le cycle 191 a livré les points 2 et 3 de #20020 — `scanLiveParticipants`
devient le site unique de la borne, quatre lectures le rejoignent, un cliquet
gèle les seize qui restent — l'a poussé sur sa branche, l'a commenté sur
l'issue… et **n'a jamais ouvert de PR.** Le travail était donc fini et invisible :
`dev` ne le portait pas, et la branche n'était citée par aucune PR ouverte.

> **Un lot qui s'arrête à sa branche n'est pas livré.** La règle de la routine —
> « se baser sur le développement précédent » — a donc eu, ce cycle-ci, une
> lecture littérale : la première chose à faire était de CONDUIRE le précédent
> jusqu'à la fusion, pas d'écrire du neuf à côté. Relu, remesuré sur la tête de
> `dev` (0 conflit de chemin, 13 commits de `dev` entre-temps), 34 suites vertes,
> `tsc` à 0 : le travail tenait. Il manquait une PR.

## Le constat de #20050, et pourquoi #20020 l'avait GELÉ au lieu de le corriger

`translationReaders` (#9709) rend DEUX listes, et elles ne se dégradent **pas
dans le même sens** :

| ce qu'elle rend | ce qu'une troncature en fait |
|---|---|
| `rooms` — les lecteurs AUTORISÉS | moins de rooms ⇒ une remise perdue |
| `excludedQueueKeys` — ceux qui ne doivent RIEN recevoir | moins de clés ⇒ **une porte ouverte** |

La seconde est un **COMPLÉMENT** : `actifs moins admis`. Chaque ligne qu'une
lecture bornée ne voit pas est une personne qu'on **cesse d'exclure** — un
lecteur sous plancher d'historique reçoit alors, dans une file qui le garde
48 h, la traduction d'un message que quatre portes lui refusent (`GET …/messages`,
`/sync`, `conversation:updated`, `GET /attachments/:id`).

> C'est la forme de #20007 avec l'inversion qui la rend plus grave : là, une
> troncature APPAUVRISSAIT une diffusion ; ici, elle OUVRE un accès. D'où la
> décision du cycle 191 de geler ce site au cliquet, avec sa raison écrite,
> plutôt que de le borner au passage — **borner sans rendre le site fail-closed
> aurait été pire que de le laisser nu.** Un cycle entier entre le relevé et la
> réparation est la forme normale d'un lot de confidentialité, pas un retard.

## Ce que le lot livre

Les trois lectures passent par le site unique, et le verdict de complétude
devient le TROISIÈME état de la loi — `{kind:'unknown'}`, celui que les
appelants portent déjà depuis #17026 (`MessageReadership`).

| lecture | question | troncature ⇒ |
|---|---|---|
| `suspects` | vivants **et** arrivés APRÈS le message | `unknown` — zéro suspect vu vaut « personne n'est sous plancher », donc la room ENTIÈRE servie : c'est la seule des trois dont la troncature ÉLARGIT l'audience |
| `active` | **ACTIFS** (bannis compris) — la base du complément | `unknown` — sous-exclusion, donc fuite durable |
| `admitted` | vivants, liens non échus | `unknown`, par le verdict commun — voir ci-dessous |

Et deux choses qui ne sont pas des détails de forme :

- **`scanActiveParticipants`** est la question PLUS LARGE que la participation
  vivante, posée explicitement : elle GARDE les bannis, parce qu'un banni doit
  figurer dans un complément (il est actif, il n'est pas admis) alors qu'il n'a
  rien à faire dans une audience. C'était la seule occurrence du dépôt où la
  clause s'écrivait à la main — l'issue demandait de « confirmer comme une
  DÉCISION écrite, ou aligner » ; c'est une décision, avec la même machinerie
  (borne, sonde `cap + 1`, journal, verdict) et aucune réécriture.
- **`narrow`** est la seule liberté qu'un appelant obtient sur le `where`, et
  elle ne peut que RÉTRÉCIR. Sans elle, la lecture des suspects paierait
  l'audience ENTIÈRE pour une question qui, au cas nominal, ne rend rien — et
  l'alternative (laisser ce site écrire son propre `take`) rendait au cycle 191
  la discipline locale qu'il venait de retirer.

## La branche qu'on n'écrit PAS, et comment on le prouve

L'issue prescrivait trois verdicts distincts, dont « `admittedRows` nomme les
AUTORISÉS ⇒ une troncature y retire des lecteurs légitimes : perte, pas fuite ».
C'est juste — et la branche correspondante est **INATTEIGNABLE** : `active`
(`isActive: true`) est un SUR-ENSEMBLE de `admitted` (`isActive` + `bannedAt`
nul) sous le MÊME plafond, donc si les admis débordent, les actifs débordent
aussi, et le verdict commun a déjà répondu.

> **Une piste d'issue peut être juste sur le raisonnement et porter une branche
> que le code ne peut pas atteindre.** L'écrire quand même aurait produit du code
> mort d'apparence prudente — la pire forme, puisqu'un lecteur futur l'aurait lu
> comme la preuve qu'on y avait pensé. Le dire sur place, avec la raison
> d'inclusion, coûte trois lignes de commentaire et reste vérifiable.

## La distinction qui a décidé la forme : une PANNE n'est pas une TRONCATURE

Les deux sortent du site unique par la même valeur (`complete: false`). Elles ne
s'arbitrent pas pareil ici :

- une **troncature** est une RÉPONSE ⇒ `unknown` ;
- une **panne** reste une LEVÉE, parce que **cinq appelants la NOMMENT par leur
  propre `onError`** (`messageReadership`, `broadcastMessageMutation`,
  `emitAttachmentUpdated`, `messageMentions`, `deliverTextTranslation`). La
  remplacer par `unknown` aurait rendu le lot plus « propre » et aurait coûté le
  seul diagnostic de ces cinq sites : une traduction définitivement perdue pour
  les absents ne laisserait qu'un `warn` d'un module que personne ne regarde.

C'est ce qui explique la forme du helper `boundedRead`, qui relève la panne par
`onError` pour la RELEVER ensuite. Elle n'est pas élégante ; elle est fidèle.

## Le ROUGE, mesuré

| mutation | témoins rouges |
|---|---|
| le code d'AVANT en entier (trois lectures nues) | **4** |
| la clause de complétude des SUSPECTS retirée | 2 — et la loi rend `readers` dont `rooms` porte la room d'un invité sous plancher |
| la clause de complétude des ACTIFS retirée | 1 — et `excludedQueueKeys` perd sa clé, donc la file dépose chez lui |
| le `take` retiré du site unique | 1 (la sonde `cap + 1` n'est plus là) |

Le double de test **honore le `take`** : sans cela, aucun témoin de borne ne
peut tomber — un double qui rend tout ce qu'on lui demande atteste une lecture
bornée aussi bien qu'une lecture nue. Et il ÉVALUE le `where`
(`matchesMongoWhere`), donc la sélection se juge sur ce qu'elle rend.

## Un couplage qui devient un témoin

Ce site écrivait `ADMITTED_FILE_READER_WHERE` ; il écrit maintenant la clause du
site unique, `PARTICIPATION_VIVANTE`. Les deux **sont** la même chose
(`fileReaderAdmission.ts`, affectation directe) — et c'est exactement ce qui
rend le passage sûr tant que c'est vrai.

> Chercher une clause par son NOM, c'est manquer les sites qui l'écrivent
> autrement (cycle 105). **La réciproque est qu'un site qui CHANGE de nom de
> clause doit prouver que la clause n'a pas changé** — un témoin d'une ligne, qui
> tombera le jour où la porte de lecture des fichiers se durcit, et forcera à
> relire ce site dans le même lot au lieu de le laisser suivre en silence.

## Ce qui RESTE

- **#20020, point 1** — partager la lecture entre l'audience et la file sur les
  mutations d'id (`MessageMutationQueueParams` ne porte pas `participants`).
  Chemins tenus par d'autres branches vivantes aux deux derniers relevés.
- **#20051** — les treize lectures nues restantes, dont DEUX servent la liste
  comme EFFECTIF (`memberCount: remaining.length`) : un effectif tronqué est un
  nombre FAUX servi aux clients, pas une audience partielle.
- **Non mesuré, troisième cycle de suite** : existe-t-il en production une
  conversation de plus de 2 000 participants vivants ? Le lot ne répond pas
  davantage ; il rend seulement la question moins chère, puisque le verdict de
  troncature est désormais JOURNALISÉ sur les trois lectures de cette loi.
