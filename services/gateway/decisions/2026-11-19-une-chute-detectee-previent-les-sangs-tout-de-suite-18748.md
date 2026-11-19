## 2026-11-19 : une chute détectée par la montre prévient les Sangs tout de suite, avec la position et la batterie qui leur sont déjà partagées

**Statut** : Proposé le 2026-11-19 (#18748, SAN-01 du catalogue `docs/specs/cercles/etat-du-telephone.md`). Donnée de santé (art. 9 RGPD) : revue `conformite-juridique` requise avant toute promotion en production. Suit la forme de la vérification d'inactivité (#18738), dont elle réutilise l'éventail d'alerte et la loi commune des états d'appareil (`relations/emitterFeatureAccess.ts`).

**Contexte** : « ⚠️ Une chute a été détectée sur la montre d'Awa à 16:42 », avec la position et la batterie. Source : HealthKit (`numberOfTimesFallen`, écrit par l'Apple Watch dans l'app Santé de l'iPhone). Rien de standard sur Android.

**Décision** :

1. **La source est l'iPhone, qui lit HealthKit.** Un `HKObserverQuery` à livraison d'arrière-plan immédiate sur `numberOfTimesFallen`, suivi d'une requête ancrée, rapporte chaque échantillon neuf : `POST /me/health/fall { detectedAt }` — un instant, aucune autre donnée de santé (schéma strict). L'autorisation Santé n'est demandée qu'à l'activation du réglage, jamais au lancement.
2. **Le serveur ne garde que l'épisode en cours** : `{ userId, detectedAt, expiresAt }` scellé dans Redis, 6 h, aucun historique. Une chute rapportée plus de 30 min après son instant, ou dans le futur, est refusée ; une seconde chute à moins de 10 min de la première ne repousse rien.
3. **Push immédiat aux Sangs** (`fall_detected`) : c'est une alerte. Le texte dit la chute et l'heure (à la minute), jamais la position. L'état servi dans `user:<Sang>` (`fall:detected`) porte la dernière position et la dernière batterie **seulement** si ce Sang les reçoit déjà (mêmes lois que #18738).
4. **« Je vais bien »** (`POST /me/health/fall/ok`) clôt l'épisode : `fall:cleared` et un push « X va bien » aux Sangs qui ont reçu l'alerte. L'expiration, elle, est silencieuse.
5. **Accès** : `health.fall` au niveau Sang, actif par défaut sans confirmation (décision porteur du 2026-11-14), coupure pour tous `User.fallSharingDisabledAt` (collecte comprise), retrait par personne `RelationFeatureSetting.fallShared`. Entre comptes de l'équipe, niveau Sang (#16623). Le mode fantôme coupe tout. Jamais un message de conversation.
6. **Android et le web ne détectent rien** : ils reçoivent, affichent, et leur réglage dit que la détection vient d'une Apple Watch.

**Courses** : mêmes règles que #18738 — éventail hors verrou, relecture avant envoi, lecteur filtré sur `servedTo` courant, correction après coup.
