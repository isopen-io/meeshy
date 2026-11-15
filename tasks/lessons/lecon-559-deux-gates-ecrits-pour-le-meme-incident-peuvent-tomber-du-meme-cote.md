## Leçon 559 — Deux gates écrits pour le MÊME incident peuvent tomber du même côté, et le second se trouve en relevant le premier

Même jour, même dispositif. #5644 avait produit DEUX témoins pour un incident
réel (un conteneur de neuf jours servi comme sain) : la sonde de fumée
ci-dessus, et un contrôle horaire de dérive qui lit `build.commit` sur
`/health`. Les deux rougissaient sur des situations SAINES.

Le second confrontait ses **deux** cibles à `origin/main` :

```yaml
matrix:
  target:
    - { name: production, url: https://gate.meeshy.me/health }
    - { name: staging,    url: https://gate.staging.meeshy.me/health }
…
if ! git merge-base --is-ancestor "$COMMIT" origin/main; then
```

Or `deploy-staging` porte `if: github.ref == 'refs/heads/dev'` — **staging sert
`dev`**. Le gate exigeait donc de staging une révision de `main` : vert
seulement si `dev == main`, c'est-à-dire jamais. Mesuré : staging servait
`d576784c`, tête de `dev` — exactement ce qu'il devait servir — et le gate le
déclarait « branche inattendue, ou historique réécrit ». Toutes les heures.

> **Une matrice qui partage une référence ÉCRITE EN DUR ment sur toute cible
> qui ne la partage pas.** La forme du défaut est la généralisation abusive :
> ce qui est vrai de la première cible est posé comme vrai de la matrice. La
> parade est de faire DÉCLARER à chaque cible ce qui la distingue (`ref:`),
> jamais de le déduire au centre.

Ce que j'en retiens sur la MÉTHODE, et qui vaut au-delà de ces deux gates :

> **Quand un gate se révèle faux, relever les AUTRES gates du même lot avant de
> refermer.** Ils ont été écrits le même jour, par la même main, sur la même
> compréhension du problème — et ils partagent donc ses angles morts. Ici le
> second n'a pas été cherché : il est simplement apparu dans le relevé de la CI
> pendant que je corrigeais le premier, et il aurait pu ne jamais apparaître si
> j'avais arrêté de regarder après avoir expliqué le rouge de `Docker`.

Corollaire opérationnel : un gate qui rougit sur du sain se répare ou se
retire, jamais ne se tolère. Deux gates morts, c'est tout le dispositif d'une
issue de fiabilité qui ne dit plus rien — et personne ne s'en aperçoit, puisque
le rouge fait partie du décor.

<!-- LEÇONS 560 ET 561 — RAPATRIÉES LE 2026-09-12 depuis la branche
     `claude/bascule-v11-5882`, dont la PR #5887 a été FERMÉE sans merge le
     2026-09-10. Le travail de CI qu'elle portait a été refait ailleurs ; ces
     deux leçons, elles, n'avaient aucun jumeau et laissaient un TROU dans la
     numérotation (559 → 562) — la trace même du défaut que la 561 décrit.
     Aucun mot n'est retouché : ce qui suit est le texte tel qu'il avait été
     écrit et relu. -->
