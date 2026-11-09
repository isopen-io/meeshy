# Cycle 151 — l'enveloppe de l'appareil : la faire voyager, et la retenir

*Cadré le 2026-11-08, livré le 2026-11-09. Branche `claude/exciting-planck-14zure`,
démarrée depuis `dev` après la fusion du cycle 150 (`ee28259f9`).*

Le suivi que le cycle 150 a laissé ouvert en disant qu'il « demande son propre
tour » : **#17080** — en conversation chiffrée de bout en bout, la bannière
d'une RÉPONSE ou d'une MENTION reste `🔒 💬` à vie, parce que
`encryptedContent` ne voyage que sur l'éventail `regular`.

Le lot en porte **deux**, et ils ne se livrent pas séparément.

| lot | issue | ce qui change de comportement |
|---|---|---|
| A | #17080 | réponse et mention portent l'enveloppe que la NSE déchiffre |
| B | #17177 | un message à vue unique / flouté / éphémère n'en porte AUCUNE, sur les trois |

## Ce que le cadrage a trouvé avant la première ligne de code

Le lot A est un lot de COMPLÉTUDE, et son énoncé est irréprochable : un champ
voyage sur un éventail, manque aux deux autres, le symptôme est visible, le
témoin s'écrit en une ligne. Le geste évident — le passer aux deux autres —
aurait **triplé une fuite** que l'éventail de référence portait déjà.

Trois couches, chacune juste chez elle :

1. `protectedPreview` a pour préséance *éphémère > vue unique > flouté >
   chiffré*. Un message à VUE UNIQUE d'une conversation e2ee rend donc
   `locKey: 'notification.view_once_message'`, **pas** celui du chiffrement.
2. `createNotification` posait `encryptedContent: context.encryptedContent || ''`
   sous `showPreview` **et sous rien d'autre** — ni le verrou
   `notificationLocKey` qui garde le détail douze lignes plus haut, ni le
   prédicat qui garde le média.
3. La NSE iOS (`applyBodyRewrites`) déchiffre et écrit `content.body = decrypted`
   **sans consulter `declaresProtection`**. Le repli `locKey` n'agit
   qu'`if isEncryptedPush, !didDecrypt` : un déchiffrement RÉUSSI écrase le
   placeholder.

Donc, en production : le texte entier d'un message à vue unique, flouté ou
éphémère sur l'écran verrouillé, sous une bannière disant `👁️ 🖼️`. **Le même
message en mode `server` est protégé** — et c'est cette asymétrie de RÉGIME, pas
le champ, qui nomme le défaut : la décision produit « masquer un éphémère sur un
écran verrouillé » était honorée d'un côté et défaite de l'autre.

### Pourquoi cinq cycles de gardes ne l'avaient pas vu

Les cycles 123 → 128 ont fermé, un par un, ce que la charge d'une bannière
protégée TRANSPORTE : le TEXTE, la BASE du Prisme, le VERROU, le FICHIER et son
étiquette, la PISTE traduite. Ces cinq gardes se répartissent en **deux
familles** — ce qui compose une CHAÎNE, ce qui transporte un FICHIER — et
l'enveloppe n'est ni l'un ni l'autre : **c'est la charge que le LECTEUR compose
lui-même.** Les deux questions par lesquelles on balaie cet objet littéral
(« qui compose ce corps ? », cycle 126 ; « quel fichier part avec ? », cycle 125)
rendent toutes deux `[]` sur elle.

> Avant de conclure qu'un objet est gardé, compter les FAMILLES de médium qu'il
> porte, pas les champs qu'on a fermés. Détail : `tasks/lessons/2026-11-09-une-enumeration-de-ce-que-la-charge-transporte-se-fait-dans-la-langue-du-medium.md`.

## L'implémentation

### La règle vit chez le COÛT qu'elle borne

`deviceEnvelopeForPush` vivait dans `messageNotificationFanOut.ts` — chez
l'éventail qui l'avait écrite en premier. Elle vit désormais dans
`services/notifications/deviceEnvelopePush.ts`, un module FEUILLE, avec sa
seconde moitié. Même rangement que la borne de débit du cycle 150 : **chez le
coût, pas chez le symptôme** — et sans ré-export depuis l'ancienne adresse, un
ré-export ne traversant pas un double de test partiel (leçon du cycle 150).

Elle relit les drapeaux **chez elle**, sans prendre de verdict en paramètre :
« une garde de confidentialité se relit CHEZ ELLE, pas dans ses paramètres », et
les appelants de cette famille construisent chacun leur propre enregistrement de
message.

### Deux sites l'APPLIQUENT, aucun ne la réécrit

- l'éventail d'ENVOI, pour `regular` : il tient le message en mémoire, et sa
  relecture vivante ne lit que de quoi juger l'éligibilité ;
- la relecture PARTAGÉE (`MessageBannerSource.deviceEnvelope`), pour la réponse
  et la mention.

Même partage que `messageLiveness`, et pour la même raison. Le choix de
DÉRIVER plutôt que de passer un paramètre se décide sur l'appelant le plus
PAUVRE : le chemin d'ÉDITION (`notifyNewlyMentioned`) appelle le lot de mentions
sans composer aucune charge push et ne l'aurait jamais câblé. **Un paramètre dont
l'absence RETIRE une feature est un demi-correctif autant qu'un paramètre dont
l'absence désactive une garde.**

Coût : quatre colonnes et une relation (`conversation.encryptionMode`) dans la
lecture qui se faisait déjà — aucune requête de plus, et un témoin l'assert sur
la REQUÊTE, pas sur le rendu. La relation est nécessaire : se fier au seul mode
de la LIGNE est exactement le défaut #12518 (un message hérité, ou écrit par un
chemin qui n'a pas posé `encryptionMode`).

### Le régime de la conversation ne se prend PAS par la relation

Première écriture du lot : `loadMessagePrismSource` prenait
`conversation: { select: { encryptionMode: true } }` et résolvait la décision
chez elle, le doc-comment annonçant « aucune requête de plus ». **L'audit a
mesuré que c'était faux deux fois.**

D'abord le coût : `previewFeatures` est absent du générateur Prisma, donc
`relationJoins` est désactivé — et il n'existe de toute façon pas pour le
connecteur MongoDB. Le moteur résout cette relation par une requête SÉPARÉE, soit
un aller-retour de plus par notification de réponse et par lot de mentions. Le
témoin qui gardait l'affirmation comptait `prisma.message.findUnique` : il mesure
les appels à l'API Prisma, jamais les allers-retours, donc **il ne pouvait pas
réfuter la phrase qu'il gardait.**

Ensuite la redondance : les DEUX créateurs qui consomment cette source lisent
déjà `conversation.encryptionMode` dans le **même `Promise.all`**. Le régime était
en main deux lignes plus loin.

Et la relation introduisait un mode de panne neuf : `Message.conversation` est
REQUISE, donc un message dont le document `Conversation` a disparu fait lever le
moteur — ce que le `catch` transforme en `UNKNOWN_BANNER_SOURCE`, c'est-à-dire la
perte des traductions, de l'horloge de bulle, **et** un `liveness: 'unknown'`
donc fail-OPEN, pour une lecture qui réussissait avant le lot.

La source porte donc la MATIÈRE (`MessageBannerSource.cipher`), et la DÉCISION
reste un site unique : `NotificationService.deviceEnvelopeFor`, le seul à réunir
ce bloc, les deux drapeaux portés plus haut pour l'horloge, et le régime que
l'appelant tient déjà. Le témoin de provenance assert désormais l'**absence** de
la relation, et que le mode vient de la lecture de conversation déjà faite.

### Le second verrou est là où le champ atteint la ligne ET le fil

`sanitizeNotificationInputs` — le bloc dont le doc-comment raconte déjà deux
défauts de la même forme (#7157 l'avatar, #7159 le titre : « un champ voisin,
écrit par la même main, qu'aucune phrase du bloc ne nommait »). Le CONTEXTE n'y
passait pas du tout, et `createNotification` écrit `context` tel quel dans la
ligne `Notification`. Un seul point de passage garde donc les deux sorties.

Il lit la clé qui DÉCLARE la protection — `protectedPreview` en est l'unique
producteur du dépôt — et **une clé INCONNUE retient** : une porte de
confidentialité échoue en montrant moins.

### Ce que le fil ne change pas

La forme reste celle d'avant : `encryptedContent: context.encryptedContent || ''`,
donc la clé est toujours présente et vaut `''` quand il n'y a pas d'enveloppe —
ce qu'une conversation en clair poussait déjà. Le verrou ne change pas la FORME
du fil, il change ce qu'elle porte (rétrocompatibilité, directive #9231). Dans
la ligne persistée, la clé n'est pas écrite du tout.

## Où la valeur atterrit, mesurée

Le seul consommateur qui AGIT sur ce champ est la NSE iOS : `applyBodyRewrites`
est dans le plan INCONDITIONNEL de `NSEPreparationStep.plan`, donc elle traite
une réponse et une mention exactement comme un message simple — le lot A rend
donc son clair à l'écran verrouillé sans une ligne de Swift. Le web le DÉCLARE
champ de service et refuse de le rendre (`sw-push.test.ts`) ; la coque Android
ne le lit pas. Le lot B est donc une fuite iOS, fermée côté SERVEUR pour les
trois.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** |
| ROUGE, premier tour | production revenue à `HEAD` : **16 témoins tombent, 18 restent verts** — les 18 sont les négatifs (conversation en clair, message sans chiffré, le lot `regular` nominal) |
| ROUGE, second tour | la mutation que l'audit a mesurée **invisible à 3 063 témoins** (le résolveur rend la matière brute) en fait tomber **12** |
| cliquet des clés de protection | tombe quand on remet le littéral que le lot vient de retirer |
| zone d'impact | 131 suites / 3 138 témoins verts (notifications + messagerie + éventail + cliquet) |
| suite gateway COMPLÈTE | voir le commentaire de clôture de la PR |
| cliquet `journal-one-file-per-entry-guard` | vert |

## Second tour — ce que l'audit adversarial a rendu

Le lot est passé par `auditeur-adversarial` **avant** fusion (directive
2026-10-03, lot de chiffrement). Verdict : **NON BLOQUANT** — « le lot fait ce
qu'il dit […] et je n'ai pas réussi à le casser », avec l'énumération complète
des producteurs de `context.encryptedContent` et de `data.encryptedContent`, et
la confirmation qu'aucun chemin n'atteint la ligne `Notification` sans traverser
`sanitizeNotificationInputs` (un seul écrivain de `notification.create` dans tout
le gateway).

Quatre constats ont été repris dans le lot. Les deux premiers comptent.

### Le constat qui compte — ma garde n'avait AUCUN témoin sur deux de ses trois chemins

MESURÉ par l'auditeur : remplacer la résolution par la matière brute
(`deviceEnvelope: message?.encryptedContent ?? null`) laissait **3 063 témoins
sur 3 063 VERTS.**

Mes quatre témoins `it.each(lifecycleProtections)` ne lisaient que l'éventail
`regular` (`createMessageNotification.mock.calls[0][0]`), et mon harnais de
service fixait `isViewOnce: false`, `isBlurred: false`, `expiresAt: null` : **sur
les chemins RÉPONSE et MENTION, le premier verrou ne pouvait pas rougir.** Un
double PARTIEL qui gèle le verdict — exactement la forme que ce lot prétendait
chercher, et dont son propre récit affirmait « les 18 négatifs disent chacun
pourquoi ils ne peuvent pas tomber ». Sur ces deux chemins, c'était l'inverse :
ils ne pouvaient pas tomber, et personne ne le disait.

Trois conséquences se cumulaient, et la troisième est celle qui mord :

1. le **régime** (#13114) n'était pas gardé sur ces deux éventails — sous la
   mutation, le chiffré AU REPOS d'une conversation `server`, que seule la
   passerelle peut ouvrir, partait vers Apple et Google sans qu'un témoin bouge ;
2. la **protection de cycle de vie** ne l'était pas non plus ;
3. et sur le chemin d'**ÉDITION**, ce verrou est le **SEUL** :
   `notifyNewlyMentioned` appelle le lot de mentions **sans transmettre
   `notificationLocKey`**, donc le second verrou y est inerte
   (`envelopeSurvivesProtectionLock(undefined)` rend `true`).

Le harnais est désormais PARAMÉTRÉ par le régime et par la protection, et
douze témoins neufs gardent le premier verrou sur les deux chemins qui le
dérivent. **La mutation invisible à 3 063 témoins en fait tomber 12.**

Un piège rencontré en les écrivant, et il est instructif : ma première échéance
d'éphémère était un littéral daté de la veille, donc **passé**. `messageLiveness`
rendait `gone`, le créateur n'envoyait rien, et l'assertion « aucune enveloppe »
passait **sans que le verrou ait été exercé** — un témoin qui répond à une autre
question que la sienne. L'échéance se calcule relativement à `now` ; c'est la
leçon « un littéral de date sous une fenêtre n'est pas une constante, c'est une
échéance », rencontrée en la reproduisant.

### Le constat de prémisse — « unique producteur » était faux le jour de son écriture

Mon second verrou s'argumentait par « `protectedPreview` est l'unique producteur
de `notificationLocKey` dans tout le dépôt ». `messageMentions.ts` en compose un
second, avec le littéral `'notification.hidden_message'` écrit à la main — dans
le fichier même qui gouverne le chemin d'édition. La phrase était dans trois
doc-comments et dans ce journal, et **aucun gate ne pouvait la contredire.**

Deux hasards la sauvaient : ce littéral n'atteint pas `createNotification`, et sa
valeur est de toute façon une clé CONNUE et RETENANTE. Mais le correctif évident
du point 3 ci-dessus — transmettre la clé sur le chemin d'édition — la routerait
dans le verrou, où une divergence d'un caractère la rendrait INCONNUE : direction
sûre pour l'enveloppe, et la NSE perdrait la localisation de son placeholder sans
qu'un témoin ne rougisse.

`messageMentions.ts` importe désormais la constante, et l'affirmation est
remplacée par ce qui est vrai *et vérifiable* : les quatre clés ont un site de
DÉFINITION unique, et tout producteur les en importe. Cliquet :
`src/__tests__/protection-loc-key-literal-sweep.test.ts`, inventaire VIDE, qui
prouve d'abord qu'il lit le site qu'il exempte — et qui tombe quand on remet le
littéral.

> **Une affirmation d'unicité se garde par un balayage, jamais par une phrase.**

### Les deux autres

- **Le doc-comment de `sanitizeNotificationInputs` annonçait nettoyer « son
  contexte ».** Il ne le nettoie pas : `metadata` passe par `sanitizeJSON`, le
  contexte ne passe que par le verrou, qui ne retire que le chiffré. L'écart est
  ANTÉRIEUR au lot ; ce que le lot ajoutait était pire que l'écart — une phrase
  qui le déclare fermé, dans le bloc dont le doc-comment raconte déjà deux
  défauts de cette forme. La phrase dit maintenant ce qu'elle fait, et nomme
  l'écart qu'elle ne couvre pas.
- **Le coût de la relation** : voir § « Le régime de la conversation ne se prend
  PAS par la relation » ci-dessus.

### Ce que l'audit a trouvé et que ce lot NE prend PAS

- **#17187** — la ligne `Notification` retient l'enveloppe d'AVANT l'édition,
  indéfiniment, et aucune purge ne la touche. Le lot TRIPLE le nombre de lignes
  concernées sans toucher l'inventaire de `reproduceEditedMessageNotifications`
  — la liste que #17082 venait d'étendre avec exactement cet argument. Rétention,
  pas fuite servie (mesuré : aucun client ne lit ce champ). Hors du lot : cette
  liste est un inventaire à soi.
- **`boundApnsPayload`** peut couper l'enveloppe au-delà de 3 800 octets, donc
  faire revenir le symptôme de #17080 sans défaut de code et sans log. Consigné
  en commentaire sur **#17184**, qui est du même côté.
- **Le changement de comportement produit** : en e2ee, un message à vue unique /
  flouté / éphémère garde désormais son placeholder au lieu d'afficher le clair.
  C'est l'objet de #17177, mais ni l'issue ni ce journal ne le disaient comme une
  PERTE pour l'utilisateur qui l'avait. Portée bornée, vérifiée : il n'existe
  aucun réglage d'éphémère à l'échelle de la CONVERSATION, donc aucune
  conversation entière ne devient illisible sur son écran verrouillé.

### Ce que l'audit n'a PAS pu vérifier, dit à voix haute

Pas de MongoDB dans le conteneur (le coût de la relation est raisonné, pas
mesuré — raison de plus pour l'avoir retirée) ; pas de Xcode (le comportement de
la NSE est lu dans le source, jamais exécuté — #17184 reste le vrai second
niveau) ; et **ce n'est pas une revue cryptographique** : rien ici ne juge la
primitive, la gestion de clés ni la confidentialité persistante. Avant de
présenter Meeshy comme une messagerie chiffrée, un audit cryptographique TIERS
reste requis.

## Ce que ce cycle laisse ouvert

- **#17187 — la rétention de l'enveloppe dans la ligne `Notification`** (cf.
  § second tour).
- **#17184 — le second verrou côté NSE.** La garde est serveur ; le dépôt pose
  d'ordinaire les DEUX niveaux (cycle 125 : « la protection se lit aux deux
  niveaux qui la déclarent »). Côté client, `applyBodyRewrites` doit refuser de
  substituer un clair quand `notificationLocKey` déclare une protection AUTRE
  que le chiffrement. Pas pris ici : aucun Xcode dans ce conteneur, et
  `./apps/ios/meeshy.sh test` est un gate de commit pour `apps/ios`.
- **`isEndToEndMode` existe en DOUBLE** — `services/conversations/encryptionRegime.ts`
  et `services/messaging/e2eePlaintextAdmission.ts`, corps identiques
  aujourd'hui. Constat, pas lot : une jumelle qui n'a pas encore divergé, et la
  consolider touche les importateurs des deux moitiés du gateway.
- **#17075** (« supprimer pour moi » n'annonce à personne) et **#17139** /
  **#17140** restent tels que le cycle 150 les a laissés.
