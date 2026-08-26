# Itération 270 — Analyse : le miroir web du regroupement de bulles avait perdu la FRONTIÈRE DE JOUR de sa règle canonique

## État courant

Le regroupement des bulles consécutives d'un même auteur (avatar / nom / heure
rendus **uniquement en tête de groupe**) est une règle déclarée en **trois
exemplaires**, comme l'exige tout invariant transverse aux clients :

| plateforme | site | conditions de « continuité » |
|---|---|---|
| Shared (Rivière) | `packages/shared/utils/river-lanes.ts` → `continues()` | ni système · même `senderId` · **même jour** (`dayIndex`) |
| iOS (SSOT bulles) | `MessageDayGrouping.continues` (`apps/ios/.../Bubble/MessageDayGrouping.swift`) | ni système · même `senderId` non vide · **même jour** (`calendar.isDate(_,inSameDayAs:)`) |
| Web | `apps/web/utils/message-grouping.ts` → `continuent()` | ni système · même `sender.id` |

Les DEUX sources canoniques (Rivière shared **et** iOS) portent, dans leur
doc-comment, la mention explicite : « Miroirs de cette règle :
`apps/web/utils/message-grouping.ts` … — toute évolution touche les trois. »

## Problèmes identifiés

**Le miroir web `continuent()` n'a jamais reçu la troisième condition — la
frontière de jour calendaire.** Il décide la continuité sur le seul couple
(système, auteur). La règle canonique brise le groupe dès que deux messages
voisins d'un même auteur franchissent minuit.

### Symptôme observable (vue Focal)

`FocalThread` insère une **capsule de date** entre deux messages qui changent de
jour (`isNewCalendarDay`, via `startOfLocalDayMs`). Mais `FocalRow` calcule
`showsIdentityHeader = isFirstInFocalGroup(message, previous)`, et
`isFirstInFocalGroup` délègue à `continuent()` — **aveugle au jour**. Donc,
quand le même auteur écrit de part et d'autre de minuit :

- une capsule de date s'affiche (correct),
- **mais la première bulle APRÈS la capsule masque avatar, nom et heure** — elle
  paraît collée au groupe de la veille, sous le séparateur de jour.

C'est le défaut jumeau de celui corrigé le 2026-08-20 (message système groupé
avec la vraie bulle du même auteur), une dimension plus loin : ici c'est la
dimension TEMPS qui manque, pas la dimension SYSTÈME.

## Cause racine

Le type `GroupableMessage` du miroir web ne portait aucun horodatage : la règle
ne POUVAIT pas exprimer la frontière de jour. La dimension jour vivait ailleurs
sur le web (`isNewCalendarDay`, pour la seule capsule visuelle) et personne n'a
recâblé les deux : la capsule et l'en-tête d'identité étaient pilotés par deux
lois disjointes, dont une seule connaissait le jour.

## Impact métier

Lecture d'un fil actif à cheval sur minuit (ou défilement d'historique
multi-jours) : l'en-tête d'identité disparaît juste sous une capsule de date,
là où toutes les autres plateformes (iOS bulles, Rivière) le réaffichent. Défaut
de cohérence produit inter-clients, sur une surface de lecture centrale.

## Impact technique

Divergence directe d'une règle explicitement documentée « touche les trois »,
laissée non couverte par un témoin. Deux lois de jour disjointes côté web (une
pour la capsule, aucune pour l'en-tête) — dette de duplication conceptuelle.

## Évaluation du risque

Faible. Le correctif RESTREINT la continuité (brise plus de groupes) ; il ne
peut jamais MASQUER un en-tête qui s'affichait — il en RÉVÈLE là où la règle
canonique l'exige. Aucune régression possible sur le rang 0 (premier message :
toujours tête). La comparaison de jour réutilise `startOfLocalDayMs`, la MÊME
fonction que la capsule de date de `FocalThread`, garantissant que capsule et
en-tête s'accordent au pixel.

## Améliorations proposées

1. `GroupableMessage` porte `createdAt` (requis) — la règle ne peut plus être
   exprimée sans le jour, ce qui interdit STRUCTURELLEMENT la re-divergence.
2. `continuent()` ajoute la condition « même jour calendaire local », via
   `startOfLocalDayMs` (`@meeshy/shared/utils/calendar-date`) — même loi
   DST-safe que le reste du web, même fonction que la capsule de date.
3. L'adaptateur `isFirstInFocalGroup` (`focal-row-utils.ts`) descend `createdAt`
   jusqu'au prédicat ; `FocalRow` passe déjà le `Message` complet, aucun autre
   câblage nécessaire.

## Bénéfices attendus

- Parité stricte web ↔ iOS ↔ Rivière sur la règle « tête de groupe ».
- La capsule de date et le réaffichage de l'en-tête d'identité pilotés par la
  MÊME arithmétique de jour → cohérence visuelle garantie.
- La dimension jour devient inexprimable-hors-règle → verrou anti-régression.

## Complexité d'implémentation

Faible : un champ ajouté à un type, une condition ajoutée à un prédicat pur, un
adaptateur qui descend un champ déjà disponible. Tout est couvert par des tests
unitaires purs (aucune infra).

## Critères de validation

- `apps/web/__tests__/utils/message-grouping.test.ts` : nouveaux cas « même
  auteur, jour différent → ouvre un groupe » et « même auteur, même jour →
  regroupe ».
- `apps/web/components/conversations/focal/__tests__/focal-row-utils.test.ts` :
  `isFirstInFocalGroup` ouvre un groupe au changement de jour.
- `bun run type-check` (ou `tsc --noEmit`) et lint verts sur `apps/web`.
