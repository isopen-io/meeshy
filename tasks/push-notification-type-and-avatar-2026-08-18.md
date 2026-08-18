# Notifications push — type d'action visible + avatar de l'acteur (2026-08-18)

## Symptôme
Bannière iOS : « elvira ndjiki » + le texte du commentaire, avec l'icône générique
de l'app. Impossible de savoir s'il s'agit d'un commentaire, d'un message ou d'un
nouveau post, et l'avatar de l'auteur n'apparaît pas.

## Diagnostic (prouvé sur la prod, compte de démo)
Les deux bannières de la capture sont des `friend_story_comment`. La ligne en base
porte DÉJÀ le rendu riche :

| champ | valeur |
|---|---|
| `title` | « elvira ndjiki a commenté un réel » |
| `subtitle` | « Publication de Windie Nh » |
| `content` | « Et oui » |
| `actor.avatar` | `/api/v1/attachments/file/…` (**relative**) |

Deux défauts distincts :

1. **Avatar** — `imageURL` part en URL relative. Côté NSE,
   `URL(string: "/api/v1/…")` n'a ni schéma ni hôte → `URLSession.dataTask`
   échoue → `avatarData == nil` → `INPerson` sans image → iOS retombe sur
   l'icône de l'app. L'endpoint répond 200 SANS auth (vérifié) : la seule
   chose qui manque est l'origine.
2. **Type d'action** — `buildPushHeader` ne garde que le nom de l'acteur et
   jette `display.title`. Le `subtitle` envoyé (« Publication de Windie Nh »)
   est **ignoré par iOS** sur le chemin Communication Notification en 1:1
   (`recipients: nil`) — comportement déjà constaté et documenté dans
   `NotificationService.swift:604-610`. Il ne reste donc que « nom + corps ».

## Décision de rendu (validée avec l'utilisateur)
Conserver la Communication Notification (avatar rond) et porter l'action dans le
seul champ qu'iOS rend sous le nom : `speakableGroupName`, en forçant le mode
groupe de l'intent pour les notifications NON conversationnelles.

```
(o)  elvira ndjiki
     a commenté un réel · Publication de Windie Nh
     Et oui
```

Repli : si le mode groupe ne rend rien, le `subtitle` APN reste posé (chemin
`preservedSubtitle` actuel) et la bannière dégrade vers l'état d'aujourd'hui —
jamais pire.

## Lots

- [x] **L1 — shared** : `buildNotificationDisplay` expose `action` (le fragment
      « a commenté un réel » SANS l'acteur). Les templates sont déjà des
      fragments (`'comment.generic': 'a commenté {indefObj}'`) : aucune
      duplication de règle, on cesse simplement de jeter la moitié du calcul.
- [x] **L2 — gateway** : `buildPushHeader` accepte `action` + `entitySubtitle`
      et compose `action · cible` pour le push. Types conversationnels
      inchangés (nom du groupe en subtitle, rien en direct).
- [x] **L3 — gateway** : `createNotification` passe `display.action` et
      `persistedSubtitle` à `buildPushHeader`.
- [x] **L4 — iOS NSE** : résolution des `imageURL` relatives contre la base API
      allowlistée (`NSEDataSync`), https uniquement.
- [x] **L5 — iOS NSE** : mode groupe forcé pour les notifications non
      conversationnelles porteuses d'un subtitle → `speakableGroupName`.
- [~] **L6 — validation** (PARTIELLE, voir revue) : `xcrun simctl push` sur le simulateur, capture du
      rendu réel des trois familles (commentaire, nouveau post, message).

## Revue

### Livré

**L1 — `packages/shared/utils/notification-strings.ts`**
`NotificationDisplay` porte un troisième champ `action`. Chaque branche du
switch passe par un helper `framed(fragment, subtitle)` qui compose le titre ET
conserve le fragment : le titre reste littéralement `<acteur> <action>`, aucune
chaîne nouvelle, aucune duplication de règle. `action` est `null` exactement là
où `title` l'est (messages, appels, système).

**L2/L3 — `services/gateway/.../NotificationService.ts`**
`buildPushHeader` prend deux entrées optionnelles (`action`, `entitySubtitle`)
et choisit son sous-titre dans cet ordre : action sociale composée → cible
explicite → nom de conversation de groupe. Le helper pur `composePushSubtitle`
n'ajoute la cible que lorsqu'elle apprend quelque chose : « a commenté votre
publication » ne se fait pas suivre de « Votre publication », mais garde
l'aperçu (« · « Bonjour tout le monde » »). Le call site passe `display.action`
et `persistedSubtitle`.

Le sous-titre PERSISTÉ (lu par la liste in-app sous le titre riche) est
inchangé : seul celui de la bannière et du toast évolue.

**L4 — `apps/ios/MeeshyNotificationExtension/`**
`NotificationPayloadHelpers.resolveRemoteMediaURL(_:apiBaseURL:)` absolutise
une URL relative contre la base allowlistée (`NSEDataSync.trustedApiBaseURL`,
nouvellement exposée) et n'accepte que `https` — ou `http` sur localhost, pour
le dev. Appliqué aux DEUX téléchargements de la NSE : l'avatar et le média du
message, `attachmentUrl` souffrant exactement du même défaut.

**L5 — `NotificationService.swift`**
`applyCommunicationIntent` dérive son cadrage de
`NotificationPayloadHelpers.communicationFraming(...)`. Une notification sans
conversation mais porteuse d'un sous-titre passe en mode groupe avec l'action
en `speakableGroupName` ; une conversation de groupe garde sa composition
Local-First ; un direct reste en 1:1. La clé d'intent retombe sur `post:<id>`
puis sur le `notificationId`, au lieu de la chaîne vide que TOUTES les
notifications sociales partageaient.

### Vérification

| Gate | Résultat |
|---|---|
| `vitest` — notification-strings (shared) | 34/34 |
| `jest` — suites notifications gateway (28 fichiers) | 546/546 |
| `jest` — notifications web (payload socket partagé) | 163/163 |
| XCTest — suites notifications iOS (12 classes) | 168/168 |
| Rendu réel — `simctl push`, capture | sous-titre d'action AFFICHÉ |

Le RED a précédé le vert sur les trois lots de code (champ `action` absent,
`buildPushHeader` sans les nouvelles entrées, helpers iOS inexistants). Le test
`resolveRemoteMediaURL` a d'ailleurs attrapé un vrai défaut au premier tour :
`javascript:alert(1)`, n'ayant pas de `://`, était traité comme un chemin
relatif et déguisé en URL `https` vers le gateway ; la détection de schéma est
désormais un vrai motif `^[A-Za-z][A-Za-z0-9+.-]*:`.

### Ce qui N'EST PAS prouvé — à confirmer sur device

**La NSE ne s'exécute pas sous `simctl push`.** Vérifié deux fois :
`log show --predicate 'process == "MeeshyNotificationExtension"'` ne renvoie
AUCUNE ligne (pas même les traces système qu'un process émet en démarrant), et
une sonde `unreadCount: 77` dans le payload laisse `unread_count` à 0 dans le
conteneur App Group — alors que `updateSharedUnreadCount` l'écrirait sans
condition. L'extension est pourtant bien embarquée
(`Meeshy.app/PlugIns/MeeshyNotificationExtension.appex`, point d'extension
`com.apple.usernotifications.service`).

Conséquence : la capture obtenue valide le chemin SANS extension. Elle prouve
qu'iOS rend le sous-titre APN, donc que l'action atteint l'écran même si la NSE
échoue, expire ou est désactivée. Elle ne prouve PAS les deux effets qui
passent par la NSE :

1. l'avatar rond de l'auteur (résolution d'URL) ;
2. le cadrage groupe portant l'action sous le nom.

Sur device, ces deux chemins s'exécutent — c'est d'ailleurs la NSE qui, en 1:1,
mangeait le sous-titre et produisait la bannière signalée. À vérifier sur un
vrai téléphone :

```
(o)  elvira ndjiki
     a commenté un réel · Publication de Windie Nh
     Et oui
```

Si l'avatar apparaît mais pas la ligne d'action, le mode groupe n'aura pas pris
et le repli est d'une ligne côté gateway : préfixer le corps par l'action dans
`createNotification` plutôt que de la confier au sous-titre.

### Reste ouvert

Le web (`apps/web/utils/push-notifications.ts`) affiche `icon: data.senderAvatar`
— la même URL relative, que le service worker résout contre l'origine du SITE et
non celle du gateway. Hors du périmètre iOS demandé, noté ici parce que la cause
est commune.
