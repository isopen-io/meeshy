## Leçon 621

**Un gate qui NOMME une surface et en MESURE une autre est indiscernable d'un
gate juste — tant que la surface en trop reste vide.**

`check-reels.mjs` portait l'invariante 9 : « le retour du navigateur quitte les
Réels et ne laisse **AUCUN lecteur** ». Son implémentation :

```js
const players = (page) =>
  page.evaluate(() => [...document.querySelectorAll('video, audio')].map((m) => ({
    page: Number(m.closest('[data-reel-index]')?.getAttribute('data-reel-index') ?? -1),
    playing: !m.paused && !m.ended,
  })));
// ... APRÈS un page.goBack() vers /feed :
check(left.length === 0, `${label} : le retour ... aucun lecteur ne reste`);
```

Le sélecteur balaie **tout le document**, et le check s'évalue après un retour
**vers le Flux** — il comptait donc les médias du FIL, l'écran même où l'on
vient d'atterrir. L'invariante était juste tant qu'aucune carte du fil ne
montait de `<video>` ni d'`<audio>`. #6807 en a posé deux (un post vidéo, un
post sonore) : les **quatre** déclinaisons (clair/sombre × 390×844/320×568) ont
rougi d'un coup, sur un lot qui ne touchait aucun fichier des Réels.

**Le message d'échec portait déjà son diagnostic.** `page: -1` est la valeur de
repli de `closest('[data-reel-index]') ?? -1` : elle DIT que ces éléments
n'appartiennent à aucun réel. L'auteur avait anticipé le cas dans le repli et
pas dans l'assertion. Lire la valeur de repli d'un message d'échec avant de
chercher ailleurs coûte zéro seconde.

**Jumelle de la 620, à un cran de distance.** La 620 dit qu'un témoin non
inscrit est indiscernable d'un témoin vert ; celle-ci dit qu'un gate dont le
sélecteur est plus large que sa phrase est indiscernable d'un gate juste. Dans
les deux cas ce n'est pas le code qui ment — c'est la PREUVE qui ne mesure pas
ce qu'elle annonce, et rien ne le signale tant que l'écart n'a pas de matière.

**Ce qui a failli faire conclure faux.** Vert en local, rouge en CI : la pente
naturelle est « la machine ». La mesure qui réfute cela en un appel, sans rien
reconstruire — demander à `dev` le verdict du MÊME job :

```bash
gh api repos/<org>/<repo>/commits/$(git rev-parse origin/dev)/check-runs \
  --jq '.check_runs[]|select(.name|test("<job>"))|"\(.name) :: \(.conclusion)"'
```

**Mais l'asymétrie ne prouve pas la causalité, et la prémisse est le
DÉTERMINISME.** `succès(parent) ∧ échec(branche) ⇒ c'est le lot` n'est vrai que
si le verdict est une FONCTION du code ; sur une suite qui contient un test
temporel, c'est une variable aléatoire et un seul tirage ne distingue pas un lot
fautif d'un tirage malheureux. Les deux mesures qui complètent, gratuites :
**(1)** le diff touche-t-il un chemin dont dépend ce qui rougit (`git show
--stat`, avant toute hypothèse) ; **(2)** rejouer le MÊME commit — deux verdicts
sur un code identique et la question tombe.

**How to apply.** Quand un lot fait apparaître un type d'élément sur une surface
qui n'en avait pas, chercher les gates qui comptent ce type SANS le restreindre
à leur propre surface :

```bash
grep -n "querySelectorAll('video\|querySelectorAll('audio\|querySelectorAll('\[role=" scripts/*.mjs
```

Un sélecteur non préfixé par le conteneur de sa surface est un faux positif en
attente. Et jouer les gates VOISINS avant de pousser, pas seulement celui qu'on
vient d'écrire : c'est la même famille que la leçon sur la chaîne de
vérification locale qui rate l'étape qui juge.
