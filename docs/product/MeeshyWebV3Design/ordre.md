# Meeshy web v3 — l'ordre d'implementation des ecrans

> **Ce fichier est CALCULE, jamais ecrit a la main.** Il est le tri topologique de la colonne
> `depend_de` de `matrice.json`, produit par `ordre-des-ecrans.js`, qui est aussi le gate CI.
> L'ETAT de chaque ecran vit dans son issue GitHub, jamais ici.

37 ecrans, 10 lots, graphe acyclique.

| # | Vue | Priorite | Lot | Route | Audience | Depend de |
|---:|---|---|---|---|---|---|
| 1 | `linkRedirect` | P0-role-premier | L1 | `/l/:token` | les-deux | — |
| 2 | `story` | P0-role-premier | L3 | `/stories/:id` | anonyme | — |
| 3 | `comments` | P0-role-premier | L3 | `/post/:id` | anonyme | `story` |
| 4 | `join` | P0-role-premier | L2 | `/chats/:lien` | anonyme | `linkRedirect` |
| 5 | `linkExpired` | P0-role-premier | L1 | `/l/:token` | les-deux | `linkRedirect` |
| 6 | `storyFail` | P0-role-premier | L3 | `/stories/:id` | anonyme | `story` |
| 7 | `rights` | P0-role-premier | L2 | `/chats/:lien` | anonyme | `join` |
| 8 | `thread` | P0-role-premier | L2 | `/chats/:identifiant` | les-deux | `join` |
| 9 | `media` | P0-role-premier | L2 | `/chats/:id/medias` | les-deux | `thread` |
| 10 | `rich` | P0-role-premier | L2 | `/chats/:id` | les-deux | `thread` |
| 11 | `login` | P1-role-secondaire | L4 | `/login?next=/l/:token` | anonyme | — |
| 12 | `home` | P1-role-secondaire | L5 | `/` | connecte | `login` |
| 13 | `signup` | P1-role-secondaire | L4 | `/signup?next=/l/:token` | anonyme | `login` |
| 14 | `composer` | P1-role-secondaire | L5 | `/composer` | connecte | `home` |
| 15 | `feed` | P1-role-secondaire | L5 | `/feed` | connecte | `comments` |
| 16 | `links` | P1-role-secondaire | L5 | `/links` | connecte | `home` |
| 17 | `notifs` | P1-role-secondaire | L6 | `/notifications` | connecte | `home` |
| 18 | `settings` | P1-role-secondaire | L6 | `/settings` | connecte | `home` |
| 19 | `chats` | P1-role-secondaire | L5 | `/chats` | connecte | `thread`, `login` |
| 20 | `detail-application` | P1-role-secondaire | L6 | `/settings/application` | connecte | `settings` |
| 21 | `detail-media` | P1-role-secondaire | L6 | `/settings/media` | connecte | `settings` |
| 22 | `detail-message` | P1-role-secondaire | L6 | `/settings/message` | connecte | `settings` |
| 23 | `detail-privacy` | P1-role-secondaire | L6 | `/settings/privacy` | connecte | `settings` |
| 24 | `detail-profile` | P1-role-secondaire | L6 | `/settings/profile` | connecte | `settings` |
| 25 | `detail-security` | P1-role-secondaire | L6 | `/settings/security` | connecte | `settings` |
| 26 | `notifPrefs` | P1-role-secondaire | L6 | `/notifications/preferences` | connecte | `notifs` |
| 27 | `reels` | P1-role-secondaire | L5 | `/feed/reels` | connecte | `feed` |
| 28 | `storyCreate` | P1-role-secondaire | L5 | `/stories/new` | connecte | `composer` |
| 29 | `contacts` | P1-role-secondaire | L5 | `/contacts` | connecte | `chats` |
| 30 | `detail-notification` | P1-role-secondaire | L6 | `/settings/notification` | connecte | `notifPrefs` |
| 31 | `password` | P1-role-secondaire | L6 | `/settings/security/password` | connecte | `detail-security` |
| 32 | `profileEdit` | P1-role-secondaire | L6 | `/settings/profile/edit` | connecte | `detail-profile` |
| 33 | `search` | P1-role-secondaire | L5 | `/search` | connecte | `chats`, `feed` |
| 34 | `calls` | P2-confort | L7 | `/calls` | connecte | `home` |
| 35 | `communities` | P2-confort | L7 | `/communities` | connecte | `home` |
| 36 | `callAudio` | P2-confort | L7 | `/calls/:id` | connecte | `calls` |
| 37 | `callVideo` | P2-confort | L7 | `/calls/:id?video` | connecte | `callAudio` |
