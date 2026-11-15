# Cycle 165 — le cinquième porteur de texte, et la loi qu'il ne connaissait pas

*2026-11-15. Branche `claude/exciting-planck-kexumt`, repartie de la tête de
`dev` (`134848579`).*

**Livré** : #18613 — `message:attachment-updated` applique le plancher
d'historique à ses trois audiences (PR #18620).

> **Note de numérotation.** Deux branches sœurs vivantes réclamaient déjà un
> journal « cycle 163 » (`claude/exciting-planck-kfor5u` au 2026-11-15,
> `claude/exciting-planck-ksw6yk` au 2026-11-14). Celle-ci n'avait rien écrit :
> règle de tranchage du dépôt — **celui qui n'a rien écrit cède** — donc 165, et
> la collision est consignée plutôt que disputée. C'est le défaut d'espace de
> noms partagé de #5102 : un identifiant qui ne s'alloue pas collisionne.

---

## Comment le cycle a été ouvert

Les cycles 156 à 162 ont travaillé le contrat socket par ses cliquets, et les
deux branches sœurs y écrivaient encore (`packages/shared/__tests__/ci/`,
`apps/web/src/lib/api/socket.ts`, `MessageSocketManager.kt`). Le relevé de
départ a donc été fait sur **ce que les cliquets ne regardent pas** : la
passerelle côté serveur, sur trois axes qu'aucun des dix cycles précédents
n'avait ouverts — la file hors ligne, l'exactement-une-fois de l'envoi, et
l'AUDIENCE des diffusions de mutation.

Les trois ont rendu des défauts prouvés. Le lot a pris le plus net ; les cinq
autres sont des issues.

## Le constat

La loi « qui a le droit de LIRE ce message » est écrite UNE fois —
`translationReaders()` (#9709) — et son doc-comment nomme exactement le défaut
qu'elle ferme : « un invité entré par un lien sans historique recevait donc le
TEXTE traduit des messages écrits avant lui ».

**Le dépôt déclare `attachment-updated` porteur de texte, et deux fois dans le
même fichier** : `TEXT_BEARING_TABLE` et la table en prose vingt lignes plus bas
(`queuedEventContract.ts`), rangé avec `new`, `edited`, `translation` et
`link-message`.

| famille porteuse de texte | site qui applique la loi |
|---|---|
| `message:translation` | `deliverTextTranslation.ts:137` |
| `message:edited` | `editedAudience.ts:105` |
| mention | `messageMentions.ts:448` |
| aperçu de ligne de liste | `emitConversationPreviewUpdate` (`latestBelowFloor`) |
| traduction partagée | `shared-translations.ts:580` |
| **`message:attachment-updated`** | **aucun** |

Cinq déclarés, quatre inscrits. Le cinquième ne connaissait pas la loi.

## Les TROIS audiences, et pourquoi aucune n'était gardée

| audience | ce dont elle s'autorisait |
|---|---|
| plan signé par lecteur | `ADMITTED_FILE_READER_WHERE` |
| diffusion chaînée | `PARTICIPATION_VIVANTE` seul |
| file hors ligne | rien — appelée sans `excludedQueueKeys` |

Le détail qui rend le constat net : **`editedAudience.ts` écrit, à propos de la
première, qu'« elle ne regarde NI `joinedAt` NI `historyVisibleFrom` : elle ne
dispense pas du plancher ».** La phrase est posée là par le lot qui a gardé
l'édition. Elle décrivait, mot pour mot, le site resté ouvert un fichier plus
loin — c'est « cette entité a-t-elle une JUMELLE ? » (cycle 85) avec le
commentaire du bon côté.

## Ce qui rend le défaut PERMANENT, et non une course

Le balayage des médias en attente n'a **aucune borne temporelle basse**
(`gateway-sweep-runner.ts:56`). Une pièce bloquée par une panne de worker est
reprise des jours plus tard, donc l'enrichissement tire sur un message d'âge
arbitraire. Il n'y a pas de fenêtre à gagner : il faut une pièce en attente et
un invité entré entre-temps.

Ce qui partait vers lui par CE canal : la transcription Whisper entière, ses
traductions NLLB, les URL des pistes TTS et l'adresse du fichier — **en direct
sur ses deux rooms**, le handshake le mettant dans `conversation:<id>` sous
`PARTICIPATION_VIVANTE` seul — **plus une entrée Redis de 48 h sous sa clé** que
le drain rejouait à sa reconnexion. Pendant ce temps `GET …/messages`, `/sync`,
`conversation:updated` et `GET /attachments/:id` refusent tous ce message au
même lecteur.

> ## ⛔ CE LOT NE FERME QU'UN CANAL SUR TROIS — ne pas lire ce journal comme « l'invité ne reçoit plus la transcription »
>
> L'audit adversarial d'avant-fusion a mesuré deux canaux FRÈRES, non gardés,
> **dans la même fonction**, qui partent AVANT celui-ci :
> `transcription:ready` (`MeeshySocketIOManager.ts:2466`) et
> `audio-translation:*` (`:2621`), tous deux en `io.to(roomName).emit(...)` nu,
> portant le texte — et le second l'URL de la piste TTS. L'invité sous plancher
> a donc **toujours** le texte intégral, servi une milliseconde avant la garde.
> Consigné en **#18623**.
>
> **Pourquoi l'énumération de ce cycle ne pouvait pas les voir** : elle a
> soustrait les appelants de la loi à `TEXT_BEARING_TABLE`, qui énumère les
> familles **de la FILE**. Ces deux-là ne sont jamais enfilés, donc ne figurent
> dans aucune table. **Une déclaration qui n'énumère qu'un TRANSPORT ne vérifie
> que ce transport** — voir la leçon du jour, qui corrige la leçon 1 ci-dessous.

> **La file faisait survivre la fuite à la déconnexion qui l'avait empêchée en
> direct.** C'est la propriété la plus coûteuse de ce défaut, et la seule qu'un
> témoin de direct ne peut pas voir.

## Les deux pannes qu'un témoin confondait

Le témoin existant — « still emits to the conversation room when the participant
lookup fails » — faisait LEVER **toute** requête participant. Deux pannes
distinctes vivaient donc sous un seul double, et elles s'arbitrent à l'OPPOSÉ :

| ce qui tombe | verdict juste |
|---|---|
| la LISTE d'audience | dégrader vers la room — **la loi a répondu**, toute la room peut lire |
| la LOI | n'émettre RIEN — on ne sait NI qui est bloqué, NI qui est autorisé |

Le double a été scindé sur la forme du `select` (les colonnes de plancher sont
dans l'un et pas dans l'autre), et les deux arbitrages se lisent désormais côte
à côte dans le même `describe`.

> **Un double qui fait tomber « tout » fait tomber plusieurs questions à la
> fois, et la réponse qu'il atteste est celle de la question qu'on avait en
> tête.** Celui-ci attestait la dégradation ; il couvrait aussi, sans le dire,
> un fail-OPEN sur un contrôle d'accès.

## Le nom était faux AVANT ce lot

`editReadership` servait déjà DEUX familles — l'édition et la MENTION. Le nom
n'était donc pas « devenu » faux en ajoutant un troisième appelant : il l'était
pour un appelant sur deux. Renommé `messageReadership` / `blockedReaderKeys` /
`MessageReadership`, 23 références, 7 fichiers, rien d'autre changé dans ces
fichiers.

> **Un nom qui désigne un seul des appelants d'une loi rend la loi invisible
> depuis les autres.** Le quatrième site qui en aura besoin ne la cherchera pas
> sous « edit ». Le module n'a PAS été déplacé : la loi vit déjà à un site
> unique, et un churn d'imports sur sept fichiers aurait enterré le correctif de
> confidentialité sous un diff mécanique.

## Preuves

| preuve | résultat |
|---|---|
| ROUGE avant le correctif | **5 témoins de garde tombent**, les 5 de non-régression restent verts |
| mutation par mutation (audit adversarial) | voir le tableau ci-dessous — un des cinq ne gardait RIEN |
| `src/socketio` | 150 suites / 2475 témoins (149 / 2464 avant) |
| `emitAttachmentUpdated*` | 3 suites / 29 témoins |
| `services/messaging` + `routes/messages-writes` + `routes/conversations` | 40 suites / 622 témoins |
| `tsc --noEmit` gateway | **EXIT=0**, lu hors pipe (`$?` direct) |

Le ROUGE à 5-sur-10 est la mesure qui compte : **au cas nominal, la forme juste
et le défaut rendent le même verdict**, la loi rendant `{kind:'room'}` sans rien
restreindre. Un témoin posé là ne peut pas tomber — c'est la leçon 261, et c'est
pourquoi les dix témoins se répartissent en cinq gardes et cinq
non-régressions.

### Le « 5 témoins tombent » était vrai en BLOC et faux sur un cinquième

L'audit adversarial a muté les gardes **une par une**, ce que le ROUGE en bloc
ne distingue pas :

| mutation de production | témoins qui tombent |
|---|---|
| retirer `exceptRooms` | 3 — dont, **à tort**, celui du plan signé |
| retirer `excludedQueueKeys` | 2 |
| retirer `if (readership.kind === 'unknown') return;` | 2 |
| retirer `if (blocked.has(target.key)) continue;` | **0** |

La garde du plan signé par lecteur — celle qui protège la branche la plus
sensible, les pièces à VUE UNIQUE et les flammes — **n'était gardée par rien**.
Cause mesurée : le fichier de témoins ne posait pas
`ATTACHMENT_URL_SIGNING_KEY`, donc `readerSignedPlanForMessageId` sortait sur
`if (!signer …) return null` **avant même de regarder la protection du
message** ; `vueUnique: true` était un paramètre MORT et les deux témoins du
plan passaient par la diffusion chaînée comme les autres. Sa sœur
`emitAttachmentUpdated.readerSigned.test.ts` posait déjà cette clé.

Corrigé : une ligne d'environnement, et la mutation tombe désormais (1 échec).

> **Un ROUGE en BLOC prouve qu'au moins une garde porte, jamais que chacune
> porte.** Dix témoins, cinq gardes, cinq rouges : l'arithmétique avait l'air
> d'une correspondance un-pour-un, et deux témoins tombaient pour la garde du
> voisin. La mesure qui distingue est la mutation UNE PAR UNE — et elle est le
> seul moyen de savoir laquelle des gardes est décorative.

## Ce que le cycle a trouvé et n'a PAS livré

Six issues, chacune avec ses lignes vérifiées. Aucune n'est une ligne de ce
journal : l'issue fait foi.

| # | ce que c'est | pourquoi ce n'était pas ce lot |
|---|---|---|
| #18614 | le drain accuse la remise par FENÊTRE DE TEMPS (`freezeMessageStatus` sans `messageIds`), donc il accuse les entrées qu'il vient de refuser — et son témoin mocke précisément la méthode où la garantie se rompt | autre sous-système (accusés), autre arbitrage |
| #18615 | le plancher est appliqué à l'ENFILEMENT, pas au DRAIN : un octroi `historyVisibleFrom` révoqué pendant l'absence du lecteur est quand même rejoué | **la jumelle directe de ce lot** — ce lot ferme le site, celle-ci ferme le MOMENT |
| #18616 | une SECONDE instance de `RedisDeliveryQueue` sert le pipeline média ; sa tranche mémoire n'est jamais drainée, purgée ni nettoyée — et deux doc-comments affirment l'unicité | voisin du même émetteur, cause distincte |
| #18617 | `POST /links/:identifier/messages` rend 500 au renvoi d'un message déjà écrit ; le commentaire qui l'exempte du dedup promet un 409 qu'il ne peut pas produire | piège armé (aucun client de première partie n'y POSTe — mais le binding Android est livré) |
| #18618 | rien n'ordonne les événements EN DIRECT contre le drain : une édition émise pendant la fenêtre de reconnexion arrive avant le `message:new` qu'elle mute | demande une décision de contrat |
| #18619 | la file enfile l'adresse NUE d'une pièce liée au lecteur — y compris quand le direct décide délibérément de ne rien émettre | **trouvé indépendamment par DEUX des trois audits**, ce qui en fait une propriété et pas une impression |

## Les deux leçons de méthode du cycle

**1. Une énumération de sites se vérifie par la DÉCLARATION — et la déclaration
n'énumère qu'UN TRANSPORT.** La liste des familles porteuses de texte n'a pas
été devinée : elle est écrite dans le dépôt (`TEXT_BEARING_TABLE`), et le défaut
s'est trouvé en comparant cette déclaration aux appelants de la loi. Cinq
déclarés, quatre inscrits — une soustraction, pas une intuition.

**Et la soustraction était juste dans sa langue, et aveugle hors d'elle.**
`TEXT_BEARING_TABLE` énumère les familles de la **FILE**. `transcription:ready`
et `audio-translation:*` ne sont jamais enfilés, donc ne figurent dans aucune
table — la soustraction ne pouvait pas les rendre, et ils portent le même texte,
à sept lignes du site corrigé (#18623). La leçon 261 disait qu'une énumération
porte deux affirmations ; celle-ci en porte une troisième, muette : **« ces sites
appliquent la règle », « ce sont les sites où elle s'applique », et "ce transport
est le seul par lequel la donnée sort »**. La dernière est celle qui a tenu.

Détail : `tasks/lessons/2026-11-15-une-declaration-qui-n-enumere-qu-un-transport-ne-verifie-que-ce-transport.md`.

**2. Un commentaire juste peut décrire un site qui ne l'est pas.** La phrase qui
nomme le défaut était déjà dans le dépôt, posée par le lot qui avait gardé
l'édition, à propos de l'admission exacte dont le site fautif s'autorisait.
Elle ne pointait rien — elle décrivait. Devant une phrase de la forme « cette
porte ne dispense pas de X », la question est : **qui d'autre s'autorise sur
cette porte ?**

## Suivi hérité, relu

| # | état au cycle 162 | état mesuré ce cycle |
|---|---|---|
| #18499 | « inventoriés, verdict de produit à rendre » | **fermé** le 2026-11-14 par PR #18504 |
| #18342 | la jumelle descendante | ouverte — branches sœurs actives dans les gates, non repris |
| #18115 | les trois champs morts d'`AttachmentUpdatedEvent` | ouverte — `apps/web`/Android revendiqués par PR #18540 |
| #18456 | le consommateur iOS d'`AttachmentReactionUpdateEvent.userId` | ouverte — demande Xcode |
