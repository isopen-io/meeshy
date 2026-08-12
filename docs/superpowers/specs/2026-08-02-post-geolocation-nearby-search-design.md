# Recherche de posts/reels/stories par proximité — indexation géospatiale et heatmap

Date : 2026-08-02
Statut : design validé, prêt pour implémentation autonome (workflow)

## Problème

Depuis le spec du 29/07 (`2026-07-29-partage-position-design.md`), un post/message/
commentaire peut porter une position (`metadata.location` → `SharedPlace`), mais
uniquement pour l'**affichage** (carte + nom de lieu sur le contenu lui-même). Ce
spec assumait explicitement : *« pas d'index géographique, donc pas de requête
spatiale ultérieure sans reprise du modèle »*.

Ce document est cette reprise : permettre de **rechercher** des posts/reels/
stories/status par proximité géographique, avec une visualisation par carte de
densité (zones chaudes/froides), sans dégrader ni fusionner avec le mécanisme
d'affichage existant.

## Décisions

| Sujet | Décision |
|---|---|
| Scope contenu | POST, REEL, STORY, STATUS (tous les `PostType`) — pas les messages ni les commentaires |
| Relation au badge affiché | **Indépendante** de `metadata.location` — deux champs séparés, deux opt-in séparés |
| Moment du choix | Par publication, précision mémorisée localement comme défaut pré-sélectionné |
| Niveaux de précision | 4 : Exacte / Quartier (~1km) / Ville (~10km) / Région (~100km), + désactivé |
| Floutage | Arrondi déterministe à une grille (PAS de bruit aléatoire — voir Risques) |
| Rétro-indexation | Aucune — uniquement les publications futures |
| Scope plateforme v1 | iOS seul ; endpoint gateway agnostique du client (réutilisable web plus tard) |
| Découvrabilité sans badge | Possible — les deux toggles sont indépendants |
| Visualisation | Carte à pins (`/posts/nearby`) + carte de densité chaude/froide (`/posts/nearby/density`) |
| Accessibilité | Plusieurs points d'entrée (toolbar Feed, action sur badge de lieu, profil) |

## 1. Modèle de données

Sur `Post` (`packages/shared/prisma/schema.prisma`, modèle `Post` à partir de
`:2840`), en plus du `metadata.location` existant (inchangé, sert uniquement
l'affichage) :

- `geoPoint: Json?` — GeoJSON `{ type: "Point", coordinates: [lng, lat] }`,
  coordonnée déjà quantifiée à la précision choisie (ou exacte).
- `geoPrecision: String?` — `"EXACT" | "NEIGHBORHOOD" | "CITY" | "REGION"`.

Index MongoDB `2dsphere` sur `geoPoint`, créé via `$runCommandRaw` (pattern déjà
utilisé dans ce gateway — `InitService.ts`, `NotificationService.ts`,
`PostTranslationService.ts`) au bootstrap du service, documenté en commentaire
dans `schema.prisma` puisque Prisma ne sait pas déclarer ce type d'index.

Aucune migration de données : `geoPoint`/`geoPrecision` restent `null` pour tout
post publié avant cette fonctionnalité (décision assumée — voir Risques).

## 2. Consentement / flux de publication

Concerne les publications de post/reel/story/status (composer feed), **pas** le
composer de message ni la feuille de commentaire — ceux-ci gardent uniquement
`metadata.location` d'affichage tel qu'aujourd'hui.

Après le choix de lieu habituel (`LocationPickerView`), deux contrôles
indépendants :

- **« Afficher une position sur ce contenu »** — toggle existant, inchangé,
  gouverne `metadata.location`.
- **« Rendre ce contenu trouvable à proximité »** — nouveau, off par défaut,
  avec sélecteur Exacte/Quartier/Ville/Région si activé.

Le sélecteur de précision **mémorise le dernier choix utilisé** (préférence
locale device — UserDefaults ou équivalent, pas un réglage serveur) comme
valeur pré-sélectionnée à la prochaine publication. L'utilisateur voit et
confirme toujours ; rien n'est appliqué silencieusement.

Le client envoie toujours la coordonnée **exacte** captée (GPS ou pin MapKit),
accompagnée d'un champ `discoverabilityPrecision` optionnel. **Le serveur
seul** calcule l'arrondi de grille avant d'écrire `geoPoint`/`geoPrecision` — si
`discoverabilityPrecision` est absent, les deux champs restent `null`. Le
serveur ne conserve jamais une précision supérieure à celle demandée : la
coordonnée exacte n'est pas persistée du tout si l'utilisateur n'a pas choisi
« Exacte ».

Grilles de quantification (approximation acceptée, la conversion degré→km
varie avec la latitude — non bloquant pour une fonctionnalité de découverte) :

| Précision | Arrondi | Rayon approximatif |
|---|---|---|
| EXACT | aucun | — |
| NEIGHBORHOOD | 0.01° | ~1 km |
| CITY | 0.1° | ~10 km |
| REGION | 1° | ~100 km |

## 3. Endpoints gateway

### `GET /api/v1/posts/nearby?lat=&lng=&radiusKm=&cursor=&limit=`

1. Agrégation raw `$geoNear` sur `geoPoint`, filtrée `visibility: PUBLIC`
   (la recherche par proximité n'étend jamais l'audience au-delà de ce qu'un
   post `PUBLIC` autorise déjà — `COMMUNITY`/`PRIVATE` n'apparaissent jamais
   ici, quel que soit `discoverabilityPrecision`) et
   `expiresAt: null OR expiresAt > now()` (exclut nativement le contenu
   éphémère expiré : STORY ~21h, STATUS ~1h). Retourne `{id, distanceMeters}[]`
   triés par distance.
2. `prisma.post.findMany({ where: { id: { in }}})`, même enrichissement que le
   feed actuel (`PostFeedService` : traductions, `hoistLocationDeep`,
   réactions), réordonné selon l'étape 1.
3. Réponse `sendSuccess()` standard, `pagination` top-level.

### `GET /api/v1/posts/nearby/density?lat=&lng=&radiusKm=&cellSizeKm=`

Agrégation raw `$geoNear` + `$group` par cellule de grille (même échelle que
`geoPrecision`, adaptée au niveau de zoom carte demandé par le client) :
`{cellLat, cellLng, count}[]`. Volontairement plus léger que `/nearby` — sert
uniquement le rendu de densité, pas le contenu complet des posts.

Les deux endpoints rejettent tout champ `geoPoint`/`geoPrecision` envoyé
directement par le client (même invariant que `metadata` : le serveur seul
écrit ces champs, jamais de passthrough).

## 4. UI iOS

### Découverte (carte + liste)

Nouvel écran `NearbyDiscoveryView` : bascule carte de densité / carte à pins /
liste. La carte de densité rend un overlay `MKOverlay` custom (cercles
semi-transparents par cellule, couleur interpolée rouge chaud → bleu froid
selon `count` normalisé) au-dessus de la même base carte que `AdaptiveMap`.
Zoomer ou taper une cellule bascule vers les pins individuels
(`/posts/nearby`).

### Accessibilité — plusieurs points d'entrée

Nouvelle route `Router.Route.nearbyDiscovery(initialCoordinate:
CLLocationCoordinate2D?)`, sur le modèle exact de `.peopleDiscovery(initialTab:)`
déjà présent dans `Router.swift`. Points d'entrée :

- Icône persistante dans la toolbar du Feed (`FeedView`) — entrée principale.
- Action contextuelle sur tout badge de position déjà affiché (post/story) :
  « Voir près d'ici » → pousse la route pré-centrée sur cette coordonnée
  (indépendant de l'opt-in découvrabilité — un simple raccourci de navigation
  basé sur une position déjà visible publiquement).
- Entrée depuis le profil (onglet posts personnels) pour visualiser ses
  propres publications géolocalisées.

### Web

Hors scope v1 (décision assumée). L'endpoint gateway reste agnostique du
client, donc réutilisable sans retouche backend le jour où le web rendra la
position (dette déjà notée dans le spec du 29/07).

## 5. Erreurs & cas limites

- Pas de permission de localisation → état vide explicite sur l'écran
  découverte, pas de crash (réutilise le même service de localisation que le
  picker — vigilance sur l'isolation d'acteur, cf. spec du 29/07 §2.2).
- Aucun résultat dans le rayon → état vide dédié, pas de repli trompeur.
- Antiméridien (180°/−180°) : `$geoNear` natif MongoDB le gère nativement,
  pas de traitement custom nécessaire.
- Contenu éphémère qui expire pendant la consultation de l'écran découverte :
  accepté tel quel (rafraîchissement au prochain pull-to-refresh, pas de
  websocket dédié en v1).

## 6. Tests

- **Unitaire** : fonction de quantification de grille (bornes exactes par
  tier) ; rejet si précision demandée dépasse celle autorisée.
- **Gateway** : `$runCommandRaw` mocké (précédent
  `__tests__/notifications-security.test.ts`,
  `services/posts/__tests__/PostTranslationService.test.ts`) pour les
  agrégations `$geoNear`/`$group` ; filtrage `visibility`/`expiresAt` ; refus
  d'un `geoPoint`/`geoPrecision` client brut.
- **SDK iOS** : round-trip Codable des nouveaux champs de payload/réponse.
- **iOS app** : mémorisation du dernier tier choisi ; navigation vers
  `NearbyDiscoveryView` depuis chacun des points d'entrée ; snapshot de l'écran
  découverte (carte de densité, clair/sombre).
- **Visuel** : vérification sur simulateur iOS — chaque point d'entrée mène
  bien à l'écran, la carte de densité rend des zones visuellement
  différenciées.

## Risques

- **Pas de rétro-indexation** : les posts géolocalisés publiés avant cette
  fonctionnalité (depuis le 30/07) resteront invisibles en recherche nearby.
  Assumé — les rendre soudainement découvrables romprait le consentement
  donné au moment de leur publication (aucune recherche par proximité
  n'existait alors).
- **Arrondi à une grille fixe, pas de bruit aléatoire** : un bruit indépendant
  à chaque publication serait cassable statistiquement (poster plusieurs fois
  depuis le même lieu avec un bruit différent permet, en moyennant, de
  retrouver la position réelle). L'arrondi déterministe donne toujours la même
  cellule pour un même lieu réel — rien à moyenner. Conséquence acceptée :
  deux utilisateurs dans la même cellule de grille ne sont pas distinguables
  entre eux à ce niveau de précision (c'est le but).
- **Conversion degré→km approximative** : varie avec la latitude (les degrés
  de longitude se resserrent près des pôles). Non bloquant pour une
  fonctionnalité de découverte grand public ; à revisiter si Meeshy cible un
  usage à très haute latitude.
- **Web ne rendra rien** en v1 (dette déjà connue depuis le 29/07, non
  aggravée par ce chantier).
