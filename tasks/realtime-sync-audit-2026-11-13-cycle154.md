# Cycle 154 — un fail-OPEN qui s'annonçait fail-CLOSED, et les deux unités qui le fabriquent

*2026-11-13. Branche `claude/exciting-planck-1p83cg`, partie de `dev` à
`621e944be` après la fusion du cycle 153 (PR #18051, la dernière de ce cycle).*

**Issue livrée** : #17140 — ouverte par le cycle 151 et laissée en « décision à
instruire » par les cycles 152 et 153.

> **Une ligne ABSENTE et une lecture qui LÈVE ne sont pas la même réponse, et
> elles s'arbitrent à l'opposé.** Le module le savait pour la seconde — tout son
> appareil tolérant ne parle que d'elle — et répondait `null` à la première.

## Le défaut

`services/historyFloor.ts` — `historyFloorFor` :

```ts
if (!link || link.allowViewHistory) return null;   // ← lien INTROUVABLE ⇒ AUCUN plancher
return join.joinedAt;
```

Le plancher d'historique est l'instant avant lequel rien n'est lisible à un
participant. Quand c'est au LIEN de décider, une ligne de lien introuvable ne
bornait **rien** — ni le fil, ni le delta de `/sync`, ni la recherche, ni
l'agrégat. Un doc-comment le présentait comme une posture assumée (« posture
historique de `messages.ts` »), et **trois témoins la gelaient** à trois étages
différents (`historyFloor.test.ts` deux fois, `messages-routes.test.ts`,
`sync.test.ts`).

C'est un fail-OPEN **décisionnel**, et il était annoncé fail-CLOSED par les
surfaces qui écrivent ce mot — vrai des levées, faux de l'absence de ligne.

## Ce qui le rend atteignable : DEUX fabriques, et la seconde est horaire

Le relevé n'est pas une inférence, c'est la lecture de deux unités :

| unité | ce qu'elle fait | quand |
|---|---|---|
| `deleteShareLinksRevokingGuests` | ferme, révoque, **supprime** les liens créés par un compte | purge d'un compte (#10492) |
| `cleanupExpiredData` | révoque puis **supprime** les liens ÉCHUS | **balayage horaire** |

Les deux révoquent par `shareLinkActiveGuestsWhere`, qui porte
`type: 'anonymous'`. **Un INSCRIT peut entrer par un lien**
(`link-admission.ts`, `linkMemberFields`). Il reste donc actif, son
`shareLinkId` pointant une ligne qui n'existe plus.

La seconde fabrique est la plus coûteuse parce qu'elle n'est pas un incident :
**c'est le cycle de vie NOMINAL de tout lien qui porte un `expiresAt`.** Le lien
lui fermait l'historique ; son expiration le lui rouvrait ENTIER.

C'est la même asymétrie que celle fermée par #17076, et le doc-comment de
`deleteShareLinksRevokingGuests` nomme lui-même sa jumelle historique (« la purge
d'un compte supprimait les liens de son créateur en laissant leurs invités
actifs … pour toujours ») — le dépôt avait vu la moitié ANONYME du problème.

## Ce que ce lot n'affirme pas

**La FABRIQUE est mesurée, la POPULATION ne l'est pas.** Les deux admissions
par lien FIGENT `canViewHistory: shareLink.allowViewHistory` sur la ligne
participant (`link-admission.ts:322`, `link-admission-guest.ts:83`), et le droit
figé se règle au rang (iii) — **avant** que le lien n'entre en jeu. Une
participation admise depuis que ce champ existe n'atteint donc jamais la branche
corrigée.

Le défaut mord sur les participations dont le droit figé est **ABSENT** : celles
d'avant le champ, que le module appelle lui-même la population « legacy ».
Combien en reste-t-il en base ? Cette session n'a pas d'accès production et ne
le dit pas. Ce qu'elle dit : le piège est armé, deux unités l'arment en
continu, et le dépôt a une règle pour ça (cycle 84) — on ne le laisse pas armé
au motif que personne n'a encore marché dessus. Et une règle pour l'autre moitié
(cycle 103) — on n'annonce pas une panne qu'on n'a pas mesurée.

**Corollaire rassurant, et il fait partie du verdict** : la fermeture ne RETIRE
rien à une participation moderne admise par un lien `allowViewHistory: true`.
Son droit est figé ; la suppression du lien ne lui coûte rien. Le lot ferme une
fuite sans fermer une capacité.

## L'arbitrage, et pourquoi il est énoncé UNE fois

`linkGrantsHistory(shareLinkId, link)` — trois états, dont deux rendaient le
même verdict :

| la participation | la ligne de lien | verdict |
|---|---|---|
| aucun `shareLinkId` | — | **accorde** |
| `shareLinkId` posé | lue | ce que la ligne dit |
| `shareLinkId` posé | **INTROUVABLE** | **refuse** |

Il est exporté parce qu'il a une JUMELLE, et que cette jumelle le DÉCLARAIT :
la fiche d'un participant (`participants-reads.ts`) annonce `canViewHistory`, et
son commentaire énonce exactement la contrainte — « même arbitrage exactement
que `historyFloorFor`, qui décide de la lecture ; les énoncer différemment
ferait annoncer à la fiche un droit que la lecture ne respecte pas ».

Elle le retapait : `shareLink?.allowViewHistory ?? true`. **Ce repli confond les
deux premières lignes du tableau avec la troisième** — il n'a qu'un `null` en
face et deux raisons de l'avoir. Il est donc faux de la même façon, et le
commentaire qui exige l'alignement était au-dessus.

> **Une règle qu'il faut retaper à chaque site est une règle qu'un site finira
> par ne pas avoir** — et ici le site qui ne l'avait pas était celui dont le
> commentaire jurait de l'avoir.

**Un seul correctif couvre 35 consommateurs de production** (relevé mécanique
des importateurs de `historyFloor`) : fil, `/sync`, recherche globale, favoris,
épinglés, fils de discussion, accusés, pièces jointes, aperçu poussé,
statistiques, mentions, tableau de bord. C'est ce que vaut la source unique.

## Ce que le lot a trouvé en se faisant relire par ses propres témoins

**Quatre témoins gelaient la posture renversée**, à quatre étages — et c'est
l'information : la posture n'était pas une ligne oubliée, elle était ÉTABLIE.
Chacun est inversé et dit pourquoi, jamais supprimé :

| fichier | ce qu'il gelait |
|---|---|
| `historyFloor.test.ts` | « ne borne RIEN quand le lien est INTROUVABLE — posture unique du dépôt » |
| `historyFloor.test.ts` | « ne borne pas sur un lien introuvable — même posture que GET messages » |
| `messages-routes.test.ts` | « shareLink INTROUVABLE: aucun plancher, et pas de 403 » |
| `sync.test.ts` | « un lien introuvable ne borne pas — même posture que GET messages » |

Le témoin de `messages-routes` garde sa SECONDE moitié intacte (« pas de 403 ») :
ce module rétrécit une LECTURE, il ne ferme pas une PORTE (c'est
`shareLinkReadGate`, et sa posture sur le lien introuvable est une autre
question, laissée telle quelle).

**Et une affirmation périmée survivait chez la jumelle.** Le doc-comment de
`resolveEntryRights` (`services/participantRights.ts`) énonçait « Défaut `true`
— un lien introuvable ne borne rien, posture unique du dépôt ». Laissée debout,
elle aurait fait recroire ce que ce commit condamne : c'est la leçon du
cycle 153 (« un lot qui instruit une affirmation et en laisse la jumelle debout
la fera recroire »), appliquée à un commentaire une deuxième fois en deux
cycles.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** |
| `historyFloor.test.ts` | **79 témoins verts** (70 avant le lot) |
| fiche de participant | **42 témoins verts** |
| zone d'impact (`istory\|articipant\|essage\|share\|link\|stats`) | **470 suites / 7 606 témoins** |
| mutation — retour au fail-OPEN dans `historyFloorFor` | **6 rouges** |
| mutation — `linkGrantsHistory` perd la distinction « aucun lien » | **1 rouge** |
| mutation — la fiche retape `?? true` | **1 rouge** |

## Ce que ce cycle laisse ouvert

- **`participant-rights-core.ts` est le TROISIÈME énoncé de la même règle**, et
  le seul appelant de `resolveEntryRights` qui ne passe pas de repli : il ne lit
  AUCUN lien, donc son `canViewHistory` retombe sur le défaut `true` du
  paramètre. Sa charge est servie à un HÔTE (la route est fermée aux
  admin/creator) et le `participant:rights-updated` diffusé retire le champ
  (#4009) — mais la réponse, elle, le porte. L'aligner coûte une requête, ou un
  choix fail-closed qui peut annoncer `false` à tort : c'est un lot à soi, pas
  une ligne à glisser ici. **Issue #18055.**
- **#17139** — l'ORDRE de deux listes sur un agrégat non planchéisé. Inchangé.
- **#17075** — « supprimer pour moi » n'annonce à personne. `décision-produit`.
- **#17196 / #17197** — l'effet de bord du cycle 151 sur iOS. Pas de Xcode ici.
- **La troisième composition** (suivi du cycle 153) : **instruite et close.**
  Les trois différences de `createMessageNotification` sont gardées — la
  relecture vivante et le refus d'une ligne absente par
  `replyMentionLivenessGate.test.ts` (« le lot regular, lui, se tait »),
  l'élection du MÉDIUM par le TYPE lui-même (`NotificationBannerMedia` ne porte
  aucun champ de fichier, donc `replyOrMentionBanner` ne peut structurellement
  pas en attacher un). Ce qu'aucun témoin ne garde est le `context` que réponse
  et mention composent chez elles — rien n'empêche un futur lot d'y poser un
  `firstAttachmentUrl`. Petit, et dit ici plutôt que gelé par un témoin qu'on
  n'a pas écrit.

**Et ce que ce lot ne couvre pas, comme ses prédécesseurs** : la cryptographie.
**Un audit cryptographique TIERS reste requis avant de présenter Meeshy comme
une messagerie chiffrée.**
