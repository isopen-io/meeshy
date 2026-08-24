# Cycle 126 — la bulle pré-enregistrée d'une RÉPONSE ou d'une MENTION était ordonnée par l'horloge du DEVICE

> Le cycle 125 bis (PR #3478, mergée) a soldé la moitié TEXTE du suivi du cycle 124. Ce lot solde
> l'autre : ce qui décide de la PLACE et du RENDU de la bulle que la NSE écrit en base locale.

## Point de départ — un helper partagé qui ne composait que la moitié de son nom

La NSE iOS pré-enregistre une bulle dès qu'un push porte un `messageId` — donc pour les **trois**
éventails de `messageNotificationFanOut`. Elle en écrit quatre champs ; deux venaient du helper
partagé `prePersistedMessageFields`, deux étaient posés **en ligne, chez le seul**
`createMessageNotification` :

| champ NSE | composé par | ce qu'il décide | repli sans lui |
|---|---|---|---|
| `content` | helper partagé (cycle 124) | le texte | `""` |
| `originalLanguage` | helper partagé (cycle 124) | l'étiquette de langue | `"en"` |
| **`createdAt`** | **en ligne, 1 des 3** | **la PLACE dans le fil** | **`Date()` — l'horloge du device** |
| **`messageType`** | **en ligne, 1 des 3** | **le RENDU (audio / image vs texte)** | **`text`** |

Sur un même message, au démarrage à froid :

| destinataire | sa bulle |
|---|---|
| les membres du fil | à sa place, rendue selon son type |
| **celui à qui on répond** | **rangée à l'heure de RÉCEPTION du push, rendue en `text`** |
| **celui qu'on mentionne** | **idem** |

Ces deux éventails ne poussant pas `attachmentMimeType` non plus — décision DÉLIBÉRÉE du
cycle 125 bis —, le repli `mediaMessageTypes` de l'extension ne rattrapait rien : **la bulle d'une
réponse VOCALE était un rectangle de texte vide** jusqu'à la synchro REST, c'est-à-dire pendant
toute la fenêtre où un pré-enregistrement a une raison d'être.

**Pourquoi le cycle 125 bis est passé à côté** : le pré-enregistrement avait DÉJÀ son helper
partagé, appelé par les trois. Ce partage suffisait à le faire passer pour partagé.

> **Un helper PARTAGÉ peut ne composer qu'une PARTIE de ce que son nom promet.** Retournement de
> la leçon 277, pas sa répétition : là il manquait un appelant et le compte était faux ; ici le
> helper est le plus HAUT, ses trois appelants sont les trois éventails, le compte est juste — et
> il manque un CHAMP. La question se pose donc du côté du CONSOMMATEUR (quels champs la NSE
> lit-elle ?), pas du côté des appelants. Deux listes à confronter, jamais un compte à faire.

## Ce qui a été fait

- [x] Témoins RED d'abord — `prePersistStampParity.test.ts`, 8 témoins, **5 rouges avant**
- [x] `MessagePrePersistStamp` + `MessageNotificationSource` — l'estampille et la source du Prisme
      tenues ensemble : mêmes colonnes, même ligne, aucune ne dépend du destinataire
- [x] `loadMessagePrismSource` → `loadMessageNotificationSource` — deux colonnes de plus dans un
      `select` existant, **aucune requête ajoutée**
- [x] `prePersistedMessageFields` compose les QUATRE champs — site unique enfin conforme à son nom
- [x] `createMessageNotification` cesse de poser les deux siens en ligne : les trois éventails
      passent par la même projection, donc ne peuvent plus diverger
- [x] Doc — `tasks/realtime-sync-audit-2026-08-24-cycle126.md`, `tasks/lessons.md` § Leçon 279,
      et le paragraphe « Reste à câbler » de `CLAUDE.md`, périmé depuis le cycle 125 bis, remplacé
      par son état SOLDÉ

## Décisions

**L'estampille traverse les trois refus du helper.** `prePersistedMessageFields` refuse d'écrire le
TEXTE d'un placeholder de protection, d'une transcription, ou d'un aperçu vide. L'estampille n'en
est pas : un horodatage ne révèle que l'instant d'un message que la bannière annonce de toute
façon, un type ne révèle que l'icône que `protectedPreview` compose déjà (« 👁️ 🎵 »). Les retirer
avec le texte n'ajouterait AUCUNE garde et laisserait la bulle d'un message protégé se ranger à
l'heure du device. C'est aussi, exactement, ce que `createMessageNotification` faisait déjà — le
lot ne change rien à l'éventail de référence.

> Symétrie de la leçon 275 : là, une garde écrite pour du texte laissait partir un FICHIER — trop
> étroite. L'étendre ici à des champs qui ne sont pas du contenu la rendrait trop LARGE. Les deux
> erreurs coûtent différemment : trop étroite, elle laisse fuir ; trop large, elle dégrade un
> service sans rien protéger — et personne ne le signale, parce qu'elle ressemble à de la prudence.

**Fail-OPEN inchangé, et une absence ne ment pas.** Une relecture en échec rend une estampille vide
⇒ aucune clé sur le fil ⇒ l'extension retombe sur ses propres replis. Poser une valeur inventée
(l'heure du fan-out, `text`) ferait mentir l'ordre du fil — pire qu'une absence, que le client sait
interpréter.

**Le rich-push n'est toujours pas étendu à la réponse ni à la mention** — inchangé, et toujours
délibéré. Leur bulle porte désormais le bon TYPE sans le FICHIER : elle se rend en bulle
audio/image en attente de téléchargement, plus en rectangle vide. Dégradation correcte, pas
contournement.

## Revue

| gate | résultat |
|---|---|
| `prePersistStampParity.test.ts` (nouveau) | **8 témoins — 5 rouges avant, 8 verts après** |
| suites voisines (`notifications/` + éventail + `NotificationService`) | 42 suites, 760 témoins verts |
| suite gateway complète | **859 suites / 19 527 témoins verts** (exit 0) |
| `services/gateway` `tsc --noEmit` | 0 erreur |
| Swift | non modifié — le fil porte enfin les clés que la NSE lisait déjà |

Trois des huit témoins étaient VERTS avant le correctif, délibérément : la référence
(`createMessageNotification` pousse l'estampille), le fail-open, et « l'éventail de mentions relit
UNE fois ». Ils ne conduisent pas le correctif, ils gardent ce qu'il ne doit pas casser — le
troisième en particulier, parce qu'élargir un `select` est exactement le geste qui invite à ajouter
une requête, et qu'une requête par destinataire ne rougit nulle part.

## Suivi MESURÉ

- `isEncrypted` reste lue par la NSE et jamais émise. **Piège armé, pas panne, et mesuré comme
  tel** : `prePersistMessage` et la branche `locKey` retombent toutes deux sur `encryptedContent`,
  que le fil porte.
- La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste traduite du Prisme.
- Aucun chemin de création n'écrit `isViewOnce` / `isBlurred` sur une `MessageAttachment` : le
  second niveau de `maskedAttachment` reste armé, pas encore atteignable.
- **La bulle pré-enregistrée porte `state: .delivered` et `deliveredAt: nil`** — non instruit ce
  cycle-ci. Un accusé de remise part bien de `postDeliveryReceipt`, mais la ligne locale ne le
  reflète pas, et c'est elle que l'app relit au démarrage à froid.
