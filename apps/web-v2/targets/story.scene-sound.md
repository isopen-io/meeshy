# Preuve — le son de fond joue réellement sur une coque (#6899, correction revue)

Ce que la revue-correction demandait : ne pas se contenter d'un bouton son présent à l'écran,
mais lire `HTMLMediaElement.currentTime` AVANT/APRÈS un geste, dans le VRAI moteur de rendu de la
coque (WKWebView / Android WebView), et verser la capture au dépôt.

## Coque testée : AVD `Meeshy_Poc_Web-v31` (Android WebView, `me.meeshy.app`, PID mesuré 3526)

Méthode : `adb forward tcp:PORT localabstract:webview_devtools_remote_<pid>`, puis le protocole
CDP RÉEL exposé par le WebView applicatif (pas Chrome desktop) via un client WebSocket — la
même API que `chrome://inspect`, mais parlée directement au bridge du WebView. Navigation vers
`/story/st-scene` (la fixture `st-scene`, `src/lib/api/fixtures-stories.ts:234-275` — fond
paysage + texte + piste `a1` `isBackground:true`), puis lecture répétée de
`document.querySelectorAll('audio')[0].currentTime` sans aucune interaction supplémentaire (le
son démarre automatiquement à l'ouverture de la scène, comme sur iOS ; aucun blocage de la
politique d'autoplay n'a été observé sur ce WebView).

Résultat MESURÉ (huit lectures espacées d'une seconde, même session) :

```
t+1s: {"url":"/story/st-scene","audios":[{"currentTime":0.756384,"paused":false,"readyState":4}],"verdict":"canvas"}
t+2s: {"url":"/story/st-scene","audios":[{"currentTime":1.797358,"paused":false,"readyState":4}],"verdict":"canvas"}
t+3s: {"url":"/story/st-scene","audios":[{"currentTime":0.473301,"paused":false,"readyState":4}],"verdict":"canvas"}
```
(rejoué deux fois à des instants différents ; le premier passage a été suivi jusqu'à t+8s : la
piste boucle — `currentTime` retombe près de 0 à chaque tour, cohérent avec `loop:true` sur un
clip d'environ 2 s — puis la diapositive avance vers la story suivante à `timelineDuration: 8`.)

`readyState: 4` (`HAVE_ENOUGH_DATA`) et `paused: false` à chaque lecture : la piste ne joue pas
« en apparence », `currentTime` AVANCE réellement, gouvernée par l'horloge du média — pas une
alternance d'états gelés. `verdict: "canvas"` confirme aussi que le texte `t1` (posé sur la bande
basse, hors du rectangle image) fait bien basculer la présentation hors du chemin « image seule »,
comme la spécification l'exige pour cette fixture.

## Captures versionnées

- `story.scene-sound.android.png` — la scène `st-scene` en cours de lecture (texte « Golden hour,
  on the bands », bouton son NON coupé visible dans la ligne auteur, barre de progression au
  deuxième segment). `adb shell cmd uimode night` → `yes` au moment de la capture.
- `story.scene-sound.android-light-statusbar.png` — MÊME scène, MÊME session de lecture, système
  basculé en `adb shell cmd uimode night no` : seule la barre de statut Android change de thème
  (icônes sombres sur fond clair) ; le canevas du lecteur reste inchangé — attendu, `story.tsx`
  force `colorScheme: 'dark'` sur tout le lecteur quel que soit le thème système
  (`apps/web-v2/src/routes/story.tsx:598`), donc les deux schémas produisent la MÊME peinture du
  plateau par construction. Les deux captures le démontrent plutôt que de le réaffirmer.

## Coque iOS (WKWebView, simulateur `Meeshy Poc-Web-V2`, 138B8B8D-0B3B-44E5-98B0-B62723B884BC)

**Non obtenue — un défaut BLOQUANT a été découvert en tentant de la produire**, distinct de
« la preuve manque » : sur ce simulateur, ouvrir `/story/st-scene` (même méthode de navigation,
vérifiée équivalente : `history.pushState` + `popstate`, le mécanisme que `src/lib/router.tsx:311`
écoute réellement) rend `data-story-verdict="imageOnly"`, ZÉRO élément `<audio>` monté, puis le
lecteur se referme vers la liste des conversations en un peu plus d'une seconde — reproduit
proprement à deux reprises (un relancement complet de l'app entre les deux). `data-story-scene`
confirme qu'il s'agit bien de `st-scene` (pas d'une autre fixture) ; `location.pathname` retombe
sur `/` sans qu'aucune erreur JS ne soit journalisée (`Runtime.exceptionThrown` observé et vide).

Le même parcours (même fixture, mêmes lois `imageOnlyPresentation`/`electBackgroundTrack`) est
gardé VERT par le gate automatisé `scripts/check-story-scene.mjs` (105 invariants, Chromium via
Playwright) — la LOGIQUE n'est donc pas mise en cause par ce relevé : quelque chose de propre à
WebKit/WKWebView (mesure de disposition au premier rendu, minuterie, ou une interaction avec la
détection « story illisible » du lecteur) fait diverger le verdict par rapport à Chromium et à
Android WebView, sur la MÊME fixture. Ce point n'était pas dans l'énoncé des deux défauts confiés
à cette correction ; il EXPLIQUE pourquoi aucune preuve positive n'a pu être produite côté iOS,
et devrait être ouvert comme son propre défaut avant de clore #6899 pour de bon (« qu'est-ce qui
part à côté » aussi vaut pour les VERDICTS, pas seulement pour les CHAMPS).

Ouvert : isopen-io/meeshy#6927.
