## Leçon 271 — un helper de confidentialité à UN SEUL appelant est un inventaire, pas une garde (2026-08-24, cycle 123 bis)

**Le constat.** Le lot précédent venait de fermer la fuite du fil push sur les trois éventails de
`messageNotificationFanOut`. La règle de `/services/gateway/CLAUDE.md` — « Cette entité a-t-elle
une JUMELLE ? à poser au moment où l'on corrige, pas des cycles plus tard » — a été posée dans le
même lot, et sa réponse tient en une mesure d'une ligne :

> **`protectedPreview()` n'avait qu'UN SEUL appelant de production dans tout le dépôt.**

Trois autres sites copiaient le texte d'un message sans jamais passer par lui, dont deux vers des
TIERS : le contenu édité poussé aux ENTRANTS d'une mention (`messageMentions:358`), et la
réécriture qui DÉMASQUE toutes les lignes déjà notifiées à la première édition
(`reproduceEditedMessageNotifications:158,181,194`). Le troisième — la réaction — sert l'auteur
lui-même, donc moins cher, et pas nul pour autant.

> **Le compte des appelants d'un helper de sécurité est une mesure de COUVERTURE, et elle
> s'obtient en une commande.** Un helper à un appelant ne garde pas une règle : il documente
> qu'un site l'applique. La question n'est pas « la garde est-elle correcte ? » mais « combien de
> chemins mènent à la donnée qu'elle protège, et combien passent par elle ? ».

C'est la forme « garde » de la leçon 261 (une énumération porte deux affirmations, dont une
presque jamais vérifiée) : le lot 122 avait écrit noir sur blanc que la substitution était
tranchée par « l'éventail, qui a COMPOSÉ l'aperçu » — vrai de l'éventail, et muet sur les trois
producteurs qui composent un aperçu SANS être cet éventail.

### Corollaire — l'ÉDITION est un second producteur, et personne ne la compte

Deux des trois sites sont sur le chemin d'ÉDITION, et ce n'est pas un hasard. Un message protégé
est masqué à l'ENVOI, une fois, par l'unité qui le sait. L'édition rejoue ensuite la même
question — quel texte va sur l'écran de qui ? — dans deux unités écrites pour un tout autre
problème (réconcilier des mentions, rafraîchir une copie dénormalisée), et ni l'une ni l'autre
n'avait de raison de penser à la protection.

Mesuré au passage : **rien n'interdit d'éditer un message protégé** — `messageEditAdmission` et
`messageEditContent` ne portent aucune occurrence de `isViewOnce`, `isBlurred`, `effectFlags` ni
`expiresAt`.

> **Quand une règle s'applique à une DONNÉE, l'énumérer sur les producteurs de cette donnée ne
> suffit pas : il faut aussi énumérer ce qui la RÉÉCRIT.** Une copie dénormalisée a deux moments
> — celui où elle naît et celui où elle est rafraîchie — et le second est écrit par quelqu'un qui
> pense mettre à jour un texte, pas publier un secret.

### Corollaire — une garde de confidentialité se relit CHEZ ELLE, pas dans ses paramètres

Les deux correctifs d'édition relisent les drapeaux depuis la base plutôt que de les recevoir de
l'appelant, et c'est le point de conception du lot. `MentionTargetMessage` ne porte que
`expiresAt` ; `EditedMessageRecord` ne porte que l'identité et les deux contenus ; les QUATRE
transports d'édition les construisent chacun de leur côté.

**Un paramètre dont l'absence désactive une garde est un demi-correctif** — c'est le jumeau exact
du corollaire du cycle 122 (« un appelant qui oublie le paramètre perd une requête, jamais le
Prisme »), et il est plus grave ici : là on perdait une traduction, ici on publierait un secret.
D'où aussi le fail-CLOSED des deux relectures — une lecture qui ne conclut pas répond
« protégé », à l'inverse du best-effort qui gouverne le reste de ces unités. **Une notification
appauvrie se rattrape ; un secret poussé, non.**

### Corollaire de harnais — chercher UNE chaîne dans la charge ENTIÈRE

Les témoins de ce lot exercent un secret unique (`le code du coffre est 4242`) et le cherchent
dans la charge SERVIE entière — corps du push, blob écrit — plutôt que champ par champ. C'est la
leçon 268 appliquée au harnais : le défaut qu'elle nomme venait précisément d'un témoin qui
observait le bon champ et un seul. **Pour une règle qui dit « ceci ne doit être NULLE PART »,
l'assertion doit porter sur le tout ; « nulle part » ne se vérifie pas clé par clé.**

### Corollaire d'outillage — le piège du `| tail` s'est refermé, et il est déjà écrit

`services/gateway/CLAUDE.md` porte la règle depuis le cycle ~103 : « ne jamais passer un gate par
un pipe quand c'est son code de sortie qu'on interroge — le code de retour d'un pipeline est
celui de sa DERNIÈRE commande ». Ce lot l'a rejouée : `bun run test:coverage 2>&1 | tail -30`
lancé en arrière-plan a été rapporté **exit 0** alors que la suite portait **3 fichiers et
16 témoins ROUGES**. Le `0` était celui de `tail`.

Ce qui l'a rattrapé n'est pas la vigilance mais une HABITUDE : ouvrir le fichier de sortie et
chercher la ligne `Test Suites:` plutôt que de croire le statut. La forme robuste est de rediriger
vers un fichier et d'y écrire le code soi-même (`; echo "JEST_EXIT=$?" >> log`).

> **Une règle écrite dans le dépôt n'est pas une règle appliquée.** Celle-ci l'était depuis vingt
> cycles, dans le fichier que ce lot édite. Un gate ne se lit pas au statut d'un pipeline, et la
> seule défense qui tienne est de ne jamais construire le pipeline.
