# Cycle 122 — le Prisme de la bannière était RÉSOLU mais jamais SERVI

## Défaut

Deux défauts empilés sur la même surface (les notifications poussées) :

1. **Le corps de la bannière ne descendait pas le Prisme.** Le cycle 121 avait corrigé le RANG
   de la traduction élue et l'avait déposée dans `context.translatedContent` → payload APNs/FCM.
   **Aucun client ne lit ce champ** (mesuré : NSE iOS, app iOS, Android, service worker web — zéro
   occurrence). Le seul texte rendu par les trois plateformes est `payload.body`, composé depuis
   l'aperçu ORIGINAL. Le symptôme visé par le cycle 121 — bannière dans la langue de l'expéditeur
   pendant que la ligne de liste est traduite — survivait intact.
2. **Les éventails RÉPONSE et MENTION n'appliquaient AUCUN Prisme** (suivi mesuré du cycle 121) :
   `content: params.messagePreview`, sans `translatedContent` ni `translatedLanguage`, sans même
   la langue de cadrage.

## Correctif

- [x] Extraire la descente en helpers PARTAGÉS (`loadMessagePrismSource`, `resolveServedTranslation`,
      `servedPreview`, `translatedPushFields`) — les trois éventails les appellent, pas de
      cinquième famille divergente.
- [x] Le CORPS servi (push `body` + `Notification.content` persisté) porte le texte du Prisme.
- [x] Réponse + mention : descente complète (corps, champs de fil, langue de cadrage au rang 1).
- [x] Lot de mentions : UNE lecture du message pour N mentionnés ; `createMentionNotification`
      relit quand la source n'est pas fournie — la correction ne dépend pas du câblage.
- [x] Garde de substitution (`previewIsMessageContent`), tranchée par l'éventail :
      un aperçu protégé (placeholder) et une transcription de vocal ne sont PAS `Message.content`.

## Témoins

- [x] 26 témoins de Prisme de notification (16 nouveaux). Mesure du ROUGE : Prisme neutralisé
      (`servedPreview` → identité, `translatedPushFields` → `{}`) ⇒ **16 tombent, 10 restent verts** —
      ces 10 gardent le mode d'échec du CORRECTIF (pas de fuite sur aperçu protégé, règle #1,
      règle #3, original servi), pas celui du défaut.
- [x] Suite gateway complète + `tsc --noEmit` (0 erreur).

## Suivi MESURÉ (non hérité)

- Bannière d'un VOCAL : reste dans la langue de l'expéditeur — la transcription a ses propres
  traductions (`MessageAttachment.translations`), qu'aucun éventail ne descend. Absence assumée
  et nommée par ce lot, pas un oubli.
- `prePersistMessage` (NSE iOS) lit `userInfo["content"]`, clé absente du payload push
  (`PushNotificationService:785` pose `{...payload.data}`) ⇒ corps VIDE au démarrage à froid
  jusqu'à la synchro REST. Défaut DISTINCT du Prisme.

## Leçon

`tasks/lessons.md` § Leçon 265 — un contenu RÉSOLU n'est pas un contenu SERVI.
