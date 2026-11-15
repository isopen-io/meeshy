## Leçon 25 — F62 soldé : `resolveUserLanguage` renvoyait les préférences in-app en casse brute, `resolveUserLanguagesOrdered` les lowercasait — drift de casse live sur le Prisme (2026-07-04, itération 98)
Deux résolveurs sœurs du même module (`packages/shared/utils/conversation-helpers.ts`) répondaient à
la même question « quelle langue pour cet utilisateur ? » avec deux politiques de casse divergentes :
`resolveUserLanguagesOrdered` lowercasait chaque préférence in-app (`c.toLowerCase()`) — c'est elle
qui produit les **cibles de traduction** (stockées minuscules) et les `resolvedLanguages` du socket ;
`resolveUserLanguage` renvoyait `user.systemLanguage` **verbatim** — c'est elle qui produit
`meta.userLanguage` (l'indice de langue d'affichage du client) et la langue des notifications. Cause
racine : `isSupportedLanguage` valide de façon insensible à la casse (`code.toLowerCase()` avant
lookup) mais **ne transforme pas** — les écritures (`register`, `PreferencesService`) persistent
`'EN'` verbatim, la casse n'est donc **pas garantie minuscule en base**. Conséquence live : un
`systemLanguage: 'EN'` → `meta.userLanguage: 'EN'` → le client cherche une traduction `'EN'`, ne
trouve que la clé `'en'` → **retombe sur l'original** (violation Prisme règle #1) ; notification dans
la mauvaise langue ; `getRequiredLanguages` produit `['EN','en']` (doublon, requête translator
gaspillée). **Fix (6 `.toLowerCase()`) : normaliser à la LECTURE dans les deux résolveurs** — parité
stricte avec `resolveUserLanguagesOrdered`, répare aussi les données déjà stockées en casse mixte,
sans migration, se propage à tous les consommateurs (dont le web qui délègue). RED→GREEN + suite
`packages/shared` 1265/1265 + `tsc` 0 erreur. **Règle : quand la validation d'un champ est
insensible à la casse mais ne normalise pas la valeur stockée, la casse en base n'est PAS garantie —
le résolveur de lecture (source de vérité) DOIT normaliser, et TOUS les résolveurs sœurs du même
champ doivent partager la même politique de casse (auditer le module entier, pas la seule fonction
touchée).**
