## Leçon 289 — un secret PRÉSENT n'est pas une chaîne d'authentification qui MARCHE ; un workflow jamais vert se lit comme jamais exécuté (2026-08-26, release 1.0.6)

`ios-fastlane-release.yml` portait tout ce qu'il faut sur le papier : `MATCH_GIT_URL`,
`MATCH_DEPLOY_KEY`, un agent SSH armé, `MATCH_PASSWORD`. Il n'avait pourtant **jamais
été vert** (2 runs, 2 échecs) — et chaque run mourait un cran plus loin que le
précédent, ce qui donne l'illusion d'un progrès :

1. 22/07 : `bundle install` → le `Gemfile.lock` ne connaissait que `arm64-darwin-25`
   et le runner `macos-15` est `darwin-23`.
2. 26/08 : `match` → clone en **HTTPS** sans identifiant. `MATCH_GIT_URL` ET le défaut
   du Matchfile sont des URL `https://`, donc la clé de déploiement chargée trois
   lignes plus haut n'était **jamais sollicitée**. Et derrière ce défaut, un second :
   `isopen-io/meeshy-certificates` n'a AUCUNE clé de déploiement enregistrée, et
   l'organisation a « Deploy keys are disabled » — la clé du secret n'aurait pu servir
   nulle part, sous aucun transport.

> **Un secret dit qu'une valeur existe, pas qu'elle est BRANCHÉE.** La question à
> poser à toute chaîne d'auth CI : « quel transport le client utilise-t-il, et le
> credential chargé est-il celui de CE transport ? » (URL `https://` ⇒ token ; URL
> `git@` ⇒ clé). Puis : « la contrepartie ACCEPTE-t-elle ce credential ? » (clé
> enregistrée, politique d'org). Les deux se vérifient AVANT de relancer un run de
> 20 minutes : `gh api repos/<org>/<repo>/keys`, et la forme de l'URL dans le log
> (`git_url | ***` masqué — regarder l'ERREUR, pas le tableau : `could not read
> Username for 'https://github.com'` nomme le transport).

**Et un workflow jamais vert n'est pas « un pipeline qui a un bug » — c'est un
pipeline qui n'a jamais existé.** Le lire comme tel change le plan : chercher le
chemin qui a RÉELLEMENT livré (ici : runs Xcode Cloud #1790–#1799 tous VALID, et la
lane `release` en LOCAL avec `apps/ios/.env`), plutôt que corriger un cran de plus
d'un chemin dont personne ne connaît la fin. Le correctif de transport a quand même
été poussé (insteadOf limité au dépôt de certificats) : il est juste, mais il ne
suffira qu'avec un PAT `MATCH_GIT_BASIC_AUTHORIZATION` ou le retour des deploy keys —
deux gestes du user.
---
