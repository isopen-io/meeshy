# Cycle 184 — l'issue annonçait trois sites nus ; deux l'écrivaient déjà, et l'un par un spread

*2026-11-19, à la suite du cycle 183 (#19801, fusionné dans `dev` par `07609bfa9b`).
Branche `claude/exciting-planck-loe3fu`. Instruit **#19802**, l'une des colonnes
rendues par le tri de #19748.*

---

## Pourquoi celui-là

Des colonnes restantes du tri (#19802, #19803) et des suivis ouverts, #19802
l'emporte sur le critère des trois cycles précédents — un défaut **mesuré**, qui
**supprime une feature entière** — avec une propriété de plus : il
**s'auto-entretient**. Une file se compose des lignes dont la colonne « c'est
fait » est vide ; l'égalité qui la lit n'apparie pas une clé absente ; la file
est donc vide, rien n'est traité, la colonne n'est jamais écrite, la file reste
vide. Contrairement à une porte qui refuse, aucun chemin voisin ne vient
déverrouiller le cas.

*(#19836 était mon candidat suivant du cycle 183 : une autre session l'a livré
pendant que ma CI tournait — `dev` porte son journal. La doctrine de la branche
poussée tôt a fonctionné dans le sens le moins cher : je l'ai appris en
fusionnant, avant d'écrire une ligne.)*

## Le défaut — mais pas celui que l'issue décrivait

L'issue affirme : « aucun des trois chemins de création ne l'écrit ». Mesuré site
par site :

| créateur de `PartnerProfile` | ce qu'il écrit | l'issue disait |
|---|---|---|
| `LensPartners.ts:249` | `verifiedAt: null` — porté par `data`, **RÉPANDU** dans `create` | nu |
| `PackPublishers.ts:585` | `verifiedAt: current?.verifiedAt ?? now` — l'éditeur officiel naît vérifié | nu |
| `PackPublishers.ts:609` | **rien** | nu |

**Deux des trois l'écrivaient déjà.** La file de vérification des partenaires
n'était donc pas vide : un partenaire qui déclare son profil y entre. Ce qui n'y
entrait jamais est le profil d'éditeur **créé automatiquement quand un auteur
publie un pack** — et celui-là ne pouvait pas être vérifié une première fois.

Les deux créateurs de demande de suppression, en revanche, sont nus comme
l'issue le dit, et leurs littéraux sont complets, sans aucun spread :
**aucun premier rappel hebdomadaire n'est jamais parti, pour aucune demande.**

> **L'erreur de l'issue n'est pas une inattention : c'est un SPREAD.**
> `create: { userId, createdAt: now, ...data }` ne montre pas ses clés — il faut
> résoudre `data`, dix lignes plus haut, pour y voir `verifiedAt: null`. Une
> énumération de clés LITTÉRALES conclut « absente » là où la valeur est posée
> ailleurs.

Et c'est la part qui vaut d'être dite : **le cliquet que le cycle 183 a posé
rend `unresolved` — et non `missing` — devant un spread de premier niveau,
exactement pour ce cas.** L'instrument avait la bonne réponse (« je ne sais
pas ») là où l'humain a tranché (« c'est nu »). Un cliquet dont le verdict
prudent paraît timide vient de gagner son troisième argument.

## Ce que le lot livre, et ce qu'il refuse de livrer

Les trois sites nus posent leur colonne. **La lecture n'est pas touchée**, et
c'est le même arbitrage qu'au cycle 183, pour un motif plus fort :

| file | ce que réparer la LECTURE déclencherait |
|---|---|
| vérification des partenaires | une file d'administration qui s'ouvre d'un coup — **non destructif** |
| rappels de suppression | **un envoi de courriels de masse**, à chaque demande expirée depuis la mise en service |

Un courriel ne se rattrape pas, et celui-ci parle de la suppression d'un compte.
C'est la règle du cycle 84 appliquée à un ENVOI : réparer ce qui rendait une
donnée invisible oblige à décider, dans le même lot, ce que la visibilité
DÉCLENCHE. Le sort de l'arriéré est **#19900**, avec ses quatre options et la
mesure à prendre.

## Les deux colonnes rejoignent le cliquet de filtres, et il les a nommées

`verifiedAt` (borné à `partnerProfile`) et `lastReminderAt` (borné à
`accountDeletionRequest`) entrent dans `COLONNES` de
`soft-state-equality-filter-guard`. Il a immédiatement rendu les deux lectures
nues — `LensPartners.ts:294#verifiedAt` et
`MaintenanceService.ts:882#lastReminderAt` — qui sont désormais gelées avec leur
discipline d'écriture MESURÉE et, pour les rappels, la raison écrite du refus de
la troisième branche.

C'est le geste que le cycle 183 avait appris de son audit (constat B2 : « un
second registre là où le dépôt en avait un »), appliqué cette fois **sans qu'un
audit ait à le demander**.

## Ce que ce lot a payé dans son propre témoin, deux fois

### 1. Une fenêtre en CARACTÈRES est un témoin qui mentira

Le premier témoin relevait le littéral de création par `slice(at, at + 500)`.
Il est passé au ROUGE **dès que le correctif a posé la clé** : les commentaires
qui l'expliquent l'avaient repoussée au-delà du 500e caractère. Le témoin
accusait un code juste.

> Et la version symétrique de cette erreur est pire : une fenêtre trop LARGE
> attrape le littéral SUIVANT et blanchit un code faux, sans rien dire.
> L'appariement d'accolades n'a pas de réglage — c'est la seule borne qui ne se
> périme pas.

### 2. Le commentaire qui EXPLIQUE la règle blanchissait le code qui la viole

Plus cher, et mesuré par accident. En retirant la clé de l'un des deux `data`
pour prouver le ROUGE, le témoin est resté **VERT**. Raison : le commentaire que
je venais d'écrire cite la clause de lecture, donc contient la chaîne
`lastReminderAt: null`. Le fichier en portait **trois** occurrences, dont deux
seulement étaient du code.

> **C'est exactement la leçon du cliquet du cycle 183**, qui blanchit les
> commentaires pour cette raison précise — et elle s'est reproduite dans le
> TÉMOIN du cycle suivant, écrit par celui qui venait de l'appliquer à
> l'instrument. **Une règle de méthode ne se transporte pas d'un outil à son
> voisin : elle se réapplique.** Savoir qu'un commentaire peut absoudre ne
> protège pas le fichier d'à côté.

Le témoin dépouille désormais les commentaires
(`stripCommentsPreservingStrings`, le site unique du dépôt) avant toute mesure,
et il tombe sur la mutation qu'il bénissait — vérifié.

## Preuve

- **RED prouvé par mutation, site par site** : la clé retirée de
  `PackPublishers` fait tomber son témoin ; retirée de l'un des deux `data` de
  `delete-account`, elle fait tomber le témoin des deux routes — après le
  dépouillement des commentaires, et **pas avant**, ce qui est la mesure qui
  compte ;
- `pending-state-write-discipline` **5 verts** (dont deux qui attestent les
  créateurs DÉJÀ justes : sans eux, un lot de nettoyage retirerait leur clé pour
  « s'aligner » sur le troisième) ;
- `soft-state-equality-filter-guard` **30 verts** après inscription des deux
  colonnes ; les suites des trois sites touchés **152 verts** ; les trois
  cliquets de taille et celui du cycle 183 **21 verts** ;
- `tsc --noEmit` sur `services/gateway` : **EXIT=0**.

## Ce qui n'a pas été mesuré, et ne doit pas se lire comme vert

- **L'ARRIÉRÉ des deux colonnes** : combien de profils d'éditeur portent
  l'absence, combien de demandes de suppression n'ont jamais reçu de rappel.
  Aucune base dans ce conteneur. C'est **#19900**, et c'est une décision du
  porteur, pas un correctif.
- **Le comportement contre un vrai MongoDB 8** (#19739) : la sémantique employée
  est celle que le dépôt porte à plus de dix endroits ; non rejouée contre le
  moteur.
- **Ce que la file de vérification montrera** une fois peuplée : personne ne l'a
  regardée tourner, puisqu'elle ne rendait qu'un sous-ensemble.
