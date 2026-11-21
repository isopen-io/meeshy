# Cycle 176 — `dev` était rouge sans qu'une ligne du dépôt ait changé : le navigateur des gardes flottait

*2026-11-18. Branche `claude/exciting-planck-23hbzb`, PR #19481, fusionnée dans
`dev` par `d83328e26`. Livre #19480 (milestone « Les gardes navigateur ne
rougissent plus parce que Chromium a changé »).*

---

## Le point de départ : un suivi du cycle 175

Le cycle 175 s'était clos sur trois suivis, dont celui-ci : **« #18760 n'est pas
refermé — les runs `ci.yml` de `dev` concluent `cancelled`, si bien que `dev`
n'a pas de verdict à sa tête. C'est le défaut d'INFRASTRUCTURE qui a le plus
coûté à cette session. »**

Il avait raison, et il a coûté une deuxième fois. Le dernier run de `dev` qui
avait CONCLU (n° 30113) rendait `failure` ; tous les suivants concluaient
`cancelled` ou patientaient en `queued`. **`dev` était donc rouge à sa tête
depuis des heures, et le tableau ne le montrait nulle part.**

Un seul job tombait : `Web · gardes navigateur (Playwright) · tranche 4`, et
avec lui le `Verdict CI`.

## La question juste

Les deux gardes passent **en local**, à la tête de `dev`, sans rien modifier.
C'est le fait qui cadre tout le cycle, parce qu'il interdit la lecture
spontanée (« un lot a cassé quelque chose ») :

> **Quand la CI rougit sans qu'une ligne du dépôt ait changé, la question n'est
> pas « qui a cassé ça ? » mais « qu'est-ce qui a BOUGÉ et qui n'est pas dans le
> diff ? »** — et la réponse est dans les lignes d'INSTALLATION du log, que
> personne ne lit.

Elles la donnaient :

```
ligne  421 : + @playwright/test@1.65.1
ligne 2409 : Downloading Chrome for Testing 159.0.8154.6 (playwright chromium v1255)
```

Le dépôt épingle Node (`22.19`), bun (`1.3.14`), pnpm (`9`) et Python (`3.10`)
dans l'en-tête de `ci.yml`. **Le navigateur, lui, flottait** : `^1.62.1` dans
`package.json`, et `preparer-js` lance `bun install` **sans**
`--frozen-lockfile` — la CI ne lisait donc même pas le pin de `bun.lock`
(1.64.1), elle résolvait au plus récent à chaque run. Mon conteneur, lui,
tournait sous Chrome 153.

## Les deux témoins étaient fautifs INDÉPENDAMMENT de la version

C'est le point qui décide du correctif. Le saut 1.64 → 1.65 n'a pas cassé deux
témoins justes : il a **révélé** deux témoins qui ne mesuraient pas ce qu'ils
annonçaient.

| témoin | ce que 1.65 / Chrome 159 change | ce qu'il mesurait vraiment |
|---|---|---|
| `check-feed-scenes.mjs:650` | `inert` est respecté dans les contrôles d'actionnabilité | il cliquait une page de carrousel que l'application rend `inert` **à dessein** — un geste qu'aucun utilisateur ne peut faire |
| `check-media-grid.mjs:627` | `justify-content: flex-end` se sérialise `flow-end` | il comparait `getComputedStyle(…).justifyContent` à un littéral — il testait **le navigateur** |

Pour le second, mesuré avant de conclure : la feuille bâtie ne déclare que
`justify-content:flex-end` (aucun `flow-end` nulle part dans `dist`), et
Chrome 153 rend bien `flex-end`. C'est la sérialisation qui a bougé, pas le
style.

Pour le premier, le relevé DOM a tranché une hypothèse tentante — « c'est une
course, la page devient inerte trop tard » : la sonde montre la page 1 inerte
aux DEUX gabarits, dès le premier rendu, **y compris en local où le clic
passe**. L'inertie n'est pas un accident de timing, c'est la décision de
l'application. Et elle est juste : une page hors écran ne doit recevoir ni le
doigt ni le lecteur d'écran.

> **L'application avait raison ; c'est la garde qui, en cliquant au travers,
> affirmait implicitement le contraire.** Aucun code d'application n'a été
> relâché pour faire passer un test — c'est le témoin qui a été ramené sur le
> chemin réel (amener la scène par la flèche, attendre le FAIT
> `aria-current="true"` ET inertie levée, puis toucher).

## Ce que le lot a fait, et ce qu'il n'a pas fait

Les deux témoins corrigés **plus la cause racine** : `@playwright/test` épinglé
au patch. Un spec exact ne laisse rien à résoudre, donc une montée de navigateur
arrivera par une PR de dépendance RELUE.

Ce qu'il n'a **pas** fait, et la mesure qui l'explique :
`bun install --frozen-lockfile` est le geste qui fermerait le flottement à la
source. Contrôle sur `dev` PRISTINE (`git stash`) : il échoue **déjà**
(`overrides in package.json changed since bun.lock was saved`), le bun du
conteneur (1.4.4) ne normalisant ni les `overrides` ni la version de lockfile
comme le 1.3.14 de la CI. Geler exige d'abord de régénérer `bun.lock` AVEC bun
1.3.14 — un lot à soi (#19613).

## Le rouge que j'ai moi-même produit, et comment l'attribution s'est tranchée

`Gardes du dépôt` est tombé sur la PR. **Le dépôt tient DEUX lockfiles**, et je
n'en avais épinglé qu'un : `pnpm-lock.yaml` — celui sur lequel tourne Turborepo
— portait encore `^1.62.1`.

L'attribution ne s'est pas devinée, elle s'est contrôlée :

| arbre | `check-lockfile-alignment.mjs` |
|---|---|
| manifestes de `dev` | self-test 14/14, « alignés sur les 7 manifestes » |
| mon `bun.lock` seul | **2 désalignements** |

Le rouge était le mien. Régénéré par le geste que la garde prescrit elle-même
(`pnpm install --lockfile-only`), diff confiné à playwright plus le retrait de
`fsevents@2.3.2` que 1.65 ne déclare plus. **Recoupement utile** : les trois
empreintes écrites par pnpm sont identiques à celles lues au registre pour
l'édition chirurgicale de `bun.lock` — les deux lockfiles décrivent le même
arbre.

### Et la garde a signalé DEUX choses, pas une

Son `--self-test` tombait aussi, sur une sonde « aurait dû rester silencieuse ».
Il n'est donc **pas hermétique** : il dérive ses fixtures des manifestes RÉELS,
si bien qu'un désalignement du dépôt fait échouer une sonde de TOLÉRANCE et rend
un message qui accuse le **vérificateur** d'être trop strict. Il m'a envoyé
chercher du mauvais côté ; la cause n'est venue que du run hors self-test.
Suivi #19612.

## Preuve

- **run [44230572294](https://github.com/isopen-io/meeshy/actions/runs/44230572294),
  sur l'arbre FUSIONNÉ `f411083de` : 26 jobs, ZÉRO non-vert, tranche 4 verte,
  `Verdict CI` vert** — sous Chrome 159, le navigateur que le conteneur ne peut
  pas obtenir (`cdn.playwright.dev` refusé par le proxy, 403) ;
- run 44210396832 sur `15ec324be` : 26 jobs, zéro non-vert ;
- en local, sur l'arbre fusionné : les **21 gardes** du job `Gardes du dépôt`, le
  build du web, `check-feed-scenes` (**174 invariants, compte INCHANGÉ** — aucun
  témoin perdu) et `check-thread-states` ;
- **deux mutations rouges**, chacune ancrée sur le nom de l'unité visée :
  précondition retournée en `justify-start` ⇒ `ECHEC … media-16 … (obtenu
  ["flex","justify-end"])` — le relevé prouvant au passage que la rangée porte
  bien la classe lue ; navigation retirée ⇒ `waitForFunction: Timeout 30000ms` ;
- `dev` (`c11ad1d14`) contenue dans la branche, et le `dist` **reconstruit**
  plutôt que réutilisé bien que `dev` n'ait touché aucun fichier de
  `apps/web/src` : réutiliser un artefact que personne n'a re-dérivé est
  exactement la classe de faute que ce lot corrige.

## Suivis

- **#19612** — le `--self-test` de `check-lockfile-alignment.mjs` n'est pas
  hermétique, et accuse l'outil quand c'est le dépôt qui est en faute.
- **#19613** — le bun du conteneur (1.4.4) réécrit `bun.lock` en
  `lockfileVersion: 3` à chaque `bun install`, y compris celui du hook de
  démarrage de session ; le bun 1.3.14 de la CI ne sait pas le lire
  (`UnknownLockfileVersion`, ce que `56e4bf53a` a dû réparer). Reverti à la main
  dans cette session ; **rien ne le garde**. Porte aussi
  `bun install --frozen-lockfile`.
- **#18760 n'est toujours pas refermé**, et c'est la deuxième session de suite
  qu'il coûte cher : sans verdict à la tête de `dev`, un rouge y vit invisible.
  Ce cycle ne l'adresse pas.
- **La valeur 500 du plafond de la file** et sa politique d'éviction ne sont
  toujours pas touchées (#18733 en a posé la trace ; la mesure manque) — hérité
  du cycle 175, non instruit ici.
