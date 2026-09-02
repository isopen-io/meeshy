# Meeshy web v3 — l'ordre d'implementation des ecrans

> **Ce fichier est CALCULE, jamais ecrit a la main.** Il est le tri topologique de la colonne
> `depend_de` de `matrice.json`, produit par `ordre-des-ecrans.js`, qui est aussi le gate CI.
> L'ETAT de chaque ecran vit dans son issue GitHub, jamais ici.

46 ecrans (38 dessines par la planche, 8 exiges par la mission sans etre dessines), 10 lots, graphe acyclique.

| # | Vue | Priorite | Lot | Route | Audience | Depend de |
|---:|---|---|---|---|---|---|
| 1 | `linkRedirect` | P0-role-premier | L1 | `/l/:token` | les-deux | — |
| 2 | `sheet:lang` *(hors planche)* | P0-role-premier | L3 | `(surimpression)` | les-deux | — |
| 3 | `story` | P0-role-premier | L3 | `/stories/:id` | anonyme | — |
| 4 | `comments` | P0-role-premier | L3 | `/post/:id` | anonyme | `story` |
| 5 | `join` | P0-role-premier | L2 | `/chat/:lien` | anonyme | `linkRedirect` |
| 6 | `linkExpired` | P0-role-premier | L1 | `/l/:token` | les-deux | `linkRedirect` |
| 7 | `moods` *(hors planche)* | P0-role-premier | L3 | `/moods/:id` | anonyme | `story` |
| 8 | `reelShared` *(hors planche)* | P0-role-premier | L3 | `/reels/:id` | anonyme | `story` |
| 9 | `storyFail` | P0-role-premier | L3 | `/stories/:id` | anonyme | `story` |
| 10 | `rights` | P0-role-premier | L2 | `/chat/:lien` | anonyme | `join` |
| 11 | `thread` | P0-role-premier | L2 | `/chats/:cle` | les-deux | `join` |
| 12 | `media` | P0-role-premier | L2 | `/chats/:cle/medias` | les-deux | `thread` |
| 13 | `rich` | P0-role-premier | L2 | `/chats/:id` | les-deux | `thread` |
| 14 | `login` | P1-role-secondaire | L4 | `/login?returnUrl=/chat/:lien` | anonyme | — |
| 15 | `vitrine` | P1-role-secondaire | L4 | `/` | anonyme | — |
| 16 | `home` | P1-role-secondaire | L5 | `/` | connecte | `login` |
| 17 | `signup` | P1-role-secondaire | L4 | `/signup?returnUrl=/chat/:lien` | anonyme | `login` |
| 18 | `banner:inApp` *(hors planche)* | P1-role-secondaire | L6 | `(surimpression)` | connecte | `home` |
| 19 | `composer` | P1-role-secondaire | L5 | `/composer` | connecte | `home` |
| 20 | `feed` | P1-role-secondaire | L5 | `/feed` | connecte | `comments` |
| 21 | `links` | P1-role-secondaire | L5 | `/links` | connecte | `home` |
| 22 | `notifs` | P1-role-secondaire | L6 | `/notifications` | connecte | `home` |
| 23 | `settings` | P1-role-secondaire | L6 | `/settings` | connecte | `home` |
| 24 | `sheet:member` *(hors planche)* | P1-role-secondaire | L5 | `(surimpression)` | connecte | `home` |
| 25 | `chats` | P1-role-secondaire | L5 | `/chats` | connecte | `thread`, `login` |
| 26 | `detail-application` | P1-role-secondaire | L6 | `/settings/application` | connecte | `settings` |
| 27 | `detail-media` | P1-role-secondaire | L6 | `/settings/media` | connecte | `settings` |
| 28 | `detail-message` | P1-role-secondaire | L6 | `/settings/message` | connecte | `settings` |
| 29 | `detail-privacy` | P1-role-secondaire | L6 | `/settings/privacy` | connecte | `settings` |
| 30 | `detail-profile` | P1-role-secondaire | L6 | `/settings/profile` | connecte | `settings` |
| 31 | `detail-security` | P1-role-secondaire | L6 | `/settings/security` | connecte | `settings` |
| 32 | `notifPrefs` | P1-role-secondaire | L6 | `/notifications/preferences` | connecte | `notifs` |
| 33 | `reels` | P1-role-secondaire | L5 | `/feed/reels` | connecte | `feed` |
| 34 | `sheet:attach` *(hors planche)* | P1-role-secondaire | L5 | `(surimpression)` | les-deux | `thread` |
| 35 | `sheet:link` *(hors planche)* | P1-role-secondaire | L5 | `(surimpression)` | connecte | `links` |
| 36 | `storyCreate` | P1-role-secondaire | L5 | `/stories/new` | connecte | `composer` |
| 37 | `contacts` | P1-role-secondaire | L5 | `/contacts` | connecte | `chats` |
| 38 | `detail-notification` | P1-role-secondaire | L6 | `/settings/notification` | connecte | `notifPrefs` |
| 39 | `password` | P1-role-secondaire | L6 | `/settings/security/password` | connecte | `detail-security` |
| 40 | `profileEdit` | P1-role-secondaire | L6 | `/settings/profile/edit` | connecte | `detail-profile` |
| 41 | `search` | P1-role-secondaire | L5 | `/search` | connecte | `chats`, `feed` |
| 42 | `sheet:conv` *(hors planche)* | P1-role-secondaire | L5 | `(surimpression)` | connecte | `chats` |
| 43 | `calls` | P2-confort | L7 | `/calls` | connecte | `home` |
| 44 | `communities` | P2-confort | L7 | `/communities` | connecte | `home` |
| 45 | `callAudio` | P2-confort | L7 | `/calls/:id` | connecte | `calls` |
| 46 | `callVideo` | P2-confort | L7 | `/calls/:id?video` | connecte | `callAudio` |
