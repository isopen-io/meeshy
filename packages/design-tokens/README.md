# `@meeshy/design-tokens` — LA table de jetons de la v3 web

Trois fichiers CSS, et **aucune valeur ailleurs**. `apps/web-v3/app/globals.css`
les importe **par spécificateur de paquet** ; le harnais visuel
(`docs/product/MeeshyWebV3Design/compare-rendu.js`) mesure le rendu qui en sort.
Un composant de la v3 qui écrit une couleur, un rayon ou une police en dur est
refusé par `apps/web-v3/scripts/check-jetons.mjs` (conception § 3.2,
corollaire 2) — **les trois, pas seulement le premier** : la première écriture
du gate ne regardait que les couleurs pendant que ce paragraphe en affirmait
trois, et une restriction DÉCLARÉE que rien ne fait respecter est pire que son
absence (le lot suivant lit ce fichier et croit la surface gardée).

```
package.json  le manifeste — c'est lui qui rend le paquet ATTEIGNABLE
tokens.css    @import des deux schémas + ce qui ne dépend d'aucun schéma
dark.css      schéma sombre — porté par :root ET .dark
light.css     schéma clair  — porté par .light seulement
```

## Pourquoi c'est un paquet, et pas juste un dossier

`apps/web-v3/app/globals.css` a d'abord importé la table par chemin relatif
(`../../../packages/design-tokens/tokens.css`). Ça marche en local, dans le
monorepo intact — et **seulement là**. L'étage builder de
`apps/web-v3/Dockerfile` copie `apps/web-v3/` et rien d'autre : dans l'image,
`packages/` n'existe pas et `next build` rend
`Module not found: Can't resolve '../../../packages/design-tokens/tokens.css'`.
Le défaut restait invisible parce que la v3 n'émet encore **aucune page**, donc
webpack ne compile jamais `globals.css`.

Un franchissement de frontière de paquet se **déclare** : `@meeshy/design-tokens`
est un workspace, `apps/web-v3` le porte en dépendance, le Dockerfile l'installe
comme le legacy installe `@meeshy/shared`, et `docker.yml` reconstruit l'image de
la v3 quand ce paquet change. Les trois sont gardés par
`scripts/check-v3-pipeline.mjs` (`aucune source de la v3 n'atteint le disque hors
de son paquet`, `tout paquet déclaré par la v3 voyage dans son image`, `tout
paquet déclaré par la v3 reconstruit son image`).

## Ce que la table ne fait jamais

**Elle ne bascule pas toute seule.** Aucun de ces fichiers ne contient de
requête de média sur le schéma de couleurs de l'OS — le mot lui-même n'apparaît
dans aucun des trois fichiers de jetons, pour que le témoin du critère de fin
soit un `grep` et pas une lecture. Le seul site qui interroge l'OS est
`apps/web-v3/app/theme-script.tsx`, qui lit `localStorage` puis, à défaut,
`matchMedia`, et **corrige** la classe rendue par le serveur avant le premier
pixel.

L'hybride « média pour les jetons, classe pour Tailwind » est une jumelle
divergente : un utilisateur en préférence **claire explicite** sur un **OS
sombre** obtiendrait des jetons sombres sous des utilitaires `dark:` clairs.
La préférence de l'OS ne gouverne donc que la valeur **par défaut de la
classe**, jamais un jeton (conception § 2, issue #4413).

**Et cette phrase est MESURÉE, pas seulement grepée.** Un `grep` dit qu'aucune
requête de média n'est écrite ; il ne dit pas ce que le navigateur **sert**.
`apps/web-v3/scripts/lib/cascade.mjs` résout la table — `@import` dans l'ordre,
spécificité, condition `prefers-color-scheme` — sous une classe et sous un
schéma d'OS donnés, et le gate refuse toute propriété dont la valeur SERVIE
change avec l'OS à classe égale (`suivisDeLOS`). Le témoin qui compte est celui
du lecteur **sans JavaScript**, donc sans classe : c'est lui, et lui seul, qu'un
`@media` reprend — les deux classes explicites l'emportent par spécificité et ne
verraient rien tomber.

Le moteur, symétriquement, est **UN** module : `apps/web-v3/app/theme-script.tsx`.
`moteursParalleles` refuse dans `apps/web-v3` les cinq formes par lesquelles un
second site interroge le thème — une requête `@media` sur le schéma dans une
feuille, sélecteur `.dark`/`.light` dans une feuille, `prefers-color-scheme` en
code, `classList` sur la classe de thème, variante Tailwind `dark:` qui nomme
une couleur hors table (`dark:bg-slate-900` refusé, `dark:bg-[var(--color-…)]`
accepté). L'exception est **nommée en constante** : ouvrir un second site
demande de l'ajouter là, jamais de laisser un fichier de plus lire `matchMedia`
sans que rien ne rougisse.

Vérification :

```bash
grep -rn 'prefers-color-scheme' packages/design-tokens/*.css   # rien
cd apps/web-v3 && node scripts/check-jetons.mjs
cd apps/web-v3 && bunx jest --testPathPatterns='(jetons|moteur-de-theme|theme-script)'
node scripts/check-v3-pipeline.mjs --self-test
```

## Pourquoi le schéma sombre est porté par `:root`, et pourquoi ça ne suffit pas

Sans classe posée — **navigateur sans JavaScript**, la cible du rôle premier —
il faut tout de même servir un thème complet. C'est le sombre, parce que c'est
le rendu de référence de la planche (« nocturne ») et parce que `ds-shim.css`
déclare déjà ses valeurs sur `:root` : le harnais de captures peut donc
consommer `tokens.css` à la place de `ds-shim.css` **sans changer un pixel**.
`:root.light` l'emporte par spécificité, quel que soit l'ordre des imports.

**Ce que cela coûte, écrit noir sur blanc** [revue #4413] : un lecteur **sans
JavaScript** reçoit du **SOMBRE quelle que soit la préférence de son
appareil**, et rien dans la v3 ne lui permet d'en changer — la coquille racine
rend `<html class="dark">` avant de rien savoir de lui. Ce n'est pas un oubli
d'implémentation, c'est un arbitrage à faire, et il touche les dimensions 5
(accès) et 9 (compatibilité) du **rôle premier**. Trois portes existent :

| porte | ce qu'elle coûte |
|---|---|
| assumer le sombre (aujourd'hui) | un lecteur sans JS en préférence claire lit du sombre |
| un `@media (prefers-color-scheme: light) { :root:not(.dark):not(.light) { … } }` | qualifié par l'ABSENCE des deux classes, il ne peut jamais l'emporter sur un choix explicite — donc ce n'est PAS la jumelle que #4413 refuse ; mais le gate le refuse quand même (`BASCULE` rougit sur tout `prefers-color-scheme` dans la table, et `suivisDeLOS` exige l'égalité sous `classes: []`), et l'ouvrir demanderait d'assouplir DEUX contrôles que la revue #4413 vient de montrer poreux ailleurs |
| rendre la classe côté SERVEUR d'après `Sec-CH-Prefers-Color-Scheme` | aucune seconde table, aucun assouplissement de gate ; coûte un en-tête `Accept-CH` et une variation de cache |

Tant que l'arbitrage n'est pas rendu, la première porte est celle qui est
servie, et le gate reste strict : il vaut mieux un gate plus large que sa loi
qu'une loi qu'on relâche avant d'avoir décidé.

Mais des jetons sombres sur un `<html>` nu ne font pas une page sombre. Deux
choses manquaient, et les deux ne coûtaient rien :

1. **`color-scheme` est déclaré ICI**, dans chaque schéma, pas par le script
   inline. Posé en JavaScript seul, il laissait un lecteur sans JS avec des
   ascenseurs, des contrôles de formulaire et un canevas de surdéfilement
   **blancs** sous une page sombre. La conception § 2 dit « `color-scheme` suit
   la classe » : il la suit en CSS.
2. **La classe par défaut est rendue par le SERVEUR**
   (`apps/web-v3/app/layout.tsx` → `<html className={THEME_PAR_DEFAUT}>`).
   Sans elle, `darkMode: ["class"]` laissait les utilitaires `dark:` de Tailwind
   INACTIFS chez un visiteur sans JS pendant que les jetons peignaient sombre —
   la jumelle divergente ci-dessus, recréée dans le cas no-JS. Le thème par
   défaut a désormais **un** site : `THEME_PAR_DEFAUT`.

## D'où viennent les valeurs

| Famille | Origine | Comment la rejouer |
|---|---|---|
| Fond, surface, texte, rampe neutre 400–900, accents 200–400, police du corps | **MESURÉE** — `docs/product/MeeshyWebV3Design/ds-shim.css`, reconstitution des jetons du bundle `_ds/nocturne-…` absent du dépôt, elle-même déduite des couleurs écrites en dur dans la planche | `cat docs/product/MeeshyWebV3Design/ds-shim.css` |
| Primaire (`--color-primary`) | **MESURÉE** — `--meeshy-p` de la planche, égal à `--color-accent-400` | `grep -o 'meeshy-p:[^}]*' docs/product/MeeshyWebV3Design/MeeshyWebV3.dc.html` |
| États (succès, avertissement, danger) et palette d'avatars | **MESURÉES puis CORRIGÉES là où elles ne se lisent pas** — les hex écrits en dur dans la planche, par rôle observé ; voir « Ce que la lisibilité a changé » | `grep -oE '#[0-9a-fA-F]{3,8}\b' docs/product/MeeshyWebV3Design/MeeshyWebV3.dc.html \| sort \| uniq -c \| sort -rn` |
| Ombres | **MESURÉES** — les trois `box-shadow` de la planche | `grep -oE 'box-shadow:[^;"]{0,60}' docs/product/MeeshyWebV3Design/MeeshyWebV3.dc.html` |
| Présence (`--color-presence-*`) | **CITÉE en SOMBRE, DÉRIVÉE en CLAIR** — `CLAUDE.md` § « User Presence » fixe la palette 1/3/5 et impose **une** carte centrale par client ; elle la fixe pour des surfaces **nocturnes**, et ne dit rien d'un fond blanc. Voir « Ce que la lisibilité a changé » | `grep -n 'PRESENCE_DOT_CLASS' CLAUDE.md` |
| Rayons, tailles de texte, graisses | **MESURÉES puis RÉDUITES en échelle** — voir ci-dessous | `grep -oE 'border-radius:[0-9]+px' …` / `grep -oE 'font-size:[0-9]+px' …` |
| **Tout le schéma clair** | **DÉRIVÉ, non mesuré** — la planche n'a aucune vue claire | — |
| Police monospace, interlignes | **DÉRIVÉS, non mesurés** — la planche pose `line-height:1` partout (c'est un dessin, pas du texte qui coule) | — |

### Ce que l'échelle absorbe

La planche écrit **onze** rayons (6, 8, 10, 11, 12, 14, 16, 18, 20, 22, 26 px
et la pilule) et **seize** tailles de texte (11 → 34 px, presque tous les
pas). Une énumération n'est pas une échelle : la table en retient sept rayons
et dix tailles, et les valeurs intermédiaires sont absorbées par le pas le plus
proche (10 → `--radius-sm`, 11 et 14 → `--radius-md`, 18 → `--radius-lg`,
22 → `--radius-xl` ; 16 → `--text-base`, 18 → `--text-md`, 20 et 21 →
`--text-lg`, 23 et 24 → `--text-xl`, 28 → `--text-2xl`).

**Écart assumé**, au même titre que l'écart typographique et chromatique de la
planche : la conformité se mesure sur la **disposition, la hiérarchie, les
états et les gestes** — `compare-rendu.js` ne compare ni couleur ni typographie
(conception § 3.3 et § « Sur la mesure de conformité »).

### Ce que le schéma clair a changé aux valeurs mesurées

La rampe neutre est **retournée** (400 reste le rôle « le plus contrasté »,
900 le rôle « le plus proche du fond »). **Retourner la rampe ne retourne pas
les rôles** : `--color-surface-raised` veut dire « au-dessus », et le prendre
dans la rampe retournée le peignait plus SOMBRE que `--color-surface`, à
1,00:1 de `--color-bg-sunken` — « surélevé » et « enfoncé » strictement
indiscernables. Les quatre plans (`bg-sunken`, `bg`, `surface`,
`surface-raised`) forment désormais une **échelle strictement croissante en
luminance dans les deux schémas**, l'élévation restant portée par
`--shadow-sm`. Une parité de **clés** ne disait rien de ça : le témoin est un
contrôle d'**ordre**.

`--color-on-primary` suit la même règle dans les deux schémas : encre sombre sur
la primaire claire du sombre, blanche sur la primaire foncée du clair. La
planche écrit du blanc sur sa primaire.

### Ce que la lisibilité a changé — dans les DEUX schémas

Le gate **calcule** les rapports WCAG sur la table RÉSOLUE (les `var()` sont
suivis) et rejoue la même loi sur les deux schémas : **4,5:1** pour tout ce qui
se lit (WCAG 1.4.3), **3:1** pour ce qui porte seul son information sans être
du texte (WCAG 1.4.11 — contour visible d'un contrôle, pastille de présence).

Le schéma **sombre**, pourtant le seul mesuré, portait quatre paires sous AA.
Ce que la table corrige, et son rapport AVANT :

| Jeton | Avant | Mesuré | Après |
|---|---|---|---|
| `--color-text-subtle` (sombre) | `var(--color-neutral-600)` #75798c | 4,46 sur `--color-bg`, **3,53** sur `--color-surface-raised` | #8a8ea6 — sort de la rampe, le RÔLE prend la valeur qui tient sa loi |
| `--color-text-subtle` (clair) | `var(--color-neutral-600)` #666a80 | **4,39** sur `--color-bg-sunken` | #5f6379 |
| `--color-danger` (sombre) | #ef4444 | **4,04** sur `--color-surface-raised` | #f45b5b |
| `--color-danger` (clair) | #dc2626 | **3,98** sur `--color-bg-sunken` | #c81e1e |
| `--color-warning` (clair) | #b45309 | **4,14** sur `--color-bg-sunken` | #a84e08 |
| `--color-avatar-1` | #6366f1 | **4,37** sous `--color-on-avatar` — des initiales sont du TEXTE | #7d80f6 |
| `--color-border-interactive` | *n'existait pas* | `--color-border` 1,28:1 et `--color-border-strong` 1,88:1 sur `--color-surface-raised` : **aucun jeton ne permettait de dessiner le contour d'un contrôle** | jeton neuf, ≥ 3:1 dans les deux schémas |
| `--color-presence-*` (clair) | valeurs sombres servies verbatim | **1,80 / 1,56 / 2,37** sur `--color-bg` | famille DE schéma ; teintes assombries, ≥ 3:1 |

C'est le **seul** endroit où la table corrige la planche, et c'est au titre de
la dimension 5 (facilité d'accès). Chaque correction est un cran de luminance,
jamais un changement de teinte.

Sur la présence : `CLAUDE.md` impose **une** carte centrale par client et fixe
la palette 1/3/5 pour des surfaces nocturnes. Il n'autorise pas à servir cette
carte sur un fond blanc sans vérifier qu'on la voit — les pastilles sont le
SEUL porteur de leur information (aucun libellé sur un avatar). Le sombre garde
donc les valeurs citées à l'identique ; le clair sert leurs variantes
assombries, et cet écart est ici.

## Ajouter un jeton

1. Une valeur **de schéma** (elle change entre clair et sombre) va dans
   `dark.css` **et** `light.css` — `node scripts/check-jetons.mjs` refuse un
   jeton qui n'a pas sa jumelle dans l'autre schéma. Ce contrôle vivait
   uniquement dans un test jest : la commande citée ici rendait vert sur un
   orphelin, et le contributeur ne découvrait le refus qu'ailleurs.
2. Une valeur **hors schéma** (typographie, rayon, palette catégorielle) va dans
   `tokens.css`. Le test : *sa lisibilité dépend-elle du fond ?* Si oui, ce
   n'est pas une valeur hors schéma — c'est ce qui a fait sortir
   `--color-presence-*` de `tokens.css`.
3. Une couleur d'encre ou de signal **s'inscrit dans la loi de contraste** de
   `scripts/check-jetons.mjs` (`ENCRES_SUR_PLAN`, `SIGNAUX_SUR_PLAN`,
   `ENCRES_SUR_FOND`). Un jeton de couleur qu'aucune paire ne nomme n'est gardé
   par personne.
4. Une valeur qui n'est ni mesurée ni citée n'entre pas : elle se mesure
   d'abord, et la ligne de sa provenance s'ajoute au tableau ci-dessus.
