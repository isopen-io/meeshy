# Cycle 46 bis — la garde monotone iOS jetait les recalculs autoritatifs

Journal d'audit. Suite du cycle 40, qui avait MESURÉ ce défaut sans le livrer
(« pas de toolchain Swift ici », § Constats iOS **A**), et du cycle 45, dont la
piste ouverte se referme ici sans correctif — voir § 1.

**« bis » parce qu'une AUTRE exécution de cette routine a tourné en parallèle et
porte déjà le numéro 46** (`tasks/realtime-sync-audit-2026-08-15-cycle46.md`,
« l'écran Confidentialité écrivait dans un tiroir que le serveur n'ouvrait
pas »). C'est le motif exact de la leçon 281, et il s'est reproduit. Les deux
exécutions sont parties de la MÊME piste léguée par le cycle 45 et ont abouti à
la MÊME conclusion sur elle (§ 1) — indépendamment, ce qui la confirme à deux
voix — puis ont divergé : l'autre a suivi les deux rangements de la préférence,
celle-ci a suivi la garde monotone de l'aperçu. Aucun recouvrement de code.

---

## 1. La piste héritée du cycle 45 : tranchée, NON défectueuse

Le cycle 45 laissait une question ouverte :

> `_loadReadReceiptOptOuts` ne considère QUE les participants qui ont un
> `userId` (`if (!participant.userId) continue`) […] à établir avant d'écrire,
> `PATCH /me/preferences/privacy` est-il atteignable par une session anonyme ?

**Réponse : non.** Les deux routeurs de préférences sont montés en refusant
explicitement les sessions anonymes :

```ts
// routes/me/preferences/index.ts:41  et  routes/me/preferences/categories.ts:166
const authMiddleware = createUnifiedAuthMiddleware(prisma, {
  requireAuth: true,
  allowAnonymous: false,
});
```

et le middleware unifié répond `403 REGISTERED_USER_REQUIRED` avant tout
handler (`middleware/auth.ts:496`). Un invité de lien partagé ne peut donc
enregistrer aucune préférence `showReadReceipts` : côté écriture
`getPreferencesForUsers` le sert par les défauts (`showReadReceipts: true`),
côté lecture le gate l'ignore — **les deux bouts s'accordent, et pour la bonne
raison**, pas par coïncidence. Le `continue` est correct.

Vérifié au passage, puisque la même piste le suggérait : le cache d'opt-out
(`READ_RECEIPT_OPT_OUT_CACHE`, TTL 5 min) n'est invalidé nulle part en
production — mais `PrivacyPreferencesService.invalidateCache` ne l'est pas
davantage (aucun appelant hors de son propre test). Les deux caches ont le même
TTL et la même absence d'invalidation : l'alignement que le commentaire du
premier revendique est RÉEL. Rien à corriger là non plus.

**Aucun correctif n'a donc été écrit sur cette piste.** Elle est close.

---

## 2. Le défaut livré : un aperçu qui recule est jeté, sur deux chemins nominaux

### 2.1 La garde

`ConversationStore.merging` (`packages/MeeshySDK/.../Store/ConversationStore.swift`)
tient le groupe d'aperçu — `lastMessageAt`, `lastMessageId`,
`lastMessagePreview`, et la paire du Prisme — pour **monotone** :

```swift
let lastMessageIsCurrent = event.lastMessageAt.map { $0 >= conv.lastMessageAt } ?? true
if lastMessageIsCurrent { /* seul endroit où le groupe s'applique */ }
```

La règle protège d'un cas réel : une diffusion pour un message ANCIEN qui
doublerait une plus récente laisserait la ligne afficher l'horodatage du neuf
avec le texte du vieux. Le `>=` (et non `>`) est lui aussi motivé — une ÉDITION
garde le même `createdAt`.

### 2.2 Ce que la garde emporte avec elle

Un aperçu **recalculé par le serveur** recule légitimement, et il le fait sur
des chemins nominaux :

| geste | ce que le serveur recalcule | l'aperçu |
|---|---|---|
| supprimer le dernier message **pour tous** | le dernier message non supprimé | le PRÉCÉDENT, donc plus ancien |
| masquer son propre dernier message visible (`delete-for-me`, `clear-history`) | le dernier message visible **par ce lecteur** | plus ancien par construction |
| une traduction qui atterrit | le même message | inchangé (pas concerné) |

Dans les deux premiers cas, la garde jette le groupe ENTIER. Conséquences
mesurées :

- **Supprimer pour tous le dernier message** laisse la ligne de liste afficher
  l'aperçu d'un message qui n'existe plus, jusqu'à une mutation SANS RAPPORT
  dans la même conversation — indéfiniment si rien d'autre n'y bouge.
- Le correctif du **cycle 40** (`refreshPersonalConversationPreview`, quatre
  écrivains câblés) était **effectif sur web et inerte sur iOS** : l'événement
  qu'il a fait naître arrive, et se fait jeter à l'entrée.

### 2.3 Pourquoi le client ne pouvait pas s'en sortir seul

Du seul CONTENU, une diffusion périmée et un recalcul autoritatif sont
**indiscernables** : les deux portent un `lastMessageAt` qui recule, les deux
nomment un `lastMessageId` différent. Aucun prédicat sur le payload ne les
sépare. Seul l'ÉMETTEUR sait lequel des deux il envoie.

---

## 3. Le correctif : l'émetteur le déclare, la garde lui cède

**Un champ, optionnel, posé par UN SEUL émetteur.**

```ts
// socketio/emitConversationPreviewUpdate.ts — basePayload
previewRecalculated: true,
```

`emitConversationPreviewUpdate` est, par définition, l'unité qui RECALCULE
l'aperçu depuis l'état courant de la base (`message.findFirst` + la sonde de
masquage personnel). Ses six appelants sont tous des recalculs : édition,
suppression pour tous, traduction qui atterrit, masquage personnel. Les
émetteurs **message-driven** (`MessageHandler`, `MeeshySocketIOManager`) ne le
posent pas — ce sont exactement ceux que la garde protège.

Côté SDK, la garde cède devant la déclaration, et devant elle seule :

```swift
if lastMessageIsCurrent || event.previewRecalculated {
```

Trois maillons, parce que le champ traverse trois frontières et qu'un seul
manquant le rend inerte :

1. `ConversationUpdatedEventData.previewRecalculated?` — contrat partagé ;
2. `ConversationUpdatedEvent.previewRecalculated` — décodage
   (`decodeIfPresent ?? false`) ;
3. `ConversationStoreSocketBridge.mapConversationUpdated` — **le maillon qui
   manquait déjà pour `updatedAt`** : cette fonction ne recopie qu'un
   sous-ensemble des champs décodés, et un drapeau décodé mais non transmis
   serait aussi inerte qu'un drapeau absent.

Le store RAM et le cache disque partagent `merging` (`ConversationSyncEngine`
l'appelle), donc les deux héritent du correctif sans divergence possible —
c'est la raison pour laquelle cette règle vit hors de l'acteur.

### 3.1 La DEUXIÈME surface, trouvée en instruisant la première

`ConversationListViewModel` (app, pas SDK) écoute le même événement et n'a PAS
la même forme. Sa branche de bump est gardée par un `>` strict ; tout ce qui
n'avance pas tombe dans un `else` qui applique **l'aperçu, l'id et le Prisme**
— mais **jamais `lastMessageAt`**, qu'aucune ligne de cette branche ne réécrit.

Conséquence, distincte de celle du store et plus discrète : après une
suppression pour tous du dernier message, la ligne affichait **le bon texte au
mauvais RANG**. L'aperçu se corrigeait, l'horodatage restait celui du message
supprimé, et la liste est triée par `lastMessageAt` décroissant
(`conversationsAreInOrder`) — la ligne gardait donc la place que lui donnait un
message qui n'existe plus, jusqu'à la synchro suivante.

Le correctif y est d'une ligne, sous le même drapeau et pour la même raison ;
pas de re-tri explicite, les sections d'affichage trient à la construction.

**Ce que cette surface apprend** : « le correctif du cycle 40 est inerte sur
iOS » était vrai du store et FAUX de l'écran. Les deux chemins client du même
événement avaient divergé — l'un jetait le groupe entier, l'autre en appliquait
les trois quarts. Aucun des deux n'était complet, et aucun ne pouvait le devenir
sans la déclaration du serveur.

---

## 4. Ce qui a été écarté, et pourquoi

**Omettre `lastMessageAt` du payload de recalcul** pour passer sous la garde.
Le champ deviendrait faux et le tri de la liste avec lui : on remplacerait un
aperçu périmé par un TRI périmé. (Le cycle 40 l'écrivait déjà.)

**Ordonner par `updatedAt` (heure d'émission) plutôt que par `lastMessageAt`.**
C'était la piste nommée par le cycle 40, et elle est théoriquement la bonne :
`updatedAt` est REQUIS sur le contrat et posé par les trois émetteurs, et le
chemin des accusés de lecture s'en sert déjà comme frontière
(`ConversationSyncEngine.applyReadReceipt(frontier:)`). Écartée pour trois
raisons mesurées :

1. Elle exige de mémoriser, PAR conversation, l'heure d'émission du dernier
   aperçu appliqué — donc un champ persisté de plus sur `MeeshyConversation`,
   qui traverse le cache disque.
2. Ce marqueur est **nul sur une ligne fraîchement chargée par REST**, c'est-à-dire
   au démarrage à froid — exactement la situation où le défaut se produit
   (l'utilisateur ouvre l'app, pose l'écran de liste, un pair supprime son
   dernier message). La règle ne se serait donc appliquée qu'à partir du
   DEUXIÈME événement : elle ne ferme pas le défaut visé.
3. Elle troque une garde de contenu contre une comparaison d'horloges entre
   nœuds gateway, dont la dérive n'est bornée par rien ici.

**Faire porter la distinction par `lastMessageId`.** Ne discrimine pas : une
diffusion périmée nomme, elle aussi, un autre message.

---

## 5. Ce qui reste assumé

Deux recalculs qui se doubleraient s'appliquent dans l'ordre d'ARRIVÉE. Une
même connexion Socket.IO préserve l'ordre d'émission, et le seul cas où la
course se joue vraiment — une traduction qui atterrit derrière un message plus
neuf — est déjà tenu **côté serveur** par la borne `onlyIfLatestIs`, qui
abandonne le fan-out au lieu d'émettre un aperçu dépassé. Le drapeau n'ouvre
donc la garde que pour des payloads que le serveur a lui-même jugés courants.

---

## 6. Gates

- [x] **2 RED discriminants gateway** vus rouges avant correctif, restaurés
      verts après (`emitConversationPreviewUpdate.recalcFlag.test.ts`), dont le
      témoin du recul lui-même : le payload servi au lecteur masquant nomme
      `PREVIOUS_ID` et porte l'horodatage plus ANCIEN.
- [x] Double prisma **COMPLET** dans le nouveau fichier (les quatre modèles) —
      l'émetteur avale ses propres pannes, un double amputé le rend muet et
      laisse le témoin vert sur une version qui n'émet rien (leçon du cycle 40,
      re-notée dans l'en-tête du fichier).
- [x] **1 garde de non-régression gateway** : le bump message-driven
      (`MessageHandler.broadcastNewMessage`) n'a PAS le drapeau — sans elle,
      poser le drapeau partout passerait pour un correctif alors que ce serait
      le défaut symétrique.
- [x] **8 témoins Swift** : 3 sur `merging` (le recul déclaré s'applique ; le
      MÊME recul non déclaré reste jeté ; le Prisme suit le groupe), 1 de bout
      en bout sur le pont, 2 sur le décodage (clé présente / clé absente), et 2
      sur `ConversationListViewModel` (l'horodatage suit l'aperçu quand c'est
      déclaré ; il ne bouge pas sinon).
- [x] `bunx tsc --noEmit` gateway : **0**. `packages/shared` : **0**.
- [x] Suite gateway ciblée : **56 suites / 851 tests** verts
      (socketio + handlers + visibilité personnelle).
- [x] Suite gateway COMPLÈTE : **730 suites / 17 802 tests**, tout vert (353 s).
      Cycle 45 : 729 / 17 799 — soit exactement +1 suite et +3 tests, les
      ajouts de ce cycle et rien d'autre.
- [x] Web : aucun changement requis — `use-socket-cache-sync` applique le patch
      sans garde monotone (vérifié), le champ y est simplement ignoré.

### Vérification CI (Swift)

Aucune toolchain Swift dans ce conteneur — même contrainte qu'au cycle 40. La
vérification passe donc par `sdk-tests.yml` (macos-15, Xcode 26.1.1, simulateur
iOS 18.2) pour le SDK, et par `ios.yml` (MeeshyTests) pour la moitié app. Le RED
Swift est démontré par
la contre-épreuve incluse
(`test_applyConversationUpdated_backwardsWithoutRecalcFlag_staysRejected`) : le
même payload, au même recul, sans la déclaration, reste jeté — un correctif qui
aurait simplement retiré la garde ferait rougir ce témoin-là.

---

## 7. Piste suivante — repérée, NON livrée

(Distincte des trois que l'autre cycle 46 lègue : celles-ci portent sur les
deux rangements de la préférence et l'invalidation des caches à l'écriture.)

`emitConversationPreviewUpdate` sait dire « ce lecteur n'a plus AUCUN message
visible ici » : `messagePayloadFor(null)` sort alors `lastMessageAt: null`,
`lastMessageId: null`, et le prisme vide. Côté SDK, `merging` n'applique QUE des
valeurs non-nil (`if let v = event.lastMessageId`) : un payload entièrement nul
laisse donc la ligne afficher l'aperçu d'avant, drapeau ou pas. Le cas se
produit quand un lecteur masque le DERNIER message qui lui restait dans une
conversation.

C'est le même défaut de famille que celui fermé ici — un serveur qui dit la
vérité, un client qui ne sait pas l'entendre — mais il demande autre chose qu'un
drapeau : distinguer, dans le groupe d'aperçu, « champ non fourni par cette
variante de payload » (le sens actuel de `nil`) de « le serveur DIT qu'il n'y a
plus rien ». C'est exactement le tri-état que
`LastMessagePreviewTranslations.unchanged` / `.replaced([:])` a déjà dû
introduire pour la carte du Prisme, et pour la même raison — **la solution
existe déjà dans ce fichier, appliquée à un champ voisin.** À établir avant
d'écrire : `resolvedLastMessagePreview` et la ligne de liste savent-ils rendre
une conversation sans dernier message, ou faut-il d'abord leur en donner la
forme ?
