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


---

## L'audit adversarial a rendu BLOQUANT, et il avait raison : j'étais l'interrupteur

Verdict **BLOQUANT**, pour une phrase que ce journal écrivait sur lui-même :

> « Écrire la colonne rend exactes les lignes À VENIR **sans rien déclencher** »

**Elle est fausse.** J'ai vérifié chaque maillon moi-même avant d'agir ; tous
tiennent.

### Ce que poser `lastReminderAt: null` allumait

La passe de rappels cherche `status: 'GRACE_PERIOD_EXPIRED'`. Ce statut est écrit
par l'étape qui **PURGE et ANONYMISE** le compte, dans la même itération
(`MaintenanceService`, § « 1. Expiration des grace periods » : `$transaction`
statut + `deletedAt`, puis `purgeMessages`, `purgeMedia`,
`anonymizeIdentityOfExpiredAccount`). **`GRACE_PERIOD_EXPIRED` veut dire
« compte déjà détruit ».** Pour chaque demande, ma ligne aurait donc produit :

| ce qui part | mesuré |
|---|---|
| un courriel **la nuit même de la destruction** | les deux étapes tournent dans la même invocation |
| puis un **tous les sept jours, sans fin** | `reminderCount` n'est jamais plafonné (il n'est lu que par un `logger.info`) et rien ne fait sortir une ligne de ce statut hors d'un clic utilisateur |
| vers `…@deleted.meeshy.invalid` | `anonymizedEmail()` écrit cette adresse ; elle est NON VIDE, donc `if (!user?.email) continue` ne retient rien — et `.invalid` est un TLD réservé (RFC 2606) : rebonds durs sur le domaine d'envoi de production |
| avec deux liens **déjà morts** | le rappel tourne les jetons et ne touche pas `tokenExpiresAt` (TTL 72 h, grâce 30 jours) |

> **Le défaut était la seule chose qui empêchait un défaut pire, et le correctif
> « évident » en était l'interrupteur.** C'est la forme du cycle 124 retournée :
> là, un champ de service DÉCLARAIT une restriction qu'il n'appliquait pas ; ici,
> c'est le LOT qui déclarait l'innocuité d'un chemin dont il était le seul
> interrupteur.

Et la raison pour laquelle je ne l'ai pas vu se dit en une phrase : **j'ai lu les
CRÉATEURS et la CLAUSE, jamais le CONSOMMATEUR.** Les trois cycles précédents
m'avaient entraîné à demander « qui écrit ? » et « qui lit ? » ; la question qui
manquait est **« et que fait celui qui lit ? »**. Une file inerte n'a pas de
comportement observable — c'est exactement pourquoi personne ne l'a relue, et
pourquoi la rallumer demande de la lire d'abord.

**Les deux écritures sont RETIRÉES.** L'égalité nue du balayage est désormais
documentée au cliquet comme **une GARDE** — pas une dette — avec sa mesure, et
un témoin garde l'absence VOULUE dans les deux créateurs. Réparer la passe
(statut visé, plafond, TTL, exclusion des comptes purgés) est une décision du
porteur : elle écrit à de vraies personnes depuis le domaine de production
(#19900).

### Le second constat : la file que ce lot peuplait contenait des lignes intraitables

`verify()` écrit sous `snapshotWhere(current)`, qui appariait `logoSha256` et
`website` par une **égalité nue**. Un profil créé par `adopt` ne porte ni l'un ni
l'autre : `updateMany` rendait `count: 0`, `verify` rendait `profile-changed`, et
la route rendait **409 `PARTNER_PROFILE_CHANGED` à chaque essai, indéfiniment**,
puisque rien n'avait changé.

> **Le MÊME piège que celui de ce cycle, un cran plus loin — et c'est le lot qui
> l'ouvrait** : poser la clé d'attente faisait ENTRER ces profils dans la file.
> Rendre une ligne VISIBLE oblige à la rendre TRAITABLE. Le journal écrivait de
> cette file qu'elle était « non destructive » et admettait n'avoir « jamais
> regardé tourner » ce qu'elle montrerait : les deux phrases étaient côte à côte,
> et la seconde annulait la première.

Corrigé du côté de la LECTURE (`snapshotWhere` dit l'absence par `unsetOrNull`),
parce que c'est le seul correctif qui couvre aussi les profils DÉJÀ créés — et
parce que l'exporter depuis `LensPartners` vers `PackPublishers` aurait fait un
cycle d'imports, `LensPartners` important déjà `PackPublishers`.

**Et il a fallu apprendre `AND` au double partagé.** `matches()`
(`sticker-packs.harness.ts`) connaissait `OR` et `NOT`, pas `AND` : la clause
composée tombait dans `fieldMatches(row, 'AND', …)`, n'appariait rien, et cinq
témoins de vérification rendaient 409. **La direction était la bonne** — il a
échoué bruyamment plutôt que d'ignorer la clé, ce que `mongo-where.ts` exige d'un
double — mais un double qui ignore une famille de clauses que la production
emploie est un double qui mentira dès que la forme changera de sens.

### Le témoin de ce lot blessait cinq mutations, dont trois passaient `tsc`

Reproduites par l'audit, et les deux pires vérifiées par moi après correction :

| mutation | avant | après |
|---|---|---|
| la clé **déplacée** de `create` vers `update` (le `create` redevient nu **et** chaque publication DÉVÉRIFIE un éditeur) | **VERT**, `tsc` EXIT=0 | **ROUGE** |
| `verifiedAt: undefined` (Prisma l'ignore comme une clé absente) | **VERT**, `tsc` EXIT=0 | **ROUGE** |

Cause racine de la première : le relevé ancrait sur l'appel et prenait le premier
`{` — donc **tout l'objet d'arguments, `update:` comprise**. Il se borne
désormais au seul objet `create:`/`data:`, et exige la **PAIRE clé→`null`**,
jamais la seule clé.

Et une distinction qui s'est imposée en le réparant : **blanchir les chaînes
protège contre un littéral qui FEINT du code** (`note: 'lastReminderAt: null'`,
le trou que ce lot avait laissé en fermant celui des commentaires) **et aveugle
devant une chaîne qui EST l'argument** (`unsetOrNull('logoSha256')`). Un seul
lecteur ne peut pas faire les deux : il y en a deux, `sourceOf` et `codeOf`, et
choisir le mauvais fait soit bénir un code faux, soit accuser un code juste.

### Et une borne que j'avais écrite au lieu de la mesurer

`verifiedAt: ['partnerProfile']` — faux. Mesuré sur `schema.prisma` : la colonne
vit sur **deux** modèles optionnels, `PartnerProfile` **et `AtomLink`**. Mon
commentaire disait « chacune sur son seul modèle ». C'est la forme « une limite
qu'on écrit au lieu de la mesurer protège le site qu'elle cache » — **dans le
fichier dont le doc-comment la dénonce deux cents lignes plus haut**, et un
cycle après que l'audit du 182 me l'a apprise sur `lastActivityAt`.

Corrigé en `['partnerProfile', 'atomLink']`. Et la phrase « il ne tient que TROIS
colonnes » du même doc-comment, périmée par deux élargissements, dit désormais
sept en renvoyant à la liste qui fait foi : **un compte écrit à côté de la liste
qu'il compte se périme au premier ajout.**

### Ce que l'audit a vérifié sans rien trouver

Mes cinq mesures de créateurs et de lecteurs tiennent, et il les a reprises à
l'échelle du dépôt (scripts, seeds, migrations, `$runCommandRaw` compris) : trois
créateurs de `PartnerProfile`, deux de `AccountDeletionRequest`, le spread de
`LensPartners`, la date réelle de l'éditeur officiel, l'écrivain unique de
`lastReminderAt`, et `sites: 1` exact pour les deux entrées du cliquet. Il a
relevé huit lecteurs EN MÉMOIRE de `verifiedAt` que le lot ne nomme pas : aucun
n'est un filtre, Prisma rendant `null` pour un scalaire optionnel absent, mais le
point n'est mesuré nulle part — et s'il était faux, `verified: row.verifiedAt
!== null` aurait servi un badge « vérifié » à tout éditeur adopté.
