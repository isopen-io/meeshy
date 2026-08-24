# Meeshy - CLAUDE.md

## Project Overview
Meeshy is a high-performance real-time messaging platform with multi-language translation, voice cloning, and end-to-end encryption. It supports 100k+ messages/second with simultaneous multi-language translation.

## Prisme Linguistique — Philosophie Produit

Le Prisme Linguistique est le principe fondamental de l'experience Meeshy :

**Par defaut, l'utilisateur consomme tout le contenu dans sa langue principale configuree.** Les traductions sont appliquees automatiquement, de maniere elegante et discrete — l'utilisateur ne devrait jamais ressentir de friction linguistique.

### Principes
- **Transparence** : Le contenu traduit s'affiche comme du contenu natif. Pas de popup, pas de banniere intrusive
- **Discretion** : Un indicateur subtil (icone translate, badge langue) signale qu'une traduction est active, sans distraire
- **Exploration** : L'utilisateur peut a tout moment voir l'original ou explorer d'autres langues via un geste naturel (long press, tap icone)
- **Automatisme** : La resolution de langue preferee est automatique (langue principale > langues secondaires > original)
- **Coherence** : Le prisme s'applique a TOUT le contenu — messages texte, transcriptions audio, metadonnees, previews

### Pipeline technique
```
Message recu → Detection langue originale → Traduction auto (NLLB-200 via translator)
→ Stockage MongoDB (MessageTranslation[]) → Push Socket.IO → Client affiche dans langue preferee
```

### Resolution de langue
Ordre de resolution pour le contenu (messages, transcriptions) — identique partout :
1. `systemLanguage` — langue primaire configuree dans l'app (priorite la plus haute)
2. `regionalLanguage` — langue secondaire configuree dans l'app
3. `customDestinationLanguage` — langue de destination personnalisee
4. `deviceLocale` — locale appareil (`Locale.current` iOS, `Accept-Language` web), 4e priorité 2026-05-26
5. Fallback : `'fr'`

Source de verite : `resolveUserLanguage()` dans `packages/shared/utils/conversation-helpers.ts`
iOS : `MeeshyUser.preferredContentLanguages` dans `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`

**La locale appareil intervient en 4e priorité — jamais en remplacement des préférences in-app.** Un utilisateur francophone avec un iPhone en anglais voit toujours ses messages en français (priorité 1) ; la locale anglaise n'intervient que si aucune traduction française n'est disponible ET qu'une traduction anglaise existe. Source de vérité : `resolveUserLanguage()` dans `packages/shared/utils/conversation-helpers.ts` accepte `{ deviceLocale }` en 2e argument.

Source de verite gateway : `packages/shared/utils/conversation-helpers.ts` → `resolveUserLanguage()`
Source de verite iOS : `ConversationViewModel.preferredLanguages` + `preferredTranslation(for:)`

### Regles critiques du Prisme
1. **Si aucune traduction ne matche la langue preferee, afficher le contenu original (retourner `nil`).** Ne JAMAIS tomber sur `translations.first` comme fallback — l'absence de traduction vers la langue preferee signifie que le contenu est deja dans cette langue.
2. **La locale appareil entre en 4e priorité (Prisme étendu 2026-05-26)** — après `systemLanguage`, `regionalLanguage`, `customDestinationLanguage`. Elle ne les supplante jamais. iOS l'injecte via header `X-Device-Locale` ; gateway la persiste opportunément dans `User.deviceLocale`.
3. **La langue d'origine concourt à son RANG dans le prisme, jamais comme court-circuit (2026-08-10).** Un résolveur parcourt les langues du lecteur DANS L'ORDRE ; la première servie gagne — par une traduction, ou parce que le message est déjà écrit dedans. Ne JAMAIS écrire « si la langue d'origine appartient au prisme ⇒ afficher l'original » : cette formulation rétrograde la langue PRIMAIRE dès que la langue d'origine occupe un rang inférieur, ce que produit mécaniquement la locale appareil (règle 2). Prisme `['fr','en']`, message anglais, traduction française disponible ⇒ **« Bonjour »**, jamais « Hello ». Sources de vérité, une par client : `resolveLastMessagePreview()` (`packages/shared/utils/conversation-helpers.ts`, consommée par le web), `MeeshyConversation.resolvedLastMessagePreview` (`packages/MeeshySDK/.../CoreModels.swift`) et `resolveLastMessagePreview()` (`apps/android/core/model/.../lang/LastMessagePreviewResolver.kt`) — toute évolution touche les TROIS. Android a rejoint la règle au cycle 118 : son `ApiConversation` ne déclarait ni `lastMessageTranslations` ni `lastMessageOriginalLanguage`, donc le décodeur les jetait et la ligne de liste restait dans la langue de l'expéditeur pour tout le monde. **Quand cette liste dit « jumelles », compter les clients avant de la croire.**

   **Cette règle gouverne TROIS familles de résolveurs, pas une** (cycle 120). L'énumération initiale ne couvrait que l'APERÇU DE LISTE ; le cycle 119 a ajouté l'AUDIO ; le cycle 120 a trouvé la troisième — les POSTS/COMMENTAIRES — dont le web ne descendait PAS le prisme (il ne résolvait que le rang 1, ratant toute traduction d'un rang inférieur quand le rang 1 manquait — cas nominal dès que la locale appareil, rang 4, diffère de la langue applicative) :

   | famille | web | iOS | Android |
   |---|---|---|---|
   | aperçu de liste | `resolveLastMessagePreview()` (`packages/shared/utils/conversation-helpers.ts`) | `MeeshyConversation.resolvedLastMessagePreview` | `LastMessagePreviewResolver.kt` |
   | audio (transcription + piste jouée) | `resolveAutoLanguage` (`apps/web/hooks/use-audio-translation.ts`) | `AudioTrackLanguageResolver.resolve` | `resolveTranslatedAudio` (`BubbleContentBuilder.kt`) |
   | audio **sur l'écran verrouillé** (piste ATTACHÉE au push) | résolu **SERVEUR** : `NotificationService.servedAttachmentMedia`, élu par la langue du texte servi | idem (NSE) | idem |
   | posts / commentaires | `TranslationToggle` (`autoResolved`, via `usePreferredLanguages`) + `usePostTranslation` (`apps/web/hooks/use-post-translation.ts`) | `APIPost.resolveTranslation` (`packages/MeeshySDK/.../Models/PostModels.swift`) | `LanguageResolver.preferredTranslation` (`apps/android/core/model/.../lang/`) |
   | **bannière de notification** (message, réponse, mention) | résolu **SERVEUR**, une fois pour les trois clients : `NotificationService.previewPrismSource` + `prismTranslation` (`services/gateway/.../notifications/`), partagé par les trois éventails → le CORPS servi et, en projection, `translatedContent` / `translatedLanguage` sur le fil APNs/FCM | idem (NSE) | idem |

   **La quatrième famille est résolue côté SERVEUR** — c'est ce qui l'a tenue hors des trois énumérations précédentes, qui balayaient les clients. Un résolveur de Prisme n'est pas nécessairement dans un client : dès qu'un contenu part vers un destinataire NOMMÉ (un push, un e-mail, un digest), c'est la passerelle qui descend son prisme. Trouvée au cycle 121 en posant la question de la 261 sur un type de contenu de plus : « et le texte poussé dans une notification, qui le résout ? ».

   **Un contenu résolu voyage avec son MÉDIUM (cycle 128).** La famille AUDIO ci-dessus a DEUX lignes parce que le cycle 123 n'en avait corrigé qu'une : il a fait descendre le prisme au TEXTE de la bannière d'un vocal, et laissé douze lignes plus bas, dans le même objet littéral, `firstAttachmentUrl: first?.fileUrl` — l'original, sans condition. Une bannière **en français** au-dessus d'un `UNNotificationAttachment` qui **parle anglais**. La piste TTS vivait pourtant sur la colonne que l'éventail lisait déjà (`MessageAttachment.translations[lang].url`), dont `transcriptTranslationTexts()` ne prenait que le texte ; sa jumelle `transcriptTranslationTracks()` (`packages/shared/types/attachment-audio.ts`) en est le site unique.

   > **La question à poser à un correctif de Prisme n'est pas seulement « sert-il le bon texte ? » mais « qu'est-ce qui part À CÔTÉ du texte qu'il vient de corriger ? »** — c'est la leçon 275 (une protection se mesure sur tout ce que la charge TRANSPORTE) portée d'une garde de confidentialité à un correctif de résolution.

   Et **la piste est élue par la langue du TEXTE SERVI, jamais par une descente indépendante** : deux descentes parallèles serviraient « la réunion est déplacée » au-dessus d'une piste espagnole — un défaut PIRE que celui qu'on corrige, parce qu'il a l'air d'une traduction ratée plutôt que d'une traduction absente. Détail : `tasks/lessons.md` § 283.

   **La descente elle-même est UNE fonction** : `resolvePrismTranslation()` (`packages/shared/utils/conversation-helpers.ts`), qui rend `{ language, text } | null` — `null` ⇒ servir l'original. `resolveLastMessagePreview()` en est désormais une projection. Tout consommateur TS qui doit DIRE dans quelle langue il sert (et pas seulement afficher un texte) l'appelle plutôt que de réécrire la boucle : c'est la réécriture qui a produit trois familles divergentes en trois cycles.

   **Les TROIS éventails de `messageNotificationFanOut` descendent le Prisme depuis le cycle 122.** `createReplyNotification` et `createMentionNotification` posaient `content: params.messagePreview` — l'original — et ne poussaient ni `translatedContent` ni `translatedLanguage` : une bannière de réponse ou de mention arrivait toujours dans la langue de l'expéditeur pendant que celle d'un message simple servait la traduction. Défaut DISTINCT de celui du cycle 121 (ABSENCE du Prisme, pas un mauvais rang). La descente est désormais un site UNIQUE côté serveur — `NotificationService.prismTranslation`, alimenté par `pushableTranslations` + `loadMessagePrismSource` — que les trois éventails partagent ; l'éventail de mentions relit la source UNE fois pour tous ses destinataires, la descente restant par lecteur.

   **Et un contenu résolu doit être SERVI, pas seulement transporté (cycle 122).** La descente ci-dessus alimente `translatedContent` / `translatedLanguage` sur le fil push — **des champs qu'AUCUN client ne lit** (mesuré : ni la NSE iOS, ni l'app, ni Android, ni le service worker web). Le seul texte que les trois plateformes rendent est `payload.body`, et il restait composé depuis l'aperçu ORIGINAL : le symptôme visé — deux textes pour un même message — survivait intact, une couche plus bas. **La question à poser à tout résolveur de Prisme n'est donc pas seulement « élit-il le bon rang ? » mais « qui AFFICHE ce qu'il élit ? »** — un correctif dont la valeur n'atteint aucun lecteur n'a corrigé personne. Le corps de la bannière ET le `Notification.content` persisté portent désormais le texte servi, sur les trois éventails ; `translatedContent`/`translatedLanguage` restent sur le fil comme champs de service.

   **Ce qui traduit un aperçu dépend de ce que l'aperçu EST, et le site qui l'a COMPOSÉ est le seul à le savoir** : `Message.translations` ne traduit QUE `Message.content`. D'où `PreviewPrismBasis` (cycle 123), un type SOMME que l'éventail déclare — `message-content` (nominal) · `protected-placeholder` (éphémère / vue unique / flouté / chiffré : un placeholder, que rien ne traduit) · `transcript` + SA carte (`MessageAttachment.translations`). Un booléen « substituable ou non » ne pouvait pas dire la troisième forme, qui n'est pas non-substituable mais substituable par une AUTRE carte.

   **Le corps servi et les champs du fil sont DEUX PROJECTIONS D'UNE SEULE descente (cycle 123).** Ils venaient de deux résolutions parallèles, gardées différemment : `servedPreview` par la base de l'aperçu, `translatedContent`/`translatedLanguage` par rien. Pour un message à VUE UNIQUE, la bannière affichait donc son placeholder pendant que la charge APNs transportait à côté la traduction EN CLAIR du texte masqué — puis la persistait dans la ligne `Notification` (le pipeline de traduction n'ayant, mesuré, aucun gate sur `isViewOnce` / `isBlurred` / `expiresAt`). **La question à poser à un résolveur de Prisme est donc triple** : élit-il le bon rang (cycle 121) ? qui AFFICHE ce qu'il élit (cycle 122) ? et **que transporte-t-il À CÔTÉ de ce qu'il affiche** (cycle 123) ? La bannière d'un VOCAL descend sa propre carte depuis le même lot — `transcriptTranslationTexts()` (`packages/shared/types/attachment-audio.ts`) est le site UNIQUE du dépouillement `AttachmentTranslations` → `langue → texte`.

   **Cycle 124 — la protection était ANNONCÉE par deux champs et APPLIQUÉE par aucun.** Le cycle 123 a fermé le FIL d'un message protégé ; son CORPS était déjà perdu une couche PLUS HAUT que toute déclaration de base. `notificationPreviewForPush = firstAttachmentTranscript ?? notificationPreview` faisait gagner la transcription INCONDITIONNELLEMENT sur le placeholder que `protectedPreview` venait de composer : un vocal ÉPHÉMÈRE / à VUE UNIQUE / FLOUTÉ / CHIFFRÉ poussait **son texte transcrit entier sur l'écran verrouillé**. `previewIsProtectedPlaceholder` gouvernait `previewBasis`, jamais l'aperçu lui-même — et `pushPreviewBasis`, élisant `transcript` avant de regarder la protection, offrait en prime la carte de l'attachment à la descente, que seul le verrou `notificationLocKey` retenait.

   > **Un champ de service qui DÉCLARE une restriction ne la fait pas respecter.** La question à poser à toute garde n'est pas « est-elle posée ? » mais **« le texte qu'elle gouverne est-il bien celui qui part ? »**. C'est la forme du cycle 123 avec l'inversion qui la rend pire : ici l'hôte rend PLUS que ce que le résolveur autorise. La question à un résolveur de Prisme est donc QUADRUPLE — bon rang (121) ? qui l'affiche (122) ? que transporte-t-il à côté (123) ? **et le texte qu'il reçoit a-t-il le droit d'être là (124) ?**

   **Cycle 125 bis — répondre par un VOCAL poussait une bannière au CORPS VIDE.** `buildMessageNotificationBodyI18n` — le compositeur qui remplace un texte ABSENT par le libellé du premier média (« 🎤 Message vocal · 0:12 ») — n'était appelé que par `createMessageNotification`. Les éventails RÉPONSE et MENTION posaient `content: servedPreview(...)`, une projection plus PAUVRE : sur le MÊME message, les membres du fil voyaient la transcription et **celui à qui on répond ne voyait RIEN**. Site unique désormais : `servedBannerBody()`, et `NotificationBannerMedia` sépare la charge par l'USAGE de ses champs — ce qui compose un TEXTE (les trois) / ce qui transporte un FICHIER (le message simple seul, décision assumée : y attacher le média inline rouvrirait la surface que le cycle 125 vient de resserrer).

   > **Deux sites qui partagent le sous-helper d'une règle ont l'air de partager la règle.** La divergence ne se voit pas dans « qui appelle quoi » mais dans « qui appelle la COMPOSITION ». Et **un corps VIDE n'est pas « un autre choix de produit »** : le suivi avait été classé « décision produit » deux cycles de suite, ce qui était juste sur la langue et faux sur ce que l'utilisateur VOIT. Devant une telle étiquette, demander — *quel produit choisirait ça ?* Détail : `tasks/lessons.md` § 277.

   **Cycle 126 — et un lot qui fait CONVERGER une chaîne laisse derrière tout ce qui la QUALIFIE.** Deux champs de l'éventail n'ont pas suivi le lot ci-dessus, pour une raison qu'il faut dire à voix haute : **ils ne composent aucune chaîne.** `notificationLocKey` QUALIFIE le placeholder d'un message protégé (la NSE le rend depuis sa propre table) et sert de SECOND VERROU à `createNotification` ; `messageCreatedAt` / `messageType` portent l'horloge SERVEUR de la bulle que la NSE PRÉ-ENREGISTRE — sans eux, la bulle d'une réponse était datée par l'horloge du DEVICE et se rangeait au mauvais endroit du fil. `createMessageNotification` tenait les deux de sa relecture VIVANTE ; réponse et mention n'ont que `loadMessagePrismSource`, dont le `select` ne les demandait pas.

   > **Un lot qui partage une valeur composée doit énumérer ce qui voyage AVEC elle, pas seulement ce qui la compose.** Un champ qui QUALIFIE un texte — clé de localisation, horloge, type, base — ne se trouve pas en cherchant « qui compose ce texte ? » : par construction, il n'apparaît dans aucune composition. C'est la forme du cycle 125 rejouée un cran plus haut, et le même angle mort : le niveau d'abstraction du correctif rend invisible ce qui ne participe pas à sa phrase.

   Sites : `MessageBannerSource` (la source du Prisme ET l'horloge, deux types car deux questions), `messageClockFields()` et le `notificationLocKey` servi aux trois lots. Corollaire de structure : **un relais qui RECOPIE champ par champ est un inventaire à tenir à jour** — `createMentionNotificationsBatch` en recopiait neuf, retenant en silence chaque champ ajouté en amont. Il RÉPAND désormais, ne nommant que les deux champs qui changent de nom. Détail : `tasks/realtime-sync-audit-2026-08-24-cycle126.md`, `tasks/lessons.md` § 279.

   **Cycle 125 — les quatre gardes gardaient une CHAÎNE, et le fichier partait à côté.** `protectedPreview`, `previewPrismSource`, `prePersistedMessageFields` et le verrou du cycle 124 sont justes, testées, bien placées : toutes retiennent du TEXTE. Douze lignes sous la dernière, dans le même objet littéral, `firstAttachmentUrl: first?.fileUrl` partait sans aucune condition — et la NSE iOS télécharge cette URL puis l'attache en `UNNotificationAttachment` sans jamais regarder `notificationLocKey`. **Une photo à VUE UNIQUE s'affichait ENTIÈRE sur l'écran verrouillé sous une bannière disant « 👁️ 🖼️ ».** Aucun texte n'avait besoin de fuir pour que le secret parte.

   > **Une protection de CONTENU se mesure sur tout ce que la charge TRANSPORTE, jamais sur sa seule chaîne** — texte, fichier, nom de fichier, taille, durée, vignette, URL. Et le défaut ne se cachait pas dans un fichier oublié : il était dans l'objet voisin, écrit par la même main, invisible parce qu'il ne compose aucune chaîne. La question qui l'attrape se pose AU MOMENT du correctif : « la charge que ce site remet contient-elle autre chose que ce que je viens de garder ? », et elle se répond en lisant l'objet remis ligne à ligne.

   La protection d'un média se lit aux DEUX niveaux qui la déclarent : celui du MESSAGE (`protectedPreview`) et celui de la PIÈCE JOINTE (`maskedAttachment`, sa JUMELLE posée juste à côté d'elle — `MessageAttachment.isViewOnce / isBlurred / effectFlags`, que le `select` de l'éventail ne lisait pas du tout). Un seul prédicat, `mediaMayTravel`, gouverne `attachmentInfo` EN BLOC **et** `firstAttachmentTranscript` ; `createNotification` pose le second verrou sur `notificationLocKey`, dont `protectedPreview` est l'unique producteur du dépôt — sa présence est une DÉCLARATION de protection, jamais un indice. Détail : `tasks/realtime-sync-audit-2026-08-24-cycle125.md`, `tasks/lessons.md` § 275.

   **Le second suivi du cycle 122 est SOLDÉ au cycle 124 : le fil push porte enfin `content` et `originalLanguage`.** `NotificationService.prePersistMessage` (NSE) lisait ces DEUX clés ; le payload n'en portait AUCUNE (vérifié sur `createNotification`, seul producteur de `data`, et sur `PushNotificationService:785` qui pose `{...payload.data}`). La bulle pré-enregistrée au démarrage à froid était donc VIDE **et** étiquetée « en » pour tout le monde — la seconde moitié n'était pas dans le suivi, et c'est elle qui faussait la résolution du Prisme sur cette bulle. Ce qui voyage est l'ORIGINAL, jamais la traduction : `MessageRecord.content` est le champ d'origine, `originalLanguage` son étiquette, et la traduction a déjà `translatedContent`. `PreviewPrismBasis` y répond à une SECONDE question, distincte de « qu'est-ce qui traduit cet aperçu ? » : seul `message-content` EST le contenu du message.

   **Le suivi du cycle 124 — « les éventails RÉPONSE et MENTION ne portent aucune transcription » — est SOLDÉ au cycle 125 bis**, et ce qui QUALIFIE leur aperçu au cycle 126 (voir ci-dessus).

   **Le Prisme a DEUX faces, et les quatre familles ci-dessus n'en décrivent qu'une (cycle 125).** Elles gouvernent le CONTENU — quelle traduction servir. La seconde face est le **CADRAGE** : dans quelle langue on ADRESSE un lecteur (sujet d'e-mail, titre de notification, format de date). `NotificationService.resolveRecipientPrism` porte la distinction dans son doc-comment et rend les deux depuis UNE lecture — mais elle ne servait que les éventails de messages. **Dix-sept sites du gateway écrivaient vers un destinataire NOMMÉ en lisant `user.systemLanguage` en direct** : les onze e-mails transactionnels (réinitialisation de mot de passe, lien magique, vérification, changement de contact, suppression de compte, invitation, digest, diffusion), les notifications de diffusion et de nouvelle connexion, et les deux jumeaux de `SocketUser.language`. Site UNIQUE désormais : `services/gateway/src/utils/recipient-language.ts`, qui tient ENSEMBLE la forme du `select` et la descente — c'est la projection trop étroite, pas l'appel manquant, qui rend une descente impossible en aval sans qu'aucun témoin ne rougisse. Détail : `tasks/lessons.md` § Leçon 276.

   **Une énumération de sites porte DEUX affirmations** : « ces sites appliquent la règle » (vérifiable) et « ce sont les sites où la règle s'applique » (presque jamais vérifiée). Avant de se fier à une telle liste, demander : **cette règle gouverne-t-elle un autre TYPE DE CONTENU, et qui le résout ?** Le Prisme s'appliquant à TOUT le contenu (§ Cohérence), la réponse est en général oui — la troisième famille a été trouvée en posant exactement cette question. Et **un témoin de RANG s'écrit sur un rang AUTRE que le premier** : au rang 1, le court-circuit interdit et la règle juste rendent le même verdict, donc le témoin ne peut pas tomber. Détail : `tasks/lessons.md` § Leçon 261.

   **Web — suivi du cycle 120, SOLDÉ au cycle 123.** Les trois surfaces restées au rang 1 descendent désormais le prisme ordonné : COMMENTAIRES (`CommentList` → `CommentReplies` → `CommentThread` → `CommentItem`, câblé chez ses quatre hôtes : `PostDetail`, `StoryViewer`, `ReelsFeedScreen`), STATUS (`StatusBar` → `StatusPopover`, câblé par `PostsFeedScreen`) et STORIES (`StoryViewer`, les deux chemins legacy).

   **Le cycle 123 y a trouvé un défaut que « correct mais pas rang-conscient » ne décrivait pas** : sur le chemin legacy de `StoryViewer`, le CORPS de la story rendait `story.content` — l'ORIGINAL — pendant que la puce de `TranslationToggle` (montée `showContent={false}`, l'hôte positionnant le texte lui-même) annonçait la langue résolue. Le Prisme était ANNONCÉ sans être APPLIQUÉ. Le relais existait (`onDisplayedChange`) et sa documentation nommait exactement ce risque ; personne ne l'avait branché.

   > **Un hôte qui monte le résolveur en `showContent={false}` contracte une DETTE : rendre lui-même ce que le résolveur annonce.** Sans le relais, la surface est pire qu'une surface non câblée — elle AFFIRME une langue qu'elle ne sert pas. Chercher les hôtes de ce motif (`showContent={false}` sans `onDisplayedChange`) avant de conclure qu'une surface est « correcte ».

   Cette requête, lancée dans le même cycle, a rendu une QUATRIÈME surface : **`PostCard` — le corps d'un post dans le FIL**, rangé dans « fait » depuis le cycle 120 parce que `preferredLanguages` y arrivait bien. Ce qui manquait était en AVAL du résolveur. Le défaut y était pire qu'ailleurs : la variante `block` rend une zone « traductions disponibles » cliquable, et cliquer n'y changeait **rien** — le contrôle était INERTE. **Suivre une donnée jusqu'à son consommateur s'arrête un cran trop tôt : la suivre jusqu'au PIXEL.** Le témoin qui l'attrape n'interroge ni le rang ni le prisme, mais l'effet : « cliquer une traduction change-t-il le texte lu ? » — la loi 4 (« un contrôle existe s'il a un effet ») est ici un test de Prisme déguisé.

   Deux corollaires de forme, tirés du même lot :
   - **`preferredLanguages` est un tableau, donc son IDENTITÉ change à chaque rendu chez tout hôte qui le construit en ligne.** Couplé au relais, cela bouclait sans fin (effet → état de l'hôte → rendu → nouvelle identité → effet). L'effet de `TranslationToggle` dépend donc des trois PRIMITIVES servies, jamais de l'objet qui les porte : la boucle se referme à la source, quel que soit le site d'appel.
   - **Une chaîne de langues alimentant un résolveur se déclare AVANT les retours anticipés du composant** — dès qu'elle passe en `useMemo`, elle devient un hook.

   **Note de convergence (merge itération 257 ↔ cycle 123).** Les deux passes ont câblé COMMENTAIRES et STATUS en parallèle, à l'identique — l'implémentation retenue est celle de l'itération 257, la première mergée. L'itération 257 avait de plus IDENTIFIÉ le défaut du texte legacy de story et l'avait explicitement DIFFÉRÉ, en nommant la bonne raison : « y descendre le prisme désynchroniserait la pastille du texte — il faut d'abord câbler `onDisplayedChange` ». C'est exactement ce que le cycle 123 a fait, sur `StoryViewer` **et** sur `PostCard`, où le même motif était resté invisible parce que la surface figurait déjà dans la colonne des sites conformes.


## Architecture

```
apps/web (Next.js 15)        apps/ios (SwiftUI)
         ↓ WebSocket/HTTP              ↓ REST/WebSocket
services/gateway (Fastify 5 + Socket.IO + ZMQ)
         ↓ ZeroMQ (PUSH/SUB)
services/translator (FastAPI + PyTorch + Whisper + TTS)
         ↓
MongoDB 8 (Prisma) + Redis 8
```

### Monorepo Structure
```
apps/web/          → Next.js 15 frontend (port 3100)
apps/ios/          → SwiftUI iOS app
services/gateway/  → Fastify 5 API + WebSocket (port 3000)
services/translator/ → FastAPI ML service (port 8000)
packages/shared/   → TypeScript types, Prisma schema, encryption
packages/MeeshySDK/ → Swift SDK for iOS
infrastructure/    → Docker, Traefik, env configs
scripts/           → Deployment & maintenance scripts
tests/             → E2E tests (Playwright)
docs/              → Architecture & feature documentation
```

### Build System
- **Package Manager**: **bun 1.3.14 (default locally — CI parity)**, pnpm 9+ (required: Turborepo runs on pnpm). The CI runs install/build/tests under bun by default (`PACKAGE_MANAGER` defaults to `bun`, `BUN_VERSION: '1.3.14'`). Run bun locally too — `node/jest` reports a higher, non-CI coverage number (gateway: ~67.5% node vs **62.9% bun**, identical on Node 22; the gap is bun-vs-node, NOT a Node version gap — all CI is Node 22).
- **Orchestrator**: Turborepo with remote caching
- **Workspaces**: `apps/*`, `services/*`, `packages/*`

### Local Test Parity (bun)
Reproduce CI coverage locally — the prerequisites below are what CI does automatically:
```bash
bun install --ignore-scripts                                  # see note below before using plain `bun install`
cd packages/shared && npx prisma generate --generator client  # else ~17 gateway suites fail (commentId/PostMediaSelect)
cd packages/shared && bun run build                           # else SocialEventsHandler fails (CommentMediaUpdatedEventData missing from dist)
cd services/gateway && bun run test:coverage                   # 740/740 suites green
```

**`bun install` échoue derrière un proxy sortant.** Le postinstall de `grpc-tools`
télécharge un binaire préconstruit via une URL S3 que le proxy réécrit, et
`node-pre-gyp` rend `Could not parse s3 bucket name from virtual host url` — l'install
s'arrête là, laissant des arbres de workspace partiels. `bun install --ignore-scripts`
passe et suffit pour TOUS les gates du gateway : `grpc-tools` n'en sert aucun. Ne pas
lire l'échec comme un dépôt cassé.

Note de layout : bun 1.3 installe en mode ISOLÉ (store `node_modules/.bun` +
arbres de symlinks par workspace). Un `ls node_modules` maigre à la racine est
NORMAL — vérifier plutôt `services/gateway/node_modules` et `node_modules/.bun`.
Keep bun current with `bun upgrade`; bump `BUN_VERSION` in `.github/workflows/{ci,docker}.yml` in lockstep so local and CI never diverge.

## Development Philosophy

### TDD is Non-Negotiable
Every line of production code must be written in response to a failing test. RED-GREEN-REFACTOR in small, known-good increments:
1. **RED**: Write failing test first (NO production code without failing test)
2. **GREEN**: Write MINIMUM code to pass test
3. **REFACTOR**: Assess improvement opportunities (only if adds value)

Each increment leaves the codebase in a working state.

### Testing Principles
- Test **behavior**, not implementation
- Test through public API exclusively
- Use factory functions for test data (no `let`/`beforeEach` mutation)
- 100% coverage through business behavior
- No 1:1 mapping between test files and implementation files
- Use real schemas/types in tests, never redefine them

### TypeScript Guidelines
- **Strict mode always** across all TypeScript services
- No `any` types - ever (use `unknown` if type truly unknown)
- No type assertions without justification
- Prefer `type` over `interface` for data structures
- Reserve `interface` for behavior contracts only
- Define schemas first (Zod), derive types from them at trust boundaries

### Code Style
- **Immutable data only** - no mutation
- Pure functions wherever possible
- No nested if/else - use early returns or composition
- No comments - code should be self-documenting
- Prefer options objects over positional parameters
- Use array methods (`map`, `filter`, `reduce`) over loops
- **No redundant boolean + timestamp pairs** - a nullable `DateTime?` field is sufficient: `null` = false, non-null = true with timestamp. Never add a separate boolean (e.g. use `deletedAt: DateTime?` NOT `isDeleted: Boolean` + `deletedAt: DateTime?`)

### Preferred Tools
- **Language**: TypeScript strict mode (JS services), Swift (iOS), Python (translator)
- **Testing**: Jest/Vitest + React Testing Library (web), pytest (Python), XCTest (iOS)
- **Validation**: Zod (TypeScript), Pydantic (Python)
- **State**: Zustand (web), SwiftUI @Published (iOS)

### iOS TDD Requirements
- Every NEW service MUST define a protocol BEFORE implementation (name: `{ServiceName}Providing`)
- Protocols live in same file as concrete type, above the class declaration
- All ViewModels accept dependencies via init injection with `.shared` defaults
- Every PR MUST include tests for changed behavior
- Use XCTest for all iOS tests (Swift Testing for SDK pure model tests)
- `./apps/ios/meeshy.sh test` MUST pass before any commit
- Mock pattern: `Mock{ServiceName}` conforming to protocol, with `Result<T, Error>` stubs + call counts
- Test naming: `test_{method}_{condition}_{expectedResult}`

## Instant App Principles (Non-Negotiable)

These principles are mandatory alongside TDD. Reference: `docs/superpowers/specs/2026-03-17-architecture-bible-design.md`

### Cache-First, Network-Second
Every screen MUST display cached data IMMEDIATELY if available.
No spinner when cache has data (even stale). Skeleton/placeholder ONLY on empty cache (cold start).

### Stale-While-Revalidate
Use CacheResult<T> (.fresh/.stale/.expired/.empty) and distinguish each case.
Serve .stale immediately + silent background refresh. NEVER call .value directly — handle each case.

### Optimistic Updates
Every user action gets instant feedback. Network confirms after.
Capture snapshot → apply local → send network → rollback on failure.

### Offline Graceful Degradation
App MUST work offline for reads. Write actions queued (OfflineQueue). FIFO flush on reconnect.

### Zero Unnecessary Re-render
Leaf views: NO @ObservedObject on global singletons. Pass primitive values (isDark: Bool).
Use @Environment(\.colorScheme) for simple dark/light. Equatable + .equatable() on list cell views.

### Single Source of Truth
Each data type has ONE source. No reimplementation.
Language resolution: resolveUserLanguage() from packages/shared/.
Types: packages/shared/types/. iOS models: packages/MeeshySDK/.
Response format: sendSuccess()/sendError() from utils/response.ts.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Parallel Worktree Strategy

Pour les larges feature sets, utiliser git worktrees pour le travail agent parallele:

### Setup
```bash
git worktree add ../v2_meeshy-{branch-name} -b {branch-name} main
```

### Regles
1. Chaque worktree possede des fichiers specifiques -- JAMAIS deux worktrees sur le meme fichier
2. project.pbxproj: gere par le DERNIER worktree a merger uniquement
3. Ordre de merge: branches pure-UI d'abord, branches avec fichiers partages en dernier
4. Chaque agent lance `./apps/ios/meeshy.sh build` dans son worktree pour verifier
5. Apres tous les merges, clean build depuis main pour catcher les problemes d'integration

### Convention de nommage
```
feat/{area}-{feature}  ex: feat/settings-legal, feat/settings-account
```

### Worktree Directory
```
../v2_meeshy-{branch-name}  (sibling du repo principal)
```

## Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Minimal code impact.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **SDK Purity**: Le SDK (`packages/MeeshySDK/`) fournit des **building blocks** (atomes, services low-level, models, rule engines stateless). L'**orchestration UX produit** (View wrappers cascadant cache → downloader → policy, ViewModels, décisions "quand auto-DL", "quelle UI cascade") reste **app-side** (`apps/ios/Meeshy/...`, `apps/web/...`). Test du grain : si le composant appelle des shared singletons nommés Meeshy (CacheCoordinator stores nommés, MediaDownloadPreferencesStore, NetworkConditionMonitor) + encode une règle "quand faire X" → app. S'il prend des paramètres opaques et reste agnostique → SDK. Voir `packages/MeeshySDK/CLAUDE.md` pour la règle détaillée et le tableau de placement.

## Critical Rules

### Event Naming Convention
Socket.IO events use `entity:action-word` format with **hyphens** (NOT underscores):
```
message:send-with-attachments   (client → server)
message:new                     (server → client)
reaction:added                  (server → client)
```
Source of truth: `packages/shared/types/socketio-events.ts`

### Docker Environment Variables
**NEVER quote YAML env var values** in docker-compose files:
```yaml
# CORRECT
NEXT_PUBLIC_API_URL=https://gate.meeshy.me

# WRONG - causes double-quoting syntax errors in JS
NEXT_PUBLIC_API_URL="https://gate.meeshy.me"
```

### Database
- **MongoDB 8** with replica set (NOT PostgreSQL - copilot-instructions.md is outdated)
- **Prisma ORM** - Schema at `packages/shared/prisma/schema.prisma`
- IDs are MongoDB ObjectIds (24-char hex strings)

### Authentication
- **Registered users**: JWT via `Authorization: Bearer {token}`
- **Anonymous users**: Session token via `X-Session-Token` header (NO encryption)
- Roles: BIGBOSS > ADMIN > MODERATOR > AUDIT > ANALYST > USER

### Type Safety
- All shared types in `packages/shared/types/` - single source of truth
- Use `@meeshy/shared` imports across services
- Prisma schema generates DB types; manual types extend them
- NO `any` in shared package - use `unknown` with validation

## Development Environment

### Local Services (tmux "meeshy")
- Window 0: translator (FastAPI, port 8000)
- Window 1: gateway (Fastify, port 3000)
- Window 2: web (Next.js, port 3100)

### Docker Environments
| Environment | Compose File | SSL | Domains |
|-------------|-------------|-----|---------|
| dev | docker-compose.dev.yml | HTTP | localhost:3100/3000/8000 |
| local | docker-compose.local.yml | mkcert | *.meeshy.local |
| prod | docker-compose.prod.yml | Let's Encrypt | meeshy.me |

### Production
- Server: `root@meeshy.me` at `/opt/meeshy/production/`
- Production docker-compose.yml differs from repo (different container/image names)
- Container names: `meeshy-frontend`, `meeshy-gateway`, `meeshy-translator`
- Healthcheck ~30s before Traefik routes traffic

### API Access & Authentication
**All API routes are prefixed** with `/api/v1/`:
```
Production: https://gate.meeshy.me/api/v1/
Staging:    https://staging.meeshy.me/api/v1/
Local:      http://localhost:3000/api/v1/
```

**Login endpoint**: `POST /api/v1/auth/login`
```bash
curl -X POST https://gate.meeshy.me/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<user>","password":"<pass>"}'
```
Response: `{ data: { token: "jwt...", user: { ... } } }`

**Authenticated requests**: `Authorization: Bearer {token}`
```bash
curl https://gate.meeshy.me/api/v1/conversations?limit=10 \
  -H 'Authorization: Bearer {token}'
```

**Common API paths**:
| Resource | Endpoint |
|----------|----------|
| Login | `POST /api/v1/auth/login` |
| Register | `POST /api/v1/auth/register` |
| Conversations | `GET /api/v1/conversations` |
| Messages | `GET /api/v1/conversations/:id/messages` |
| User profile | `GET /api/v1/users/:id` |
| Update profile | `PATCH /api/v1/users/profile` |

### iOS Build
Always use `./apps/ios/meeshy.sh`:
```bash
./apps/ios/meeshy.sh build   # Build only (non-blocking)
./apps/ios/meeshy.sh run     # Build+install+launch+logs (BLOCKS)
```

### Test Credentials
Stored out-of-tree in `apps/ios/fastlane/.env` (gitignored). The
fastlane `release` lane reads `DEMO_USER` / `DEMO_PASSWORD` from
there and forwards them to App Review. CI injects the same vars from
GitHub Actions secrets (see `.github/workflows/ios-release.yml`).
Ask the team for the values or pull from the production password
manager — never inline them in this file again.

See `apps/ios/fastlane/SECRETS.md` for the full list of ENV vars
required by the fastlane lanes.

### Redis Rate Limit Reset
```bash
docker exec meeshy-local-redis redis-cli DEL "ratelimit:auth:login:ip:{ip}:{prefix}"
```

### Prisma Schema vs MongoDB Reality
Les champs de preferences de traduction (`translateToSystemLanguage`, `translateToRegionalLanguage`, `useCustomDestination`) sont maintenant modélisés dans le schema Prisma et utilisables dans `select`. Les champs `autoTranslateEnabled` (sur Conversation) et `profileCompletionRate`, `registrationCountry` (sur User) sont aussi modélisés. Plus besoin de casts `(user as any)`.

## Key Patterns

### Conversation Accent Color
Each conversation has a unique, deterministic accent color computed from its metadata:
```
primary = blend(languageColor×0.30, typeColor×0.30, themeColor×0.40)
secondary = hueShift(primary, +30°)
accent = hueShift(primary, −30°)
```
- Source: `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift`
- Access: `conversation.accentColor` (hex string), `conversation.colorPalette` (primary/secondary/accent)
- Fallback: `DynamicColorGenerator.colorForName(name)` (hash → 20-color palette)
- Rule: ALL conversation-context components MUST use `accentColor`, never hardcode colors
- Semantic colors (error, success) remain static via `MeeshyColors`

### User Presence (source de vérité + palette)
États dérivés de `isOnline` (backend, autoritatif — garde anti-stale jusqu'à 5 min) + `lastActiveAt` (décroissance 60s/3min/5min) — règle produit 1/3/5 (2026-07-20) :
`online` (isOnline OU actif ≤ 60s) → **vert** `#34D399` (pulse) · `away` (≤ 3min) → **orange** `#FBBF24` · `idle` (≤ 5min) → **gris AFFICHÉ** `#9CA3AF` · `offline` (> 5min OU aucune donnée) → **aucun point**.
- **Offline = pas de pastille sur les avatars** (comme WhatsApp). Le gris `#9CA3AF` reste défini dans les maps centrales (`PRESENCE_DOT_CLASS.offline`, `PresenceState.offline.dotColor`) pour les affichages LABELLISÉS explicites (en-têtes de section « Hors ligne », badge story-intro, texte « vu il y a X »), mais les dots d'avatar ne le rendent jamais.
- Source de vérité TS : `packages/shared/utils/user-presence.ts` (`getUserPresenceStatus`) ; miroirs : iOS `UserPresence.state(now:)` (PresenceModels.swift), Android `Presence.kt` — toute évolution touche les 3 sites
- Mapping couleur CENTRAL (ne jamais redéclarer localement) : web `PRESENCE_DOT_CLASS`/`PRESENCE_BADGE_CLASS` (`apps/web/lib/user-status.ts`), iOS `PresenceState.dotColor` (`MeeshyUI/Theme/PresenceStyle.swift`), Android `meeshyPresenceDotColor` (`MeeshyAvatar.kt`, renvoie `null` pour offline = pas de dot)
- **typing:start reçu = preuve d'activité** : les clients forcent localement online (iOS `PresenceManager.noteActivity`, web `TypingService` → user-store) — une personne qui écrit est TOUJOURS verte

### API Response Format (all services)
```typescript
{ success: boolean, data?: T, error?: { code, message }, pagination?: PaginationMeta }
```

### ZMQ Communication (Gateway ↔ Translator)
- Gateway PUSH → Translator PULL (port 5555)
- Translator PUB → Gateway SUB (port 5558)
- Multipart frames: Frame 1 = JSON metadata, Frames 2+ = binary data
- `binaryFrames[0]` is first binary (NOT index [1])

### Audio Pipeline
- Audio attachments go through REST `POST /messages` (primary) OR the `message:send-with-attachments` socket event (fallback when REST fails)
- The pipeline fires on BOTH paths — `MessageProcessor.handleAttachments` triggers `processAudioAttachments` regardless of source (no `source` gate)
- 3 stages: Transcription (Whisper) → Translation (NLLB) → TTS (Chatterbox)

### Async EventEmitter Hazard
- `emit()` does NOT await Promises
- Always wrap async Socket.IO/EventEmitter listeners in try/catch

## Subdirectory CLAUDE.md Files
Each major directory has its own CLAUDE.md with domain-specific conventions:
- `apps/web/CLAUDE.md` - Next.js frontend patterns
- `apps/ios/CLAUDE.md` - SwiftUI iOS patterns
- `services/gateway/CLAUDE.md` - Fastify API patterns
- `services/translator/CLAUDE.md` - FastAPI ML patterns
- `packages/shared/CLAUDE.md` - Shared types & schema
- `packages/MeeshySDK/CLAUDE.md` - Swift SDK (core + UI targets)
- `infrastructure/CLAUDE.md` - Docker & deployment

## Architectural Decision Records
Each active development directory has a `decisions.md` file documenting key architectural choices:
- `apps/web/decisions.md` - State, routing, auth, styling, i18n, build decisions
- `apps/ios/decisions.md` - MVVM, navigation, singletons, cache, security decisions
- `services/gateway/decisions.md` - Framework, WebSocket, ZMQ, encryption, rate limiting decisions
- `services/translator/decisions.md` - ML models, TTS backends, worker pool, package manager decisions
- `packages/shared/decisions.md` - Type system, validation, events, database, API format decisions
- `packages/MeeshySDK/decisions.md` - Dual-target, networking, sockets, cache, auth decisions

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
