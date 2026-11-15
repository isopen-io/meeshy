## 2026-10-06 : Le jeu d'un autre se lit selon SON réglage ; le jeu notifie au plus une fois par jour (#9481, #9489, #9490)

### Les raretés des succès sont servies par le contrat (#9489)

`game.achievementRarities` (`milestoneKey → { rarity, holders, population }`) est DÉCLARÉ dans `game-v2.ts` (`gameAchievementRaritiesSchema`), optionnel et tolérant comme les sept autres extensions. **Fail-closed côté serveur** : `AchievementRarityService.served()` n'y met un succès que si sa part est affichable (`rarityShareDisplayable` : 20 titulaires, 1 000 comptes) ET qu'une rareté a été mesurée — sous le seuil l'entrée est ABSENTE, jamais servie à `rarity: null`. Gardée 5 minutes en mémoire ; le calcul de nuit la renouvelle. Une carte illisible ou vide s'absente SANS emporter les sept extensions.

### Les réglages du jeu se relisent (#9481)

`GET /me/game/privacy` (même chemin que l'écriture) sert `{ gameHidden, friendsLeagueOptOut, visibility }`. Les clients relisent l'état du serveur au lieu de garder la dernière réponse `PUT`. Les « Célébrations » n'ont aucune colonne serveur : elles ne sont pas servies.

### Le jeu d'un autre : `GET /users/:userId/game` (#9481)

`GameStandingService`, par `GameProfileService.facetsVisibleTo` — UNE traversée (blocage, soi / ADMIN / ami accepté, réglage du membre plafonné par « caché de la recherche » et « Jeu masqué »), qui décide deux facettes : **`rank`** gouverne `standing` (niveau + palier, étoiles de Prestige, forme de la Flamme, rang de Gloire et division — Mythe compris, car le drapeau suit la visibilité du rang), **`treasury`** gouverne `treasury` (le PALIER, jamais les Meeshes).

- **Un palier, jamais un compte** : ni Gloire, ni jours de série, ni Meeshes, ni date, ni présence.
- **La Flamme se montre allumée, à risque ou couverte par un gel — trois états indiscernables dehors** : celle d'hier se montre comme celle d'aujourd'hui. Éteinte ou sans série : `flame: null`, sans « depuis quand ».
- **Un refus rend `visible: false` et deux blocs nuls — la MÊME réponse qu'un compte inexistant** (même pour un ADMIN qui lit un identifiant inconnu). Ni 403 ni 404.

### Les notifications du jeu (#9490)

Quatre types (`game_duo_invited`, `game_duo_accepted`, `game_league_result`, `game_season_step`), textes en huit langues (catalogue `notification-strings`), préférence **`notification.gameEnabled`** (défaut `true`, absent = reçu), réglable par la route de préférences existante.

- **Au plus UNE notification de jeu par jour et par destinataire, tous types confondus**, le jour de SON fuseau (`SET NX EX`, `CacheStore.setnx`). La conception partie IX l'écrit sans exception ; une invitation de duo écartée reste visible dans le bloc `game` (`duo.status = invited`). Un verrou qui ne répond pas FERME (on ne notifie pas quand on ne sait pas compter).
- **Un événement ne s'annonce qu'une fois** (clé par duo, par semaine de ligue, par étape) : rejouer un règlement interrompu ne notifie pas deux fois.
- **« Jeu masqué » ne notifie rien**, et `gameEnabled: false` non plus — lu AVANT le plafond du jour, pour qu'un compte qui a coupé « Jeu » ne consomme pas un créneau qu'il ne verra jamais.
- **Cadrage dans la langue du destinataire** (`recipientLanguage`, la descente du Prisme).
- **Rien d'un pseudonyme, d'un rang ni d'une heure** : le duo nomme l'AMI (ils se connaissent), la ligue et la saison ne nomment personne ; jamais « X t'a dépassé ». Le résultat de ligue ne porte que SA zone, SA coupe, SA ligue.
- **Une conséquence, jamais une condition** : détachées ou envoyées après le règlement, gardées par un `.catch`. Une notification qui tombe ne retient ni ne défait une invitation, un règlement, une étoile.

Sites : `services/game/GameNotifier.ts` (décision), hooks dans `DuoService` (invitation, acceptation), `LeagueSettlement` (après le règlement du groupe), `SeasonService.addStars` (étape franchie, la plus haute si plusieurs). Témoins : `GameNotifier.test.ts`, `__tests__/unit/routes/me/game-integration.test.ts`.

### La purge d'un compte pagine

`GamePurge` ne borne plus ses duos (500), ses duos ouverts (50) ni ses groupes de ligue (500) : chaque lot SUPPRIME ses lignes, le suivant repart du reste, et un lot qui ne fait rien reculer arrête la boucle.

### Ce qui n'est pas fait

Le miroir Android Kotlin ne reçoit rien (gel du 2026-09-16). Aucune migration d'index : aucune requête nouvelle ne sort des index posés par `2026-10-06-game-wave2-indexes`.
