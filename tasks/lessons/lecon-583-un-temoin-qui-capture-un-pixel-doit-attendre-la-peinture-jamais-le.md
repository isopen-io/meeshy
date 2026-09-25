## Leçon 583 — Un témoin qui CAPTURE un pixel doit attendre la PEINTURE, jamais le chargement — et `complete` ne dit rien de la peinture

2026-09-12, #6135. `check-media.mjs` garde un défaut de PEINTURE : le glyphe de
repli ne doit pas se poser par-dessus une image décodée. Il capture la pièce
jointe, échantillonne le cœur de sa boîte, et exige une seule couleur. Il était
**vert en local et rouge en CI depuis sa naissance**, onze heures durant — et
comme le job s'arrête au premier rouge, il faisait sauter les neuf gates
suivants.

Le message ne disait pas assez pour trancher :

```
le cœur de la boîte est la couleur servie (229,246,248) à 21,20 %, en 106 teintes
```

**Trois hypothèses ont été falsifiées à la main, à un run de quinze minutes par
tour** : le composeur qui recouvrirait la pièce (la marge de 11 px concernait une
AUTRE pièce, 1 169 px plus bas) ; `loading="lazy"` qui différerait le chargement
(`complete=true` au repos, en local) ; la rastérisation logicielle du runner
(trois lancements, dont `--use-angle=swiftshader` : les trois rendaient 100,00 %
sur une teinte). Aucune ne tenait, et le gate restait vert en local sur les trois.

CE QUI A TRANCHÉ : FAIRE DIRE AU TÉMOIN CE QU'IL A VU. Enrichi de l'état de
l'`<img>` au moment de la capture et des CINQ premières couleurs, il a rendu en
CI deux relevés que seule une explication réconcilie :

```
cinq premières : 229,246,248 21.2% | 228,245,247 16.0% | 228,245,248 15.3%
                 | 230,246,248 11.8% | 229,245,248 10.4%
image APRÈS la capture : complete=true naturalWidth=1 hidden=false couvre=true
                 opacity=1 objectFit=cover visible
fond de la figure : color(srgb 0.27451 0.741176 0.792157 / 0.12)
```

`229,246,248` est l'accent de la conversation à 12 % composité — **le fond de la
figure**, pas l'image indigo `99,102,241`. Le cœur montrait donc la boîte VIDE,
pendant que l'`<img>` relevée juste après se déclarait décodée, opaque et
couvrant exactement cette boîte. **La capture avait précédé la peinture.**

La pièce mesurée est le PREMIER message du fil (`top = -462` au repos) et son
`<img>` porte `loading="lazy"` + `decoding="async"`. `locator.screenshot()` fait
défiler l'élément dans le champ **puis** capture : la capture tombe dans la même
séquence que le chargement que son propre défilement vient de déclencher. Sur
macOS la peinture arrive avant ; sur le runner Linux, non.

> **`complete` dit que les octets sont là, jamais qu'un pixel a été posé.** Un
> témoin qui lit des PIXELS attend `scrollIntoViewIfNeeded()` → `decode()` →
> DEUX `requestAnimationFrame` (le premier rend la main au compositeur, le second
> garantit qu'une frame a été produite après le décodage). Et il ne se repose
> jamais sur le défilement IMPLICITE de la capture : ce défilement est la cause
> du chargement qu'on attend.

SECONDE MOITIÉ, ET ELLE RENDAIT LE MESSAGE TROMPEUR : **une part de pixels ne se
mesure pas à l'ÉGALITÉ STRICTE.** Les cinq couleurs ci-dessus sont la même à ±2 :
un aplat composité est TRAMÉ, et compter des clés `"r,g,b"` exactes fragmentait un
champ uniforme à l'œil en 106 clés — d'où « 21,20 % » pour un aplat. Le témoin
annonçait un recouvrement là où il n'y avait qu'une trame. La part se calcule à
une DISTANCE de la dominante (ici ±2).

LA TOLÉRANCE SE JUSTIFIE PAR UNE MESURE, JAMAIS PAR UN SENTIMENT. Un témoin
desserré qui ne tombe plus ne garde rien : la faute d'origine a été rejouée (le
glyphe repeint APRÈS l'`<img>`, donc par-dessus), reconstruite, mesurée.

|  | à ±2 | à l'exact | teintes | |
|---|---|---|---|---|
| forme fautive, clair | 92,16 % | 92,13 % | 54 | ROUGE |
| forme fautive, sombre | 90,47 % | 90,36 % | 65 | ROUGE |
| forme correcte | 100,00 % | 100,00 % | 1 | VERT |

**La tolérance ne déplace le verdict que de 0,03 point sur la forme fautive** :
elle est orthogonale au défaut gardé, et le glyphe fondu (`71,71,174` contre
`99,102,241`) en est à une distance de 67 — trente-trois fois le seuil. C'est
cette mesure-là, pas l'intuition, qui autorise à desserrer.

Et deux de mes propres hypothèses, corrigées pour qu'elles ne traînent pas : le
schéma SOMBRE n'était pas un faux vert (il rougit à 90,47 % sur la forme fautive,
il mesure donc bien) ; le CADRAGE n'était pas en cause (capture CI 251×168,
locale 247×165 — la CI est même légèrement plus grande).

> **Un témoin qui rougit sans dire ce qu'il a vu coûte un run par hypothèse.**
> Lui faire rendre son relevé dans le message d'ÉCHEC — jamais au repos — est
> moins cher que la première hypothèse qu'on aurait explorée sans lui.

Mécanique du comptage par égalité stricte identifiée par la session `andp-00`.
Voir aussi la 576 (un défaut visuel peut n'exister que sur UN moteur).
