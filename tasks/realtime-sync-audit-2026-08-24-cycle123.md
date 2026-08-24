# Cycle 123 — la protection gardait le CORPS, pas le FIL ; et le vocal n'avait pas de Prisme

## Point de départ

Deux suivis MESURÉS du cycle 122 (pas hérités — vérifiés en ouvrant les méthodes) :

1. la bannière d'un VOCAL reste dans la langue de l'expéditeur, sa transcription ayant ses
   propres traductions (`MessageAttachment.translations`) qu'aucun éventail ne descend ;
2. `prePersistMessage` (NSE iOS) lit `userInfo["content"]`, clé absente du payload push.

Le (2) est du Swift, non exerçable ici — il reste ouvert et nommé. Ce lot instruit le (1), et
c'est en cherchant OÙ brancher la source d'une transcription qu'un défaut PLUS GRAVE est
apparu au même point de branchement.

## Défaut A — la traduction en clair d'un message PROTÉGÉ partait sur le fil push

`prismTranslationContext(prismSource, …)` était appelé INCONDITIONNELLEMENT dans les trois
éventails (`NotificationService:1723`, `:1896`, `:3483` avant ce lot), pendant que
`servedPreview` — le CORPS — était gardé par `previewIsMessageContent`. Pour un message
éphémère / à vue unique / flouté :

| ce qui part | contenu |
|---|---|
| `push.body` | le placeholder — « ⏱️ 💬 24h » : la protection tient |
| `push.data.translatedContent` | **la traduction EN CLAIR du texte masqué** |
| ligne `Notification` persistée | idem, via `context` |

### La fuite est ATTEIGNABLE, mesurée sur quatre points

Le pipeline de traduction n'a **aucun gate** sur ces drapeaux :

- déclenchement : `messagePostSaveEffects.ts:78-93` → `handleNewMessage`, dont la charge
  (`:84-92`) ne PORTE même pas `isViewOnce` / `isBlurred` / `expiresAt` — un gate aval y est
  matériellement impossible ;
- gates réels de `handleNewMessage` : emoji seul, URL seule, E2EE, contenu vide, aucune langue
  cible. Aucun ne concerne la protection ;
- écriture : `MessageTranslationService._saveTranslationToDatabase` (`:3021-3104`) ne lit que
  `translations` et le triplet de chiffrement ;
- servabilité : `shouldEncryptTranslation` ne marque `isEncrypted` que pour `server`/`hybrid`,
  donc `pushableTranslations` n'écartait pas ces entrées.

Un message à vue unique porteur de texte est donc traduit comme un autre, et sa traduction
était servable sur le canal push.

### Pourquoi aucun témoin ne pouvait le voir

Le témoin du cycle 122 (« ne substitue JAMAIS dans un aperçu PROTÉGÉ ») assertait `push.body`
seul. C'est le BON champ pour la moitié qu'il gardait, et c'est le choix du champ observé qui
rendait l'autre moitié inobservable — la leçon 266 retournée : là le champ observé rendait
inobservable une règle sur ce qu'on SERT, ici sur ce qu'on REFUSE de servir.

## Défaut B — la bannière d'un VOCAL ne descendait aucun Prisme

Suivi (1). `previewIsMessageContent: false` disait « rien ne traduit cet aperçu », alors que la
transcription EST traduite — ailleurs. Un francophone recevant un vocal espagnol lisait donc sa
bannière en espagnol pendant que la ligne de liste de la même application servait la
transcription traduite : le symptôme exact des cycles 118 à 122, sur un cinquième site.

## La cause commune

Deux résolutions PARALLÈLES du même Prisme vivaient dans chaque éventail — une pour le corps,
une pour les champs du fil — gardées différemment. Le défaut A n'est pas un oubli de garde,
c'est une duplication : toute garde ajoutée à l'une aurait manqué l'autre.

Et un BOOLÉEN ne pouvait pas exprimer le défaut B : une transcription n'est pas
« non substituable », elle est substituable par une AUTRE carte.

## Correctif

- **`PreviewPrismBasis`** — type SOMME que l'éventail déclare : `message-content` ·
  `protected-placeholder` · `transcript` + sa source. Remplace le booléen ; les trois formes
  s'excluent par construction (un booléen + une source séparés pourraient se contredire).
- **UNE descente par destinataire** (`previewPrismSource` → `prismTranslation`), dont le corps
  servi (`servedPreview`) et les champs du fil (`servedTranslationFields`, qui prend la
  traduction DÉJÀ ÉLUE) sont deux PROJECTIONS. Ce que le fil transporte décrit désormais, par
  construction, ce que la bannière affiche.
- **Second verrou conservé** : `notificationLocKey` refuse toute source en plus de la base
  déclarée. Un appelant qui oublie de déclarer sa base perd une traduction, jamais le secret.
- **`transcriptTranslationTexts()`** (`packages/shared/types/attachment-audio.ts`) — site UNIQUE
  du dépouillement `AttachmentTranslations` → `langue → texte` (soft-delete et textes vides
  écartés), pour qu'une sixième famille ne réécrive pas la boucle (leçon 264).
- **Éventail** : `translations` entre au `select` de l'attachment ; `transcriptionLanguage()`
  rend la langue PARLÉE, qui concourt à son rang (règle #3).

## Témoins et mesure du ROUGE

| lot | témoins | RED mesuré |
|---|---|---|
| `messageNotificationPrism` (+9) | fuite du fil, 4 témoins de transcription | **5 tombent** avant correctif |
| `replyMentionNotificationPrism` (+1) | fuite du fil sur les 2 autres éventails | inclus dans la mutation 1 |
| `messageNotificationFanOut` (+4) | câblage : base transcription, `select`, base nominale, placeholder sur les 3 éventails | mutation 2 |
| `attachment-audio` (+4) | dépouillement, soft-delete, texte vide, colonne informe | — |

Deux mutations, pour prouver que les témoins tombent sur le défaut qu'ils NOMMENT :

1. `previewPrismSource` → rend toujours `messageSource` (le défaut du cycle 122) ⇒
   **10 témoins tombent** sur les deux suites de Prisme.
2. l'éventail cesse de composer la base transcription ⇒ **1 témoin tombe**, précisément celui
   qui garde le câblage (les trois autres gardent d'autres propriétés et restent verts — c'est
   la forme correcte, chacun garde une chose).

## Gates

- `services/gateway` : **847/847 suites, 19397/19397 témoins** verts (bun, `test:coverage`).
- `packages/shared` : **108/108 fichiers, 2578/2578 témoins** verts (vitest).
- `tsc --noEmit` sur `services/gateway` : **0 erreur**.

## Vérifié, et PAS un défaut

`reproduceEditedMessageNotifications` réécrit le corps persisté depuis l'aperçu ORIGINAL
(`rewriteBody`), qui ne préfixe plus le corps quand celui-ci a été TRADUIT — la fonction retombe
alors sur `nextPreview`, le nouveau texte original. Ce n'est pas une perte : l'édition PURGE
`Message.translations` (le pipeline retraduit), donc il n'y a à cet instant AUCUNE traduction à
servir, et les deux clés du contexte sont explicitement supprimées juste au-dessus. Comportement
cohérent — noté pour ne pas fabriquer une dette imaginaire.

## Suivi MESURÉ

- `prePersistMessage` (NSE iOS) : corps VIDE au démarrage à froid jusqu'à la synchro REST.
  Hérité du cycle 122, toujours ouvert, distinct du Prisme.
- La bannière d'un vocal sert la TRANSCRIPTION traduite ; la PISTE AUDIO traduite (`url` sur la
  même entrée) n'est pas attachée — la notification joint toujours le fichier original. Absence
  nommée, non instruite.

## Leçon

`tasks/lessons.md` § Leçon 267 — quand deux valeurs doivent rester d'accord, la question n'est
pas « les a-t-on gardées pareil ? » mais « peuvent-elles être calculées deux fois ? ».
