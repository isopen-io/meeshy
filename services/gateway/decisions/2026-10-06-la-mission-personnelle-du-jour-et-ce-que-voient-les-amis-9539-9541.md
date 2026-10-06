## 2026-10-06 : La mission personnelle du jour, annoncée au début de sa plage ; la Flamme, les points et les trophées ne se montrent qu'aux amis (#9539, #9541)

### La mission personnelle (#9539)

Chaque compte (niveau 5 atteint) reçoit chaque jour **UNE mission qui lui est propre**, avec une **plage de deux heures pleines** dans son fuseau. Elle est une ligne `DailyMission` d'**emplacement 3**, à côté des trois missions du jour (0 à 2) — jamais à leur place.

- **La LOI** (`packages/shared/utils/game/personal-mission.ts`) : tirage déterministe par `(userId, jour)`, pondéré par les USAGES du compte (compteurs d'engagement), ses LANGUES (une mission du Prisme n'est proposée qu'à qui en parle deux), son NIVEAU (facile sous le 10, moyenne sous le 30, difficile ensuite — jamais d'Or) et ses HEURES HABITUELLES. La plage tient entre 8 h et 23 h ; tirée tard, elle ne retient que les plages où il reste une heure — sinon **aucune mission ce jour-là**, jamais une mission déjà manquée. Les signaux des trois missions du jour sont exclus.
- **Les heures habituelles ne sortent jamais** : l'histogramme (150 derniers messages des 30 derniers jours, `MissionHabits.ts`) est une ENTRÉE du tirage ; seule la plage tirée est servie, au hasard pondéré (deux jours de suite ne rendent pas la même heure). Aucune charge, aucun journal, aucune notification ne le porte (conformité partie IX : « jamais une heure d'activité »).
- **Le serveur juge sur des INSTANTS** : `startsAt` / `endsAt` (champs optionnels de `DailyMission`, posés par `instantOfLocal` dans le fuseau du compte). Début inclus, fin EXCLUE : passé `endsAt`, plus aucun geste ne fait avancer la mission (fail-closed, quel que soit l'appareil qui rejoue). Avant `startsAt`, non plus.
- **Elle ne gouverne ni le coffre ni le changement** : le coffre s'ouvre quand les TROIS du jour sont faites ; le changement de mission la refuse (`MISSION_REROLL_UNAVAILABLE`) ; toutes les lectures « de la journée » filtrent `slot < 3`.
- **Contrat additif** : `game.missions.personal` (`{ …mission, startsAt, endsAt, state }`, `state ∈ upcoming | active | completed | missed`), tolérant (`.catch(undefined)`), **jamais dans `items`** — un ancien client lit exactement ce qu'il lisait, et le coffre comme le « changer » ne changent pas.
- **Qui la tire** : la lecture de `GET /me/engagement` (premier accès du jour), ou le **job** `GameMissionWindowJob` (toutes les 5 minutes) qui tire à l'avance, par lot borné (200) et curseur, les comptes vus ces 7 derniers jours dont l'heure locale est entre 5 h et 21 h — sans cela personne ne serait prévenu au début de sa plage. Échelle : ≤ 1 000 comptes, un cycle du curseur en quelques passages ; à 100 000, restreindre aux fuseaux qui s'éveillent.

### L'annonce de début de plage (#9539)

Type **`game_mission_window`**, textes en huit langues (`game.missionWindow` : « Ta mission du jour : {activité}, entre {début} et {fin}. »), dans la langue de cadrage du destinataire, les bornes formatées dans son fuseau. Push ET in-app (`createNotification`), préférence `notification.gameEnabled`, « Jeu masqué » respecté.

- **Une fois par mission** : la réclamation (`DailyMission.notifiedAt`) est posée AVANT l'envoi, par une écriture conditionnelle (deux processus n'envoient qu'une fois) ; un envoi qui ÉCHOUE rend la réclamation (le passage suivant réessaie), un envoi ÉCARTÉ (réglage coupé, jeu masqué) ne se rejoue pas ; une mission déjà faite n'est pas annoncée.
- **Navigation** : `metadata = { action: 'view_details', route: 'progression', gameSection: 'missions', missionId, dayKey, templateKey, startsAt, endsAt }` — le toucher ouvre la section Héros des missions.
- **Hors du plafond d'une notification de jeu par jour** (avec les duos) : elle EST la notification quotidienne du compte ; elle ne prend pas le créneau (`GAME_NOTIFICATIONS_OUTSIDE_DAILY_CAP`).
- **Index** : `DailyMission_startsAt_idx`, migration datée `2026-10-06-game-mission-window-indexes.mongodb.js`, idempotente, **NON jouée** (staging d'abord, production avec le feu vert du porteur).

### Ce que voient les amis (#9541)

- **La Flamme d'un autre n'est servie qu'à ses AMIS acceptés** (et à soi, et à ADMIN/BIGBOSS) : `GameStandingService` ne la sert plus à « tout le monde », même quand le membre a ouvert son rang à tous.
- **Les amis voient en plus ses POINTS et le NOMBRE de ses trophées** (`standing.points`, `standing.trophyCount`, optionnels et ABSENTS — jamais nuls — pour tout autre lecteur) ; le nombre de trophées suit en plus le réglage de la VITRINE. Le rang, la division et la mention Légende ou Mythe restent ceux du réglage du rang.
- **Ce qui ne part toujours pas** : la Gloire exacte, les jours de série, une date, une présence. « Jeu masqué », le blocage et « moi seul » restent des portes fermées, amis compris. Le schéma de réponse de la route (JSON strict) déclare les deux champs : sans quoi le sérialiseur les aurait effacés.
- **Les duos sortent du plafond** : une invitation ou une acceptation de duo est un message d'un ami ; elle ne se compte pas et ne prend pas le créneau du jour (un résultat de ligue le même jour part). Elle reste annoncée une fois par duo.

### Ce qui n'est pas fait

Le miroir Android Kotlin ne reçoit rien (gel du 2026-09-16). Les clients web et iOS lisent `missions.personal`, routent `game_mission_window` et affichent le minuteur dans leurs lots.
