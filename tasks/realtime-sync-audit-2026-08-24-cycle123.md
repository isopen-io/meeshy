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

`tasks/lessons.md` § Leçon 268 — quand deux valeurs doivent rester d'accord, la question n'est
pas « les a-t-on gardées pareil ? » mais « peuvent-elles être calculées deux fois ? ».
(La 267 est celle du cycle 123 WEB parallèle, atterri sur `main` le même jour.)

---

# Cycle 123 bis — la JUMELLE, posée au moment du correctif

## La question, et sa réponse en une mesure

`/services/gateway/CLAUDE.md` porte une règle : « Cette entité a-t-elle une JUMELLE ? — à poser
au moment où l'on corrige, pas des cycles plus tard. » Posée sur le défaut A ci-dessus, elle rend
une mesure d'une ligne :

> **`protectedPreview()` n'avait qu'UN SEUL appelant de production dans tout le dépôt** —
> `messageNotificationFanOut.ts:320`.

Tout ce qui copie le texte d'un message SANS passer par cet éventail le servait donc nu. Trois
sites, dont deux fuient vers des TIERS.

## Site 1 — `createReactionNotification` (destinataire : l'AUTEUR)

`NotificationService:2064-2070` lisait `select: { content: true, expiresAt: true }` — les
drapeaux de protection n'étaient pas même CHARGÉS, donc aucun masque n'était possible. L'extrait
(100 caractères de `Message.content`) partait dans le corps du push (`:1301-1303` →
`body: pushBody`) et dans `metadata.messageContent`.

Le destinataire est l'auteur du message : il connaît son texte, ce qui rend ce site moins cher
que les deux suivants. **La protection ne parle pourtant pas de qui SAIT, elle parle de ce qui
S'AFFICHE** — un message éphémère ou flouté n'a rien à faire sur un écran verrouillé, fût-il
celui de son auteur, ni dans une ligne `Notification` que l'inbox in-app relit.

Correctif : les drapeaux entrent au `select`, `protectedPreview` tranche, l'extrait est OMIS
(la branche « pas d'extrait » existait déjà pour un message sans texte). Pas de
`notificationLocKey` ici, contrairement à l'éventail : les clients s'en servent pour REMPLACER
le corps, ce qui effacerait « a réagi 🔥 ».

## Site 2 — `notifyNewlyMentioned` (destinataires : des TIERS)

`messageMentions.ts:358` passait `messageContent: content` — le contenu ÉDITÉ brut — à
`createMentionNotificationsBatch`, sans masque ET sans base de Prisme (donc `message-content` par
défaut, ce qui laissait en plus le Prisme réinjecter la TRADUCTION du même secret).

Éditer un message à vue unique pour y nommer quelqu'un lui poussait le texte en clair.

Correctif : les drapeaux se relisent ICI (`loadMessageProtection`), pas via `params` —
`MentionTargetMessage` ne porte que `expiresAt`, et les quatre transports d'édition ne
construisent pas tous un `Message` complet. La lecture n'a lieu que lorsqu'il y a des entrants.

## Site 3 — `reproduceEditedMessageNotifications` (destinataires : des TIERS)

`:158,181,194` réécrivaient `content` / `metadata.messagePreview` / `metadata.messageContent` de
TOUTES les lignes du message avec le contenu brut, sur les quatre types ancrés. Le placeholder
correctement masqué à la création était donc REMPLACÉ par le vrai texte à la première édition,
puis réannoncé (`notification:deleted` + `notification:new`).

Mesuré au passage : **rien n'interdit d'éditer un message protégé** — `messageEditAdmission` et
`messageEditContent` ne portent aucune occurrence de `isViewOnce`, `isBlurred`, `effectFlags` ni
`expiresAt`.

Correctif : ne RIEN réécrire quand le message est protégé. Ce n'est pas seulement la voie
prudente, c'est la voie JUSTE — le placeholder ne dérive pas du contenu, donc une édition du
contenu ne le périme pas, et sa seule part variable (la durée d'un éphémère) ne bouge pas non
plus.

## Fail-CLOSED sur les trois

Les deux relectures ajoutées (`loadMessageProtection`, `isProtectedMessage`) répondent
« protégé » quand elles ne concluent PAS — message introuvable ou lecture en échec. C'est
l'inverse de l'arbitrage best-effort qui gouverne le reste de ces unités, et c'est délibéré :
une notification appauvrie se rattrape, un secret poussé non.

## Témoins

8 témoins, **5 tombent** avant correctif (les 3 verts sont les témoins de NON-régression :
la réaction reste annoncée, un message ordinaire garde son extrait, une ligne ordinaire est bien
rafraîchie). Le secret exercé est une chaîne unique cherchée dans la charge SERVIE entière —
corps du push et blob écrit —, jamais champ par champ : c'est la leçon du défaut A appliquée au
harnais.

| témoin | ROUGE mesuré |
|---|---|
| réaction — corps servi | `a réagi 🔥 à votre message : « le code du coffre est 4242 »` |
| réaction — `metadata.messageContent` | `{"messageContent":"le code du coffre est 4242"}` |
| mention entrante — aperçu | `le code du coffre est 4242` |
| mention entrante — base déclarée | `undefined` |
| reproduction — ligne masquée | `content` passe de `👁️ 💬` à `le code du coffre est 4242` |

## Leçon

`tasks/lessons.md` § Leçon 269 — un helper de confidentialité à UN SEUL appelant est un
inventaire, pas une garde.

## Gates du lot 2

- `services/gateway` : **848/848 suites, 19411 témoins** verts (bun, `test:coverage`),
  code de sortie de JEST lu directement — cf. le corollaire d'outillage de la leçon 269.
- `tsc --noEmit` : **0 erreur**.

## Ce que le lot 2 a coûté en HARNAIS, et pourquoi c'était prévisible

Trois doubles de test sont devenus MUETS d'un coup — `reproduceEditedMessageNotifications`
(port `{ notification }` seul), `messageMentions` (`message` réduit à `update`) et
`MessageHandlerEditDelete` (`findUnique` en `jest.fn()` nu). La relecture étant fail-CLOSED,
leur silence se traduisait en « message protégé » : **16 témoins verts sur des unités qui ne
réécrivaient plus rien.**

C'est la contrepartie ASSUMÉE du choix de conception (une garde de confidentialité se relit CHEZ
elle, jamais via ses paramètres) et la forme « double PARTIEL » que le CLAUDE.md du gateway
documente depuis le cycle 91 : un double qui n'offre pas ce que la production offre ne signale
pas la perte, il la rend invisible. Les trois doubles servent désormais un message ORDINAIRE par
défaut, et chaque témoin qui parle d'un message protégé le dit dans SA ligne.

Un témoin existant en est sorti plus honnête : « une mention ajoutée en ÉDITANT un message
éphémère hérite de son échéance » posait `expiresAt` sur le PARAMÈTRE pendant que la ligne relue
disait « ordinaire » — il attestait un message qui n'existe pas.
