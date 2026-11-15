## Leçon 351 — deux mesures qui partagent un MODULE ne partagent pas ses CONDITIONS

`apps/web-v3/scripts/mesure-reseau.mjs` est le site unique de la mesure CDP, et la
conception s'en félicitait : « la même mesure sert le gate de la v3 ET la ligne de
base ». Le module était bien partagé. Ses conditions ne l'étaient pas :
`baseline.mjs` appelait `mesureUrls(urls, commandePour)` **sans troisième
argument**, donc `options?.profil === undefined` (aucun `Network.emulateNetworkConditions`)
et `options?.repetitions ?? 1` (aucun p75), pendant que le `main()` du même module
appliquait le profil 3G Fast de `budgets.json`. L'« AVANT » aurait été pris en
fibre de datacenter et l'« APRÈS » en 3G p75 — et **rien dans le fichier écrit ne
l'aurait dit** : `composeBaseline` n'enregistrait ni `profil`, ni `repetitions`,
ni `percentile`.

> **Un paramètre optionnel est une divergence qui ne rougit pas.** Quand deux
> appelants partagent une fonction dont les conditions passent par un `options?`,
> l'un des deux finit par ne pas le passer, et le défaut est INVISIBLE : les deux
> chiffres existent, ils ont l'air comparables, ils ne le sont pas. La question à
> poser à un module partagé n'est pas « qui l'appelle ? » mais **« qui l'appelle
> AVEC QUOI ? »** — et la réponse s'écrit DANS la donnée produite, jamais
> seulement dans le code : un chiffre qui ne porte pas ses conditions ne s'oppose
> à rien.

Corollaires tirés du même lot (revue croisée de « baseline.json porte de vraies
mesures ») :

- **`page.goto` RÉUSSIT sur un 404.** `composeMesure` posait `statut: 'mesuré'`
  sans jamais regarder `http` : un identifiant de contenu mort — ou deviné faux —
  transformait une page d'erreur en chiffre commité. Le verrou vit au site qui
  POSE le statut (`estCodeDeMesure`), pas chez l'appelant.
- **Un verdict qui compte les lignes PLEINES ne dit pas ce qu'elles contiennent.**
  `verdictDeLigneDeBase` n'attrapait que le mensonge le plus grossier (« établie
  sans chiffres ») ; six lignes mesurées sur `127.0.0.1` sortaient VERTES, et le
  seul garde-fou jest comparait des LONGUEURS (`lignes.length`), jamais des URLs.
  Un verdict de provenance regarde l'ORIGINE, le CODE et la COUVERTURE.
- **Une doctrine écrite dans un fichier ne vaut que si le code l'applique.**
  L'en-tête jurait « un `null` se voit, un zéro se compare » et `maximum()` faisait
  `l[champ] ?? 0` : un 404 sans peinture sortait en `lcp_max_ms: 0`.
- **Un `${{ inputs.x }}` dans un `run:` est substitué AVANT le shell.** Les entrées
  d'un `workflow_dispatch` passent par `env:` et se citent — sinon elles
  s'exécutent. Leur VALIDATION, elle, reste au site unique qui les consomme.
- **Une commande d'éprouvette recommandée dans un doc devient une commande
  RÉELLE.** La conception invitait à lancer `baseline.mjs http://127.0.0.1:8931/`
  « pour éprouver la chaîne » — ce qui écrivait un `baseline.json` de localhost,
  vert. Éprouver une chaîne se fait avec l'outil dont c'est le métier.
