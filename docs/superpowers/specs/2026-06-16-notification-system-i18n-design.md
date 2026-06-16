# Spec — i18n serveur des textes système de notification

- **Date** : 2026-06-16
- **Statut** : Design validé (stratégie + langues), en attente de revue spec
- **Périmètre** : Production. Pas de configuration APN staging.
- **Décisions actées** :
  - Stratégie : **localisation côté serveur**, à la langue résolue du destinataire (Prisme-first).
  - Langues : **8** — `ar, de, en, es, fr, it, pt, zh-Hans`.

---

## 1. Problème

Les textes système des notifications (« a réagi », « a commenté », « vous a mentionné »,
« Appel manqué », « Nouvelle demande de contact », mots de type de pièce jointe, etc.)
sont **codés en dur en français** côté gateway, et reconstruits **en français** côté iOS
(NSE + toast in-app). Un destinataire dont `systemLanguage` n'est pas `fr` reçoit donc
des notifications en français, ce qui viole le **Prisme Linguistique** :
*« le prisme s'applique à TOUT le contenu — messages, transcriptions, métadonnées, previews »*.

## 2. Décision d'architecture — pourquoi le backend

La langue de référence d'un utilisateur Meeshy est `systemLanguage` (config in-app),
priorité 1 du Prisme ; `deviceLocale` n'est que priorité 4. **Seul le serveur connaît
`systemLanguage` de façon fiable au moment de l'envoi.** Une localisation côté client
(loc-key Apple / xcstrings) utiliserait la langue du *device* → non conforme au Prisme.

Le backend offre en plus :
- **une seule source de vérité** couvrant tous les canaux (push APNs, in-app iOS, in-app web, digests email, FCM Android) ;
- **aucun changement de schéma** : `Notification.content` reste une `string`, déjà per-destinataire ;
- réutilisation du **pattern existant `EmailService`** (catalogue `Record<SupportedLanguage, …>`) ;
- liberté grammaticale totale (ordre des mots `ar`/`zh-Hans`) en TypeScript.

Compromis accepté : le texte est **figé à l'envoi** dans la langue d'alors. Sans valeur de
re-localisation live pour des notifications, qui sont des artefacts éphémères et datés.

iOS et web **affichent** le `content` localisé par le gateway au lieu de le reconstruire.

## 3. Source de vérité de la langue

`resolveUserLanguage()` de `packages/shared/utils/conversation-helpers.ts` :
`systemLanguage → regionalLanguage → customDestinationLanguage → deviceLocale → 'fr'`.

Comme `resolveUserLanguage()` peut retourner **n'importe quel code** (l'utilisateur peut
configurer `ja`, `ru`, …), le catalogue doit normaliser et **retomber sur `en`** pour tout
code hors des 8 langues supportées.

## 4. Composants

### 4.1 `packages/shared/utils/notification-strings.ts` (nouveau)

Source unique du catalogue. Miroir structurel de `EmailService.ts`, mais dans `shared`.

```ts
export const NOTIFICATION_LANGUAGES = ['ar','de','en','es','fr','it','pt','zh-Hans'] as const;
export type NotificationLanguage = typeof NOTIFICATION_LANGUAGES[number];

// Normalise un code arbitraire vers une NotificationLanguage supportée.
// 'fr-FR'→'fr', 'pt-BR'→'pt', 'zh'/'zh-CN'/'zh-Hans'→'zh-Hans', inconnu→'en'.
export function normalizeNotificationLanguage(code?: string | null): NotificationLanguage;

// Builder principal. Ne jette jamais ; clé inconnue → chaîne vide défensive.
export function notificationString(
  lang: string | null | undefined,
  key: NotificationStringKey,
  params?: NotificationStringParams,
): string;
```

Le catalogue est un `Record<NotificationLanguage, Record<NotificationStringKey, (params) => string>>`
(builders paramétrés, car la plupart des chaînes interpolent emoji / nom / type de post /
titre de conversation / compteurs de PJ et ont un ordre de mots variable selon la langue).

#### Clés (`NotificationStringKey`) et chaînes de référence (fr / en)

L'inventaire provient de `services/gateway/src/services/notifications/NotificationService.ts` :

| Clé | Params | fr (référence) | en (référence) |
|---|---|---|---|
| `reaction.message` | `emoji` | `a réagi {emoji} à votre message` | `reacted {emoji} to your message` |
| `reaction.comment` | `emoji` | `a réagi {emoji} à votre commentaire` | `reacted {emoji} to your comment` |
| `reaction.commentVerbose` | `actor, emoji, contextSuffix` | `{actor} a réagi {emoji} à votre commentaire{contextSuffix}` | `{actor} reacted {emoji} to your comment{contextSuffix}` |
| `reaction.post` | `emoji, postType` | `a réagi {emoji} à votre {postNoun}` | `reacted {emoji} to your {postNoun}` |
| `comment.your` | `postType` | `a commenté votre {postNoun}` | `commented on your {postNoun}` |
| `comment.generic` | `postType` | `a commenté {article} {postNoun}` | `commented on a {postNoun}` |
| `comment.repliedIn` | `postType` | `a répondu dans {article} {postNoun}` | `replied in a {postNoun}` |
| `comment.reply` | — | `En réponse à votre commentaire` | `Replied to your comment` |
| `comment.replyWithParent` | `preview` | `En réponse à « {preview} »` | `Replying to "{preview}"` |
| `mention` | — | `vous a mentionné` | `mentioned you` |
| `friend.story` | — | `a publié une nouvelle story` | `shared a new story` |
| `friend.post` | — | `a publié un nouveau post` | `shared a new post` |
| `friend.mood` | — | `a publié une nouvelle humeur` | `shared a new mood` |
| `call.missed` | `callType` | `{callIcon} Appel {callLabel} manqué` | `{callIcon} Missed {callLabel} call` |
| `contact.request` | — | `Nouvelle demande de contact` | `New contact request` |
| `contact.accepted` | — | `Demande de contact acceptée` | `Contact request accepted` |
| `repost` | `postType` | `a partagé {repostNoun}` | `shared {repostNoun}` |
| `invitation.group` | `title` | `Invitation au groupe {title}` | `Invitation to group {title}` |
| `invitation.direct` | `actor` | `Nouvelle conversation avec {actor}` | `New conversation with {actor}` |
| `group.added` | `title` | `Ajouté au groupe {title}` | `Added to group {title}` |
| `group.newContact` | — | `Nouveau contact` | `New contact` |
| `attachment.photo` | `details?` | `📷 Photo` | `📷 Photo` |
| `attachment.video` | `details?` | `🎬 Vidéo` | `🎬 Video` |
| `attachment.audio` | `details?` | `🎵 Audio` | `🎵 Audio` |
| `attachment.document` | `details?` | `📄 Document` | `📄 Document` |
| `attachment.files` | `count` | `📎 {count} fichiers` | `📎 {count} files` |
| `login.newDevice.title` | — | `Nouvelle connexion détectée` | `New login detected` |

> **Messages protégés (E2EE / view-once / hidden / ephemeral) — hors périmètre i18n.**
> `protectedMessagePreview()` (216-222) produit des previews **icône-seule** par design
> (confidentialité : aucun mot n'est révélé). Il n'y a donc rien à traduire — on **ne touche
> pas** à ces chaînes (les localiser introduirait du texte, soit un changement de comportement).

Nouns dérivés (sous-clés ou helpers internes, localisés) :
- `postNoun(postType)` : `STORY→story`, `STATUS→statut`, `POST→publication`.
- `repostNoun(postType)` : idem avec l'article correct par langue.
- `callLabel(callType)` : `video→vidéo`, `audio→audio`.
- `article` : géré **par langue** dans le template (fr `votre`/`un`, en `your`/`a`, ar/zh sans article).

Les emoji, icônes (`📷🎬🎵📄📎🔒`), noms propres et titres de conversation restent
**non traduits** (interpolés tels quels).

#### Règles d'interpolation
- Les templates portent des placeholders nommés `{emoji}`, `{actor}`, `{title}`, `{postNoun}`, `{count}`, etc.
- Word order, articles et accords gérés **par langue** dans chaque builder (pas de
  concaténation naïve depuis le TS appelant).
- `ar` : produire la phrase RTL correcte (l'icône/emoji reste en tête comme aujourd'hui).
- `zh-Hans` : pas d'espace avant la ponctuation, pas d'article.

### 4.2 Gateway — `services/gateway/src/services/notifications/NotificationService.ts`

1. **Helper de résolution** (nouveau, privé) :
   ```ts
   private async resolveRecipientLang(userId: string): Promise<string>
   ```
   - `select { systemLanguage, regionalLanguage, customDestinationLanguage, deviceLocale }`
   - appelle `resolveUserLanguage(user, { deviceLocale })`
   - défaut `'fr'` si user introuvable (comportement actuel préservé).
   - mémoïsation par appel de notification (un seul fetch par destinataire).

2. **Remplacement de chaque chaîne FR codée en dur** par
   `notificationString(lang, key, params)`. Sites concernés (inventaire §4.1) :
   lignes ~289 (et la famille d'attachments 262-368), 1224, 1457, 1474, 1491, 1613,
   1721-1723, 1808/1814, 1857, 1896, 2117, 2241, 2287-2288, 2347, 2407, 2444, 2758.
   Note : certaines clés alimentent le **`subtitle`** et non le `content`
   (`comment.reply`, `comment.replyWithParent` ≈2287-2288) — préserver le champ cible
   exact de chaque site.

3. **`protectedMessagePreview()` (198-222)** : **inchangé** — previews icône-seule
   (confidentialité), rien à traduire. Le `locKey` reste émis tel quel (compat NSE — §4.3).

4. **`buildMessageNotificationBody()` et les labels de type PJ** : mots localisés
   (`attachment.*`) ; les métadonnées numériques (`1920×1080`, `2.5 Mo`, `0:34`) et
   les séparateurs `·` restent inchangés ; les badges `+N📷` restent inchangés (emoji + chiffre).

5. **`login_new_device` (2745-2758)** : remplacer le branchement `en/fr` ad hoc par
   `notificationString(lang, 'login.newDevice.title')`.

### 4.3 iOS — `apps/ios/MeeshyNotificationExtension/NotificationService.swift`

- **Supprimer** la reconstruction FR des réactions (≈104-127) : afficher le `content`
  du gateway (désormais localisé). Le corps push provient du gateway pour tous les types.
- La voie `locKey` (`NSLocalizedString`, ≈72-86) reste **inchangée** : filet pour le
  fallback E2EE (déchiffrement échoué), localisé via xcstrings (langue device). Acceptable
  car n'affiche aucun contenu utilisateur — juste un avis générique « message chiffré ».
- Étape d'implémentation : cartographier les lignes exactes des reconstructions FR avant édition.

### 4.4 iOS — `apps/ios/.../MeeshyUI/Notifications/SocketNotificationEvent+Toast.swift`

- Le **corps** du toast in-app consomme le `content` localisé porté par l'événement socket
  au lieu de reconstruire en FR (≈153-180).
- Le **titre** garde le nom de l'expéditeur (pas de traduction) ; le **subtitle** garde
  la résolution Local-First du nom de conversation (`customName`) déjà en place — inchangé.
- Étape d'implémentation : vérifier que l'événement socket transporte bien `content`
  localisé pour chaque type ; adapter les sites de reconstruction FR.

## 5. Flux de données

```
Événement (message/réaction/commentaire/appel/contact/post)
  → resolveRecipientLang(recipientUserId)               [gateway]
  → notificationString(lang, key, params)               [shared]
  → Notification.content (localisé) + payload.body (localisé)
  → APNs / FCM / in-app web
       └─ iOS NSE & toast : AFFICHENT le content gateway (plus de rebuild FR)
       └─ web in-app : titre via i18n frontend (inchangé) + corps = content gateway
```

## 6. Gestion des erreurs / cas limites

- `lang` hors des 8 → `normalizeNotificationLanguage` retombe sur `en`.
- Destinataire introuvable → `'fr'` (comportement actuel).
- Clé absente du catalogue → chaîne vide défensive (jamais d'exception, jamais de crash de notif).
- Variantes régionales (`fr-FR`, `pt-BR`, `zh-CN`) normalisées vers la langue de base.
- E2EE déchiffrement échoué → preview icône-seule (inchangée) ; `locKey` xcstrings en filet.

## 7. Tests (TDD, RED → GREEN)

**shared — `packages/shared` :**
- chaque `NotificationStringKey` existe dans **les 8 langues** (test de complétude itérant `NOTIFICATION_LANGUAGES`).
- `normalizeNotificationLanguage` : `fr-FR→fr`, `pt-BR→pt`, `zh-CN→zh-Hans`, `ja→en`, `null→en`.
- interpolation : placeholders correctement substitués ; emoji/titre non altérés.

**gateway — `NotificationService.pushMessage.test.ts` (étendu) :**
- destinataire `systemLanguage='en'` → `content` en anglais pour réaction / commentaire / mention / appel manqué / contact / repost / invitation / PJ.
- destinataire `systemLanguage='de'` et `='ar'` → langue correcte (au moins 1 cas chacun).
- `deviceLocale` n'override pas `systemLanguage` (cohérence Prisme : `systemLanguage='fr'` + `deviceLocale='en'` → fr).
- destinataire introuvable → `fr`.

**iOS :**
- NSE : un payload avec `content` localisé est affiché tel quel (pas de réécriture FR des réactions).
- toast : le corps reflète le `content` de l'événement, pas une chaîne FR reconstruite.

## 8. Hors périmètre

- **Pas d'APN staging** (consigne).
- **Aucun changement de schéma Prisma.**
- **Web frontend : aucun changement** (titre déjà i18n côté client où `systemLanguage` est dispo ; corps = `content` gateway, désormais localisé).
- **`EmailService` inchangé** (déjà i18n ; mutualisation du catalogue = travail futur, YAGNI ici).
- Pas de rapatriement du titre web vers le backend (incohérence existante connue, sans impact Prisme sur web).

## 9. Réserve qualité

Traductions des 8 langues produites pendant l'implémentation ; **relecture native recommandée
pour `ar` (RTL) et `zh-Hans`** avant déploiement production. Les chaînes de référence `fr`/`en`
sont fixées par cette spec (§4.1).

## 10. Risques

- **Threading de `lang`** dans tous les sites de `NotificationService.ts` : principal coût
  d'intégration ; mitigé par le helper `resolveRecipientLang` mémoïsé.
- **iOS rebuilds** : risque de régression d'affichage si l'événement socket ne porte pas le
  `content` attendu pour un type → couvert par l'étape de cartographie + tests iOS.
- **Qualité ar/zh-Hans** : couvert par la réserve §9.
