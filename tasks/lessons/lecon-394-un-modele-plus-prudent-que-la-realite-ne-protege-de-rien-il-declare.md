## Leçon 394 — Un modèle PLUS PRUDENT que la réalité ne protège de rien : il déclare une frontière que l'aiguilleur ne trace pas

**Lot #4691.** `PathPrefix` de Traefik est un préfixe de **CHAÎNE**, pas de
segments. `PathPrefix(`/l`)` réclame donc `/login`, `/links` et `/lien` — trois
routes que le legacy sert. Mesuré sur staging : les trois rendaient le 404 du
routeur Pages de la v3, et `/login` est l'appel à l'action de la vitrine.

Les **trois** lecteurs de cette règle dans le dépôt modélisaient l'inverse.
`capture()` comparait contre `` `${valeur}/` `` ; un témoin de `zone-lint.test.ts`
s'intitulait littéralement « /login ne tombe pas dans /l ». Personne n'avait
menti : chacun avait écrit le comportement qu'il **espérait** de Traefik.

> Un modèle plus étroit que la réalité n'est pas « conservateur ». Il occupe la
> place de la vérification qu'on croit avoir, et **tout ce qui s'appuie dessus
> hérite du même angle mort**. Le modèle suit l'outil ; c'est le RÈGLEMENT qu'on
> écrit sans ambiguïté (`/l/`, avec sa barre).

Et le garde qui manquait ne posait pas la même question que celui qui existait.
« La règle ne réclame que des chemins servis » regarde les **valeurs** réclamées
— `/l` est bien servi. Le défaut est dans ce que ces valeurs **emportent**.
C'est la question du § 4.4 bis retournée : non pas « ce que je bascule est-il
servi ? » mais **« qu'est-ce qui bascule AVEC ? »** — la même forme que la
leçon 275 (une protection se mesure sur tout ce que la charge TRANSPORTE),
portée d'une garde de contenu à une règle de routage.

Corollaire de méthode : le défaut a été trouvé en **suivant les liens sortants
de la page qu'on venait d'écrire**, pas en relisant la règle. Un lien mort se
voit en le SUIVANT.
