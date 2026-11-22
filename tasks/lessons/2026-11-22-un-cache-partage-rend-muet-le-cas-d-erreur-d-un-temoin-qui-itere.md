## Un cache partagé rend muet le cas d'erreur d'un témoin qui itère

**2026-11-22, cycle 221 (#20429).** Un témoin de confidentialité itérait sur
trois configurations de blocage — « l'auteur a bloqué », « le viewer a bloqué »,
« la lecture des blocages tombe en panne » — et assertait, pour chacune,
qu'aucune valeur nominative ne partait sur le fil.

Sous la mutation qui retire le fail-closed (`if (separated === null) return`),
ce témoin restait **VERT**.

La cause n'est pas dans le témoin mais dans ce qu'il traverse : le cache de
séparation (`socketio/separatedRooms.ts`) est **PARTAGÉ par le processus**, et
les trois itérations résolvent la **même clé** de sujets. La première écrivait
l'entrée ; la troisième — celle de la panne — était servie par elle, sans jamais
ouvrir la lecture qui échoue. Le témoin portait le nom d'un cas qu'il
n'exerçait pas.

`resetSeparationCacheForTests()` était bien appelé — dans `beforeEach`, c'est-à-dire
**une fois par témoin**, quand ce témoin a besoin d'un vidage **par itération**.

> **Un `beforeEach` borne la suite, pas la boucle.** Dès qu'un témoin itère à
> travers un résolveur qui MÉMORISE — cache de processus, mémoïsation, pool de
> connexions, compteur de débit —, l'état remis à zéro entre les témoins ne l'est
> plus entre les cas, et les cas qui viennent APRÈS le premier sont servis par
> lui. Le vidage appartient alors au corps de la boucle.

Et sur la méthode qui l'attrape, qui est la moitié transférable :

> **Le compte de rouges d'une mutation n'est pas sa mesure — la LISTE des
> témoins qui tombent l'est.** La mutation rendait « 1 rouge », un chiffre
> parfaitement crédible pour une garde qui n'a qu'un témoin dédié. Ce qui a
> révélé le défaut est d'avoir écrit, AVANT de muter, quels témoins devaient
> tomber, puis d'avoir lu le verdict témoin par témoin et constaté qu'il en
> manquait un. Un tableau de mutations qui ne publie que des nombres ne peut
> pas voir ce cas.

Famille : « un témoin qui ne peut pas tomber n'est pas un témoin »
(`services/gateway/CLAUDE.md` § Tests), vue du côté de l'ÉTAT PARTAGÉ plutôt
que de celui de la copie de production. Et c'est le même angle mort que la
leçon 261 d'un cran plus bas : une énumération de CAS affirme « ces cas sont
exercés », et c'est l'affirmation que personne ne relit.
