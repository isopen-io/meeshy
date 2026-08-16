# Cycle 52 — la ligne décrivait un mélange de deux messages

## 1. D'où vient la piste

Le cycle 51 la lègue en n°2 de ses pistes non livrées, et la qualifie
lui-même de « la plus grosse » :

> Six champs du groupe d'aperçu (`lastMessageAttachments`,
> `lastMessageAttachmentCount`, `lastMessageSenderName`, `lastMessageIsBlurred`,
> `lastMessageIsViewOnce`, `lastMessageExpiresAt`) ne voyagent sur AUCUN
> `conversation:updated` : hydratés par `GET /conversations`, jamais rafraîchis
> en temps réel. Non prise ici parce que la PR #3096 (cycle 50) était encore
> ouverte sur exactement ces fichiers — la reprendre demande un `main` frais.

`main` est frais (la PR est atterrie). La piste est prise.

L'instruction a d'abord dû trancher une question que le cycle 51 laissait
ouverte : ces six champs sont-ils « jamais rafraîchis » (une lacune) ou
« faux » (un défaut) ? La réponse décide du correctif, et elle n'est pas la
même selon le chemin.

## 2. Le constat

Le payload que `emitConversationPreviewUpdate` met sur le fil :

| Porté | Absent |
|---|---|
| `lastMessageId`, `lastMessageAt`, `senderId` | `lastMessageSenderName` |
| `lastMessagePreview` | `lastMessageAttachments`, `lastMessageAttachmentCount` |
| `lastMessageTranslations`, `lastMessageOriginalLanguage` | `lastMessageIsBlurred`, `lastMessageIsViewOnce` |
| `location` (si le message est géolocalisé) | `lastMessageExpiresAt` |
| `previewRecalculated` | |

Les six absents ne sont pas oubliés en route : `PREVIEW_MESSAGE_SELECT` ne les
LIT pas. Le serveur ne les connaît pas au moment d'émettre.

Le client, lui, appliquait ce payload **champ par champ** :

```swift
if case .replaced(.some(let id)) = event.lastMessage { conv.lastMessageId = id }
if let v = event.lastMessagePreview { conv.lastMessagePreview = v }
```

Tant que le payload décrit le MÊME message — une édition, une traduction qui
atterrit — c'est correct : les six champs tus n'ont pas changé.

**Mais deux chemins nominaux nomment un AUTRE message** : la suppression pour
tous du dernier message (le serveur sert le précédent) et le masquage personnel
(le lecteur se voit servir son propre remplaçant). Là, les six champs
décrivaient encore le message d'avant, et rien ne les corrigeait.

Ce que la ligne rendait alors :

- **« Windie : salut »** — où Windie n'a jamais écrit « salut ». C'est le nom
  de l'auteur du message SUPPRIMÉ.
- **la vignette d'une photo effacée** légendant un texte tout neuf.
- **« Vue unique »** sur un message ordinaire — `lastMessageSummaryKind`
  compose son libellé depuis ces drapeaux.
- **« Message expiré »** sur un message bien vivant, par l'`expiresAt` de
  l'ancien.

Aucun de ces états ne se corrige tout seul. L'incohérence n'existe qu'à
l'écran : la ligne est localement bien formée, aucun invariant client n'est
violé, et seul un `GET /conversations` complet remet tout d'aplomb.

## 3. Pourquoi c'était déjà censé être impossible

`LastMessageFacet` existe **exactement** pour ça, et son en-tête le dit depuis
le cycle qui l'a créée :

> Les écrire séparément est la source d'une classe de bugs entière : un chemin
> temps réel qui pose le texte et l'horodatage sans toucher au reste laisse la
> ligne décrire un MÉLANGE de deux messages — l'auteur de l'ancien, l'icône de
> pièce jointe de l'ancien, et « Vue unique » collé sur un texte tout neuf
> parce que le message précédent l'était.

Le défaut refermé ici est **littéralement le paragraphe ci-dessus**, revenu par
la seule porte qui ne passait pas par la facette.

Et il est revenu à **deux mètres** de l'endroit où il avait été fermé : les
deux branches du MÊME `if` dans le sink `conversationUpdated`.

```
conversation:updated
  ├── lastMessageAt a AVANCÉ  → bumpToTop(facet:)      ── ATOMIQUE (fermé, cf. P1/P2)
  └── sinon                    → champ par champ        ── LE DÉFAUT
```

Le témoin `test_bumpToTop_resetsStaleCompanionFields` couvre la première
branche, et son commentaire énonce déjà toute la règle (P1 pour les six champs,
P2 pour le texte et le Prisme). La seconde branche n'a jamais été instruite —
elle a été écrite pour les mises à jour de MÉTADONNÉES (renommage, avatar), où
la question ne se pose pas, et le chemin recalculé est venu s'y greffer plus
tard.

## 4. Le troisième site, découvert en instruisant

En cherchant tous les écrivains de `lastMessageId` hors facette :

```
ConversationSyncEngine.recomputeLastMessagePreviewAfterDeletion  ← quatre champs à la main
```

Même défaut, **découvert localement** au lieu d'être reçu : quand une
suppression retire le dernier message et que le cache des messages tient un
survivant, cette fonction pose `lastMessagePreview`, `lastMessageId`,
`lastMessageSenderName` et `lastMessageAt` — et laisse les **sept** autres
décrire le message supprimé.

Dont `lastMessageTranslations`. Le résolveur PRÉFÈRE la carte à l'aperçu brut
(`resolvedLastMessagePreview`) : sur ce chemin, un lecteur francophone voyait
donc la **traduction du message supprimé** s'installer au-dessus du texte de
son remplaçant. Le seul des trois sites où le défaut atteignait le Prisme.

Le cycle 49 avait refermé la branche `else` de cette même fonction (le vidage
complet quand il n'y a AUCUN survivant, par `clearLastMessage`). La branche
`if let newLast` — celle qui a un survivant — était restée à la main.

Ici la correction est plus simple qu'ailleurs : **le message est là, tout
entier**. La facette s'écrit en bloc, par la primitive qui existait déjà.

## 5. Le correctif

`MeeshyConversation.adoptLastMessage(id:)` — l'identité change ⇒ tout ce qui
DÉCRIT le message est remis à neutre ; l'appelant repose aussitôt ce que le
payload porte vraiment.

Deux propriétés font tout le geste :

1. **Il couvre les onze champs, pas les six.** Le texte et la carte du Prisme
   sont dans le même cas dès qu'un payload les tait. Les exclure rouvrirait le
   défaut sous sa forme subtile — celle que P2 avait dû fermer après P1 sur la
   branche voisine : un texte ancien non attribué, et pire, une traduction
   ancienne que le résolveur préfère à l'aperçu.
2. **Il se tait quand l'identité ne change pas.** Sans cette borne il serait
   destructeur : une édition de légende dépouillerait la ligne de sa photo et
   de son auteur à chaque frappe. Le payload les tait parce qu'ils n'ont pas
   changé, pas parce qu'ils ont disparu.

`lastMessageAt` reste délibérément dehors — c'est le RANG de la ligne, tenu par
les règles de monotonie de l'appelant et par `previewRecalculated`, jamais par
l'identité. Le mettre dans le geste ferait plonger la ligne au fond de la liste
sur des payloads qui n'en parlent pas.

**Trois sites câblés** :

| Site | Ce qu'il écrit | Geste |
|---|---|---|
| `ConversationStore.merging` (SDK) | store RAM **et** cache disque (`applyingConversationUpdate` lui délègue) | `adoptLastMessage` |
| `ConversationListViewModel` (app) | l'écran, 2ᵉ implémentation du même événement | `adoptLastMessage` |
| `ConversationSyncEngine.recompute…` (SDK) | cache disque, chemin local | `applyLastMessage(facet)` — le message est là |

## 6. Les autres surfaces

**Gateway : inchangé, et c'est un constat, pas un oubli.** Porter les six
champs demanderait de joindre `attachments` dans `PREVIEW_MESSAGE_SELECT`. Or
ce `select` est exécuté **avant** le portillon `onlyIfLatestIs`, donc sur le
chemin qu'emprunte le fan-out des TRADUCTIONS — le plus fréquenté des trois
appelants, une fois par traduction qui atterrit. Ce serait payer le coût le
plus chaud du service pour un cas qui ne survient qu'aux deux chemins où
l'identité change. Et cela ne fermerait que les émetteurs d'AUJOURD'HUI : la
règle client, elle, vaut pour le quatrième émetteur que personne n'a encore
écrit. Un cycle gateway pourra le reprendre s'il mesure d'abord.

**Web : défaut réel, non traité, documenté.** Sa ligne rend l'OBJET
`conversation.lastMessage` (`ConversationItem` → `formatLastMessage`), que le
patch de `conversation:updated` ne touche pas du tout : il écrit
`lastMessagePreview` et `lastMessageTranslations`, que la ligne ne lit pas —
sauf la carte, passée en prisme À CÔTÉ du `lastMessage.content` périmé. Le
cycle 49 avait câblé le seul cas du VIDAGE (`lastMessageId: null` ⇒
`lastMessage: undefined`). Le cas « autre id » reste entier, et il est plus
visible qu'sur iOS : la ligne garde le message supprimé **en entier**, texte
compris. Son correctif n'est pas une règle de fusion mais une décision de
RENDU — d'où la ligne tire son texte, son heure et son auteur quand l'objet est
absent — donc un cycle web dédié, pas une greffe ici. Piste n°1 du §8.

**Android : indemne, pour la raison établie au cycle 49** — son
`conversation:updated` déclenche un `refreshSilently()` REST. Il ne peut pas
mal lire un payload qu'il ne lit pas, au prix d'un aller-retour par événement.

## 7. Écarté délibérément

**Ne remettre à neutre que les six champs absents du payload.** Traité au §5,
point 1 : c'est la régression P1-sans-P2, déjà vécue sur la branche voisine.

**Unifier les deux implémentations de la fusion.** Toujours pas mûre, pour la
raison instruite au cycle 51 (deux TYPES d'événement reliés par un mapping
manuel). À noter tout de même : le geste central sur le MODÈLE rend leur
divergence inoffensive **sur ce point précis** — les deux sites appellent
désormais la même fonction, et un futur troisième la trouvera avant d'écrire
onze affectations. C'est le premier cycle où la duplication des deux `merging`
n'a pas coûté une divergence de plus.

**Un témoin gateway de la forme du payload.** Écrit, puis retiré avant commit :
les deux formes (`lastMessageId` peuplé, `lastMessageId` nul) sont déjà
assertées par des témoins existants, et `toBe`/`toBeNull` échouent tous deux
sur une clé absente. Le témoin n'ajoutait rien qu'un rouge de plus le jour où
le contrat casserait. Un test redondant est du bruit, pas une ceinture.

## 8. Pistes pour le cycle 53 — repérées, NON livrées

1. **Le web, et c'est maintenant la plus grosse.** Sa ligne de liste ignore
   TOUT le fan-out temps réel de l'aperçu : elle rend `conversation.lastMessage`
   (l'objet), quand le payload écrit des champs scalaires frères que personne ne
   lit. Donc pas seulement le cas « autre message » traité ici côté iOS —
   l'édition et la traduction n'y sont pas visibles non plus. Le correctif
   demande de choisir d'où la ligne tire son texte quand l'objet est absent ou
   périmé (un repli sur `lastMessagePreview` + `lastMessageAt`, probablement),
   ce qui est une décision de rendu à instruire, pas une règle de fusion.

2. **Les deux ÉVÉNEMENTS avant les deux FUSIONS** — la piste n°1 du cycle 51,
   intacte. `ConversationUpdatedEvent` (app) et `ConversationUpdatedStoreEvent`
   (SDK) portent des champs différents, reliés par un mapping manuel de quinze
   lignes. C'est ce mapping qui a laissé passer `location` (cycle 50). Un témoin
   comparant les deux jeux de champs coûterait beaucoup moins qu'une fusion.

3. **`PUT /conversations/:id` accepte toujours de renommer un DM** (cycle 51,
   piste n°3) — donnée morte en base, écrite par une route qui n'aurait pas dû
   l'accepter. Le client sait l'ignorer sur ses deux chemins ; la route reste
   ouverte, et la population de documents concernés n'est pas mesurée.

## 9. Gates

- **Gateway** : aucun changement de source. La suite
  `emitConversationPreviewUpdate` (29 témoins) relancée pour vérifier que le
  contrat sur lequel s'appuie le correctif client est bien celui qui est testé —
  verte.
- **Swift** : pas de toolchain sur cet hôte (ni `swift`, ni `xcodebuild`). Le
  RED n'a donc pas été EXÉCUTÉ ; il est raisonné, et chaque témoin neuf énonce
  le champ précis qu'il verrouille. `sdk-tests.yml` exécute les 10 témoins SDK
  (3 store + 5 facette + les 2 existants du fichier voisin) ; `ios.yml` compile
  la moitié app sans l'exécuter, sa suite `MeeshyTests` demandant un mot-clé
  dans le sujet du commit. Le résidu non joué est donc les 2 témoins app — même
  situation qu'aux cycles 49 à 51, notée ici pour ne pas la laisser passer pour
  une couverture complète.
- CHANGELOG + ADR (`packages/MeeshySDK/decisions.md`) + ce journal + leçon.
