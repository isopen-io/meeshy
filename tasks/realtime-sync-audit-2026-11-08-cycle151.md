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
| ROUGE | production revenue à `HEAD` : **16 témoins tombent, 18 restent verts** — les 18 sont les négatifs (conversation en clair, message sans chiffré, le lot `regular` nominal), et chacun dit pourquoi il ne peut pas tomber |
| zone d'impact | 69 suites / 1 133 témoins verts (notifications + éventail) |
| suite gateway COMPLÈTE | **2 584 suites / 40 378 témoins verts, 6 rouges** — les six suites de codecs d'image déjà rouges sur `dev` (`avifdec` absent de l'image), hors du diff |
| cliquet `journal-one-file-per-entry-guard` | vert |

## Ce que ce cycle laisse ouvert

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
