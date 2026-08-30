# Meeshy web v3 — l'ordre d'implementation des ecrans

> **Ce fichier est CALCULE, jamais ecrit a la main.** Il est le tri topologique de la colonne
> `depend_de` de `matrice.json`, produit par `ordre-des-ecrans.js`, qui est aussi le gate CI.
> L'ETAT de chaque ecran vit dans son issue GitHub, jamais ici.

44 ecrans (37 dessines par la planche, 7 exiges par la mission sans etre dessines), 10 lots, graphe acyclique.

| # | Vue | Priorite | Lot | Route | Audience | Depend de |
|---:|---|---|---|---|---|---|
| 1 | `linkRedirect` | P0-role-premier | L1 | `/l/:token` | les-deux | — |
| 2 | `sheet:lang` *(hors planche)* | P0-role-premier | L3 | `(surimpression)` | les-deux | — |
| 3 | `story` | P0-role-premier | L3 | `/stories/:id` | anonyme | — |
| 4 | `comments` | P0-role-premier | L3 | `/post/:id` | anonyme | `story` |
| 5 | `join` | P0-role-premier | L2 | `/chats/:lien` | anonyme | `linkRedirect` |
| 6 | `linkExpired` | P0-role-premier | L1 | `/l/:token` | les-deux | `linkRedirect` |
| 7 | `moods` *(hors planche)* | P0-role-premier | L3 | `/moods/:id` | anonyme | `story` |
| 8 | `reelShared` *(hors planche)* | P0-role-premier | L3 | `/reels/:id` | anonyme | `story` |
| 9 | `storyFail` | P0-role-premier | L3 | `/stories/:id` | anonyme | `story` |
| 10 | `rights` | P0-role-premier | L2 | `/chats/:lien` | anonyme | `join` |
| 11 | `thread` | P0-role-premier | L2 | `/chats/:identifiant` | les-deux | `join` |
| 12 | `media` | P0-role-premier | L2 | `/chats/:id/medias` | les-deux | `thread` |
| 13 | `rich` | P0-role-premier | L2 | `/chats/:id` | les-deux | `thread` |
| 14 | `login` | P1-role-secondaire | L4 | `/login?next=/l/:token` | anonyme | — |
| 15 | `home` | P1-role-secondaire | L5 | `/` | connecte | `login` |
| 16 | `signup` | P1-role-secondaire | L4 | `/signup?next=/l/:token` | anonyme | `login` |
| 17 | `composer` | P1-role-secondaire | L5 | `/composer` | connecte | `home` |
| 18 | `feed` | P1-role-secondaire | L5 | `/feed` | connecte | `comments` |
| 19 | `links` | P1-role-secondaire | L5 | `/links` | connecte | `home` |
| 20 | `notifs` | P1-role-secondaire | L6 | `/notifications` | connecte | `home` |
| 21 | `settings` | P1-role-secondaire | L6 | `/settings` | connecte | `home` |
| 22 | `sheet:member` *(hors planche)* | P1-role-secondaire | L5 | `(surimpression)` | connecte | `home` |
| 23 | `chats` | P1-role-secondaire | L5 | `/chats` | connecte | `thread`, `login` |
| 24 | `detail-application` | P1-role-secondaire | L6 | `/settings/application` | connecte | `settings` |
| 25 | `detail-media` | P1-role-secondaire | L6 | `/settings/media` | connecte | `settings` |
| 26 | `detail-message` | P1-role-secondaire | L6 | `/settings/message` | connecte | `settings` |
| 27 | `detail-privacy` | P1-role-secondaire | L6 | `/settings/privacy` | connecte | `settings` |
| 28 | `detail-profile` | P1-role-secondaire | L6 | `/settings/profile` | connecte | `settings` |
| 29 | `detail-security` | P1-role-secondaire | L6 | `/settings/security` | connecte | `settings` |
| 30 | `notifPrefs` | P1-role-secondaire | L6 | `/notifications/preferences` | connecte | `notifs` |
| 31 | `reels` | P1-role-secondaire | L5 | `/feed/reels` | connecte | `feed` |
| 32 | `sheet:attach` *(hors planche)* | P1-role-secondaire | L5 | `(surimpression)` | les-deux | `thread` |
| 33 | `sheet:link` *(hors planche)* | P1-role-secondaire | L5 | `(surimpression)` | connecte | `links` |
| 34 | `storyCreate` | P1-role-secondaire | L5 | `/stories/new` | connecte | `composer` |
| 35 | `contacts` | P1-role-secondaire | L5 | `/contacts` | connecte | `chats` |
| 36 | `detail-notification` | P1-role-secondaire | L6 | `/settings/notification` | connecte | `notifPrefs` |
| 37 | `password` | P1-role-secondaire | L6 | `/settings/security/password` | connecte | `detail-security` |
| 38 | `profileEdit` | P1-role-secondaire | L6 | `/settings/profile/edit` | connecte | `detail-profile` |
| 39 | `search` | P1-role-secondaire | L5 | `/search` | connecte | `chats`, `feed` |
| 40 | `sheet:conv` *(hors planche)* | P1-role-secondaire | L5 | `(surimpression)` | connecte | `chats` |
| 41 | `calls` | P2-confort | L7 | `/calls` | connecte | `home` |
| 42 | `communities` | P2-confort | L7 | `/communities` | connecte | `home` |
| 43 | `callAudio` | P2-confort | L7 | `/calls/:id` | connecte | `calls` |
| 44 | `callVideo` | P2-confort | L7 | `/calls/:id?video` | connecte | `callAudio` |
