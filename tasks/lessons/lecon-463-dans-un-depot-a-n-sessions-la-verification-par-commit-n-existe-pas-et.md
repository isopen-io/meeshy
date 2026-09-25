## Leçon 463 — Dans un dépôt à N sessions, la vérification PAR COMMIT n'existe pas, et s'en abstenir de pousser ne la crée pas

Mesuré trois fois dans la même soirée. La CI annule le run d'un commit dès qu'un
suivant arrive, et sur `dev` les commits arrivent de trois sessions :

| commit | verdict obtenu |
|---|---|
| `4a379db4` | **rouge** — jamais réparé sous son propre SHA |
| `36ad4a6c` (mes deux correctifs) | **annulé** |
| `aeee9a57` | **annulé** ×2 (CI puis SDK Tests) |
| `12a5efb8` (le correctif qui sortait `dev` du rouge) | iOS vert, **SDK Tests annulé** |

Premier diagnostic, faux à moitié : « six de mes pushes en quatre-vingt-dix
minutes annulent mes propres runs ». J'ai donc **cessé de pousser** — et le run
suivant a été annulé par le merge d'une voisine, puis un autre par un troisième
lot. **La cadence n'est pas la mienne, c'est celle du dépôt.**

> S'abstenir de pousser ne rachète pas un verdict : cela ne fait que déplacer
> qui l'annule. Le seul commit vérifié de bout en bout est la TÊTE, et seulement
> jusqu'au push suivant — donc le dernier point de vérification recule sans
> arrêt vers le passé (mesuré : cinq heures d'écart entre deux `SDK Tests`
> réellement terminés).

**La parade n'est pas dans la CI, elle est en local**, et la leçon 459 en donne
le moyen : la suite complète tient en deux commandes de 11 et 2 minutes. Ce qui
signifie que la CI n'est PAS le gate d'un lot — c'est un filet sur l'arbre. Un
lot qui touche le SDK se vérifie AVANT de pousser, sans quoi il ne sera peut-être
jamais vérifié du tout.

Corollaire, et c'est ce qui a laissé mes deux régressions vivre plusieurs
heures : dans un dépôt à cadence soutenue, **« la CI dira si c'est cassé » est un
pari sur le fait que personne ne poussera pendant trente minutes.** Ce pari se
perd la plupart du temps.

---
