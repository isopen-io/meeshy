## Leçon 137 — Compter les ÉCRIVAINS avant les lecteurs, et une non-régression se prouve par DIFF quand le typage est éteint

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
