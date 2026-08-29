# Cycle 137 — deux écrans de réglages remettaient les autres réglages à zéro dès que leur chargement avait échoué

**Issue** : #4240 (suivi mesuré du cycle 136).
**Branche** : `claude/keen-hamilton-w54ww2`.
**Surfaces** : `apps/web/app/notifications/preferences/page.tsx`,
`apps/web/components/settings/ApplicationSettings.tsx`,
`apps/web/lib/preferences/submitted-preference-keys.ts` (nouveau site unique).

## Pourquoi le cycle 136 ne les avait pas atteints

Le cycle 136 a fait passer les trois écritures du **store**
`user-preferences-store` en `PATCH` du seul soumis. Le lot était complet — pour
le store. Ces deux écrans écrivent les MÊMES documents sans passer par lui :
chacun a son `useState`, son `fetch`, son `PUT`.

`grep "method: 'PUT'"` sur `apps/web` les rend en deux lignes. C'est la requête
qui manquait : **un correctif de forme se propage par les imports, jamais par le
sujet.**

Et la connaissance était déjà écrite, dans le lot précédent :
`mirrored-preference-categories.ts` dit « le bloc `notifications` du store n'a
aucun consommateur en production (**l'écran `/notifications/preferences` tient
son propre état local**) ». La phrase justifiait de ne pas doubler la catégorie ;
sa seconde moitié — un écran qui tient son propre état tient aussi sa propre
écriture — n'a jamais été lue (leçon 316).

## Le défaut

| écran | endpoint | amorce locale | schéma | écart |
|---|---|---|---|---|
| notifications | `/me/preferences/notification` | 15 champs | 33 | **18** |
| application | `/me/preferences/application` | 17 champs | 22 | **5** |

`PUT` **REMPLACE** (`schema.parse(body)` puis `update: { [category]: validated }`).
Zod comble l'absent par ses `default()` — et **supprime** ce qui est
`optional()` sans défaut.

**Le déclencheur est un chargement raté, absorbé en silence.** Les deux écrans
font `if (response.ok) { … }` sans branche `else`, et posent `loading = false`
dans le `finally` : hors ligne, sur un 5xx ou avec un jeton expiré, l'écran rend
son amorce de DÉFAUTS comme si c'étaient les réglages de l'utilisateur, bouton
d'enregistrement actif. Le geste suivant les estampait sur le serveur.

### Ce qui partait — notifications (18 champs)

- **`callsEnabled`** → `true` : la catégorie qui gouverne les appels entrants,
  délibérément indépendante de `pushEnabled` (parité FaceTime/WhatsApp/Signal).
  Coupée par l'utilisateur ⇒ **rallumée**.
- **`dndUtcOffsetMinutes`** → `0` : la fenêtre « ne pas déranger » repasse en
  UTC. Tokyo (`540`) voit ses heures calmes 22:00–08:00 décalées de neuf heures —
  **les notifications sonnent la nuit**.
- **`showPreview`** → `true` : le contenu des messages **revient sur l'écran
  verrouillé** de qui l'avait masqué. Un défaut de confidentialité, de la même
  famille que le cycle 125.
- `dndDays` → `[]`, `showSenderName`, `vibrationEnabled`, `voicemailEnabled`,
  `groupInviteEnabled`, `memberLeftEnabled`, les sept bascules sociales,
  `groupNotifications`, `notificationBadgeEnabled`.

### Ce qui partait — application (5 champs)

- **`autoTranslateEnabled`** → `true` : ce document est son **UNIQUE** store, lu
  par les réponses d'authentification. La traduction automatique se rallumait
  toute seule — une atteinte directe au Prisme Linguistique, depuis l'écran
  d'apparence.
- **Les quatre horodatages de consentement** + `dataProcessingConsentAt` :
  `.nullable().optional()` **sans `default()`**, donc Zod les OMET de `validated`
  et le remplacement les **EFFACE**. `ConsentValidationService` les lit avec
  priorité `UserPreferences.application > User` : un consentement accordé par la
  seule API préférences (chemin popup iOS) n'a **pas de colonne `User` de
  repli** — il disparaissait pour de bon, avec le clonage vocal qu'il autorise.

> **Recenser ce qu'un `PUT` perd se lit en DEUX passes du schéma** : ce que les
> `default()` réécrivent, et ce que l'ABSENCE de `default()` supprime. La seconde
> passe ne se voit pas en comparant deux listes de champs.

## Le correctif

Les deux écrans tiennent la liste des clés que **le geste de l'utilisateur** a
touchées (`useRef(new Set<string>())`, alimentée par l'unique entonnoir de
mutation de chaque écran) et n'envoient que celles-là, en `PATCH`.

L'état affiché ne pouvait pas répondre à cette question : après un chargement
raté, il EST l'état de défauts, et rien ne l'en distingue.

`submittedKeys` — jusqu'ici privé du store — devient un site unique,
`lib/preferences/submitted-preference-keys.ts`, avec `pickSubmitted(state, keys)`
pour la forme « état complet + liste de clés touchées ». Le store l'importe.

### Ce que l'adversarial re-read a attrapé

La première version oubliait par `clear()` au retour d'un envoi réussi. Les
contrôles restent vivants pendant le vol : une bascule faite entre-temps était
effacée de la liste sans être partie — elle n'aurait voyagé ni alors ni au geste
suivant, l'écran affichant durablement une valeur que le serveur ignore. L'oubli
se fait donc par **SOUSTRACTION de ce qui vient de partir**. `hasChanges`
portait déjà ce défaut dans `ApplicationSettings`, en pire (le bouton
d'enregistrement disparaissait avec lui) ; il est désormais recalculé depuis la
liste. Le témoin qui garde ce point a été vérifié RED contre `clear()`.

## Gates

| gate | résultat |
|---|---|
| `__tests__/lib/submitted-preference-keys.test.ts` (nouveau, 6) | vert |
| `__tests__/app/notification-preferences-page.test.tsx` (nouveau, 8) | RED prouvé sur 6 avant correctif (le corps portait les 37 clés du document lu, métadonnées de ligne comprises) |
| `components/settings/ApplicationSettings.test.tsx` (+3, PUT→PATCH) | RED prouvé sur 4 |
| `bun run test:coverage` (apps/web, commande de la CI) | **808 suites, 14848 témoins verts**, 21 sautés (806 / 14831 au cycle 136 : +2 suites, +17 témoins) |
| `scripts/check-type-debt.sh` (BLOQUANTE) | `✓ 1194 erreurs de types — la dette n'a pas bougé.` (`EXIT=0` lu directement) |
| `scripts/check-law-literals.sh` (BLOQUANTE) | `✓ No law literals found in skin files` (`EXIT=0`) |
| gateway / iOS / Android | **non modifiés** — aucun contrat de fil touché : les deux verbes existaient déjà, les écrans prenaient le mauvais |

## Suivi MESURÉ

- **`thirdPartyServicesConsentAt` est exigé par trois gardes de
  `ConsentValidationService` (lignes 321, 343, 381 — dont `betaFeaturesEnabled`)
  et n'existe dans AUCUN schéma partagé.** Seul de sa famille, il n'a pas non
  plus de colonne `User` de repli. Il est lu depuis `UserPreferences.application` sans repli
  `User`, et Zod (mode strip) le supprime de tout corps qui le nomme — `PUT`
  comme `PATCH`. Le consentement ne peut donc **jamais** être accordé par l'API
  préférences, et les features bêta restent bloquées par construction. Défaut
  distinct de ce lot (une clé absente du schéma, pas un verbe), à instruire.
- **Aucun des deux écrans ne DIT que son chargement a échoué** : il rend ses
  défauts. Le correctif borne le dommage à ce que l'utilisateur touche, mais la
  dimension 8 (états d'erreur dessinés) reste non mûre sur ces deux surfaces.
- **La course « le chargement atterrit après une bascule » n'est pas
  atteignable** : les deux écrans sont gardés par `loading`, et le bouton comme
  les contrôles n'existent qu'une fois le `finally` passé. Mesuré, pas supposé —
  aucune garde ajoutée pour un chemin que rien n'emprunte.
- **`replaceMutation` (le `PUT`) de `hooks/use-preferences.ts` n'a aucun appelant
  de production.** Laissé en place, hors du fil de ce lot.
- Les suivis du cycle 136 restent ouverts : iOS réaffirme le bloc chiffrement
  relu ; `syncAll()` lit `/me/preferences/privacy` deux fois au démarrage ;
  `updateNotifications` n'est pas sous `trackPreferenceWrite` — mesuré sans
  conséquence tant que `notifications` n'est pas une catégorie doublée
  (`MIRRORED_CATEGORIES`), donc aucune relecture ne court contre elle.
