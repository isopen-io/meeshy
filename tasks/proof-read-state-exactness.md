# Schéma de preuve — exactitude de l'état de lecture (messages & pièces jointes)

> But : établir formellement *quand* l'indicateur affiché représente exactement
> l'état réel, et *où* subsistent des trous. Conclusion honnête en fin de document.
> Statut build : non compilé (host Linux) — la preuve est sur la logique ; la CI
> macOS doit valider.

## 1. Modèle d'état (variables)

Pour un message `m` que **j'ai envoyé** dans une conversation `c` :

| Symbole | Définition | Source de vérité |
|---|---|---|
| `N(c)` | nombre réel de **destinataires actifs** (membres de `c` **hors** moi) | serveur (participants actifs) |
| `R(m)` | nombre réel de destinataires ayant **lu** `m` | serveur (curseurs) |
| `D(m)` | nombre réel ayant **reçu** `m` | serveur (curseurs) |
| `rc, dc` | `readCount`, `deliveredCount` de la ligne locale | REST (curseur-exact à l'instant du fetch) |
| `rAll, dAll` | `readByAllAt`, `deliveredToAllAt` (marqueurs) | **local uniquement** (chemin live all-or-nothing) |
| `n` | dénominateur d'affichage = `memberCount(c) − 1` | modèle conversation client |
| `s` | `deliveryStatus` stocké (issu de `toMessage`) | dérivé compteurs+state |

**Sémantique cible (WhatsApp all-or-nothing)**, pour `N(c) ≥ 1` :
```
I(m) = read       ⟺ R(m) = N(c)
I(m) = delivered  ⟺ D(m) = N(c)  ∧  R(m) < N(c)
I(m) = sent       sinon
```
(les états de cycle d'envoi `sending/invisible/clock/slow/failed` sont orthogonaux
et renvoyés verbatim — hors périmètre de cette preuve.)

## 2. Fonction de décision (resolver) — `DeliveryStatusResolver.resolve`
```
si status ∈ {lifecycle}      → status            (orthogonal)
si n ≤ 1 (1:1 / inconnu)      → s                 (cas direct)
sinon (groupe, n > 1) :
   si rAll ≠ nil ∨ rc ≥ n     → read
   si dAll ≠ nil ∨ dc ≥ n     → delivered
   sinon                      → sent
```

## 3. Chemins d'écriture (4) et leurs invariants

| # | Chemin | Écrit | Frontière ? | Dénominateur |
|---|---|---|---|---|
| P1 | Cold-start REST (`upsertFromAPIMessages`) | `rc,dc` (curseur-exact), `s` | — | — |
| P2 | Live cache/liste (`ConversationSyncEngine.applyReadReceipt`) | `s, rc, dc` | ✅ `event.updatedAt` | `summary.totalMembers` (serveur) |
| P3 | Live on-screen GRDB (`batchDeliverySync`) | `state→s`, `rAll/dAll` | ✅ `event.updatedAt` *(ajouté)* | `summary.totalMembers` (serveur, via handler) |
| P4 | Affichage (`BubbleContentBuilder`) | rien — calcule `I` via resolver | — | `n = memberCount−1` |

**Lemmes serveur** (architecture curseur, vérifiés) :
- **L1** : `rc ≤ N(c)` et `dc ≤ N(c)` — le serveur compte les participants actifs
  dont le curseur franchit `m.createdAt` ; il ne peut jamais sur-compter.
- **L2** (monotonie curseur) : si tous ont lu le message le plus récent à l'instant
  `t`, alors tous ont lu tout message de `createdAt ≤ t`.
- **L3** : le gateway **ne calcule pas** `readByAllAt`/`deliveredToAllAt` niveau
  message (modèle curseur ; test `MessageReadStatusService.test.ts:1229/1243`
  asserte `message.update` jamais appelé). Donc à froid `rAll = dAll = nil`.

**Invariant marqueurs (I-MARK)** : `rAll`/`dAll` ne sont posés QUE par P3, et P3
n'est nourri (handler) que si `fromCounts(summary) ∈ {read,delivered}` c.-à-d.
`summary.readCount ≥ summary.totalMembers` (serveur, dénominateur exact `= N(c)`),
ET seulement sur les lignes `createdAt ≤ event.updatedAt` (frontière). Le coalesce
de P1 (`api.x ?? existing.x`) garantit qu'un refresh REST n'efface jamais un
marqueur local.

## 4. Théorème de SOUNDNESS (jamais de sur-déclaration)

> **T1.** `I(m) = read ⟹ R(m) = N(c)` et `I(m) = delivered ⟹ D(m) = N(c)`,
> sous l'hypothèse **A1**.

**A1 (hypothèse de membership)** : `n = memberCount−1 ≥ N(c)` — la vue client du
nombre de membres n'est pas *sous-estimée* (aucune adhésion manquée non encore
synchronisée). Les changements d'adhésion se propagent par événement participant ;
les violations sont transitoires et s'auto-corrigent au refresh.

**Preuve par cas de la branche `I = read`** (le cas `delivered` est identique) :

- **Cas n ≤ 1 (direct)** : `I = s`. À froid `s = read` ⟺ `rc > 0` ; or `N(c) = 1`
  et par L1 `rc ≤ 1`, donc `rc > 0 ⟺ rc = 1 = N(c)` ⟹ `R(m) = N(c)`. En live, P3
  pose `read` ssi `summary.readCount ≥ totalMembers = 1`. ✅
- **Cas n > 1, via `rc ≥ n`** : par L1 `rc ≤ N(c)`. Par A1 `n ≥ N(c)`. Donc
  `rc ≥ n ≥ N(c) ≥ rc` ⟹ `rc = N(c)` ⟹ `R(m) = N(c)`. ✅
- **Cas n > 1, via `rAll ≠ nil`** : par I-MARK, posé seulement quand le serveur a
  constaté `readCount ≥ N(c)` (dénominateur serveur exact) sur une ligne
  `createdAt ≤` frontière. Par L1 `readCount = N(c)` ; par L2 vrai pour cette
  ligne. ⟹ `R(m) = N(c)`. **Indépendant de A1.** ✅

∎ Sous A1, l'indicateur ne sur-déclare jamais. La branche marqueur est
inconditionnellement sound (dénominateur serveur). La seule dépendance à A1 est la
branche compteurs à froid.

## 5. PRÉCISION (exactitude du palier affiché)

> **T2.** À froid (P1) et après toute transition all-or-nothing (P3), `I(m)` égale
> exactement le palier réel, sous A1 + membership courant.

- **Froid** : `rc,dc` curseur-exacts (P1), `n` exact (A1, membership courant) ⟹
  resolver exact. Une sur-déclaration `s` héritée de `toMessage` (`rc>0→read`) est
  **rétrogradée** par le resolver via compteurs (`rc < n`). ✅
- **Transition live « tous reçu / tous lu »** : P3 pose le marqueur ⟹ resolver
  exact immédiatement, sans course (marqueur indépendant des compteurs). ✅
- **Progression PARTIELLE intra-groupe** (ex. 3→7 sur 10) : le handler n'émet rien
  (pas « tous »). `rc` reste à sa dernière valeur REST. Mais aucun seuil
  all-or-nothing n'est franchi ⟹ le **palier affiché reste correct** (`sent`/
  `delivered`) ; seul le compteur caché est périmé (invisible UI). ✅ palier-exact
- **Convergence** : chaque refresh REST resynchronise `rc,dc` à l'exact. Système
  *eventually-exact*. ✅
- **Détail « qui a lu »** (sheet) : fetch REST dédié, exact à l'ouverture. ✅

## 6. Pièces jointes — état honnête

**Backend (exact)** : `AttachmentStatusEntry` (par user×attachment : `viewedAt`,
`downloadedAt`, `listenedAt`, `watchedAt`, counts/durées) + agrégats
`MessageAttachment.{viewedByAllAt, downloadedByAllAt, listenedByAllAt,
watchedByAllAt, viewedCount, downloadedCount, consumedCount}` **calculés** par le
gateway.

**iOS (trou)** : `MeeshyMessageAttachment` (SDK) **n'expose AUCUN** de ces champs ;
l'UI n'a **aucun indicateur par pièce jointe**. La coche vit **uniquement au niveau
message**.

**Conséquence pour la preuve** :
- L'état « message lu/reçu » (donc *le message porteur de la pièce jointe a été
  lu/reçu* au sens messagerie) est couvert par T1/T2 — même garantie que le texte.
- L'état de **consommation** d'une pièce jointe (vue/téléchargée/écoutée/regardée
  par tous) **n'est ni transporté ni affiché sur iOS** ⟹ **aucune garantie
  d'exactitude ne peut être faite pour une UI inexistante.** Seul le view-once
  (`viewOnceCount`) est transporté et pilote la bulle « burned ».

**Pour étendre la preuve aux pièces jointes** (incrément spécifié) :
1. Exposer `viewedByAllAt/…/viewedCount/…` dans `MeeshyMessageAttachment` (SDK) +
   décodage REST.
2. Consommer `message:attachment-updated` pour les compteurs live par pièce jointe.
3. Indicateur par pièce jointe + resolver dédié (même schéma all-or-nothing,
   dénominateur `N(c)`), avec marqueurs `…ByAllAt` comme signal « tous » (le
   gateway les calcule déjà — pas de dépendance A1 côté attachment).

## 7. Verdict honnête

| Périmètre | Garantie |
|---|---|
| **Soundness message** (jamais « lu » faux) | ✅ **Prouvé** (T1) sous A1 ; branche marqueur inconditionnelle. Trou de frontière GRDB **fermé**. |
| **Précision message** (palier exact) | ✅ Exact à froid + sur transitions ; partiel groupe = palier exact, compteur convergent. |
| **Pièce jointe — lu/reçu (niveau message)** | ✅ Couvert par l'indicateur message. |
| **Pièce jointe — consommation (vue/DL/écoute par tous)** | ❌ **Non surfacé iOS** — donnée backend exacte, mais pas de modèle/UI. Pas de garantie possible avant l'incrément §6. |
| **Précision de lecture (faux accusés émis)** | ⚠️ Hors périmètre actuel — gating foreground/viewport non livré (spec). N'affecte pas T1/T2 (qui portent sur l'AFFICHAGE de l'expéditeur), mais sur la *justesse des accusés émis*. |

**Réponse à « aura-t-on TOUJOURS un état exact ? »** :
- Pour l'**indicateur message de l'expéditeur** : **OUI, prouvablement sound**
  (jamais de mauvaise info) et **exact** à froid + après chaque transition, sous la
  seule hypothèse A1 (membership client non sous-estimé) qui s'auto-corrige. Au
  pire : sous-déclaration transitoire honnête, jamais sur-déclaration.
- Pour la **consommation des pièces jointes** : **PAS ENCORE** — c'est une feature
  iOS absente (backend prêt). L'incrément §6 la rend prouvable au même standard.

**Hypothèses à durcir pour un « toujours » inconditionnel** :
- A1 : faire porter par le REST `/messages` le `recipientCount` (totalMembers
  serveur) par message → supprime la dépendance au `memberCount` client et rend la
  branche compteurs inconditionnellement sound (aligne froid sur live).
- Précision lecture (§ verdict ligne 5) : gating foreground + viewport.
