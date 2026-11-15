## Leçon 44 — détection UA par `includes` : un token spécifique avalé par un token générique testé plus tôt (2026-07-08, routine messaging, iter 142)

`detectOS` / `detectBrowser` / `detectDevice` (`services/gateway/src/routes/tracking-links/types.ts`) classent le
User-Agent persisté sur CHAQUE clic de lien de tracking (chemin redirect `GET /l/:token` + chemin manuel
`POST .../click`), puis agrégé en `clicksByOS` / `clicksByBrowser` / `clicksByDevice` dans
`TrackingLinkService.getTrackingLinkStats`. Les trois helpers testaient des sous-chaînes `includes()` dans un ordre
naïf « du plus courant au plus rare » — mais les UA réels sont **imbriqués** : un token spécifique est presque
toujours un sur-ensemble d'un token générique testé plus tôt, donc la branche spécifique n'était JAMAIS atteinte.

- `detectOS` : tout UA Android contient `Linux` (`Linux; Android 13; …`) et tout UA iPhone/iPad contient `Mac OS X`
  (`like Mac OS X`). `Linux` étant testé avant `Android` et `Mac OS` avant `iOS`, **tout le trafic Android était
  compté comme Linux-desktop et tout l'iPhone/iPad comme macOS** — les deux OS mobiles dominants faux dans chaque
  rapport.
- `detectBrowser` : Opera moderne est Chromium (`… Chrome/104 … OPR/90`), sans `Edg`. La branche Chrome
  (`Chrome && !Edg`) l'attrapait avant la branche Opera → Opera compté comme Chrome.
- `detectDevice` : Safari iPad porte le token `Mobile` (`Mobile/15E148`). La branche `Mobile` renvoyait `mobile`
  avant que la branche `iPad` soit évaluée → tout iPad compté comme mobile ; le bucket `tablet` était de fait
  inatteignable.

**Fix** : ordonner chaque chaîne du **plus spécifique au plus générique** — mobile avant desktop dans `detectOS`
(Windows → Android → iOS → macOS → Linux), Opera/Edge avant Chrome dans `detectBrowser`, tablette avant mobile dans
`detectDevice` (+ heuristique Android-sans-`Mobile` = tablette). Aucun test préexistant ne couvrait ces helpers
(RED = 6 assertions fausses avant fix, GREEN après). 12 suites tracking (243 tests) restent vertes, `tsc --noEmit` OK.

**Règle réutilisable** : une cascade de `str.includes(token)` avec `return` au premier match n'est correcte QUE si
les tokens sont mutuellement exclusifs. Dès que le domaine réel est imbriqué (UA, MIME, chemins, langues avec
sous-tags), un token « fin » (Android, iPhone, iPad, OPR, Edg) est presque toujours contenu dans une chaîne qui
porte aussi un token « large » (Linux, Mac OS, Chrome, Mobile) — le spécifique DOIT être testé avant le générique,
sinon il est mort. Signature du bug : la branche générique n'a pas de garde d'exclusion (`&& !contientLeSpécifique`)
alors qu'une branche plus bas teste précisément ce spécifique. Balayer chaque fonction de classification par
sous-chaîne et se demander pour chaque paire (générique, spécifique) : « un input du type spécifique contient-il
aussi le token générique ? » Si oui et que le générique est testé d'abord → le spécifique est inatteignable.
