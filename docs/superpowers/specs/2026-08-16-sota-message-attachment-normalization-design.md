# Normalisation SOTA des messages à pièces jointes — Design

**Date** : 2026-08-16
**Statut** : PROPOSITION — solution totale, à valider avant implémentation
**Plateformes** : `packages/shared`, `services/gateway`, `apps/web`, `apps/ios` + `packages/MeeshySDK`
**Supersede partiellement** : décision A2 de `2026-05-30-multi-attachment-messages-and-audio-carousel-design.md` (texte toujours séparé)

## 1. Contexte & constat

L'audit cross-plateforme du 2026-08-16 (messages, attachements, légendes) établit :

1. **Le backend implémente déjà le modèle SOTA « famille B »** (message multipart, réf. `draft-ietf-mimi-content-08`) : un `Message` porte `content` (requis, `""` autorisé) + 0..N `MessageAttachment` liés par `messageId`. Texte + pièces dans le même message est validé (`SendMessageBodySchema` refine, `routes/conversations/messages.ts:146-152`) et rendu (pattern caption MIMI).
2. **Les clients divergent** : le web envoie 1 message (texte = légende de groupe, `attachmentIds[]`) ; iOS découpe en 1 message par type de média + le texte en message séparé envoyé en dernier (`MultiAttachmentSendPlanner`, décision A2).
3. **La légende par attachement est une fonctionnalité fantôme** : `MessageAttachment.title/alt/caption` existent (`schema.prisma:817-822`) mais aucun chemin d'écriture client, absents des selects canoniques (`attachmentIncludes.ts`), supprimés par `serializeAttachmentForSocket`, non décodés par iOS, lus par zéro composant web. Seul write : la copie au forward (`MessageProcessor.ts:678`).
4. **Cinq plafonds contradictoires coexistent** :

| Valeur | Site | Rôle réel |
|---|---|---|
| **10** | `MessageValidator.ts:83-90` | **Cap effectif serveur** (les 2 transports) |
| 30 | `packages/shared/types/attachment.ts:398` (`MAX_FILES_PER_MESSAGE`) | Constante client jamais consommée par le gateway |
| 50 | `apps/web/hooks/composer/useAttachmentUpload.ts:94` | Plafond UI web |
| 100 | `validation/socket-event-schemas.ts:19` (`MAX_ATTACHMENT_IDS`) | Garde anti-DoS socket (commentaire erroné : « mirrors MessageValidator (100) ») |
| **199** | `ConversationComposerState.maxMediaSelection` (iOS, relevé le 2026-08-14) | Plafond UI iOS |

Conséquence : depuis le relèvement iOS à 199, **un envoi iOS de 11+ pièces produit un message que le validator serveur rejette** (`TOO_MANY_ATTACHMENTS`). Le plafond produit décidé (2026-08-16) est **199 pièces par envoi, en un seul message** — le serveur et le web doivent monter, pas iOS redescendre.

## 2. Référentiel SOTA

Deux familles dominent le marché :

- **Famille A « média-comme-message »** (WhatsApp, Telegram, iMessage) : chaque média est un message atomique avec sa propre légende ; l'album est un regroupement (client-side, ou formalisé par `media_group_id` + ordre chez Telegram, plafonné à 10).
- **Famille B « message-avec-attachements »** (Slack, Discord, Signal, Teams, **MIMI**, Matrix ≥ v1.10) : un message = corps texte + N pièces ; le corps est la légende du groupe ; des champs par pièce (`description`/`alt_txt`) servent l'accessibilité et la légende individuelle.

La convergence interop (IETF MIMI, Matrix MSC2530) est la famille B. C'est aussi la seule compatible nativement avec le **Prisme Linguistique** : la légende de groupe étant `Message.content`, elle traverse déjà le pipeline NLLB (`Message.translations`) sans travail supplémentaire — là où une légende par média exige son propre pipeline de traduction.

**Choix normatif** : Meeshy normalise sur la **famille B enrichie** — message multipart MIMI + légende individuelle par pièce (le meilleur des deux familles), avec ordre explicite. Aucun concept d'album/`mediaGroupId` n'est introduit : le groupe EST le message.

## 3. Sémantique normalisée (règles produit)

Réponses définitives aux questions de modélisation, valables sur toutes les plateformes :

| # | Règle |
|---|---|
| **R1** | Un message est **texte seul**, **média seul**, ou **média + texte** (le texte = légende de groupe). Jamais vide (garde existante : contenu OU pièces OU forward OU payload chiffré). Pas de contrainte XOR. |
| **R2** | Chaque envoi de texte = **1 message distinct**. Aucun bundling de textes. |
| **R3** | Un envoi de N pièces (types mélangés inclus) = **1 seul message**, N ≤ 199. Fin du découpage par type d'iOS : « légende + 3 vocaux + 2 photos » → **1 message** (5 pièces, content = légende), plus 3 messages. |
| **R4** | Chaque pièce peut porter sa **légende individuelle** (`caption` ≤ 1024), un `alt` d'accessibilité (≤ 512) et un `title` (≤ 256) — optionnels, éditables par l'uploadeur. |
| **R5** | La **légende de groupe** = `Message.content`, affichée sous l'album, traduite par le Prisme (existant). La légende individuelle s'affiche sous SA pièce (lightbox, galerie, carrousel) et est traduite par le Prisme (nouveau, §7). Priorité d'affichage plein-écran : `attachment.caption` (résolue) sinon `message.content` si pièce visuelle unique — le contrat que `ConversationViewModel.mediaCaptionMap` implémente déjà. |
| **R6** | L'**ordre des pièces** = ordre de sélection au composer, persisté (`order`), stable sur tous les clients et tous les rechargements. |
| **R7** | `messageType` est **dérivé serveur** des MIME des pièces (catégorie unique → cette catégorie ; mixte → `file` ; règle existante `attachment-message-type.ts`). Les clients cessent de l'envoyer pour les messages à pièces. |

## 4. Décisions

### D1 — Un envoi = un message (unification des composers)

- **Web** : déjà conforme (`ConversationLayout` → un emit avec `attachmentIds[]`). Aucun changement de sémantique.
- **iOS** : `MultiAttachmentSendPlanner.plan()` retourne désormais **un seul** `PlannedMessage` portant toutes les pièces + le texte (`text` devient le `content` du message). Le planner est conservé (testabilité, point d'entrée unique) mais sa partition par bucket disparaît. `sendMessageWithAttachments()` n'a plus qu'une itération de groupe ; une seule bulle optimiste ; le reply/forward reste sur ce message unique.
- **Renversement assumé de la décision A2** (2026-05-30, « texte toujours séparé ») : la présente normalisation SOTA (2026-08-16) vaut nouvelle décision produit. À consigner dans `apps/ios/decisions.md`, `apps/web/decisions.md`, `services/gateway/decisions.md`, `packages/shared/decisions.md`. Les rendus « légende inline » iOS (`audioHostsCaption`, `embedsCaptionInWidget`, `mediaWithReplyContainer`) — aujourd'hui atteignables uniquement par messages entrants — deviennent le chemin nominal, y compris pour ses propres envois.
- La capacité de **rendre** les anciens historiques (messages découpés) est intacte : rien ne change pour les messages existants.

### D2 — Plafond unique : 199

Source de vérité unique dans `packages/shared/types/attachment.ts` :

```ts
export const MAX_ATTACHMENTS_PER_MESSAGE = 199;
export const MAX_ATTACHMENT_CAPTION_LENGTH = 1024;
export const MAX_ATTACHMENT_ALT_LENGTH = 512;
export const MAX_ATTACHMENT_TITLE_LENGTH = 256;
```

Consommateurs (remplacement, pas d'alias) :
- `MessageValidator.ts` : `> 10` → `> MAX_ATTACHMENTS_PER_MESSAGE` (le message d'erreur cite la constante).
- `socket-event-schemas.ts` : `MAX_ATTACHMENT_IDS = 100` → import shared 199 ; corriger le commentaire mensonger.
- `routes/conversations/messages.ts` : borne `maxItems: 199` sur le tableau du body schema (aujourd'hui non borné).
- Web `useAttachmentUpload.ts` : `MAX_ATTACHMENTS_DEFAULT = 50` → import shared.
- iOS : `ConversationComposerState.maxMediaSelection = 199` reste, avec commentaire pointant la constante shared (Swift ne peut pas l'importer ; test de garde côté gateway, cf. §10).
- `MAX_FILES_PER_MESSAGE = 30` : supprimé (tous usages migrés).

**Garde-fou en octets : écarté (révision du 2026-08-16, à l'implémentation de P0).** Le design initial prévoyait un plafond `somme(fileSize) ≤ 8 GiB` à la validation d'envoi. Il ne protège rien : les fichiers sont **déjà uploadés et écrits sur disque** quand le message part (upload-first, §« Envoi »), et `message:new` ne transporte que des **métadonnées** (URL, thumbHash, dimensions), jamais les octets — la taille cumulée n'influence donc ni la consommation disque, ni le poids du payload. Il rejetterait en revanche des envois qui passent aujourd'hui (le cap de 10 pièces × 4 GiB autorise déjà 40 GiB), pour un bénéfice nul. La vraie amplification à 199 est ailleurs et reste traitée en P1 : la concurrence du dispatch audio (D8) et les N lectures d'attachments du handler socket. Si un plafond de poids par message devient un besoin **produit**, il se posera à l'**upload**, où les octets se dépensent.

### D3 — Ordre explicite

```prisma
model MessageAttachment {
  // ...
  /// Position de la pièce dans son message — ordre de sélection au composer (0-based)
  order Int @default(0)
}
```

- Écrit à la **liaison** : l'index dans le tableau d'envoi fait foi.
- `associateAttachmentsToMessage` passe d'un `updateMany` uniforme à une transaction d'updates par ligne (`prisma.$transaction(ids.map((id, i) => update({ where: { id }, data: { messageId, order: i } })))`), chunkée par 50 pour borner la taille de transaction à 199 pièces.
- **Toutes** les lectures d'attachments d'un message ajoutent `orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]` (tie-break qui préserve le comportement actuel pour l'historique, où `order = 0` partout) : `MessageProcessor` étape 4 bis, routes `GET /messages`, `_broadcastAttachmentUpdated`, forward.
- Migration : additive (`prisma db push`), aucun backfill nécessaire.

### D4 — Légende par pièce : activation de bout en bout

La colonne existe ; on la rend vivante. Trois chemins d'écriture (tous owner-only) :

1. **À l'upload** : le multipart `POST /attachments/upload` accepte déjà `metadata_<index>` JSON — y lire `caption`/`alt`/`title` (validés par le `AttachmentSchemas.upload` Zod existant, aujourd'hui mort, `utils/validation.ts:1238`) et les écrire à la création de la ligne.
2. **À l'envoi** (chemin principal, cf. §5) : le payload porte des références enrichies `attachments: [{ id, caption?, alt?, title? }]` ; le serveur écrit ces champs à la liaison, en même temps que `order`.
3. **Après coup** : nouvelle route `PATCH /api/v1/attachments/:id` body `{ caption?, alt?, title? }` (Zod, longueurs D2, propriétaire uniquement, pièces non chiffrées uniquement). Diffusion du delta via l'événement **existant** `message:attachment-updated` (`emitAttachmentUpdated`) — aucun nouvel événement à créer.

Chemins de lecture (symétriques) :
- `attachmentMediaSelect` / `attachmentFullSelect` / `attachmentForwardPreviewSelect` : + `title, alt, caption, order, captionTranslations`.
- `serializeAttachmentForSocket` (+ son interface `SocketAttachment`) : + ces 5 champs.
- iOS `APIMessageAttachment` : décodage tolérant de ces champs + passage dans `toMessage()` → `MeeshyMessageAttachment.caption/title/alt` (déjà déclarés) ; `mediaCaptionMap` branche 1 devient vivante sans modification.
- Web : `alt={attachment.alt ?? attachment.originalName}` partout ; caption résolue affichée en lightbox/galerie/grille (cf. §8).

### D5 — Symétrie des payloads & types honnêtes

- Le chemin de broadcast REST (`MeeshySocketIOManager._broadcastNewMessage:2326`, passthrough Prisma brut) adopte `serializeAttachmentForSocket` — les deux transports émettent exactement la même forme.
- `SocketIOMessage` (`socketio-events.ts:2006`) déclare enfin `attachments: SocketAttachment[]` et `translations` (le type est aujourd'hui périmé par rapport au wire réel).
- `SendMessageRequestSchema` (`packages/shared/types/messages.ts`) — qui se prétend « runtime source of truth » sans aucun consommateur gateway — est aligné sur le contrat réel (content optionnel + refine, attachments ≤ 199) et **devient** la brique des deux schémas gateway (import), ou est supprimé. Plus jamais deux vérités.

### D6 — `messageType` serveur-only pour les messages à pièces

La dérivation `messageTypeFromMimeTypes` (socket) devient commune aux deux transports ; le `messageType` client est ignoré dès qu'il y a des pièces. Web supprime `determineMessageTypeFromMime` du payload (gardé pour l'optimistic local uniquement).

### D7 — Prisme Linguistique des légendes individuelles

```prisma
model MessageAttachment {
  // ...
  /// Traductions de `caption` — map lang → { text, translationModel, confidenceScore?, createdAt }
  /// Miroir exact de la forme Message.translations (schema.prisma:753-768)
  captionTranslations Json?
}
```

- **Production** : dans `runMessagePostSaveEffects` (déjà hors chemin d'ACK), toute pièce liée dont `caption` est non vide rejoint la même file NLLB que `content`, vers les langues des participants (logique existante de `MessageTranslationService`). Écriture dans `captionTranslations`, puis re-broadcast du delta `message:attachment-updated` (mécanisme d'enrichissement asynchrone existant — identique aux transcriptions).
- **Édition** (PATCH) : invalide `captionTranslations` et re-enqueue.
- **Résolution client** : identique aux messages — `resolveUserLanguage()` côté web, `preferredTranslation`-like côté iOS ; **jamais** de fallback `translations.first` (règle critique n°1 du Prisme) : aucune traduction dans la langue préférée ⇒ afficher la caption originale.
- E2EE : conversations chiffrées ⇒ les légendes voyagent dans l'enveloppe chiffrée côté client, colonnes serveur `null`, aucune traduction serveur (cohérent avec `content`).

### D8 — Tenue de charge à 199 pièces

- **Payload `message:new`** : la forme `SocketAttachment` est compacte (thumbHash ~33 chars, variants bornés) ; à 199 pièces on reste de l'ordre de 100-250 KB. Mesure obligatoire en phase P1 (bench dans les tests d'intégration) ; si > 512 KB constaté, plan B prévu : broadcast des 24 premières pièces + `attachmentsTotal`, hydratation du reste via `GET /conversations/:id/messages/:messageId/attachments` (paginé). Le plan B n'est PAS implémenté d'office (YAGNI), seulement benché.
- **Audio** : `processAudioAttachments` remplace son `Promise.all` illimité par une concurrence bornée (chunks de 4) — 199 vocaux ne noient pas le translator.
- **Upload** : inchangé (web : lots de 10 multipart ; iOS : TUS séquentiel avec progression agrégée `n/N` — déjà dimensionné, cf. commentaire `maxMediaSelection`).
- **Rendu** : les deux clients savent déjà tronquer (web : grille + `+N` au-delà de 10, `max-h-96` ; iOS : grille 2×2 + overlay `+N` → carrousel). Aucun rendu de 199 tuiles simultanées.

## 5. Contrat wire (envoi)

`message:send-with-attachments` (socket) et `POST /conversations/:id/messages` (REST) acceptent, **rétrocompatible** :

```ts
{
  conversationId: string;
  content: string;                       // légende de groupe, '' si aucune
  clientMessageId: string;               // cid_<uuidv4> (idempotence, inchangé)
  originalLanguage?: string;

  // NOUVEAU — références ordonnées enrichies (l'index = order)
  attachments?: ReadonlyArray<{
    id: string;                          // ObjectId d'une pièce pré-uploadée par l'appelant
    caption?: string;                    // ≤ 1024
    alt?: string;                        // ≤ 512
    title?: string;                      // ≤ 256
  }>;

  // DÉPRÉCIÉ — accepté indéfiniment, équivaut à attachments sans métadonnées
  attachmentIds?: string[];

  // inchangés : replyToId, storyReplyToId, forwardedFrom*, effets, location…
}
```

Règles serveur : `attachments` et `attachmentIds` mutuellement exclusifs (si les deux, `attachments` gagne) ; 1 ≤ N ≤ 199 ; chaque `id` doit exister et appartenir à l'appelant (contrôle existant) ; l'ordre du tableau est persisté tel quel. Le champ interne legacy `MessageRequest.attachments` (objets inline, jamais alimenté par les routes actuelles) est remplacé par cette forme référencée — le `MessageValidator` compte une seule source.

Réception : `message:new` inchangé dans sa structure, enrichi des champs D4 dans chaque pièce, tableau trié par `order`. Enrichissements différés inchangés : `translation:*`, `audio:transcription-ready`, `message:attachment-updated` (qui porte désormais aussi `caption`/`captionTranslations`).

## 6. Impacts par composant

### packages/shared
| Fichier | Changement |
|---|---|
| `prisma/schema.prisma` | + `order Int @default(0)`, + `captionTranslations Json?` sur `MessageAttachment` |
| `types/attachment.ts` | + constantes D2 ; − `MAX_FILES_PER_MESSAGE` ; `Attachment` + `order`, `captionTranslations` |
| `types/socketio-events.ts` | `MessageSendWithAttachmentsData` + `attachments[]` ; `SocketIOMessage` corrigé (D5) ; doc `AttachmentUpdatedEventData` |
| `types/messages.ts` | `SendMessageRequestSchema` aligné et consommé (ou supprimé) — D5 |
| `types/message-types.ts` / `types/messaging.ts` | dédoublonner les 3 formes `MessageAttachment` concurrentes vers celle de `attachment.ts` |
| `utils/validation.ts` | `AttachmentSchemas.upload` branché (longueurs D2) — cesse d'être mort |

### services/gateway
| Fichier | Changement |
|---|---|
| `validation/socket-event-schemas.ts` | schéma `attachments[]` enrichi, plafond 199 importé, exclusivité mutuelle |
| `routes/conversations/messages.ts` | body schema + Zod : `attachments[]`, bornes, `messageType` ignoré si pièces |
| `services/messaging/MessageValidator.ts` | plafond 199 + somme `fileSize` ≤ 8 GiB |
| `services/attachments/AttachmentService.ts` | `associateAttachmentsToMessage(refs, messageId)` : transaction par ligne, écrit `order` + caption/alt/title |
| `services/messaging/MessageProcessor.ts` | étape 4/4 bis : refs enrichies, re-read trié par `order` ; `processAudioAttachments` concurrence bornée |
| `services/attachments/attachmentIncludes.ts` | 3 selects + `title, alt, caption, order, captionTranslations` |
| `socketio/serializeAttachmentForSocket.ts` | + les 5 champs |
| `socketio/MeeshySocketIOManager.ts` | broadcast REST via le sérialiseur (D5) |
| `routes/attachments/upload.ts` | `metadata_<i>` : lire caption/alt/title validés |
| `routes/attachments/metadata.ts` | + `PATCH /:id` (D4-3) + delta `emitAttachmentUpdated` |
| `services/messaging/messagePostSaveEffects.ts` | enqueue traductions de captions (D7) |
| `socketio/handlers/MessageHandler.ts` | payload étendu, dérivation type inchangée |

### apps/web
| Fichier | Changement |
|---|---|
| `hooks/composer/useAttachmentUpload.ts` | plafond partagé 199 ; **fix bug** `uploadProgress` indexé par lot vs fichier ; caption dans `metadata_<i>` |
| `components/attachments/carousel/FilePreviewCard.tsx` + `AttachmentCarousel` | entrée de légende par tuile (tap → mini-éditeur, pattern `ComposerMode.caption` iOS) |
| `services/socketio/messaging.service.ts` | payload `attachments: [{id, caption}]` ; − `messageType` client |
| `utils/optimistic-message.ts` + `ConversationLayout.tsx` | écho optimiste des médias (passer `attachments` — le paramètre existe déjà, non câblé) |
| `components/attachments/*` | rendu caption résolue (Prisme) en lightbox/galerie/`AttachmentGridLayout` ordonné par `order` ; `alt` réel |
| `AttachmentDetails.tsx` / lightbox | édition caption → PATCH |

### apps/ios + packages/MeeshySDK
| Fichier | Changement |
|---|---|
| `MultiAttachmentSendPlanner.swift` | un seul `PlannedMessage` (pièces + texte) — D1 ; tests réécrits |
| `ConversationView+AttachmentHandlers.swift` | boucle mono-groupe ; texte = `content` du message ; une bulle optimiste |
| SDK `MessageModels.swift` | `APIMessageAttachment` décode `caption/title/alt/order/captionTranslations` ; `toMessage()` les propage ; `SendMessageRequest.attachments: [{id, caption…}]` |
| SDK `CoreModels.swift` | `MeeshyMessageAttachment` + `order`, `captionTranslations` |
| `UniversalComposerBar+Attachments.swift` | légende par chip via `ComposerMode.caption` (existant, zéro call site — on le branche) |
| `MessageSocketManager.swift` | payload fallback socket étendu |
| Rendu Bubble | tri par `order` ; caption individuelle en carrousel/plein-écran (`mediaCaptionMap` branche 1 vivante) ; `audioHostsCaption` devient chemin nominal |

## 7. Compatibilité & migration

- **DB** : purement additif (`order` default 0, `captionTranslations` null). `prisma db push`, zéro backfill (tie-break `createdAt` — D3).
- **Anciens clients → nouveau serveur** : `attachmentIds` accepté indéfiniment ; `order` = index du tableau ; captions absentes. Un ancien iOS continue de découper par type — messages valides, rendus corrects.
- **Nouveau client → ancien serveur** (fenêtre de déploiement) : le web garde `attachmentIds` en double du champ `attachments` pendant une release (le `z.object` non-strict actuel stripe le champ inconnu sans erreur) ; à retirer ensuite.
- **Types** : décodage iOS tolérant (pattern `try? decodeIfPresent` existant) ; web ignore les champs inconnus.
- **Historique** : aucun regroupement rétroactif des messages découpés par l'ancien planner (non-but).

## 8. Rollout phasé

| Phase | Contenu | Dépendances |
|---|---|---|
| **P0 — hotfix plafonds** ✅ **livré 2026-08-16** | D2 seul : constante shared `MAX_ATTACHMENTS_PER_MESSAGE = 199`, `MessageValidator` 10→199, socket schema 100→199, REST `maxItems` (tableau non borné auparavant), web 30/50→199. Garde en octets écarté (cf. D2). **Débloque le plafond iOS 199 déjà shippé.** | aucune |
| **P1 — backend normalisé** | D3 (order), D4 côté serveur (write/read/PATCH), D5, D6, D8 (bench payload + audio borné) | P0 |
| **P2 — web** | payload enrichi, captions UI composer + rendu + édition, écho optimiste, fix progress | P1 |
| **P3 — iOS** | D1 (planner unifié), décodage + rendu captions, UI légende par chip | P1 (P2 non bloquant) |
| **P4 — Prisme légendes** | D7 : `captionTranslations` pipeline + résolution clients | P1 (activable après P2/P3) |

Chaque phase est indépendamment shippable et rétrocompatible.

## 9. Plan de tests (TDD — RED d'abord)

- **P0** ✅ : validator accepte 199 / rejette 200 (+ témoin « sélection iOS pleine ») ; socket schema idem ; `AttachmentService.validateFiles` web idem ; la constante shared est figée à 199 côté test (miroir de `maxMediaSelection` Swift).
- **P1** : liaison écrit `order` = index et caption/alt/title ; re-read trié ; sérialiseur émet les 5 champs (socket ET chemin REST — test d'égalité de forme entre les deux broadcasts) ; PATCH owner-only + delta émis ; upload `metadata_<i>.caption` persisté ; `messageType` client ignoré ; bench payload 199 pièces < 512 KB.
- **P2** : composer 199 fichiers → un seul emit, refs ordonnées ; caption saisie → payload ; rendu ordonné ; progress par fichier (bug corrigé) ; optimistic avec médias.
- **P3** : `MultiAttachmentSendPlannerTests` : « 3 photos + 2 vocaux + texte → 1 message, content = texte, 5 pièces ordonnées » ; décodage `APIMessageAttachment.caption` ; `mediaCaptionMap` priorité caption > content ; `meeshy.sh test` vert.
- **P4** : caption non vide → job NLLB → `captionTranslations` écrit → delta reçu ; résolution : préférée sinon originale, jamais `first`.

## 10. Risques & points ouverts

1. **Renversement A2** : la décision « texte toujours séparé » était une décision utilisateur informée (2026-05-30). La normalisation SOTA (2026-08-16) la remplace — à re-valider explicitement avec le produit avant P3, et à consigner dans les 4 `decisions.md`.
2. **Payload à 199** : plan B spécifié mais non implémenté ; gate sur le bench P1.
3. **Swift ne consomme pas la constante TS** : le plafond iOS reste dupliqué (199). Mitigation : test gateway qui échoue si `MAX_ATTACHMENTS_PER_MESSAGE ≠ 199` avec pointeur vers `maxMediaSelection`, et commentaire croisé dans les deux sources.
4. **Modération/scan à 199 pièces** : le pipeline `scanStatus`/`moderationStatus` par pièce est inchangé mais sa volumétrie décuple — à surveiller (hors périmètre de ce design).
5. **Feed/posts** : `PostMedia` (ordre, captions par traduction de post) reste un modèle distinct — non-but ici ; une convergence éventuelle fera son propre design.

## 11. Références

- Audit 2026-08-16 (session « message-attachment-handling ») — constats §1.
- `docs/superpowers/specs/2026-05-30-multi-attachment-messages-and-audio-carousel-design.md` (A2, pattern caption MIMI §113-115).
- `docs/superpowers/specs/2026-05-25-audio-instant-render-and-attachment-size-design.md` (sérialiseur canonique, delta `attachment-updated`).
- `docs/architecture/media-translations-relational-migration.md` (alternative relationnelle à `captionTranslations` — différée, le blob miroir de `Message.translations` est retenu pour la cohérence).
- IETF `draft-ietf-mimi-content` ; Matrix MSC2530 ; Telegram Bot API `sendMediaGroup` (état de l'art comparé §2).
