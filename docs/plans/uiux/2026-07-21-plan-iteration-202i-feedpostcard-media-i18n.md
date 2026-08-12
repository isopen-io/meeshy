# Plan Iteration-202i — FeedPostCard+Media : localisation document / pages / lieu

**Branche de travail** : `claude/laughing-thompson-b3ozdj`
**Base** : `main` HEAD `6e17000` (#2215 mergé)
**Piste** : iOS (`i`)

## Objectif

Localiser les trois libellés visibles codés en dur de `FeedPostCard+Media.swift`
(`"Document"`, `"pages"`, `"Location"`) en miroir exact du frère `PostDetailView`,
qui rend les mêmes médias avec les clés `feed.post.detail.*` déjà présentes en source.

## Étapes

1. [x] Resync branche depuis `origin/main` (inclut #2215) ; supprimer l'ancien commit
   mergé (branche repartie de `main` HEAD).
2. [x] Vérifier contention essaim : `search_pull_requests FeedPostCard` → 0 PR.
   Numéro **202i** > plus haut en vol (201i #2214).
3. [x] l. 352 : `?? "Document"` → `?? String(localized: "feed.post.detail.document", defaultValue: "Document", bundle: .main)`.
4. [x] l. 367 : `Text("\(pages) pages")` → `Text("\(pages) \(String(localized: "feed.post.detail.pages", defaultValue: "pages", bundle: .main))")`.
5. [x] l. 411 : `?? "Location"` → `?? String(localized: "feed.post.detail.location", defaultValue: "Location", bundle: .main)`.
6. [x] Analyse + plan + tracking.
7. [ ] Commit + push + PR ; gate CI `iOS Tests`.

## Contraintes

- 0 changement visuel (defaultValue = ancien littéral), 0 logique, 0 clé i18n neuve
  (clés déjà référencées par `PostDetailView`), 0 SDK, 0 test neuf, 1 fichier.
- Parité de signature 1:1 avec `PostDetailView.swift:1742/1752/1778`.
- Auteur en conteneur Linux → build/tests validés en CI.
