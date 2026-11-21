# Le garde des contrôles d'appel frappait un bouton qu'un rail recouvrait encore (#20151)

**2026-11-21** — `apps/web/scripts/check-calls-controls.mjs`. Rouge intermittent sur le seul gabarit 568 × 320, constaté sur deux PR sans rapport avec l'interface d'appel (#20131, tête `112f91f343` ; #20149, tête `c378682f59`), avec exactement les deux mêmes lignes :

```
· vocal 568 × 320 : « Journal » ouvre le journal DANS la pilule
· vocal 568 × 320 : page.$eval: Failed to find element matching selector "[data-call-journal]"
```

Les deux n'en font qu'une : la seconde lit le contenu du panneau que la première n'a pas vu apparaître.

## Ce qui a été mesuré

Le bloc a été rejoué en boucle localement (Chromium préinstallé, `/opt/pw-browsers/chromium`), en instrumentant trois choses au moment exact du calcul du centre : la boîte de la cible, `document.elementFromPoint` à ce centre, et `document.elementsFromPoint` (pluriel) pour la pile complète.

**Sans rien forcer**, le journal s'est ouvert 4 fois sur 4 — et le centre calculé n'atteignait PAS la cible 2 fois sur 4 :

```
DIV.flex.min-h-0.flex-col[data-call-rail-scroll=]        ← ce qui reçoit le toucher
DIV.glass-call.pointer-events-auto.flex[data-call-rail=call]
BUTTON.glass-call-disc[data-call-captions-journal=]      ← la cible, DESSOUS
DIV[data-call-captions-footer=]
SECTION[data-call-captions-panel=translated]
```

Le point était bien **dans la boîte** du bouton (`pointInBox: true`), et la boîte n'avait bougé que de 3 px en une image. Ce qui manquait n'était pas la position : c'était que **le rail « L'appel » était encore là, par-dessus**.

**Cause.** Le garde ferme les actions puis n'attend que l'ÉTAT :

```js
await tapOn(page, '[data-call-more]');
await until(page, () => …getAttribute('data-call-layer') === 'idle');   // bascule TOUT DE SUITE
```

Or `apps/web/src/components/call-rails.tsx` le documente : « Un rail qui repart reste TOUCHABLE jusqu'au bout de sa sortie (#17643) : un bouton touché pendant le mouvement répond, comme sur iOS qui garde le hit-test pendant le fondu. » La sortie dure **300 ms**, `pointer-events-auto` compris (posé sur `CallActionRail`, le conteneur parent étant `pointer-events-none`), et à 320 px de haut le rail centré croise précisément le pied des sous-titres. **Le produit a raison ; le garde frappait trop tôt.** Rendre le rail inerte pendant sa sortie reviendrait sur #17643 — ce n'est pas le correctif.

**Pourquoi un seul gabarit.** Pas parce que 320 px est « le plus contraint » : **le bloc du journal n'existe qu'à 568 × 320**, aucune comparaison n'était possible. Le recouvrement, lui, tient bien à la hauteur — sur un écran plus haut, le rail centré ne croise pas le pied de la pilule.

## Rouge déterministe, puis vert

En ralentissant la seule sortie des rails (`[data-call-rail-side] { transition-duration: 3s }`), ce qui ne fait qu'ÉLARGIR la fenêtre que la charge d'un coureur de CI élargit pour de vrai :

| geste | journal ouvert | `elementFromPoint` au centre calculé |
|---|---|---|
| l'ancien (`centerOfSelector` puis `tap`) | **0 / 5** | `DIV[data-call-rail-scroll]`, les cinq fois |
| le nouveau (`tapOn`) | **5 / 5** | `BUTTON[data-call-captions-journal]` |

Deux autres pistes ont été mesurées et ÉCARTÉES :
- **l'étranglement du processeur** (`Emulation.setCPUThrottlingRate: 8`) ne reproduit pas — il retarde les allers-retours Playwright, donc la mesure arrive APRÈS la sortie du rail : 8 ouvertures sur 8, `inside: true` partout. Ralentir la machine rend le garde plus stable, pas moins ;
- **une copie inerte de la cible** (le motif « rien ne part d'un coup » de `CallCaptionsSlot`, qui retient les sous-titres pendant leur fondu) : recensement au moment du calcul — **un seul** `[data-call-captions-journal]` dans le document, `pointerEvents: auto`, `opacity: 1`, hors de tout `[data-leaving]`, `[aria-hidden]`, `[inert]`. Ce n'était pas `locator.first()` qui choisissait la mauvaise.

## Le correctif

`centerOfSelector` est retiré ; ses cinq points d'appel passent par `tapOn`, qui **ne frappe que ce qu'il atteint** :

```js
const posed = (page, selector) =>
  page.waitForFunction((target) => {
    const element = document.querySelector(target);
    if (element === null) return null;
    const moving = (document.querySelector('[data-call-screen]') ?? document)
      .getAnimations({ subtree: true })
      .some((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity);
    if (moving) return null;
    const box = element.getBoundingClientRect();
    const point = [box.left + box.width / 2, box.top + box.height / 2];
    const at = document.elementFromPoint(point[0], point[1]);
    return at !== null && (element === at || element.contains(at)) ? point : null;
  }, selector, { timeout: 8000 }).then((handle) => handle.jsonValue());
```

Deux conditions, et aucune n'est un délai :
1. **plus aucune animation FINIE ne tourne** dans `[data-call-screen]` — les pulsations sans fin (`typingDot`, `endTime === Infinity`) ne se terminent jamais et ne sont pas attendues ; `railsSettled` ne voyait que les `CSSTransition` et `stageSettled` que les `CSSAnimation`, aucun des deux ne couvrait les deux ;
2. **le centre atteint la cible** (`elementFromPoint`), ce qui attrape n'importe quel recouvrement, pas seulement celui de ce rail.

Deux effets au-delà de ce rouge : les quatre autres touchers du fichier enchaînaient les mêmes gestes et sont protégés par construction ; et une cible durablement recouverte échoue désormais **en le disant** (`« … » ne s'est pas posée, ou reste recouverte : rien à frapper`) au lieu des deux lignes muettes qui ont coûté deux réexécutions.

Nettoyage au passage : le doc-comment du glissé de pistes (#8619) était posé sur `centerOfSelector` alors qu'il décrit `dragEach` — il est remis sur son sujet.

## Preuve

- `node scripts/check-calls-controls.mjs` depuis `apps/web` sur l'arbre fusionné : **255 invariants verts, sortie 0**, les quatre gabarits compris.
- Rouge/vert mesuré sous sortie ralentie : 0/5 → 5/5 (tableau ci-dessus).

## Ce que ce lot ne fait pas

Un toucher sur la **marge** d'un rail qui repart (son `[data-call-rail-scroll]`, pas un de ses boutons) est absorbé sans rien déclencher, alors que le geste visait ce qui est dessous. C'est cohérent avec #17643 ; si le porteur veut que seule la surface des BOUTONS reste touchable pendant la sortie, cela mérite son issue `décision-produit`. Noté sur #20151, pas instruit ici.

## Leçon

`tasks/lessons/2026-11-21-un-controle-qui-repart-reste-touchable-donc-il-recouvre.md`
