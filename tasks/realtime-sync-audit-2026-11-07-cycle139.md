# Cycle 139 — un message qui partageait sa milliseconde avec une frontière de page disparaissait du fil

**Issue livrée** : #16684. **Branche** : `claude/exciting-planck-oqjdwm`, PR #16693.
**Milestone** : #241. **Issues ouvertes en chemin** : #16685, #16687, #16688
(file de rejeu hors ligne, milestone #242) · #16689, #16690, #16691 (audiences
de diffusion, milestone #243) · #16692 (filigrane `?after=`, milestone #241).

Le cycle 138 du même jour a traité les orphelins du contrat Socket.IO et le
Prisme du texte alternatif ; aucun chevauchement de fichier ni de sujet.

## Le défaut

`GET /conversations/:id/messages` paginait par curseur sur une clé **NON
UNIQUE** bornée par une inégalité **STRICTE** :

```ts
orderBy: { createdAt: 'desc' }                            // clé unique, non TOTALE
whereClause.createdAt = { lt: beforeMessage.createdAt }   // borne STRICTE
nextCursor = la DERNIÈRE ligne de la page
```

`Message.createdAt` est un BSON Date, donc à la **milliseconde**. Quand la
frontière d'une page tombe À L'INTÉRIEUR d'un groupe de messages qui partagent
leur milliseconde, la page suivante exclut `createdAt < T` — donc les membres du
groupe qui n'ont pas tenu sur la page. **Aucune page ne les rend jamais.** Pas
d'erreur, pas de trace : le fil est simplement plus court que l'histoire.

Trois manifestations, une seule cause :

| # | site | effet |
|---|---|---|
| A | curseur `before` (`messages-list.ts:375-397`) | un message de la fratrie de la frontière perdu pour toujours — **chemin nominal, tous les clients, chaque défilement arrière** |
| B | fenêtre `around` (`:410-448`) | un message né dans la MÊME milliseconde que la cible n'est dans AUCUNE des deux moitiés |
| C | `view=pinned` (`messages-list-views.ts:217`) | la vue TRIE sur `pinnedAt` et PAGINAIT sur `createdAt` : pertes ET doublons, **sans aucune égalité de milliseconde** |

C est déterministe mais c'est un **piège armé** : mesuré, aucun client n'appelle
`view=pinned` (`grep` sur `apps/web/src` et `packages/MeeshySDK/Sources` : zéro
site). Corrigé au titre de la règle du cycle 84 — on ne laisse pas un piège armé
au motif que personne n'a encore marché dessus. **Le dire est la moitié du
travail** : annoncer une panne qu'on n'a pas mesurée coûte la confiance des
cycles où il y en a une.

## La loi EXISTAIT, et le fil était la seule liste à ne pas l'appeler

C'est le fait le plus utile de ce cycle. `utils/keyset-cursor.ts` porte la loi
keyset de la passerelle — « une seule définition pour toutes les listes
antichronologiques » — et son doc-comment énonce **mot pour mot** l'invariant
rediagnostiqué ici :

> « sans elle, deux lignes nées dans la même milliseconde se re-servent l'une
> l'autre indéfiniment, ou se sautent. […] L'appelant DOIT trier par ce même
> couple. »

Elle était écrite pour `createdAt`, la clé des listes antichronologiques. Ce lot
ne la réécrit donc pas : il **généralise** `keysetClause` pour recevoir la
COLONNE que la vue trie — seule chose que la loi partagée ne pouvait pas savoir
— et `keysetBeforeClause` en devient une PROJECTION, ses trois appelants
inchangés (`globalPostSearch`, `globalMessageSearch`,
`StarredMessagesReader`).

Écrire une seconde fenêtre dans la route aurait été exactement la jumelle que
`cursor-pagination-single-law-guard.test.ts` existe pour empêcher.

> **Ce qui a évité la jumelle n'était pas une intuition** : c'était un nom de
> fichier (`unit/utils/keyset-cursor.test.ts`) aperçu dans la sortie d'un
> `--listTests`, et ouvert. Avant d'écrire une règle, lire les noms des suites
> voisines coûte zéro.

## Deux décisions de forme

- **La fenêtre sort sous `AND`, jamais en écrasant un filtre de champ.** Le
  plancher d'historique d'un lien de partage vit sur `createdAt` (`{ gte }`) et
  un `OR` ne s'y fond pas ; les modes `around` et `view=search` occupent déjà la
  case `id` (`{ in: [...] }`) qu'une fenêtre de premier niveau remplacerait **en
  silence**.
- **Un curseur sans valeur sur la clé triée ne rend AUCUNE fenêtre** (fail-closed).
  Le cas est réel — un `before` qui désigne un message NON épinglé sous
  `view=pinned` n'a pas de `pinnedAt` — et c'est le comportement déjà documenté
  de la route pour un curseur inconnu.

Aucun changement de contrat : le curseur reste un identifiant de message, et le
serveur en dérive les deux composantes de l'ordre total.

## Ce que le témoin a coûté, et pourquoi il valait ce prix

Le témoin **PAGINE pour de vrai** : le double Prisma ÉVALUE la clause que la
route construit sur un corpus, au lieu de rendre une page toute faite. Un double
qui rend une liste fixe ne peut par construction pas voir une fenêtre fausse.
L'assertion porte sur ce que le LECTEUR obtient en suivant `nextCursor`.

**Ma première version passait sur la route fautive.** Trois messages dont deux
dans la même milliseconde, page de 2 : les deux membres tenaient sur la MÊME
page, la frontière tombait après le groupe, et le `<` strict n'excluait
personne. Il faut quatre messages pour que la frontière COUPE la classe
d'équivalence. Détail et règle générale :
`tasks/lessons/2026-11-07-une-extraction-deplace-ses-surfaces-et-un-groupe-d-egalite-qui-tient-sur-une-page.md`.

## L'extraction a déplacé deux inventaires, et ce n'était pas prévu

Le handler franchissait le seuil de 1 000 lignes (1009) ; la résolution de la
fenêtre `around` a rejoint le module de la loi — c'est l'autre site qui RÉSOUT un
curseur — et le handler est repassé à **964** lignes, sous son état d'avant le
lot (980).

Deux cliquets d'inventaire ont alors rougi, qui dénombrent **fichier par
fichier** les lectures de `Message` et ce que chacune applique :

| cliquet | avant | après |
|---|---|---|
| `personal-history-hiding-surface-guard` | `messages-list.ts` : 6 lectures / 6 applications | 4 / 4, et le module de la loi déclare 1 / 1 |
| `orphaned-sender-repair-surface-guard` | `messages-list.ts` : 5 lectures / 1 réparation | 2 / 1, et le module est déclaré EXEMPT (sondes d'identifiants, jamais `sender`) |

Le compte du masquage est **1 et non 2** bien que la fenêtre ouvre DEUX requêtes
de page : elles partagent UN helper littéral — et c'est précisément ce que la
garde veut, le masquage vivant dans ce helper unique donc dans les deux moitiés
par construction.

Et le corollaire qui surprend : j'avais d'abord **injecté** les deux lois en
paramètres, par réflexe de testabilité. Les deux balayages lisent le TEXTE du
fichier : sous injection, l'unité les appliquait et aucun cliquet ne pouvait le
voir. **Une surface gardée qu'un cliquet ne peut pas voir n'est pas gardée.** Le
module les IMPORTE désormais.

## Preuve

| gate | résultat |
|---|---|
| CI dispatchée sur la tête exacte (`b724585`), `package_manager=bun` | **26 jobs sur 26 verts** — les 3 tranches gateway, la couverture fusionnée, Qualité TS, Gardes du dépôt, Prisma, Build, Trivy, web, shared, agent, traducteur, Playwright ×4 |
| les 9 suites touchées (dont les 2 cliquets d'inventaire et les 2 budgets de taille) | 317/317 |
| suite gateway complète en local | 39 502 verts ; 17 rouges dans 6 suites de codecs d'image (HEIF, AVIF 10 bits, carte de gain HDR, orientation EXIF) |
| `tsc --noEmit` gateway | EXIT=0 |

**Les 17 rouges locaux sont étrangers à ce lot, et c'est la CI qui le prouve** :
sur la tête précédente, les trois tranches gateway de la CI n'ont rendu QUE les
deux cliquets d'inventaire — zéro suite d'image. Elles passent en CI et ne
tombent que dans ce conteneur (capacité libvips).

**La CI des PR est GELÉE** (`vars.PR_CI_GEL`, `ci.yml:127`, `:195`, `:405`) : le
`Verdict CI` vert d'une PR agrège **dix-sept jobs `skipped`** et ne mesure rien.
La preuve se fait par `workflow_dispatch`. Et — leçon du matin, retrouvée dans
`tasks/lessons/` au bon moment — `cancel-in-progress` étant vrai sur toute
référence autre que `dev` et `main`, **un second dispatch ou un simple commit de
plus TUE le run en vol** : il n'existe qu'une preuve par branche, celle de la
dernière tête poussée. D'où la discipline de ce cycle : tout regrouper dans UNE
poussée, puis dispatcher UNE fois.

## Dimensions

**Mûres** : 1 (Sécurité — intégrité de l'historique servi), 11 (Maintenabilité —
une loi, un site, une projection), 13 (Complétude — les trois modes, toutes les
vues).

**Restantes, chacune avec son issue** : #16692 (le filigrane `?after=` porte la
même égalité et n'est pas réparable côté serveur seul — le client n'envoie qu'un
horodatage, sans identifiant pour rompre l'égalité).

## Ce que l'audit a trouvé à côté, et qui n'est pas dans ce lot

Six défauts, chacun vérifié ligne à ligne contre la source avant d'être déposé :

| issue | défaut |
|---|---|
| #16685 | la file de rejeu remet le contenu d'un message que le serveur a DÉTRUIT (éphémère brûlé, vue unique, rappel) — `messageLiveness` existe et ce chemin ne l'appelle pas |
| #16687 | une socket dont la jonction aux rooms a échoué est inscrite quand même, ce qui DÉSARME la file — le dommage est écrit au site, et un témoin le GÈLE |
| #16688 | la file est par UTILISATEUR : un appareil hors ligne ne converge pas si un autre était connecté, et trois familles sont inenfilables par construction |
| #16689 | `message:edited` transporte le `clientMessageId` de l'auteur vers toute la room et dans la file, que `message:new` retire par `stripClientMessageId` |
| #16690 | trois audiences de diffusion lisent `isActive` nu là où toute porte d'accès exige `PARTICIPATION_VIVANTE` : un membre actif-ET-banni reçoit accusés, pastille et rejeu de contenu |
| #16691 | la pastille de non-lus se vide pour un message sans expéditeur (agent, système) — sans auteur il n'y a personne à RETIRER, pas personne à SERVIR |
