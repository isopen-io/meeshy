# Cycle 151 — le champ qu'un verrou ne pouvait pas garder

*2026-11-09. Branche `claude/exciting-planck-lx3m98`, redémarrée depuis `dev`
après la fusion du cycle 150 (PR #17170, `ee28259f9`).*

Le suivi que le cycle 150 avait laissé ouvert, et qu'il avait explicitement
renvoyé à son propre tour : **#17080**, la bannière de réponse ou de mention
bloquée sur `🔒 💬` en conversation chiffrée. En l'instruisant, le lot en a
trouvé un second — **#17191** — et la découverte a changé ce que le premier
devait être.

| lot | issue | ce qui change de comportement |
|---|---|---|
| M | #17080 | l'enveloppe de l'appareil part sur les TROIS éventails |
| N | #17191 | elle se RETIENT sous une protection plus forte que le chiffrement |

## Lot M — un champ qui ne compose aucune chaîne

### Le défaut

`messageNotificationFanOut.ts` passait `encryptedContent` au seul lot `regular`.
`createReplyNotification` et `createMentionNotification` ne déclaraient pas le
paramètre, et `createNotification` lit `params.context.encryptedContent || ''`.

Côté NSE, `applyBodyRewrites` ne remplace le corps que si
`userInfo["encryptedContent"]` est non vide ; sa branche de repli — celle qui
rend le placeholder depuis la table de localisation de l'extension — exige
`isEncryptedPush`, **dérivé du même champ**. Avec `''`, aucune des deux ne tire :
la bannière reste la chaîne que la passerelle a composée.

Un membre ordinaire du fil recevait donc son message déchiffré pendant que la
personne à qui l'on répond, et tous les mentionnés, lisaient `🔒 💬`. Le symptôme
se conclut « la mention est cassée », ce qui envoie chercher du mauvais côté.

### Pourquoi quatre cycles de convergence l'ont laissé derrière

Les cycles 125 bis à 128 ont fait converger le TEXTE, l'HORLOGE, le VERROU et le
MÉDIA des trois éventails. Chacun s'est cherché avec la même question — *qui
compose ce corps ?* — et le cycle 126 avait déjà nommé sa propre limite :

> Un lot qui partage une valeur composée doit énumérer ce qui voyage AVEC elle,
> pas seulement ce qui la compose.

`encryptedContent` n'est ni un texte, ni un qualificatif de texte. C'est la
charge que le LECTEUR ouvre. Elle n'apparaît dans aucune composition, et le
`grep` qui l'aurait trouvée n'existe pas : on ne cherche pas un champ dont on ne
sait pas qu'il manque.

### L'implémentation

L'éventail l'élit UNE fois (`deviceEnvelope`) et la remet aux trois créateurs.
Le relais de mentions ne change pas : il RÉPAND depuis le cycle 126
(`const { senderId, messageContent, ...banner } = commonData`), donc le champ
traverse sans qu'un inventaire soit à tenir — exactement ce que cette forme
avait été choisie pour garantir.

### L'argument qui autorise le lot, et il est à vérifier, pas à croire

**Aucune audience n'est élargie.** Les destinataires des lots `reply` et
`mentions` sortent de `memberIds`, et ce sont précisément ceux que `regular`
aurait servis si `alreadyNotified` ne les en avait pas retirés. Le lot ne publie
donc rien vers personne de neuf : il répare une privation.

C'est l'argument central, et il repose sur une propriété du code
(`originalMessageAuthorUserId` et le filtre d'éligibilité du lot de mentions
nomment des membres), pas sur une intention. Il est soumis tel quel à l'audit
adversarial, avec la demande explicite de l'attaquer.

## Lot N — le discriminant n'était pas « y a-t-il un verrou ? »

### Ce que le premier lot a découvert

En écrivant le témoin de M, il a fallu décider ce qu'un message PROTÉGÉ fait de
son enveloppe. La réponse mesurée est : il la pousse, et la NSE la déchiffre.

`applyBodyRewrites` déchiffre, pose `content.body = decrypted`, puis
`didDecrypt = true` — ce qui **saute la branche `notificationLocKey` douze lignes
plus bas**. Un message à VUE UNIQUE, ÉPHÉMÈRE ou FLOUTÉ en conversation chiffrée
affichait donc son texte ENTIER sur l'écran verrouillé, sous une bannière que la
passerelle venait de composer en `👁️ 💬`.

### Pourquoi le second verrou du cycle 125 ne pouvait pas le garder

En E2EE, `protectedPreview` rend TOUJOURS un verdict : `isEncrypted` est vrai
pour toute ligne de la conversation (`messageNotificationFanOut.ts:450-461`).
`notificationLocKey` est donc toujours posé, et les quatre sites qui s'en servent
de second verrou — `pushMediaFields`, `contentDetailPushFields`,
`prePersistedMessageFields`, `previewPrismSource` — retiennent bien leur charge.

`encryptedContent` est le seul champ de contenu que ce verrou **ne peut pas**
garder : en E2EE le verrou est toujours là, et l'enveloppe est exactement ce qui
doit le traverser pour que `🔒 💬` devienne le vrai texte chez le lecteur. Le
garder par le verrou tuerait la feature ; ne pas le garder du tout laissait la
fuite.

> **Un champ de contenu peut être exempté d'une garde pour une raison juste, et
> l'exemption se périmer sur un cas que la raison ne couvrait pas.** La question
> à poser à toute exemption n'est pas « est-elle justifiée ? » mais **« qu'est-ce
> qui, dans la raison écrite, la BORNE ? »**. Ici la raison était « en E2EE le
> verrou est toujours posé » — vraie, et muette sur la préséance ENTRE
> protections.

Le discriminant juste existait déjà, écrit dans `protectedPreview` : la préséance
**éphémère > vue unique > flouté > chiffré**. L'enveloppe ne voyage que quand
`encrypted` est la SEULE protection.

### Deux choix de forme, et leur raison

- **La loi partagée est APPELÉE, pas ses drapeaux relus.**
  `messageProtection` (`@meeshy/shared/utils/message-protection`) lit les colonnes
  ET le bitfield `effectFlags`, par les deux chemins. Relire les drapeaux à la
  main aurait fait une seconde loi, et un canal de protection ajouté à
  `effectFlags` n'aurait pas atteint ce site.
- **`isEncrypted` ne lui est délibérément PAS passé.** La question posée ici
  n'est pas « ce message est-il protégé ? » — il l'est toujours, c'est
  l'hypothèse de la branche — mais « l'est-il AUTREMENT que par son
  chiffrement ? ». Passer `isEncrypted` rendrait le prédicat vrai partout et
  retiendrait l'enveloppe pour tout le monde : le mode d'échec silencieux du
  correctif, et celui que le témoin négatif garde.

### Pourquoi les deux lots ne se livrent pas séparément

Les destinataires de M sont la population la plus EXPOSÉE : la bannière d'une
mention perce la sourdine (c'est écrit dans `createReplyNotification` — « a reply
is not a mention: it does not pierce the mute »). Livrer M seul aurait élargi une
fuite VIVANTE vers eux.

C'est le cycle 127 à l'envers. Il avait formulé : *une garde qui protège la
population la plus NOMBREUSE peut manquer la plus EXPOSÉE.* Le corollaire que ce
cycle ajoute : **un lot qui étend une capacité du chemin le plus fréquenté vers
les chemins les plus exposés doit d'abord vérifier que ce chemin était bien
gardé.** On n'hérite pas seulement de la feature ; on hérite de ses trous, et on
les porte là où ils coûtent le plus.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** |
| rouge | **7 des 12 témoins tombent** ; les 5 verts sont les négatifs, et chacun dit pourquoi il ne peut pas tomber |
| zone d'impact | **264 suites / 5 034 témoins verts** (notifications, messagerie, E2EE, push) |
| cliquets | **18 suites / 186 témoins verts** — budgets de taille, `detached-promise-catch-sweep`, `tsc-never-loaded-tests-ratchet`, manifeste de routes, balayages de schémas de réponse et d'erreur |
| budget de taille | `NotificationService.ts` 3 575 → **3 586** (gelé à 3 761) ; `messageNotificationFanOut.ts` 864 → **931** (plafond 1 200) |
| audit adversarial | lancé sur l'arbre fusionné avant toute demande de fusion (directive 2026-10-03) |
| suite gateway COMPLÈTE | voir le commentaire de clôture de la PR |

### Sur le budget, et il faut le dire plutôt que le taire

`NotificationService.ts` est hors budget depuis toujours, et la directive
interdit d'y ajouter avant d'en avoir extrait. Ce lot y ajoute **onze lignes** —
trois déclarations de paramètre et deux lignes de `context` — sans rien extraire.

Ce qui l'autorise est la forme du cliquet, qui est la version OUTILLÉE de la
directive : il gèle une dette DÉCROISSANTE, et son doc-comment écrit pourquoi
(« un fichier légitimement découpé fait disparaître son nom sans faire rougir la
garde : c'est ce qui rend le chantier faisable sans bloquer les issues qui doivent
écrire dans ces fichiers »). Les 175 lignes de marge que ce lot entame ont été
gagnées par les extractions des cycles précédents — `boundApnsPayload`,
`push-media-fields`, `served-banner-body`, `recipient-language` — et c'est à cela
qu'elles servaient.

**Le compte se lit dans le fichier, jamais dans ce journal** : 3 586 contre un gel
à 3 761, mesuré au `wc -l`, cliquet vert.

L'extraction que ce lot a ENVISAGÉE et refusée : la composition
`servedTranslation` + `bannerBody`, dupliquée mot pour mot dans les deux
créateurs (~22 lignes chacune), qui sortirait une trentaine de lignes et
mériterait son site unique. Elle ne part pas ici parce qu'un lot de
confidentialité ne refactore pas le chemin qu'il garde — « un lot qui gouverne
une charge utile jusque-là libre ne doit rien y décider d'autre » (cycle 94).
C'est une issue à ouvrir, pas une ligne à laisser dans ce fichier.

## Ce que ce cycle laisse ouvert

- **La composition de bannière est écrite trois fois** (message, réponse,
  mention) : `this.prismTranslation(this.previewPrismSource({…}), prism.ordered)`
  suivi de `servedBannerBody({…})`. Trois exemplaires d'une règle est exactement
  la configuration qui a produit les cycles 121 à 128. À extraire chez elle, et
  cela paierait le budget que ce lot a entamé.
- **`#17075`** — « supprimer pour moi » écrit `isActive: false` et n'annonce à
  personne. Toujours étiquetée `décision-produit`, assignée au porteur : hors de
  portée d'une session.
- **`#17139`** — deux listes classent leurs membres sur l'agrégat non planchéisé.
  Un correctif d'ORDRE est une décision par surface (cycle 150).
- **`#17140`** — un `shareLinkId` dont la ligne de lien a disparu rend « aucun
  plancher ». Fail-OPEN décisionnel, présenté comme fail-closed sur six lectures
  à la fois (cycle 150).
