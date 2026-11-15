## 2026-11-05 : La Gloire du coffre suit l'effort du jour et l'heure d'ouverture, gravée à l'heure serveur (#16414)

**Statut** : Accepté (demande du porteur du 2026-11-05).

**Contexte** : la Gloire du coffre du jour valait ses points ÷ 10 (`gloryForChest`, 50 à 1 000, #10011) — trop peu au regard des autres sources (une frappe en donne 1 000).

**Décisions** :
- **Une base de 1 250 à 3 000** sur l'effort des missions du jour, la MÊME droite entière que les points (`chestBaseGloryForEffort`, l'effort borné à [300, 4 500]).
- **Une prime de précocité de 2 800 à 0** : `round(2 800 × (23 − h) ÷ 23)`, `h` = heures ENTIÈRES écoulées depuis le début du jour de jeu, bornée à [0, 23] (`chestEarlyGlory`). Un jour de jeu prolongé (au-delà de 24 h, `resolveGameDayKey`) ne paie plus de précocité ; une heure illisible non plus.
- **Total 1 250 à 5 800** ; `CHEST_ODDS.minGlory/maxGlory` les annoncent avant l'ouverture.
- **Le début du jour de jeu** (`chestDayStart`) est minuit de la clé du jour dans le fuseau du compte (`instantOfLocal`, repli UTC comme `dayKeyOf`) — sauf si les missions du jour ont été tirées AVANT cet instant : alors l'ouverture des missions fait foi. Sans cette clause, déplacer son fuseau vers l'ouest en fin de journée reculait minuit après le tirage et rendait toute la précocité à un coffre ouvert tard. L'ouverture des missions est le repère déjà établi du cours de la prime (`chestPriceCutoff`, #10219), mais seule elle ne convient pas : un compte qui ouvre le jeu à 18 h aurait toute la précocité.
- **La passerelle calcule l'heure à l'instant SERVEUR de la réclamation** (`chestHoursIntoDay`, `services/gateway/src/services/game/gameClock.ts`) et GRAVE la Gloire totale (`GameDay.chestGlory`) et sa part de précocité (`GameDay.chestEarlyGlory`, colonne additive, aucun backfill). Une réclamation rejouée rend la valeur gravée ; un coffre déjà ouvert n'est jamais réécrit.
- **L'aperçu** (`GameChest.today`) sert la Gloire « si on l'ouvre maintenant » : `glory` (le total) et `earlyGlory` (la précocité, champ neuf optionnel). Le coffre ouvert sert `earlyGlory` à côté de `glory` quand il est gravé.
- **Rétrocompatibilité (#9223)** : aucun champ retiré ni renommé ; `glory` reste le total, le seul champ que lisent les clients publiés.
- **Une loi, trois miroirs** : `packages/shared/utils/game/chest.ts`, iOS `GameChest.swift`, Android `GameChest.kt` ; vecteurs partagés `game.vectors.json` (entrée `elapsedHours`, sortie `earlyGlory`). `gloryForChest` est retirée des trois.
