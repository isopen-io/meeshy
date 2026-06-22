# Plan — Iteration 58w (web)

## Objectif
Solder le **dernier volet** du différé borné « surface feed non internationalisée » (cluster 53w) : l'écran `/feed/posts`.

## Contexte
- Volet lecteur `ReelPlayer` → soldé 57w (#774).
- Volet écran reels `ReelsFeedScreen` → soldé 57wb (#780).
- Reste : `components/feed/PostsFeedScreen.tsx` (+ `FeedTabs` exporté dans le même fichier), monté sur `/feed/posts` et l'alias `/feeds`.

**Note collision** : l'idée initiale de 58w (ReelsFeedScreen) avait été livrée en parallèle par 57wb (#780) pendant ce run. Pivot vers le volet réellement restant — PostsFeedScreen — pour éviter la duplication.

## Constat
`PostsFeedScreen.tsx` n'avait **aucun hook i18n** : ~40 chaînes figées, avec une **incohérence FR/EN flagrante** :
- Toasts FR durs : `Story publiée !`, `Lien copié !`, `Publié !`, `Post supprimé`, `Reposté !`, `Cité !`, `Mood publié !`, `Erreur`…
- UI EN dure : `Updating...`, `Unable to load feed.`, `No posts yet…`, `Retry`, `Feed`, `Unknown`, `new post`/`new posts`.
- `aria-label`/`sr-only`/sections FR : `Type de fil`, `Stories publiques`, `Humeurs`, `Composer une publication`, `Enregistrer un post audio`, `Mise à jour du fil…`, `Fil d'actualité — …`.
- `formatRelativeTime` renvoie `À l'instant`/`Il y a {n}min/h/j` FR durs.

## Périmètre
- `components/feed/PostsFeedScreen.tsx` — `useI18n('feed')` sur `PostsFeedScreen` ET `FeedTabs`
- `locales/{en,fr,es,pt}/feed.json` — **nouveau namespace** (47 clés)

## Méthode
- Namespace dédié `feed` (cohérent avec `reel` pour le sous-cluster reels).
- `formatRelativeTime(date, t)` reçoit `t` (helper hors composant) → clés `time.{now,minutes,hours,days}` paramétrées.
- Fallbacks EN 2e arg pour chaînes simples (anti-flash, leçon 50w) ; clés paramétrées (`{count}`/`{id}`/`time.*`) sans fallback string (parité ×4 = zéro flash).
- `t` ajouté aux deps de tous les `useCallback` de handlers concernés.

## Exclusions documentées (NE PAS re-flagger)
- `mockStatuses` (lignes ~64-76) : données démo placeholder « to be replaced » — PAS du chrome UI.
- Onglet `Reels` (marque produit) laissé littéral, cohérent avec `ReelsFeedScreen` (57wb).

## Vérifications
- JSON valide ×4, parité 47 clés ×4 (script flatten).
- Grep résiduel : seules les 3 lignes mock subsistent.

## Suite (59w+)
Cluster feed soldé. Candidats : `next-themes` orphan (isolé, lock), gestes/a11y modales hand-rolled (56wb), audit qualité es/pt.
