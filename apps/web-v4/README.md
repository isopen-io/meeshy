# apps/web-v4 — POC : une application TypeScript unique, web + Android + iOS

> **Statut : PROTOTYPE À ARBITRER.** Rien ici n'est en production, rien ne
> remplace `apps/web-v3`, `apps/android` ni `apps/ios`. Le POC répond à une
> question et à une seule : *peut-on avoir une application unique en TypeScript,
> stylée par Tailwind, qui reprenne l'interface iOS, reste installable en PWA,
> s'empaquette pour les stores — et tienne le coût data d'une zone rurale ?*

## Ce qui a été mesuré

Profil réseau : **Fast 3G** (188 743 bps, 562,5 ms de latence) — le même que
`apps/web-v3/budgets.json`, pour que la comparaison v3/v4 ait un sens.

### Le runtime : Preact contre React, code source identique

| | **Preact** (retenu) | React 19 |
|---|---|---|
| avant le premier pixel | **24,53 Ko** gzip | 74,90 Ko gzip |
| téléchargement seul sur Fast 3G | **1,06 s** | 3,25 s |
| requêtes avant le premier pixel | 6 | 7 |

Le code applicatif est le **même** : `preact/compat` est activé par un alias
Vite (`MEESHY_RUNTIME=react` construit l'autre). L'écart — **50,4 Ko gzip** —
est du runtime seul. Pour référence, le plancher mesuré de Next 15 App Router
sur ce dépôt est de **99,6 Ko / 6 requêtes** pour une page *vide* : la v4 rend
deux écrans complets pour le quart de ce prix.

### Le routeur (#5447)

TanStack Router pesait **25,13 Ko gzip — 49 % de la première peinture**, plus
de trois fois le runtime Preact entier. Ce poids s'est révélé
**incompressible** : retirer toutes ses options rend un chunk au **hash
identique** — on ne paie pas ce qu'on utilise, on paie le moteur.

Il est remplacé par `src/lib/routeur.tsx`, taillé pour ce que Meeshy demande
(paramètres de chemin typés depuis le motif, paramètres de recherche,
découpage par route, préchargement à l'intention, restauration du défilement) :
**~1,4 Ko gzip**. La première peinture passe de **50,85 à 24,53 Ko** et de
**2,21 s à 1,06 s** sur Fast 3G — soit **−52 %**.

Ce qui est perdu, et qu'il faut savoir : chargeurs de route, états « pending »
de navigation, validation des paramètres de recherche, routes imbriquées
au-delà d'un niveau. Les trois premiers sont couverts par TanStack Query, qui
reste ; le quatrième est une limite réelle, à lever le jour où un écran la
rencontre.

### Les deux variantes

| | **A — PWA seule** | **B — Capacitor 8** |
|---|---|---|
| avant le premier pixel | 24,53 Ko · 6 requêtes | 24,36 Ko · 5 requêtes |
| service worker | oui (Workbox) | non (la coque gère son cycle) |
| **2ᵉ visite** | **0 requête réseau · 0 octet** — vérifié | sans objet (embarqué) |
| ouverture **hors ligne** | **oui**, navigation comprise — vérifié | oui |
| pipeline | `vite build` | `vite build && cap sync` — **86 ms** |

Les deux se construisent depuis **le même `dist/`** ; seul `MEESHY_CIBLE`
change (base relative, service worker retiré). C'est la condition pour que
« transformable sans friction » soit une mesure et non une promesse.

Rejouer : `bun run gate`, `node scripts/verifie-hors-ligne.mjs`,
`node scripts/capture.mjs` (captures dans `rendu/`, non versionnées).

Les captures figent l'horloge de la page (`page.clock.setFixedTime`) : sans
ça, deux captures du même code diffèrent par leurs horodatages et comparer un
rendu avant/après devient impossible.

Les fixtures sont **ancrées sur maintenant** (`aM(90)` = il y a 90 minutes) et
non sur des dates écrites en dur : une fixture du 6 septembre affichait
« Aujourd'hui » le 6 et « Hier » le 7, donc les captures changeaient de sens
pendant la nuit et un témoin qui cherchait « Aujourd'hui » tombait sans qu'une
ligne de code ait bougé. Ce qui doit être fixe, c'est la **forme** du jeu de
données, pas l'instant où on le regarde.

### Ce qui n'a PAS pu être vérifié ici

**Aucun APK n'a été produit.** L'installation du SDK Android est refusée par la
politique de sortie de l'environnement (`dl.google.com` — CONNECT 403). Sont
vérifiés : `cap add android` (75 ms), `cap sync` (86 ms), le projet natif
généré (75 fichiers, 808 Ko) et les actifs web embarqués (228 Ko). **La taille
de l'APK, le temps de démarrage à froid et la fluidité de défilement réelle sur
un Android d'entrée de gamme restent à mesurer** — et c'est le dernier point
qui décide vraiment de la variante B.

## L'interface

Reprise de l'app iOS, relevée dans `apps/ios` et `packages/MeeshySDK` — pas des
maquettes web. Ce qui en découle et qu'on rate en regardant vite :

- **Aucune barre d'onglets, aucune barre de navigation** : l'app iOS pose
  `.navigationBarHidden(true)` partout, chaque écran dessine son en-tête
  flottant. La coquille de la v4 est donc volontairement mince.
- **Bulle à rayon uniforme 18 px** : ni queue, ni coin asymétrique, ni ombre,
  ni dégradé — les ombres ont été retirées côté iOS pour la fluidité du
  défilement, les reposer coûterait des passes hors-écran sur l'appareil visé.
- **La bulle envoyée est l'indigo de marque**, la même dans toutes les
  conversations ; seule la bulle **reçue** porte l'accent de la conversation.
- **L'avatar et le nom vivent DANS le pied de la bulle**, et seulement sur le
  **dernier** message d'une suite (jamais le premier), en groupe, en réception.
- **Regroupement** : même auteur + même jour, **sans fenêtre temporelle**
  (`src/lib/groupage.ts`, témoins compris). C'est la même loi que iOS, le web
  et Android.
- **Prisme Linguistique** : le contenu affiché EST déjà la traduction préférée,
  rendu comme du contenu natif ; la seule marque est la pastille `translate` et
  la bande de drapeaux du pied. La descente est dans `src/lib/api/prisme.ts`,
  avec le témoin qui compte — celui qui s'écrit sur un **rang autre que le
  premier**, sinon le court-circuit interdit et la règle juste rendent le même
  verdict.
- **La barre de recherche de la liste est EN BAS** : à portée du pouce.

## Ce que le POC ne fait pas

Réseau réel (fixtures figées), temps réel, en-tête repliable au défilement,
gestes de balayage sur les lignes et les bulles, menu au appui long, rail de
stories complet, listes virtualisées. Aucun n'est bloquant pour l'arbitrage ;
la virtualisation, en revanche, est **obligatoire** avant toute mesure de
fluidité sérieuse sur Android d'entrée de gamme.

## Les jetons — d'où viennent les valeurs (#5445)

**Aucune valeur de couleur ou de géométrie iOS n'est écrite à la main ici.**
`packages/design-tokens/ios.css` est **généré** depuis `MeeshyColors.swift` et
`DesignTokens.swift` par `packages/design-tokens/scripts/genere-depuis-ios.mjs`.
`src/styles/ios.css` ne fait plus que **nommer** ces jetons en utilitaires
Tailwind.

Deux gates, qui vérifient deux choses différentes :

| gate | ce qu'il prouve |
|---|---|
| `bun run check:jetons` | le CSS généré n'a pas dérivé de ses sources Swift |
| `bun run verifie:jetons` | **le navigateur peint bien ces valeurs-là**, dans les deux schémas |

Le second n'est pas redondant : entre le fichier généré et le pixel il y a un
import, un `@theme inline`, la cascade et deux classes de schéma, et n'importe
lequel peut avaler un jeton sans rien casser de visible — un nom mal
orthographié rend une couleur **vide**, pas une erreur. Les deux gates ont été
vus rougir sur une valeur falsifiée.

### Ce que la fusion a révélé, et qui reste ouvert

1. **Les deux tables n'ont jamais divergé sur les couleurs, mais sur les
   RÔLES.** `design-tokens` fait de `indigo400` sa primaire, iOS de
   `indigo500` ; les neutres de la v3 sont violacés (`#b9bcd0`), ceux d'iOS
   sont des gris vrais (`#9CA3AF`). Les unifier changerait le rendu de
   `web-v3`, une application en service : c'est une décision du porteur, pas un
   refactor. `tokens.css` est donc **intact** — vérifié.
2. **iOS porte lui-même des valeurs hors de ses propres tables.** Le rayon 18
   de la bulle n'est ni `MeeshyRadius.md` (14) ni `.lg` (16) ; le champ du
   composeur pose 22 ; l'heure d'une bulle emploie `.caption` de SwiftUI et non
   `MeeshyFont`. Elles ne sont **pas générables** — elles ne sont déclarées
   nulle part. Le tableau `HORS_TABLE_IOS` du générateur les déclare, chacune
   avec son site Swift, et vaut inventaire de ce que iOS doit remonter chez
   lui.
3. **La géométrie iOS emploie des demi-pas** (10, 14, 18, 22 px) que l'échelle
   fermée de la charte v3 (4, 8, 12, 16, 24…) ne contient pas. Soit l'échelle
   s'ouvre à ces pas, soit la fidélité cède d'un pixel par endroit.

## Le pont Tailwind ↔ design-tokens

`src/styles/app.css`. Deux choses à savoir avant d'y toucher :

- `@theme inline` fait émettre `var(--color-surface)` **dans** l'utilitaire au
  lieu d'en recopier la valeur : le basculement clair/sombre continue de passer
  par la classe `.light` de la table, et **aucune variante `dark:` n'est
  nécessaire**.
- **Un alias qui porte le nom de son jeton s'auto-référence**
  (`--color-danger: var(--color-danger)`) et devient invalide au calcul — sans
  erreur de build, sans avertissement, avec juste une couleur qui disparaît.
  D'où `erreur`, `anneau`, `av-N`, `pile`.

Les noms d'utilitaires sont les **rôles** de la charte, pas des tailles :
`rounded-carte`, `text-corps`, `bg-plan`. Un mésusage se voit en revue.
