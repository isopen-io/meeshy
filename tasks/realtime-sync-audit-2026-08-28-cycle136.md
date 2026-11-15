# Cycle 136 — une écriture de préférences envoyait un DOCUMENT entier construit depuis une TRANCHE

**Issue** : #4230.
**Branche** : `claude/keen-hamilton-zr4ttx`.
**Surface** : `apps/web/stores/user-preferences-store.ts` — les trois écritures
de préférences (`updatePrivacy`, `updateEncryption`, `updateNotifications`).

## Le défaut

La passerelle expose deux verbes par catégorie, et ils ne disent pas la même
chose (`routes/me/preferences/preference-router-factory.ts`) :

| verbe | ce qu'il fait |
|---|---|
| `PUT` | **REMPLACE** — `schema.parse(body)` puis `update: { [category]: validated }`. Zod comble les clés absentes par leurs `default()`. |
| `PATCH` | **FUSIONNE** — `submittedKeysOnly(...)` sur `resolveComplete(userId)`. Ce qu'on ne nomme pas ne bouge pas. |

Le web écrivait en `PUT`, avec pour corps un instantané de document ENTIER
(`get().privacy`, `get().notifications`). Or **chaque tranche du store est un
sous-ensemble STRICT de son document** :

- `StorePrivacyPreferences` est un `Pick` de **8 des 17** champs de
  `PrivacyPreferenceSchema` ;
- `StoreNotificationPreferences` est un `Pick` de **14 des 33** champs de
  `NotificationPreferenceSchema`.

### 1. Perte INCONDITIONNELLE — le bloc chiffrement

La tranche `privacy` ne peut **structurellement pas** porter les quatre champs
de chiffrement du même document : `syncPrivacy` les en retire explicitement, et
`EncryptionPreferences` en est le seul porteur. `get().privacy` ne les porte
donc jamais — ni après une hydratation réussie, ni après une échouée.

Basculer **n'importe quel** interrupteur de confidentialité sur le web
remettait donc aux défauts de Zod :

```
encryptionPreference        'always' → 'optional'
autoEncryptNewConversations  true    → false
showEncryptionStatus         false   → true
warnOnUnencrypted            true    → false
```

**Les conversations neuves cessaient d'être chiffrées automatiquement**, sans
aucun signe : la tranche `encryption` du store, elle, continuait d'afficher les
anciennes valeurs. Un défaut de sécurité, pas de confort.

### 2. Perte CONDITIONNELLE — dix-neuf réglages de notification

`syncNotifications` répand la réponse serveur ENTIÈRE, donc `get().notifications`
porte les 33 champs **après une hydratation réussie**. Après une hydratation
échouée (hors ligne, 5xx — exactement le cas que le cycle 135 vient de rendre
mesurable), il n'en porte que 14, et le `PUT` remettait aux défauts les dix-neuf
autres : `callsEnabled` (la catégorie qui gouverne les appels entrants,
délibérément indépendante de `pushEnabled`), `dndDays`, `dndUtcOffsetMinutes`,
et les sept bascules sociales.

### 3. Écrasement concurrent — `updateEncryption`

`updateEncryption` était déjà en `PATCH` — donc à l'abri du remplacement — mais
son corps était `{ ...currentPrivacy, ...les 4 champs }` : il réaffirmait treize
champs de confidentialité depuis un instantané local. Un réglage changé sur un
AUTRE appareil était annulé par une simple bascule de chiffrement ici, et sur
une hydratation échouée les huit défauts de la tranche étaient estampés sur le
serveur.

## La jumelle avait raison, et le web était l'exception

`PrivacyPreferenceSyncBody` (Android, `core/model`) **PATCH**e douze bascules et
documente le risque mot pour mot :

> « a body that omits the encryption keys leaves the server's encryption
> preferences untouched instead of silently stamping the device defaults over a
> value the user may have set on **web/iOS**. »

Android a instruit la question, choisi le bon verbe, **et nommé le web comme
l'endroit où l'utilisateur pose ces valeurs** — pendant que le web, en `PUT`,
était le client qui les détruisait. iOS écrit lui aussi en `PATCH`
(`PreferenceService.patchPreferences`). Le web était le seul des trois clients
sur le verbe destructeur.

## Le correctif

**Les trois écritures n'envoient que les clés que l'APPELANT a soumises, en
`PATCH`.** Un helper unique, `submittedKeys()`, retire les valeurs `undefined`
— que `JSON.stringify` retire de toute façon, si bien que les compter ferait
mentir la garde du corps vide — et chaque écriture retourne tôt quand il ne
reste rien à dire.

Ce qui disparaît avec le correctif n'est pas seulement le mauvais verbe : c'est
la **dépendance à la fidélité de la tranche au document**. Tant que le corps
était un instantané complet, tout champ ajouté au schéma partagé et non ajouté
au `Pick` du store devenait une perte de données silencieuse au prochain
réglage touché. Envoyer le soumis rend cette classe entière impossible.

L'application optimiste porte désormais `submitted` plutôt que `prefs` : un
`{ x: undefined }` cessait sinon d'être ignoré côté serveur tout en écrasant `x`
localement.

## Gates

| gate | résultat |
|---|---|
| `__tests__/stores/user-preferences-store.test.ts` (+6, 87 au total) | RED prouvé sur les 6 avant correctif. `updatePrivacy` **PATCH**e et ne nomme AUCUNE clé de chiffrement ; ne réaffirme aucun réglage voisin ; `updateEncryption` ne nomme AUCUNE clé de confidentialité ; `updateNotifications` ne nomme que le soumis ; une écriture sans clé ne part pas |
| `bun run test:coverage` (apps/web, la commande de la CI) | **806 suites, 14831 témoins verts**, 21 sautés (14825 au cycle 135 : +6) |
| `scripts/check-type-debt.sh` (BLOQUANTE) | `✓ 1194 erreurs de types — la dette n'a pas bougé.` (`EXIT=0` lu directement, jamais à travers un pipe) |
| `scripts/check-law-literals.sh` (BLOQUANTE) | `✓ No law literals found in skin files` (`EXIT=0`) |
| gateway / iOS / Android | **non modifiés** — aucun contrat de fil touché. Les deux verbes existaient déjà, le web prenait le mauvais |

## Ce que l'adversarial re-read a attrapé

Aucun des témoins d'écriture préexistants n'assertait la **MÉTHODE** ni le
**CORPS** — ils mesuraient l'état optimiste et le rejet. Le défaut vivait
exactement dans cet espace, et il y aurait survécu à n'importe quelle
augmentation de couverture qui n'aurait pas posé ces deux questions-là (« un
témoin d'écriture assert sur l'EFFET, jamais sur le statut », § gateway).

## Suivi MESURÉ

- **iOS `PrivacyPreferences` porte le bloc chiffrement et le renvoie dans son
  `PATCH`.** Sa valeur est LUE du serveur (`decodeIfPresent` + défauts), donc
  iOS ne stampe pas des défauts comme le faisait le web — mais il réaffirme un
  état relu, ce qui laisse une fenêtre d'écrasement concurrent : un réglage de
  chiffrement changé sur le web entre la lecture iOS et son écriture est annulé.
  Défaut de la même famille, gravité moindre, lot à part (l'app iOS n'est pas
  constructible dans ce conteneur).
- **Les trois suivis MESURÉS du cycle 135 restent ouverts** : `syncAll()` lit
  `/me/preferences/privacy` deux fois au démarrage ; le bloc `notifications` du
  store n'a aucun consommateur de production ; `error` n'a aucun lecteur de
  production (dimension 8 non mûre sur cet écran).
- **`updateNotifications` n'est pas sous `trackPreferenceWrite`**, contrairement
  à ses deux sœurs. Le verrou du cycle 134 empêche un rattrapage de reconnexion
  de DÉFAIRE un geste en vol ; les notifications n'en bénéficient pas. Décision
  ou oubli — à instruire, hors du fil de ce lot.
