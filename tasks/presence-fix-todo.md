# Fix Présence — seuils cohérents web / iOS / Android

## Règle produit cible (source de vérité)
Basée sur `now - lastActivity` :
- **Actif** (dot orange / "en ligne") : activité dans les **60 dernières secondes**
- **Badge orange** ("récemment actif") : de l'activité jusqu'à **5 min** sans activité
- **Badge gris** ("absent") : de **5 min** à **30 min** sans activité
- **Aucune info de présence** : au-delà de **30 min**

Bug rapporté : points orange affichés pendant 30 min au lieu de passer gris à 5 min.

## Seuils normalisés (à appliquer partout)
| État        | Condition (delta = now - lastActivity) | Couleur |
|-------------|----------------------------------------|---------|
| online/actif| delta <= 60 s                          | orange (pulse/dot plein) |
| recent      | 60 s < delta <= 5 min                  | orange (badge)  |
| away        | 5 min < delta <= 30 min                | gris            |
| offline     | delta > 30 min                         | rien (pas de badge) |

Constantes :
- ONLINE_WINDOW = 60 s
- RECENT_WINDOW = 5 min = 300 s
- AWAY_WINDOW = 30 min = 1800 s

## Étapes
- [ ] Cartographier logique présence : web, iOS, Android, gateway/shared (agents en cours)
- [ ] Identifier la source unique de vérité du calcul (idéalement 1 helper par plateforme)
- [ ] Web : corriger seuils + couleurs
- [ ] iOS : corriger seuils + couleurs
- [ ] Android : corriger seuils + couleurs
- [ ] Vérifier fraîcheur du timestamp source (lastSeen/lastActivity, heartbeat)
- [ ] Tests (TDD) sur les helpers de calcul d'état par plateforme
- [ ] Commit régulier + pull main entre les étapes

## Review (terminé 2026-07-08)
Modèle 4 états livré et **vérifié** sur les 3 plateformes, décroissance temporelle pure
sur `lastActiveAt` (gelé par le gateway à la déconnexion ; sweeper serveur = 30 min déjà OK,
aucune modif gateway nécessaire) :
- Actif ≤60s → orange (+pulse) ; ≤5min → orange ; 5-30min → gris ; >30min → rien.

- **Web** (committé `205e1a613`/`b9b05afef`/`2c28c9d5d`, sur origin) : `lib/user-status.ts`
  → 4 états + helpers `isPresence{Visible,Active,Pulsing}` ; OnlineIndicator, Avatar v2,
  ConversationItem, StreamSidebar, UserPresence{Label,Badge}, ContactCard, SearchPage,
  presence-format ; listes participants via `isPresenceActive`. 130 tests verts + i18n `status.recent` (4 langues).
- **iOS+Android** (committé `2109f4960`, local, non poussé) :
  - iOS : `PresenceModels` (+.recent, `state(now:)`), MeeshyAvatar/UserIdentityBar/profil/
    StoryViewerView/PresenceManager. Tests SDK + app `PresenceManager` **32/32 verts sur simu 18.2**
    (le sim 26.x crashe au teardown → toujours vérifier sur 18.2). Build app SUCCEEDED.
  - Android : `Presence.kt` (+RECENT, windows 60s/5min/30min), MeeshyAvatar/ContactsListTab/
    ProfileScreen (orange + gris `Neutral400`), NewConversationScreen. `./gradlew` tests verts.

Bug "points orange pendant 30min" corrigé partout. Reste optionnel : push origin (déploiement web),
device-test visuel, pulse Android (non implémenté — Android n'avait pas de pulse).


## Addendum 2026-07-08 (soir) — correction palette (JC)
La règle ci-dessus avait inversé la sémantique couleur (« Actif = dot orange »).
Décision produit JC : **vert = online/recent (isOnline backend autoritatif + typing),
orange = away 5-30min, gris = offline**. Les seuils 60s/5min/30min restent valides.
Implémenté sur les 3 plateformes + source de vérité `packages/shared/utils/user-presence.ts`.
Voir `tasks/presence-green-palette-todo.md` pour le détail.
