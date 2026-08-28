# Cycle 131 — le second arm : un magasin local que rien ne venait jamais rafraîchir

Date : 2026-08-28 · Issue : #4133 · Branche : `claude/keen-hamilton-funmhr`

## Le défaut

`user:preferences-updated` porte une **union de trois scopes** sous un seul nom. Le
cycle 130 a livré l'arm CONVERSATION côté Android. L'arm **CATÉGORIE**
(`{ userId, category }`) restait sans lecteur — et contrairement à l'arm
communauté, ce n'était pas une feature absente mais un **vrai manque** :

- `NotificationPreferencesStore` et `PrivacyPreferencesStore` sont adossés à
  **DataStore** et documentés en toutes lettres comme « the UI source of truth —
  a toggle paints instantly from it » ;
- ils sont écrits **localement**, puis propagés par l'outbox
  (`PATCH /me/preferences/{notification,privacy}`) ;
- côté passerelle, `preferences-broadcast.ts` diffuse
  `USER_PREFERENCES_UPDATED { userId, category }` pour les quatre verbes écrivains
  **et** pour la remise à zéro globale (une fois par catégorie effacée).

Conséquence : couper les notifications push depuis le web ou l'iPhone laissait le
magasin local Android sur l'ancienne valeur, **indéfiniment**. Et le magasin de
notifications ne gouverne pas qu'un écran de réglages : il gouverne ce que
l'appareil AFFICHE et SONNE, longtemps après que l'écran a disparu.

## Ce que le lot a trouvé en chemin

**Android ne pouvait pas RELIRE ces blocs.** `PreferencesApi` ne déclarait que les
deux `PATCH` — aucun `GET`. Le client pouvait écrire ses préférences et jamais les
lire : il n'existait donc, avant ce lot, aucun chemin par lequel une valeur écrite
ailleurs pouvait atteindre l'appareil, ni par socket ni par relecture.

> **Un écrivain sans lecteur ne se voit pas dans un balayage de « qui écoute quoi »** —
> il n'y a rien à écouter. C'est la forme inverse du cycle 130 (un événement sans
> consommateur) : ici, un consommateur sans source.

## Ce qui change

| site | ce qui change |
|---|---|
| `NotificationPreferenceSyncBody` / `PrivacyPreferenceSyncBody` | `toPreferences(current)` — la **moitié LECTURE** de `from()`, pure et testée en JVM |
| `PreferencesApi` | `getNotification()` / `getPrivacy()` — les deux `GET` qui manquaient |
| `PreferencesSocketManager` | l'arm CATÉGORIE rejoint le pont : `categoryPreferencesUpdated: SharedFlow<String>` |
| `PreferencesSyncCoordinator` (neuf) | le collecteur de SESSION : relit la catégorie nommée, projette, écrit le magasin |
| `RealtimeSessionCoordinator` | le démarre à l'attache, l'**arrête** à la déconnexion |
| `SdkModule` | le construit (le graphe ne lie aucun `CoroutineScope` — convention du module) |

### La projection de lecture prend `current`, et c'est tout le sujet

Les deux corps de fil portent **moins** que le bloc local, délibérément :

- les deux laissent tomber `extras` (extension locale qui ne doit jamais partir au
  serveur) ;
- le corps privacy laisse EN PLUS tomber les quatre champs de chiffrement, pour
  qu'une synchro d'appareil n'estampille jamais ses défauts par-dessus une valeur
  posée sur le web ou iOS.

Une projection reconstruite depuis la seule réponse infligerait **exactement ce
dégât dans l'autre sens** : remettre à zéro, à chaque diffusion, ce que le côté
écriture s'était donné du mal à ne pas toucher. Et la réponse `GET` **porte** bien
ces clés — rien d'autre que cette projection ne se tient entre elles et le bloc
local. D'où `toPreferences(current)` : ce que la passerelle possède vient de la
réponse, ce qu'elle ignore vient de `current`.

### Pourquoi un coordinateur, et pas un collecteur de ViewModel

Le magasin de notifications gouverne le comportement de l'appareil, pas seulement
un écran. Collecter dans `SettingsViewModel` synchroniserait les magasins
uniquement pendant que l'utilisateur les REGARDE — la fenêtre où il en a le moins
besoin. Le collecteur vit donc pour la session, démarré par
`RealtimeSessionCoordinator` à côté des managers, et **arrêté à la déconnexion** :
sans cet arrêt il resterait abonné et rejouerait une relecture sur le compte suivant.

### Pourquoi il RELIT au lieu d'appliquer la charge

`UserPreferencesCategoryUpdatedEventData` porte `{ userId, category }` — le NOM du
bloc et rien d'autre. Pas d'instantané à replier, pas de version à arbitrer (à la
différence de l'arm conversation) : la seule réponse correcte est une relecture
ciblée. Fabriquer une valeur depuis l'événement n'est pas une option que la charge
offre.

### Deux catégories sur sept

La passerelle en a sept (`privacy`, `audio`, `message`, `notification`, `video`,
`document`, `application`). Android en met **deux** en cache, donc deux seulement
peuvent se périmer ; les cinq autres sont lues à la demande par les écrans qui s'en
servent et n'ont aucun magasin à invalider. Un nom non géré est ignoré — pas
journalisé en erreur : c'est le cas nominal pour cinq sur sept. Un témoin le tient,
avec un double dont **toutes** les routes refusent par défaut, si bien qu'une
relecture inutile ferait tomber le témoin au lieu de passer inaperçue.

### Un échec de relecture ne remet RIEN à zéro

Le bloc garde la valeur qu'il avait — même dégradation qu'être hors ligne. Remettre
un bloc de notifications à ses défauts sur un incident réseau **rallumerait** les
notifications de quelqu'un qui vient de les couper ailleurs : pire que de rester
périmé. Témoin dédié.

## Gates

| gate | résultat |
|---|---|
| `PreferenceSyncBodyReadProjectionTest` (neuf, `:core:model`) | 8 témoins — décodage clé par clé des deux blocs ; `extras` préservé des deux côtés ; **la jambe chiffrement ni adoptée depuis la réponse ni écrasée** (les deux sens) ; les deux allers-retours écriture→lecture |
| `PreferencesSocketManagerTest` (+4) | l'arm catégorie émet son NOM ; la remise à zéro globale relaie un événement par catégorie, dans l'ordre ; aucun des deux arms ne fuit dans le flux de l'autre ; l'arm communauté n'atteint ni l'un ni l'autre |
| `PreferencesSyncCoordinatorTest` (neuf, `:sdk-core`) | 7 témoins — les deux blocs relus et écrits ; la jambe chiffrement intacte ; une catégorie sans magasin **non demandée** ; un échec qui ne touche à rien ; `start()` idempotent ; `stop()` qui ferme |
| `RealtimeSessionCoordinatorTest` (+3) | le collecteur démarre à l'attache, une fois, se redémarre après reconnexion, et **s'arrête à la déconnexion** |
| `:app:assembleDebug` + `testDebugUnitTest` | délégués au workflow `Android` (voir cycle 130 : `dl.google.com` est refusé par la politique de sortie de ce conteneur) |
| gateway / web / iOS | **non modifiés** — aucun contrat de fil touché, ce lot n'ajoute qu'un lecteur et deux `GET` déjà servis |

## Suivi MESURÉ

- **Les cinq autres catégories n'ont pas de magasin local**, donc rien à
  invalider — mais aussi rien qui hydrate leurs écrans en cache-first. Distinct de
  ce lot ; c'est une question de cache, pas de synchronisation.
- **Le bloc privacy gouverne des règles que le serveur applique déjà**
  (`showOnlineStatus`, `showReadReceipts`…). Ce lot rend le magasin local fidèle ;
  il ne change pas qui applique la règle.
- **Aucune hydratation au démarrage à froid.** Les deux `GET` neufs ne sont
  appelés que par une diffusion. Un appareil qui a raté l'événement (hors ligne au
  moment du changement) reste périmé jusqu'à la diffusion suivante. Les câbler à
  une relecture de démarrage est un lot à part, et il vaut la peine d'être posé.
