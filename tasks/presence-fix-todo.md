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

## Review
(à compléter)
