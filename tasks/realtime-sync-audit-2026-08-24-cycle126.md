# Cycle 126 — l'aperçu composé avait TROIS consommateurs et UN seul câblage

Date : 2026-08-24 · Branche : `claude/keen-hamilton-veokcs` · Base : `f11c5136`

## Le symptôme

**Répondre à quelqu'un par un vocal, une photo, une vidéo ou un fichier lui
poussait une bannière au CORPS VIDE** — pendant que tous les autres membres de la
conversation recevaient « 🎤 Message vocal · 0:12 » ou la transcription entière.
Le destinataire le plus directement concerné était le seul à ne rien lire.

## L'audit

`messageNotificationFanOut` COMPOSE, une fois par message, ce que sa bannière
donne à voir. Un seul de ses TROIS lots le lisait. Mesuré sur un même message :

| valeur composée par l'éventail | `regular` | `reply` | `mentions` |
|---|---|---|---|
| `notificationPreviewForPush` (transcription ⊃ contenu) | ✅ | ❌ `notificationPreview` | ❌ |
| `pushPreviewBasis` (`transcript` / `protected-placeholder`) | ✅ | ❌ `previewBasis` | ❌ |
| `attachmentInfo` (média + étiquettes) | ✅ | ❌ jamais | ❌ |
| `notificationLocKey` (verrou du cycle 125) | ✅ | ❌ jamais | ❌ |
| corps via `buildMessageNotificationBodyI18n` | ✅ | ❌ `servedPreview` nu | ❌ |
| `messageCreatedAt` / `messageType` (bulle NSE) | ✅ | ❌ | ❌ |

Pour un message SANS texte, la matière brute (`Message.content`) est la chaîne
VIDE — et sans les étiquettes de média, le corps n'a **rien** à montrer.
`buildMessageNotificationBodyI18n`, la fonction qui rend un média lisible
(« 📷 Photo · 1024×768 », badges `+N`), n'avait qu'un appelant.

Le lot de mentions ne subissait le corps vide qu'à la marge — une mention se
parse depuis le contenu, donc le contenu existe. Mais il perdait tout le reste :
la transcription d'un vocal légendé, le rich-push, le verrou de protection, et
l'horloge de sa bulle.

## La leçon (§ 277)

Les cycles 121–125 ont posé quatre questions à un résolveur de Prisme : élit-il
le bon rang · qui AFFICHE ce qu'il élit · que transporte-t-il À CÔTÉ · le texte
qu'il reçoit a-t-il le droit d'être là. La cinquième ne s'adresse pas au
résolveur mais à la VALEUR qu'il rend :

> **Qui d'AUTRE aurait dû l'afficher ?** Compter les consommateurs POSSIBLES
> d'une valeur composée avant ses consommateurs RÉELS.

C'est la leçon 271 (« un helper à un appelant est un inventaire ») portée sur une
VARIABLE LOCALE — qui n'a pas de nom exporté à compter, donc que `grep` ne trouve
pas. Ce qui la rend comptable, c'est de la NOMMER.

**Pourquoi elle a survécu deux cycles.** Les cycles 124 et 125 l'ont MESURÉE et
classée « décision produit, pas correction de Prisme ». Juste sur la taxonomie,
faux sur la conclusion : une bannière au corps vide n'est pas une décision
produit. Devant un suivi ainsi étiqueté, demander *quel produit choisirait ça ?*

## Le correctif

Un site de composition, trois consommateurs.

1. **`MessageBannerMedia`** — le jeu de champs média, NOMMÉ. Il n'existait qu'en
   ligne dans la signature de `createMessageNotification`, donc dans un seul de
   ses trois consommateurs possibles ; les deux autres ne pouvaient pas le
   recevoir. Les trois signatures le portent désormais par intersection, sans
   qu'aucun appelant existant change de forme.
2. **`messageBannerBody()`** — le corps : le texte servi par le Prisme, ou, quand
   ce texte est vide, l'étiquette détaillée du média, plus les badges `+N`, dans
   la langue de CADRAGE du destinataire. Extrait de `createMessageNotification`,
   appelé par les trois.
3. **`bannerMediaContext()` / `bannerMediaMetadata()`** — les deux projections du
   média (le fil push que la NSE lit, la ligne `Notification` persistée).
4. **`messageClockFields()` + `MessageBannerSource`** — l'horloge SERVEUR de la
   bulle pré-enregistrée. `loadMessagePrismSource` lit deux colonnes de plus dans
   la requête qu'il faisait déjà ; le TYPE reste distinct de `MessagePrismSource`,
   les deux venant de la même lecture sans répondre à la même question.
5. **L'éventail** sert `bannerPreview` + `bannerFields` aux trois lots ; le lot de
   mentions RÉPAND ce qui reste plutôt que de le recopier champ par champ — un
   champ de bannière ajouté demain arrive aux trois sans qu'on ait à s'en souvenir.

### Deux durcissements en effet de bord

Réponse et mention reçoivent désormais `notificationLocKey`, donc le second
verrou du cycle 125 s'applique à leur charge (jusque-là gardée par rien — elle ne
portait simplement aucun média) ; et leur `previewPrismSource` /
`prePersistedMessageFields` gagnent le `protectedByLocKey` qui leur manquait.

### Pas de changement client, et c'est délibéré

Les clés du fil (`attachmentUrl`, `createdAt`, `messageType`, `notificationLocKey`)
sont celles que la NSE lit déjà pour un `new_message` ; ce lot les fait porter par
deux types de notification de plus, sans en inventer une seule.

## Gates

| gate | résultat |
|---|---|
| `replyMentionBannerMedia.test.ts` (nouveau) | **19 rouges avant / 27 verts après** |
| suites voisines (`notifications/` + `messaging/` + éventail + `NotificationService`) | 35 suites, 709 témoins |
| suite gateway complète (`bun run test:coverage`) | **858/858 suites, 19536 témoins**, exit 0 |
| `services/gateway` `tsc --noEmit` | 0 erreur |
| mutation « réponse + mention reviennent à l'aperçu privé » | **9 témoins tombent** |
| mutation « le corps de la réponse cesse de se composer » | **3 témoins tombent** |
| Swift / Kotlin | non modifiés |

Le témoin qui attrape ce défaut compare les TROIS lots sur le MÊME message :
c'est la seule forme où la divergence est visible. Un témoin par lot passe au
vert sur chacun pris seul.

## Suivi MESURÉ

- **La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste
  traduite du Prisme** (hérité du cycle 123, toujours ouvert). Le corps sert la
  transcription traduite ; le média attaché reste l'audio source.
- `isEncrypted` reste lue par la NSE iOS et n'est jamais émise (cycle 124) —
  piège armé, pas panne.
- Aucun chemin de création n'écrit `isViewOnce` / `isBlurred` sur une
  `MessageAttachment` : le second niveau de `maskedAttachment` reste armé, pas
  encore atteignable (cycle 125).
- **Le lot `regular` reste le seul à faire une relecture VIVANTE du message**
  (son gate d'éligibilité : supprimé / expiré / brûlé en vol). Réponse et mention
  tiennent leur échéance de l'appelant. Ce n'est pas une divergence de bannière
  mais une divergence de GATE : un message soft-supprimé dans la fenêtre de
  l'éventail annonce encore sa réponse et ses mentions. Distinct de ce cycle, et
  non instruit.
