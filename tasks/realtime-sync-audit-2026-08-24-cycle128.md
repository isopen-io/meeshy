# Cycle 128 — le geste qui persistait sans rien annoncer

Audit de synchronisation temps réel. Point de départ : le cycle 127, qui a posé
la règle « une garde d'admission se pose sur CHAQUE chemin, pas sur le plus
fréquenté ». Ce cycle applique la même question à une autre famille — non plus
les gardes d'une notification, mais les DIFFUSIONS d'un état par utilisateur.

## 1. Le défaut

`POST /user-preferences/communities/reorder` — le glisser-déposer d'une
communauté — persiste `orderInCategory` et **n'émet rien**.

Son jumeau conversation, `reorderConversationPreferences`, diffuse
`USER_PREFERENCES_REORDERED` sur la room personnelle depuis toujours, et son
module écrivain unique porte la raison en tête de fichier :

> The row is per-USER, not per-device, so every write owes three things that
> only work as a set: persist the change; bump `version`; broadcast the
> resulting snapshot to `user:{id}` so the user's other devices converge.

`UserCommunityPreferences` est par utilisateur au même titre. Un
réordonnancement fait sur l'iPhone n'atteignait donc jamais l'onglet web ouvert,
qui tient sa liste en `staleTime: Infinity` avec le socket pour source primaire :
l'ordre divergeait jusqu'à un rechargement complet de la page.

## 2. Ce qui l'a tenu hors de vue

Deux choses, et la seconde est la plus intéressante.

**Un lot avait fermé cette classe de défaut, et n'avait pas énuméré ce site.**
`community-preferences-broadcast.test.ts` (lot F71) le dit dans son en-tête :

> PUT/DELETE on community preferences didn't emit anything, so a second
> tab/device for the same user never learned that a community was
> pinned/muted/archived/hidden.

Le lot a énuméré les verbes qui **changent une préférence**. Le
réordonnancement n'en est pas un dans la langue de cet inventaire : c'est un
geste d'ORDRE. Il écrit pourtant la même ligne, dans le même fichier, avec le
même coût.

**Et le handler fautif CITE son jumeau** — dix lignes de commentaire, pour lui
emprunter son filtre d'appartenance :

```ts
// L'`upsert` corrige cela et EXIGE en retour le filtre d'appartenance —
// c'est la raison que porte le jumeau conversation
// (`reorderConversationPreferences`) …
```

La jumelle a donc été OUVERTE, LUE, et à moitié reprise. Ce n'est pas une
inattention : la question posée en l'ouvrant était « comment borner cet
upsert ? », et la réponse trouvée y répondait exactement. La diffusion, elle,
ne répondait à aucune question qu'on se posait ce jour-là.

> **Reprendre le correctif d'une jumelle ne se fait pas en cherchant la réponse
> à sa propre question dans son code.** Le corollaire du cycle 85 disait déjà
> « on le prend en entier » ; ce cycle mesure le mécanisme par lequel on ne le
> fait pas. La question juste n'est pas *« que fait la jumelle pour mon
> problème ? »* mais **« que fait la jumelle, tout court, après cette
> écriture ? »** — et elle se répond en lisant sa suite ligne à ligne, pas en
> cherchant un mot-clé.

## 2 bis. La leçon était DÉJÀ ÉCRITE — avec le bon fichier, et une règle qui ne pouvait pas l'attraper

Découvert en résolvant le conflit de `tasks/lessons.md` : **la leçon 28**
(itération 104, 2026-07-05) s'intitule « F71 soldé : `community-preferences.ts`
était une copie figée de `conversation-preferences.ts`, sans la diffusion socket
ajoutée après-coup au sibling ».

Elle nomme la bonne PAIRE, diagnostique le bon mécanisme — « une copie de code
initiale figée avant le fix ne le reçoit jamais automatiquement, et rien ne le
signale » — et prescrit une règle réutilisable. Le réordonnancement est passé au
travers **treize mois plus tard, dans le fichier qu'elle nomme.**

La raison tient dans l'exemple de commande de la règle prescrite :

> grep immédiatement les routes SŒURS qui partagent la même forme
> (`grep -rn "PUT.*preferences" routes/`…)

`POST /user-preferences/communities/reorder` est un **POST**. La commande ne
pouvait pas le rendre, et elle a été suivie correctement.

> **Une règle de méthode outillée par un exemple de commande hérite des bornes
> de cette commande.** L'exemple est ce qu'on relit et ce qu'on exécute ; la
> phrase générale au-dessus est juste, et n'est pas ce qui s'exécute.

C'est ce qui justifie de livrer un CLIQUET plutôt qu'une règle de plus. Le
balayage part du MODÈLE Prisma, jamais du verbe de la route : il n'a pas de borne
à hériter, et trouve l'écrivain quel que soit le geste qui l'amène. **Devant une
famille de défauts déjà nommée deux fois, la réponse n'est pas de la nommer une
troisième — c'est de l'exécuter.**

## 3. La décision de contrat, et pourquoi elle a été mesurée avant d'être prise

La forme naturelle était d'élargir `UserPreferencesReorderedEventData` en y
admettant `communityId` : même geste, même charge, un discriminant de plus —
c'est exactement ce que fait `USER_PREFERENCES_UPDATED`, qui porte trois scopes
sur un seul nom.

Relevé des décodeurs AVANT d'écrire quoi que ce soit :

| décodeur de `USER_PREFERENCES_REORDERED` | face à un item `{communityId, orderInCategory}` |
|---|---|
| iOS — `UserPreferencesReorderedSocketEvent.Update.conversationId: String`, **non optionnel** | le décodage de l'ÉVÉNEMENT ENTIER échoue ; les réordonnancements de conversation qui voyagent dans le même lot partent avec |
| web — `applyRemoteReorder` → `preferencesMap.has(update.conversationId)` | filtré en silence |
| Android | aucun consommateur |

L'élargissement casse donc le cas NOMINAL pour en servir un neuf, et il le casse
par le mécanisme le plus discret qui soit : un `catch` de décodage côté client.
C'est la forme du cycle 92 bis (`ParticipantRoleUpdatedEvent`, `role` contre
`newRole`, `MissingFieldException` avalée par un `runCatching`).

**Un nom neuf — `user:preferences-community-reordered` — est INERTE pour les
deux consommateurs existants par construction.** Le précédent
`USER_PREFERENCES_UPDATED` ne le contredit pas : il a été conçu multi-scope, avec
des décodeurs qui discriminent. Un événement le devient rétroactivement au prix
d'un décodeur strict quelque part.

> La règle du cycle 105 (« avant de changer la forme d'un événement DIFFUSÉ,
> relever ses consommateurs sur les trois clients ») a une suite qu'il faut
> écrire : **le relevé ne sert pas seulement à mettre les clients à jour, il
> sert à décider s'il faut changer la forme du tout.** Un décodeur strict rend
> l'élargissement plus cher que le nom neuf, et c'est une mesure, pas un goût.

## 4. Le correctif

- `packages/shared/types/socketio-events.ts` —
  `USER_PREFERENCES_COMMUNITY_REORDERED`, son type de charge (dont le
  doc-comment porte le tableau ci-dessus), et son entrée dans
  `ServerToClientEvents` : la porte d'émission typée en dérive, donc l'émetteur
  est vérifié sans qu'aucune signature ne soit réécrite.
- `routes/community-preferences.ts` — `applicable` (dédup + filtre
  d'appartenance) est calculé AVANT les écritures, puis diffusé tel quel.
  **La charge nomme ce qui a été ÉCRIT, jamais ce qui a été DEMANDÉ** : sans ce
  bornage, la diffusion enverrait les autres appareils appliquer un ordre que la
  base ne porte pas, et confirmerait au passage l'existence d'une communauté que
  l'appelant n'a pas le droit de nommer. Rien d'écrit ⇒ rien d'émis.
- web — le seau d'écoute (`preferences-sync.service` → orchestrateur → façade)
  et le consommateur dans `use-socket-cache-sync`. Les préférences de communauté
  vivant dans React Query et non dans un magasin Zustand, le levier est
  l'invalidation : la LISTE, plus chaque communauté NOMMÉE — `orderInCategory`
  appartenant aussi à la ligne de détail. C'est ce qui rend la charge utile
  nécessaire, et pas seulement le fait que l'événement ait eu lieu.

## 5. Le cliquet, et ce qu'il mesure vraiment

`preference-writer-sweep.ts` fige les SITES D'ÉCRITURE des deux tables de
préférences par utilisateur. Six sites, tous ouverts et vérifiés, chacun avec
l'émission qui le suit.

Il ne prouve pas qu'un site diffuse — un émetteur peut vivre dix lignes plus
bas, dans une branche, ou déléguer. **Sa valeur est de forcer la question au lot
suivant** : une entrée en trop signifie « un écrivain neuf est apparu, et
celui-là, il diffuse ? ».

C'est la question qui a manqué deux fois, dans les deux familles :

- côté CONVERSATION, les trois routes de `user-deletions.ts` écrivaient
  `deletedForUserAt` / `clearHistoryBefore` sans rien émettre — d'où le module
  écrivain unique ;
- côté COMMUNAUTÉ, ce cycle.

Les deux fois, le site fautif n'était pas caché. Il était VOISIN, et il
n'appartenait simplement pas à la phrase du lot qui a fermé les autres.

Le collecteur est exercé sur une arborescence fabriquée — écrivain neuf,
plusieurs sites par fichier, lectures ignorées, commentaires dépouillés, doubles
de test exclus. **Un cliquet dont le collecteur ne trouve jamais rien reste vert
quoi qu'on écrive** : montrer qu'il TOMBE fait partie de sa livraison.

## 6. Un double partiel retiré au passage

`preferences-sync.service.test.ts` portait une fabrique
`jest.mock('@meeshy/shared/types/socketio-events')` énumérant six constantes de
`SERVER_EVENTS` à la main. Elle était INERTE — le `moduleNameMapper` du web
réécrit `@meeshy/shared/*` vers `packages/shared/dist` (cf. `apps/web/CLAUDE.md`),
donc le service recevait déjà les vraies valeurs.

Retirée plutôt que complétée, et pour la raison que le dépôt écrit déjà : quand
le module doublé n'expose que des CONSTANTES pures, la bonne réponse n'est pas
`jest.requireActual`, c'est **pas de double du tout**. Le jour où la fabrique
redeviendrait vivante, la septième constante — celle de ce lot — sortirait à
`undefined` sur ses DEUX adresses, et les témoins d'écoute resteraient verts :
ils assertent le NOM depuis la même constante que l'écouteur.

C'est le quatrième exemplaire de cette famille (cycles 86, 91, 93, 104).

## 7. Ce qui reste ouvert, et pourquoi ce n'est pas un oubli

**iOS et Android ne consomment pas le nouvel événement.** Ni l'un ni l'autre n'a
aujourd'hui de surface de réordonnancement de communautés — le seul émetteur de
`POST …/communities/reorder` du dépôt est `communities.service.ts` (web). Poser
un décodeur iOS maintenant, c'est écrire un consommateur sans producteur, que
rien ne fera tomber s'il dérive. Le contrat est en place et le doc-comment porte
la raison ; le décodeur appartient au lot qui apportera le geste.

**Le suivi du cycle 127 reste ouvert et non instruit** : la fenêtre de rappel
push est rétrécie, pas fermée — la fermer demanderait un rappel APNs
`content-available` + suppression côté NSE, lot à part touchant les trois
clients.

## 8. Gates

| gate | mesure |
|---|---|
| témoins RED prouvés (gateway) | 2 rouges sur l'émission manquante, 7 verts après |
| témoins RED prouvés (web) | 3 rouges (`is not a function`), 51 verts après |
| suite gateway complète | **861/861 suites, 19564 témoins**, exit 0 — couverture 95,47 %, identique au cycle 127 |
| suite `packages/shared` | 109 fichiers, 2587 témoins (dont les 4 gates CI) |
| gardes CI non-jest | `check-type-debt --self-test`, `check-law-literals` (+ self-test), `check-swift-viewbuilder` (+ self-test) — exits 0 |
| `tsc --noEmit` gateway | exit 0 (code de retour lu SANS pipe) |
| build `packages/shared` | exit 0 |
| suites web voisines | 21 suites, 670 témoins |
| cliquet de dette de types web | 1196 — inchangé |
# Cycle 128 — la bannière servait la bonne LANGUE et attachait le mauvais SON

## Résumé

Suivi MESURÉ du cycle 123, resté ouvert quatre cycles et instruit ici :

> « La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste
> traduite du Prisme. »

Le cycle 123 a donné à la transcription d'un vocal sa propre source de Prisme
(`PreviewPrismBasis.transcript`) : depuis, le TEXTE de la bannière descend le
prisme du lecteur. Le FICHIER attaché à côté est resté `first?.fileUrl` —
l'original, sans condition, identique pour tous les lecteurs.

Un francophone recevant un vocal anglais voyait donc, sur son écran verrouillé,
une bannière **en français** au-dessus d'un `UNNotificationAttachment` qui
**parle anglais**. Les trois clients savent pourtant descendre le Prisme sur la
piste JOUÉE en conversation — `AudioTrackLanguageResolver` (iOS),
`resolveAutoLanguage` (web), `resolveTranslatedAudio` (Android). L'écran
verrouillé était la SEULE surface de la famille AUDIO qui ne le faisait pas.

## Pourquoi c'est atteignable, et pas un piège armé

Le pipeline audio écrit la piste pour chaque langue, en production :

```ts
// MessageTranslationService._handleAudioProcessCompleted
newTranslationEntries[lang] = {
  type: 'audio', transcription: …,
  url: `/api/v1/attachments/file/translated/${attachmentId}_${lang}.${ext}`,
  durationMs: …, format: …,
};
```

Et la lecture est **GRATUITE** : `translations: true` est dans le `select` de
l'éventail DEPUIS le cycle 123. `transcriptTranslationTexts()` n'en dépouillait
que le TEXTE, laissant `url` / `durationMs` / `format` sur la même ligne, déjà
lue. C'est la leçon 279 appliquée au MÉDIUM, et la même mesure que le cycle 127 :
avant de conclure qu'une garde coûterait une requête, regarder ce que le site
lit déjà.

## Ce qui a été vérifié jusqu'au PIXEL

La question du cycle 122 — « qui AFFICHE ce que le résolveur élit ? » — a été
posée à chaque maillon, et la chaîne est complète **sans une ligne de code
client** :

| maillon | verdict |
|---|---|
| l'URL servie est RELATIVE | `NotificationPayloadHelpers.resolveRemoteMediaURL` la résout contre l'origine API de confiance |
| l'allowlist NSE | schéma + hôte seulement — aucun filtre de CHEMIN à franchir |
| la route `/attachments/file/translated/…` | `fastify.get('/attachments/file/*')` — wildcard MULTI-segment, sans authentification, sandboxée contre la traversée |
| le fichier sur disque | écrit sous `${UPLOAD_PATH}/translated/`, la base que la route résout |
| le `typeHint` UTI | `audio/mp3` → `("mp3", "public.mp3")` |

Ce dernier point justifie `normalizeTrackMimeType`, qui n'est pas cosmétique :
le producteur écrit `format: 'mp3'` (extension nue). Remis tel quel, il rate le
`hasPrefix("audio/")` de `fileHints` et retombe sur `(ext, nil)` — **pièce jointe
sans typeHint, rendu dégradé**. Les deux producteurs du dépôt divergent (`'mp3'`
côté message, `'audio/mp3'` côté post) : le dépouillement NORMALISE plutôt que de
choisir.

## Les trois décisions de conception

1. **La piste est élue par la langue du TEXTE SERVI, jamais par une descente
   indépendante.** Deux descentes parallèles laisseraient la bannière dire « la
   réunion est déplacée » au-dessus d'une piste espagnole. `servedTranslation`
   est l'unique électeur : une descente, deux projections — la discipline que le
   cycle 123 a posée pour `servedPreview` / `servedTranslationFields`.
2. **`served === null` ⇒ fichier original.** Le Prisme n'a rien élu : le message
   est déjà dans la langue du lecteur.
3. **Langue élue SANS piste ⇒ fichier original.** Fail-OPEN sur le médium — le
   TTS peut manquer là où la traduction texte existe, et le son d'origine vaut
   mieux que le silence. Le texte, lui, reste servi traduit.

Et les trois champs voyagent ENSEMBLE : `url`, `mimeType`, `durationMs`. Ils ne
retombent PAS individuellement sur ceux de l'original — ils décriraient un autre
fichier.

## Le second défaut, trouvé en LISANT le corps composé

Le premier témoin RED a rendu, pour un vocal de 12 unités : **« 🎵 Audio · 0:00 »**.

`MessageAttachment.duration` est en MILLISECONDES — `schema.prisma` le dit
(« Durée en MILLISECONDES (précision complète) ») et le doc-comment de
`formatSingleAttachmentLabelI18n` le REDIT (« champ `duration` de
MessageAttachment, cf. schema.prisma »). Son unique producteur, l'éventail,
passe la colonne telle quelle. Deux sites de `createMessageNotification` la
multipliaient par 1000 comme si elle était en secondes :

| site | ce qui partait pour un vocal de 34 s |
|---|---|
| `context.firstAttachmentDurationMs` (fil push) | `34 000 000` ms — 9 h 26 |
| `metadata.attachments.firstDurationMs` (ligne PERSISTÉE) | idem |

> **Deux lectures d'un MÊME champ, dans le MÊME objet littéral, sous deux
> unités.** Le doc-comment qui dit vrai est à quarante lignes de la ligne qui dit
> faux, et rien ne les confronte : c'est le NOM du champ d'arrivée
> (`…DurationMs`) qui rend la conversion crédible. Il annonce l'unité de la
> DESTINATION, jamais celle de la SOURCE.

Gravité mesurée, et il faut la dire honnêtement :

- `attachmentDurationMs` sur le fil push — **aucun client ne le lit** (mesuré sur
  iOS, Android, web, et la NSE). Piège armé, pas panne.
- `firstDurationMs` persisté — **DÉCLARÉ et décodé par le SDK iOS**
  (`NotificationModels.swift:379`), dont la fixture de sa propre suite pose
  `34000` pour 34 s. Le contrat est en millisecondes, et le gateway le violait.

Corrigé dans ce lot parce que c'est exactement ce que la chaîne du cycle
QUALIFIE : la durée voyage avec le fichier, et le corps de la bannière la compose.

## Le correctif

| site | ce qui change |
|---|---|
| `packages/shared/types/attachment-audio.ts` | `transcriptTranslationTracks()` — la JUMELLE de `transcriptTranslationTexts`, pour le MÉDIUM. Site UNIQUE du dépouillement. `normalizeTrackMimeType` privé |
| `NotificationService.servedAttachmentMedia()` | l'élection, extraite pour qu'elle n'ait qu'un site |
| `NotificationService.createMessageNotification` | `attachmentTracks?`, l'élection AVANT la composition du corps, et les deux `* 1000` retirés |
| `messageNotificationFanOut.ts` | la carte des candidates, gardée par `mediaMayTravel`, remise au lot `regular` |

**Les deux jumelles ne rendent PAS le même jeu de langues, et c'est le point** :
une traduction TEXTE peut exister sans que le TTS ait produit sa piste. Une
entrée sans `url` concourt pour le texte et pas pour le son — ce qui fait
retomber l'élection sur le fichier original plutôt que sur une URL vide.

## La porte NEUVE, et sa garde

La carte des pistes est un chemin de PLUS par lequel un fichier peut atteindre un
écran verrouillé. Le cycle 125 a fermé celle du fichier original ; ouvrir
celle-ci sans la garder aurait rouvert la même fuite sous un autre nom. Elle est
donc gardée par `mediaMayTravel` — le prédicat qui gouverne déjà `attachmentInfo`
EN BLOC et `firstAttachmentTranscript` — aux DEUX niveaux qui déclarent la
protection (le MESSAGE et la PIÈCE JOINTE), et le verrou `notificationLocKey` de
`createNotification` la vide une seconde fois côté payload. Cinq témoins gardent
ce mode d'échec du correctif.

## Gates

| gate | résultat |
|---|---|
| `prismAudioTrackGate.test.ts` (nouveau) | **4 rouges contre `origin/main` / 11 verts après** |
| `prismAudioTrackFanOut.test.ts` (nouveau) | **2 rouges contre `origin/main` / 9 verts après** |
| `packages/shared/__tests__/types/attachment-audio.test.ts` | 46 verts (7 neufs) |
| suites voisines (`notifications` + éventail + `NotificationService*`) | 58 suites, 1103 témoins, exit 0 |
| suite gateway complète (`bun run test:coverage`) | **863/863 suites, 19588 témoins**, exit 0 — couverture **95,48 %** stmts / **89,63 %** branches (95,47 / 89,60 au cycle 127) |
| suite `packages/shared` complète (`vitest run`) | **109/109 fichiers, 2593 témoins**, exit 0 |
| `services/gateway` `tsc --noEmit` | 0 erreur (code de retour lu SANS pipe) |
| `packages/shared` `tsc --noEmit` | 0 erreur |
| Swift / Kotlin | **non modifiés** — la chaîne était déjà complète côté client |

Les témoins qui PASSENT déjà contre `main` ne sont pas du remplissage : ils
gardent le mode d'échec du CORRECTIF (la porte neuve refermée par la protection,
le repli fail-open sur une piste absente, le cas sans carte) et non celui du
défaut. C'est la même distinction que le cycle 127.

## Suivi MESURÉ

- **Le rich-push reste hors des éventails réponse et mention** — décision du
  cycle 125 bis, toujours conservée : la carte des pistes ne part qu'avec le
  média, donc au seul lot `regular`. Rien de ce cycle ne la rouvre.
- **`attachmentDurationMs` reste un champ du fil que personne ne lit.** Il est
  désormais JUSTE, il n'est toujours pas SERVI. Même forme que
  `translatedContent` avant le cycle 122 — la question à lui poser reste « qui
  l'affiche ? », et la réponse est encore « personne ».
- **La bannière d'une VIDÉO n'a pas d'équivalent.** `AttachmentTranslation.type`
  déclare `'video'`, et le dépouillement des pistes est générique — c'est le site
  d'appel qui le borne à `audio/`, comme le fait déjà `firstAttachmentTranscript`.
  Le jour où le pipeline produit une piste vidéo traduite, la garde est à un
  prédicat près. **Non instruit ici, et distinct.**
- **`Message.ephemeralDuration` reste écrit par personne** (constat du cycle 93,
  revérifié en passant sur `forwardAdmission`) — armé, pas panne.
- Le rappel push (APNs `content-available` + suppression côté NSE) reste le
  suivi ouvert du cycle 127, toujours non instruit, toujours un lot à lui seul.
