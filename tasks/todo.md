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
- Leçon : `tasks/lessons.md` § 270.

### Lot 2 (cycle 123 bis) — la JUMELLE, posée dans le MÊME lot

La règle de `services/gateway/CLAUDE.md` appliquée au correctif ci-dessus rend une mesure d'une
ligne : **`protectedPreview()` n'avait qu'UN appelant de production dans tout le dépôt.** Trois
autres sites copiaient le texte d'un message sans masque, dont DEUX vers des tiers.

- [x] `createReactionNotification` — les drapeaux entrent au `select` ; extrait OMIS si protégé.
- [x] `notifyNewlyMentioned` (édition) — masque + `previewBasis` pour les ENTRANTS.
- [x] `reproduceEditedMessageNotifications` — une édition ne DÉMASQUE plus les lignes déjà
      notifiées (le placeholder ne dérive pas du contenu : rien à réécrire).
- [x] Les deux relectures sont fail-CLOSED et se font CHEZ la garde, pas via ses paramètres.
- [x] 8 témoins, **5 tombent** avant correctif ; le secret est cherché dans la charge ENTIÈRE.

### Suivi MESURÉ (non hérité)

- `prePersistMessage` (NSE iOS) — corps VIDE au démarrage à froid. Hérité du cycle 122, Swift,
  non exerçable ici. Toujours ouvert.
- La piste AUDIO traduite d'un vocal n'est pas attachée à la bannière (le fichier joint reste
  l'original) — absence nommée, non instruite.
- **Un message PROTÉGÉ est librement éditable** (mesuré : `messageEditAdmission` /
  `messageEditContent` ne portent aucun de ces drapeaux). Ce lot en ferme les conséquences côté
  notifications ; la question produit — « éditer un éphémère devrait-il être permis ? » — n'est
  pas tranchée ici.


---

# Cycle 123 — le Prisme ANNONCÉ sans être APPLIQUÉ (web)

## Point de départ
Suivi mesuré des cycles 120/122 : trois surfaces web restées au rang 1
(commentaires, stories, status), qualifiées « CORRECTES, seulement pas encore
rang-conscientes ». Solder ce suivi EN ENTIER (leçon 265).

## Ce que le suivi décrivait mal
Deux des trois l'étaient. La troisième — `StoryViewer` — ne l'était pas : son
corps de story rendait `story.content` (l'ORIGINAL) pendant que la puce de
`TranslationToggle` (montée `showContent={false}`) annonçait la langue résolue.
Le relais prévu pour ce cas (`onDisplayedChange`) n'était branché nulle part.

Chercher le motif — `showContent={false}` SANS `onDisplayedChange` — a rendu
une QUATRIÈME surface : `PostCard`, le corps d'un post dans le FIL, rangé dans
« fait » depuis le cycle 120. Défaut pire : la zone « traductions disponibles »
y est cliquable, et cliquer ne changeait RIEN — contrôle inerte.

## Lots
1. `StoryViewer` corps legacy — relais `onDisplayedChange` + `preferredLanguages`
2. `StoryViewer` overlays legacy — `resolvePrismeText` délègue à la SSOT
   `resolvePrismTranslation` (rang 1 seul + préfixe sur-matchant → chaîne ordonnée)
3. `PostCard` corps du fil — relais `onDisplayedChange`
4. `CommentItem`/`CommentList`/`CommentReplies`/`CommentThread` + `StatusBar` —
   prop `preferredLanguages`, câblée chez les 4 hôtes
5. `TranslationToggle` — effet de notification sur les 3 PRIMITIVES servies
   (une prop tableau non mémoïsée bouclait sans fin)

## Témoins (9, tous mesurés)
- 4 de RANG (rang 2 servi quand le rang 1 manque) — StoryViewer corps + overlay,
  CommentItem, StatusBar
- 3 anti-régression (original quand aucune langue du prisme n'est servie)
- 1 de PIXEL (le corps du post sert la traduction, pas seulement la puce)
- 1 d'INERTIE (cliquer une traduction change le texte lu)

Le témoin StatusBar a été vérifié falsifiable par mutation (retrait de la prop
→ il tombe), n'ayant jamais tourné proprement en RED.

## Convergence avec l'itération 257 (merge manuel)

L'itération 257 a câblé COMMENTAIRES et STATUS en parallèle, à l'identique ; son
implémentation est celle retenue au merge (première mergée). Elle avait de plus
IDENTIFIÉ le défaut du texte legacy de story et l'avait explicitement DIFFÉRÉ,
en nommant la bonne raison — « il faut d'abord câbler `onDisplayedChange` ».
Ce cycle l'a fait, sur `StoryViewer` ET sur `PostCard`, où le même motif restait
invisible parce que la surface figurait déjà parmi les sites conformes.

Numérotation des leçons : leur 266 (cycle 122, « un contenu RÉSOLU n'est pas un
contenu SERVI ») a atterri la première et garde son numéro ; la nôtre devient
267, avec un renvoi croisé — les deux passes ont trouvé la même forme de défaut
le même jour, sur deux couches différentes.


---
