# Transfert de médias fiable (iOS + web), menu « Plus… » sur la grille, provenance de groupe

Date : 2026-08-19
Statut : validé (brainstorming avec le user, ce jour)
Remplace partiellement : `2026-08-11-message-more-jumps-to-views-design.md` (le saut direct vers « Vues » est annulé — voir Volet B)

## Contexte

Trois demandes produit :

1. « Ajouter le transfert des médias sous Meeshy » — en réalité, le pipeline serveur existe
   déjà et est complet (`MessageProcessor.copyForwardedAttachments`, sur `main` depuis
   2026-03-24 : copie des lignes `MessageAttachment` en réutilisant les mêmes blobs, provenance
   `forwardedFromAttachmentId`/`isForwarded`, E2EE préservé, `messageType` recalculé). Le
   constat user est : **« lorsque je transfère des médias ça n'aboutit pas, ça échoue »** —
   sans crash. Les erreurs sont avalées côté iOS (`ForwardPickerSheet.swift:338-341` : glyphe
   retry muet). La cause racine n'est PAS connue et doit être diagnostiquée en premier.
   Exigence transverse : **jamais de re-upload** du média au transfert, sur iOS ET sur web.
2. Ne plus atterrir directement dans l'onglet « Vues » quand on ouvre « Plus d'actions »
   après le long-press d'un message.
3. Garantir que le nom du groupe source est indiqué quand on transfère un média/message
   issu d'un groupe (règle exacte tranchée : nom pour TOUT groupe, masqué pour les
   tête-à-tête).

Périmètres validés par le user : fiabiliser le flux existant + transfert multi-conversations
+ transfert web COMPLET (action + picker + badge, il n'existe aujourd'hui AUCUNE UI de
transfert côté web, seulement un label statique « Forwarded » dans
`apps/web/components/common/bubble-message/MessageContent.tsx:78-87`).

## État des lieux (exploration 2026-08-19)

- **Serveur** : pas d'endpoint dédié — transférer = envoyer un message ordinaire portant
  `forwardedFromId` (+ `forwardedFromConversationId`) sur l'un des 3 transports (REST
  `POST /conversations/:id/messages`, socket `message:send`, `message:send-with-attachments`).
  Garde `admitMessageForward` (`forwardAdmission.ts`) : refus des messages à vue unique
  (`view-once-not-forwardable`), héritage de la durée éphémère, best-effort si source
  introuvable. Enrichissement lecture : `forwardedFrom` (aperçu + sender + 1er attachment) et
  `forwardedFromConversation` `{id, title, identifier, type, avatar}` sur GET et sur le
  broadcast `message:new`.
- **iOS** : « Transférer » est proposé inconditionnellement (y compris vue unique → refus
  serveur muet). Deux implémentations divergentes : `ForwardPickerSheet` (REST direct +
  branche offline `OfflineQueue`) et `MessageForwardDetailView` (dupliquée, SANS offline,
  zéro call site — code mort). Le chemin `ConversationViewModel.sendMessage(forwardedFromId:)`
  est orphelin. Aperçu picker : « [Media] ». Badge bulle : `BubbleForwardedIndicator`
  (« Fwd. from {sender} • {conversation} ») affiché sans distinction de type de source.
- **SDK** : `ForwardReference` (CoreModels.swift:1582-1604) ne porte PAS le type de la
  conversation source — `APIForwardedFromConversation.type` est décodé puis JETÉ par
  `toMessage` (MessageModels.swift:805-822). L'écho optimiste n'hydrate jamais
  `forwardedFrom` (badge complet seulement au retour serveur).
- **Web** : aucune action de transfert ; le shape du message bulle ne porte que
  `forwardedFromId`.

## Volet B — « Plus… » ouvre la grille complète (iOS)

Comportement cible : les DEUX call sites de l'action « Plus… » — closure `onShowMore` de
l'overlay long-press (`ConversationView.swift:2360-2364`) et bouton `case .more:` du menu
contextuel natif iOS 26 (`ConversationView.swift:2530-2537`) — posent
`overlayState.moreSheetInitialItem = nil` inconditionnellement. La feuille `MessageMoreSheet`
s'ouvre alors en mode grille de pastilles (3 sections Actions / Infos & Prisme / Modération).

Inchangé (accès directs explicites, décision user) :
- tap sur les coches ✓✓ (`onShowReadStatus`) et « info message » (`onShowMessageInfo`) →
  `.views` (toujours gaté sur `showReadReceipts`) ;
- tap icône translate (`onShowTranslate`, `onShowTranslationDetail`, menu natif
  `case .translate`) → `.language` ;
- tap réactions (`onShowReactions`) → `.reactions`.

Tests : réécrire les 3 gardes de `MessageMoreJumpsToViewsGuardTests` pour verrouiller le
NOUVEAU contrat — aux deux sites « Plus… », interdire toute pose de `.views` (exiger `nil`) ;
conserver une garde positive sur `onShowReadStatus` → ternaire `showReadReceipts ? .views : nil`.
Amender la spec 2026-08-11 (note d'annulation pointant ici). Le mécanisme `initialItem` du
sheet reste intact (consommé par les accès directs).

## Volet A — Transfert fiable, médias inclus, multi-cibles (iOS)

### A.1 Diagnostic OBLIGATOIRE en premier lot
Reproduire le transfert d'un message média (image, vidéo, audio) et identifier la cause
racine de l'échec rapporté. Hypothèses à vérifier (aucune n'est confirmée) : refus serveur
non-view-once inattendu, décodage de la réponse `APIResponse<SendMessageResponseData>` qui
throw après un envoi pourtant réussi, `message.id` local/optimiste comme `forwardedFromId`,
`sourceConversationId` nil, environnement (staging/prod). La correction de la cause racine
fait partie du volet. Méthode : superpowers systematic-debugging, instrumentation des erreurs
avant tout correctif.

### A.2 Erreurs explicites, gate vue-unique
- Le picker affiche la RAISON d'un échec par cible (texte localisé) + retry, au lieu du
  glyphe muet. Prévoir le mapping du refus serveur (voir Volet E, code d'erreur structuré).
- `MessageActionResolver` n'offre plus `.forward` pour un message à vue unique (aligné sur
  `forwardAdmission` ; le `MessageMenuContext` gagne l'info nécessaire). Idem pour le bouton
  « Transférer » du sous-menu média du `MessageMoreSheet` et le swipe-to-forward.

### A.3 Une seule implémentation
- Supprimer `MessageForwardDetailView` (code mort divergent).
- Extraire un service de transfert unique app-side (`MessageForwardService` app,
  orchestration UX — PAS dans le SDK, test du grain SDK-purity) : construit le
  `SendMessageRequest` (`content` de la source, `forwardedFromId`, `forwardedFromConversationId`,
  `attachmentIds: nil` — JAMAIS de re-upload), branche offline `OfflineQueue` conservée,
  statuts par cible, utilisé par tous les points d'entrée (picker, swipe, quick-reaction row).

### A.4 Aperçu digne dans le picker
Vignette du média (thumbnail existant du 1er attachment + compteur si plusieurs) + libellé de
type localisé, au lieu de « [Media] ».

### A.5 Feedback fiable (pas d'écho optimiste complet)
Le message n'apparaît dans la conversation cible qu'à la confirmation serveur (le socket
`message:new` s'en charge). Le picker montre l'état par cible (en cours / envoyé / échec+raison)
et un toast succès (`FeedbackToastManager`, action locale) permet d'ouvrir la cible. Exception
Volet C : l'hydratation locale de `ForwardReference` à l'envoi (C.3) pour le badge.

### A.6 Picker multi-conversations — modèle hybride (sémantique EXACTE, décision user)
1. Chaque ligne de conversation porte un bouton « Envoyer » en fin de ligne → **envoi
   immédiat** à cette seule conversation.
2. Toucher la LIGNE (hors bouton) → **sélectionne** la conversation (mode multi-sélection) ;
   dès ≥ 1 sélection, un bouton global « Envoyer (N) » apparaît → envoi en rafale aux
   sélectionnées.
3. Une conversation déjà servie (état « envoyé ») n'est **plus sélectionnable** ; son bouton
   par-ligne devient l'état envoyé.
4. Appuyer le bouton par-ligne d'une ligne actuellement sélectionnée → envoi immédiat ET
   **retrait automatique de la sélection** (sinon l'envoi en rafale produirait un doublon).
   Aucun doublon ne doit être possible par construction.

## Volet C — Nom du groupe source sur le badge « Transféré »

### C.1 Règle produit (décision user)
Le nom de la conversation source s'affiche pour TOUT type de groupe :
`group`, `public`, `global`, `community`, `channel`, `broadcast`. Il est MASQUÉ pour les
tête-à-tête : `direct` et `bot` (traité comme un direct). Badge sans nom = variante
« Transféré » / « Fwd. from {sender} » actuelles. La règle est appliquée CÔTÉ CLIENT
(principe Local-First du repo — le gateway envoie déjà `type`, inchangé). Règle jumelle
iOS ↔ web : toute évolution touche les deux sites (à documenter dans les deux fichiers).

### C.2 Données (SDK)
- `ForwardReference` gagne `conversationType: String?` (optionnel → rétro-compatible avec le
  cache GRDB existant, `ForwardReference` étant Codable embarqué), câblé depuis
  `APIForwardedFromConversation.type` (déjà décodé, aujourd'hui jeté —
  MessageModels.swift:805-822).
- Fallback nom : `title ?? identifier` (aligné sur `MeeshyConversation.name`).

### C.3 iOS
- Gating dans `BubbleForwardedIndicator` (inputs primitifs Equatable — on passe la décision
  ou le type en String, pas d'objet), nouvelles clés localisées dans les 7 langues
  (gardes habituelles : catalogue 7 langues, clés mortes, cliquet accents).
- (Amendé à l'implémentation) Pas de ligne optimiste au transfert (cf. A.5) : l'«
  hydratation locale » envisagée au brainstorming est SANS OBJET. Le badge de la
  conversation cible est alimenté par l'enrichissement serveur (GET + broadcast
  `message:new`), couvert par C.2 — testé via le mapping `toMessage`.

### C.4 Web
Le shape du message bulle web gagne `forwardedFrom` / `forwardedFromConversation`
(title + type, données déjà présentes dans les payloads GET et socket) ; le label statique
« Forwarded » devient « Transféré depuis {groupe} » selon la règle C.1 (localisé).

## Volet D — Transfert web complet

À créer (rien n'existe) :
- Action « Transférer » dans le menu des messages web (mêmes exclusions : pas de vue unique).
- Picker de conversations avec le MÊME modèle hybride que A.6 (sémantique identique).
- Envoi : `POST /api/v1/conversations/:id/messages` avec `forwardedFromId` +
  `forwardedFromConversationId`, `attachmentIds` absent — le serveur copie, jamais de
  re-upload.
- Affichage : Volet C.4.

## Volet E — Backend (minimal)

A priori AUCUN changement de schéma (tout existe). Deux retouches candidates :
1. Code d'erreur STRUCTURÉ sur le refus de transfert (`view-once-not-forwardable`) dans la
   réponse d'erreur, pour un affichage propre côté clients (aujourd'hui message texte FR en
   dur côté gateway).
2. Ce que le diagnostic A.1 révélera (correctif ciblé uniquement).

## Ordre de livraison & tests

Quatre lots indépendants, dans cet ordre :
1. **Lot B** (petit, immédiat) : grille « Plus… » + gardes réécrites + amendement spec 2026-08-11.
2. **Lot A** : diagnostic (A.1) PUIS fiabilisation iOS (A.2→A.6) + éventuel correctif E.
3. **Lot C** : SDK (`ForwardReference.conversationType`) + badge iOS + hydratation locale.
4. **Lot D** : web complet (affichage C.4 puis action/picker).

TDD strict par lot : RED d'abord. Tests iOS (resolver, service de transfert, gardes de
source, VM), tests SDK (modèles, mapping, roundtrip Codable/GRDB), tests gateway (bun,
uniquement si E bouge), tests web (Jest/RTL + règle jumelle). Gates : `./apps/ios/meeshy.sh
test`, coverage gateway sous bun, tsc web. Vérification finale sur simulateur (flux réel de
transfert média) avant de clore le lot A.
