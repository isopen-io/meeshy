# Bandeau de stats profil + correctif menu DM — design

Date : 2026-07-25
Périmètre : iOS uniquement pour la livraison de ce cycle (phase 1 + correctif menu).
La phase 2 (totaux exacts côté backend) est **définie mais hors de ce cycle**.

> **Deux chantiers indépendants** réunis dans un même spec parce qu'ils
> proviennent de la même demande utilisateur et touchent la même surface
> (le profil d'un autre utilisateur / la ligne de conversation) :
>
> - **A.** Correctif du doublon « voir le profil » dans le menu long-press d'un DM.
> - **B.** Bandeau de statistiques (Postes / Réels / Stories) en tête du listing
>   des postes du profil, livré en **hybride** : phase 1 app-only maintenant,
>   phase 2 backend en suivi.

## Problème

### A. Menu long-press DM — doublon « voir le profil »

Sur la ligne de conversation, le long-press de l'**avatar** d'un DM affiche deux
entrées profil en anglais (« Voir le profil » + « View profile ») là où il ne
devrait y en avoir qu'une.

Cause racine : deux sources ajoutent une entrée profil.

1. `MeeshyAvatar` (SDK) auto-injecte une entrée `"Voir le profil"` **codée en dur
   en français**, jamais localisée
   (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift:299-301`).
2. L'app ajoute une seconde entrée **localisée** via `directContextMenuItems`
   (`apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift:662-671`).

La déduplication du SDK compare les libellés
(`MeeshyAvatar.swift:305-311`). En français les deux libellés valent
« Voir le profil » → dédupliqués. En anglais l'entrée hardcodée reste
« Voir le profil » tandis que l'entrée localisée devient « View profile » →
**les deux apparaissent**. Le bug est donc spécifique aux DM et invisible en
français.

De plus, l'entrée qui ouvre réellement les détails de la conversation est
libellée « Conversation » (clé `"Conversation"`), ce qui ne dit pas ce qu'elle
fait.

### B. Aucune vue d'ensemble du volume de contenu d'un profil

L'onglet « Postes » de `UserProfileSheet` affiche directement la liste des
postes, sans aucun résumé. L'utilisateur ne voit pas d'un coup d'œil combien de
postes / réels / stories l'auteur a publiés.

Contrainte structurante : **aucun compteur total n'existe côté données**.
`UserStats` (SDK) ne porte ni `postsCount`, ni `reelsCount`, ni `storiesCount` ;
la pagination `CursorPagination` n'expose pas de `total`. Le ViewModel du listing
(`ProfileUserPostsViewModel`) ne connaît que les postes **déjà chargés** (paginés,
20/page) plus un `reels` dérivé.

## Principes retenus

- **Correctif A app-side et minimal.** On ne réécrit pas la dédup du SDK : on
  supprime la source dupliquée à la racine (ne plus laisser `MeeshyAvatar`
  auto-injecter pour les DM) et on garde l'unique entrée localisée de l'app.
- **Bandeau B à valeurs opaques.** Le composant de bandeau ignore la provenance
  des chiffres : il reçoit des compteurs + un flag d'approximation. La phase 2
  réalimente le même composant sans le réécrire.
- **Honnêteté sur l'approximation.** En phase 1 les compteurs sont des bornes
  basses (postes paginés) : on l'assume visuellement par un suffixe « + » tant
  qu'il reste des pages à charger.
- **Toute logique non triviale extraite en fonction/propriété pure testable**
  (construction des items de menu, calcul des compteurs).
- **Réutiliser l'existant** : le style visuel s'aligne sur `miniStatChip`
  (`UserProfileSheet+DetailsTab.swift:354`) plutôt que d'inventer une nouvelle
  charte.

## A. Correctif menu long-press DM

Fichier : `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`.

### A.1 Supprimer l'auto-injection profil du SDK pour les DM

Aujourd'hui (`ThemedConversationRow.swift:700-701`) :

```swift
onTap: isDirect ? nil : onViewConversationInfo,
onViewProfile: isDirect ? onViewProfile : nil,
```

`onViewProfile` non-nil déclenche l'auto-injection de l'entrée hardcodée par
`MeeshyAvatar`. On passe **`onViewProfile: nil`** (l'entrée profil reste fournie,
localisée, par `directContextMenuItems`).

> **Vérification obligatoire avant édition** : lire `MeeshyAvatar.swift` et
> confirmer que le paramètre `onViewProfile` ne sert QU'à l'auto-injection de
> l'item de menu et n'est pas également câblé à un geste de tap sur l'avatar. Si
> un tap en dépend, adapter le fix pour préserver ce comportement.

### A.2 Renommer l'entrée détails → « Infos conversation »

Dans `directContextMenuItems` (`ThemedConversationRow.swift:662-671`), l'entrée
détails passe de la clé `"Conversation"` à la clé **`conversation.info`** avec
`defaultValue: "Infos conversation"`, la même que celle déjà utilisée par le menu
de GROUPE (`ThemedConversationRow.swift:675`). Les deux menus deviennent
cohérents.

### A.3 Menu DM résultant

Ordre : détails d'abord, profil ensuite (conforme à la demande).

| Icône | Libellé (FR) | Action |
|---|---|---|
| `info.circle.fill` | Infos conversation | `onViewConversationInfo` → sheet détails conv. |
| `person.circle.fill` | Voir le profil | `onViewProfile` → sheet profil |

Une seule entrée profil, correctement localisée dans toutes les langues.

### A.4 Localisation

Fichier : `apps/ios/Meeshy/Localizable.xcstrings`.

Ajouter la clé `conversation.info` (absente aujourd'hui : le menu de groupe
s'appuie sur sa seule `defaultValue` FR) avec traductions :

| Clé | fr | en | es | de | pt-BR |
|---|---|---|---|---|---|
| `conversation.info` | Infos conversation | Conversation info | Info de conversación | Unterhaltungsinfo | Informações da conversa |

Respecter les pièges `.xcstrings` connus (devRegion, pas de clés mortes en union,
édition byte-cohérente).

## B. Bandeau de statistiques — Phase 1 (livrée)

### B.1 Composant `ProfilePostsStatsBand`

Nouveau composant app-side, à valeurs opaques :

```
ProfilePostsStatsBand(
    postsCount: Int,
    reelsCount: Int,
    storiesCount: Int,
    isApproximate: Bool          // true → suffixe « + » sur chaque valeur
)
```

Rendu : bande horizontale de 3 mini-stats (valeur en chiffres arrondis, tabulaires ;
label discret dessous), dans une carte `material` arrondie. Style aligné sur
`miniStatChip`. Ne rend PAS son propre ScrollView.

```
┌─────────────────────────────────────────────┐
│   12+          3+           5+               │
│  Postes       Réels       Stories            │
└─────────────────────────────────────────────┘
```

Libellés localisés (`Localizable.xcstrings`), pluralisation gérée par le label
fixe (« Postes / Réels / Stories »), la valeur seule variant.

### B.2 Insertion

Fichier : `apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift`.

Insérer `ProfilePostsStatsBand` dans `body` **juste avant** le `LazyVStack`
(actuellement ligne 65), à l'intérieur du conteneur existant (pas de ScrollView
ajouté). Le bandeau ne s'affiche pas tant qu'aucun poste n'est chargé (état vide
inchangé).

### B.3 Source des compteurs (phase 1, dérivée)

Ajouter au `ProfileUserPostsViewModel` des propriétés calculées pures :

```swift
var postsCount: Int    { posts.filter { !$0.isReel && !$0.isStory }.count }
var reelsCount: Int    { posts.filter(\.isReel).count }
var storiesCount: Int  { posts.filter(\.isStory).count }
var isCountApproximate: Bool { hasMore }
```

`isReel` / `isStory` sont déjà dérivés du champ serveur `type`
(`FeedModels.swift:708/714`).

> **Vérification obligatoire à l'implémentation** : confirmer quels `type` sont
> renvoyés par l'endpoint profil (`getUserPosts` / `PostService`). Si les STORY
> ne figurent pas dans ce flux, `storiesCount` vaudra 0 en phase 1 — comportement
> acceptable et documenté, corrigé par la phase 2. Ne PAS charger une source
> stories séparée juste pour ce compteur (hors périmètre).

### B.4 Comportement d'approximation

Tant que `hasMore == true`, `isApproximate` est vrai → suffixe « + » (borne
basse). Une fois toutes les pages chargées, les chiffres sont exacts et le « + »
disparaît. Les compteurs se mettent à jour au fil du chargement (le bandeau
observe le ViewModel déjà en place).

## B. Bandeau — Phase 2 (suivi, backend — hors de ce cycle)

Chantier séparé, avec son propre spec/plan. Objectif : totaux exacts, non paginés.

1. **Gateway** : `countDocuments({ authorId, type })` par type (POST/REEL/STORY),
   exposé dans l'endpoint stats utilisateur (`GET /users/{id}/stats`).
2. **shared** : étendre le type de stats (`postsCount`/`reelsCount`/`storiesCount`).
3. **SDK** : étendre `UserStats`
   (`packages/MeeshySDK/Sources/MeeshySDK/Models/StatsModels.swift`).
4. **iOS** : alimenter `ProfilePostsStatsBand` depuis `effectiveUserStats` avec
   `isApproximate: false` (retrait du « + »).

Le composant de phase 1 est conçu pour ne rien changer d'autre à ce moment-là.

## Tests

Tous via `./apps/ios/meeshy.sh test` (XCTest), TDD RED → GREEN avant tout code de
production.

- **A** — construction des items de menu DM : une seule entrée profil ; l'entrée
  détails porte la clé/le libellé « Infos conversation » ; ordre détails puis
  profil. Extraire `directContextMenuItems` sous une forme testable si nécessaire.
- **B** — calcul pur des compteurs sur un jeu de `FeedPost` mixte
  (POST/REEL/STORY) : `postsCount`/`reelsCount`/`storiesCount` corrects ;
  `isCountApproximate == hasMore`.

## Fichiers touchés (phase 1 + A)

| Fichier | Chantier | Nature |
|---|---|---|
| `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` | A | édition (nil onViewProfile DM, clé détails) |
| `apps/ios/Meeshy/Localizable.xcstrings` | A + B | clés `conversation.info` + labels bandeau |
| `apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift` | B | insertion bandeau + propriétés compteurs |
| `apps/ios/Meeshy/Features/Main/Views/ProfilePostsStatsBand.swift` | B | nouveau composant |
| `apps/ios/MeeshyTests/...` | A + B | nouveaux tests |

Le SDK n'est pas modifié en phase 1 (le hardcodé FR de `MeeshyAvatar` devient du
code mort pour notre usage ; sa localisation/suppression éventuelle est un
nettoyage optionnel hors périmètre).
