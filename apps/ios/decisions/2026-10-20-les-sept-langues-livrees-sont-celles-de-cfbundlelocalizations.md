## 2026-10-20 : Les sept langues livrées sont celles de CFBundleLocalizations

Les langues livrées sont fr (source), en, de, es, pt-BR, it et ar, celles de `CFBundleLocalizations`.

- `pt` (55 entrées) et `zh-Hans` (44 entrées) du catalogue de l'app ne sont pas livrés. Leur purge suivra la fusion de #11095, qui modifie ce fichier.
- Toute clé symbolique porte les 7 valeurs, fr compris, variations plurielles incluses. `CatalogCompletenessGuardTests` (SDK) le verrouille sur les deux catalogues.
- Une clé SDK vit dans le catalogue MeeshyUI et s'appelle avec `bundle: .module`. Une clé de l'app vit dans le catalogue de l'app. Jamais l'une dans le catalogue de l'autre.
- Les doublons `post.visibility.*` du catalogue de l'app sont morts depuis que `PostVisibility.label` lit le catalogue MeeshyUI. Purge en suivi.
