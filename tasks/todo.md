# Cycle 123 — la protection gardait le CORPS, pas le FIL ; et le vocal n'avait pas de Prisme

## Point de départ — le suivi MESURÉ du cycle 122

Deux suivis étaient laissés, tous deux mesurés (pas hérités) :

1. **La bannière d'un VOCAL reste dans la langue de l'expéditeur.** Sa transcription a ses
   propres traductions (`MessageAttachment.translations`), qu'aucun éventail ne descend.
   C'est la raison même du `previewIsMessageContent: false` du cycle 122 — une absence
   ASSUMÉE, jamais comblée.
2. `prePersistMessage` (NSE iOS) lit `userInfo["content"]`, clé absente du payload push.
   Défaut DISTINCT du Prisme, hors de ce lot (Swift, non exerçable ici).

## Le défaut trouvé en instruisant (1) — la protection ne gardait qu'une moitié

En cherchant OÙ brancher la source de Prisme d'une transcription, le point de branchement
révèle un second défaut, plus grave que celui visé :

`prismTranslationContext(prismSource, …)` est appelé **INCONDITIONNELLEMENT** dans les trois
éventails (`NotificationService:1723`, `:1896`, `:3483`), pendant que `servedPreview` — le
corps — est, lui, gardé par `previewIsMessageContent`. Conséquence pour un message PROTÉGÉ
(éphémère / vue unique / flouté) :

- le CORPS porte le placeholder (« ⏱️ 💬 24h ») — la protection tient ;
- `data.translatedContent` porte **le texte en clair traduit**, poussé sur le fil APNs/FCM
  (`NotificationService:1367`) et persisté dans la ligne `Notification`.

C'est la leçon 266 dans l'autre sens : le cycle 122 a corrigé un champ que personne ne lit en
oubliant le corps ; ici la protection garde le corps et oublie le champ. **Le témoin du
cycle 122 ne pouvait pas le voir** : il assertait sur `push.body` seul (« la traduction ne
remplace pas le placeholder »), jamais sur ce que la charge TRANSPORTE à côté.

## La cause commune, et le correctif

Deux résolutions parallèles sur la même méthode : une pour le TEXTE servi, une pour les CHAMPS
du fil — gardées différemment. Le correctif les fond en UNE :

- `PreviewPrismBasis` — un type somme qui dit ce que l'aperçu EST (`message-content`,
  `protected-placeholder`, `transcript` + sa source), remplaçant le booléen
  `previewIsMessageContent`. Un booléen et une source séparés pourraient se contredire ;
- **une seule descente par destinataire**, dont le corps ET les champs du fil sont deux
  projections. Ce que le fil transporte décrit désormais ce que la bannière affiche.

## Plan

- [x] `transcriptTranslationTexts()` dans `packages/shared/types/attachment-audio.ts` — la
      SSOT du dépouillement `AttachmentTranslations` → `langue → texte` (soft-delete et
      entrées vides écartées), pour qu'une cinquième famille ne réécrive pas la boucle.
- [x] `PreviewPrismBasis` + descente unique dans les trois éventails de `NotificationService`.
- [x] `messageNotificationFanOut` : lit `translations` sur l'attachment et compose la base
      `transcript` quand l'aperçu poussé EST la transcription.
- [x] Témoins RED d'abord, sur la charge REMISE (`push.body` ET `push.data`).

## Résultat

- **18 témoins neufs**, ROUGE mesuré par deux mutations : `previewPrismSource` neutralisée ⇒
  **10 tombent** ; l'éventail privé de sa base transcription ⇒ **1 tombe**, celui qui garde le
  câblage.
- Gates : gateway **847/847 suites, 19397 témoins** · shared **108 fichiers, 2578 témoins** ·
  `tsc --noEmit` 0 erreur.
- Détail raisonné : `tasks/realtime-sync-audit-2026-08-24-cycle123.md`.
- Leçon : `tasks/lessons.md` § 267.

### Suivi MESURÉ (non hérité)

- `prePersistMessage` (NSE iOS) — corps VIDE au démarrage à froid. Hérité du cycle 122, Swift,
  non exerçable ici. Toujours ouvert.
- La piste AUDIO traduite d'un vocal n'est pas attachée à la bannière (le fichier joint reste
  l'original) — absence nommée, non instruite.
