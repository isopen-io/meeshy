# Iteration 101 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `048e40b` (« feat(android/profile): profile-header enrichment … #1482 » — HEAD au
démarrage après `git reset --hard origin/main`, working tree propre). Branche de travail
`claude/brave-archimedes-iy7tgv` recréée depuis `origin/main` (`git checkout -B … origin/main`),
0 commit non-mergé à préserver.

PR ouvertes au démarrage (9) : **#1484** (iOS calls), **#1483** (gateway/shared read-status
dual-emit), **#1481** (mentions F60), **#1480** (gateway CallService P2034), **#1479** (gateway
post/comment reaction removal idempotency), **#1477** (langue F63/F64), **#1476** (iOS calls
refactor), **#1475** (gateway AttachmentReactionService), **#1473** (iOS story text tool). Les
domaines **reactions, calls, mentions, résolution/normalisation de langue, notifications, et
socketio read-status** sont donc tous en développement parallèle actif. Cible retenue **strictement
disjointe** de tous ces fichiers.

## Cible : durcissement des utilitaires **purs** de présentation/validation web (`apps/web/utils/`)

Trois défauts concrets et prouvables, chacun dans une **fonction pure isolée** d'`apps/web/utils/`,
testable en jest, hors de tout PR ouvert. Deux surveys indépendants ont convergé sur les deux
premiers (même sibling in-repo cité comme preuve).

### F65 — `formatCompactNumber` sur-bucket au franchissement de palier (K→M, M→B)

#### Current state
`apps/web/utils/format-number.ts` choisit le palier (`K`/`M`/`B`) en comparant la valeur **brute**
au seuil, puis formate avec `.toFixed(1)`.

#### Problems identified
Pour toute valeur dans `[999_950, 999_999]`, `value / 1_000 = 999.9…` que `.toFixed(1)` **arrondit à
`"1000.0"`**. Résultat : `formatCompactNumber(999_999)` → `"1000.0K"` au lieu de `"1.0M"`. Idem au
palier million→milliard : `999_999_999` → `"1000.0M"` au lieu de `"1.0B"`. Symétrique pour les
négatifs (`-999_999` → `"-1000.0K"`).

#### Root cause
Le palier est sélectionné **avant** l'arrondi. La docstring du fichier annonce pourtant que la
centralisation (iter 61) visait exactement à tuer cette classe de bug (`me/page.tsx` affichait
« 2000.0k » au lieu de « 2.0M ») — le contrat est violé par la fonction censée l'imposer.

#### Business impact
Compteurs de likes/vues/abonnés (`PostDetail`, `CommunityCarousel`, `me/page`) affichent une valeur
d'ordre de grandeur faux (`1000.0K` lu comme « mille-mille ») sur la frange juste sous le million/
milliard — sur des surfaces sociales où le compteur est un signal produit de premier plan.

#### Root cause fix
Le palier est désormais choisi sur la valeur **après arrondi** : si l'arrondi à une décimale remonte
la mantisse à 1000, on promeut à l'unité supérieure. **Miroir exact** de la garde déjà présente dans
`packages/shared/utils/call-summary.ts` → `formatCallDataSize` (« Use the post-rounding value for the
unit cutover so e.g. 999.7 KB promotes to '1 MB' »).

### F66 — `truncateFilename` allonge/corrompt les noms **sans extension** (et à extension longue)

#### Current state
`apps/web/utils/truncate.ts` : `ext = filename.split('.').pop()`, `nameWithoutExt =
filename.substring(0, filename.lastIndexOf('.'))`, budget `maxLength - ext.length - 4`.

#### Problems identified
- **Sans point** : `lastIndexOf('.')` = `-1` → `substring(0, -1)` = `''` et `ext` = le nom entier.
  `truncateFilename('finalpresentationdocument', 15)` → `"....finalpresentationdocument"` — **plus
  long que l'entrée**, préfixé d'un `.` parasite. L'opposé d'une troncature.
- **Extension longue** : `maxLength - ext.length - 4` devient négatif → `substring` clampe à `''` →
  sortie = `"...."` + extension, > `maxLength`.
- La sortie n'est **jamais** bornée par `maxLength`, contrairement au contrat (« préservant
  l'extension », défaut `maxLength = 32`).

#### Root cause
Aucune garde sur le point interne (`lastIndexOf('.') > 0`), ni clamp de la longueur du nom à ≥ 0, ni
borne finale sur `maxLength`. Callers : `markdown/MarkdownViewer.tsx`, `pdf/PDFViewerWrapper.tsx`
(fichiers réels `README`, `Dockerfile`, ou à extension inhabituellement longue).

#### Root cause fix
Extension = uniquement sur un **point interne** (`dotIndex > 0`, exclut point de tête `.gitignore`
et de queue `fichier.`). On préserve l'extension seulement si le budget de nom reste ≥ 1 caractère ;
sinon on tronque tout le nom, **borné par `maxLength`**. Garde `maxLength ≤ len('...')` pour les cas
dégénérés.

### F67 — `validateMessageContent` mesure la longueur **non-trimmée** (drift avec le payload envoyé)

#### Current state
`apps/web/utils/messaging-utils.ts` : la garde de vacuité **trim** (`!content.trim()`), mais la garde
de longueur teste `content.length` **brut** (ligne 37). Le sibling `prepareMessageMetadata` envoie
`content.trim()`.

#### Problems identified
Un message de `maxLength` caractères visibles + espaces en fin est **rejeté** « trop long », alors
que le payload réellement envoyé (`content.trim()`) est **sous** la limite. Les deux helpers voisins
divergent sur le comptage des espaces de fin.

#### Root cause fix
`content.trim().length > maxLength` — parité stricte avec le trim déjà appliqué à la vacuité et au
payload. Une ligne.

## Risk assessment
Très faible. Trois fonctions pures, **aucune** signature/import/contrat public modifié. Pour les
données correctes (cas nominal), la sortie est identique : `formatCompactNumber` inchangé hors des
frontières d'arrondi ; `truncateFilename` inchangé pour un nom à extension normale sous budget ;
`validateMessageContent` inchangé sauf la frange espaces-de-fin (élargit l'acceptation, ne restreint
jamais). Aucun test existant n'assertait les sorties buggées (grep vide).

## Validation criteria
- [x] Tests RED d'abord : `999_999`→attendu `1.0M` observé `1000.0K` ; `truncateFilename` sans
      extension observé plus long que l'entrée ; `validateMessageContent(maxLen chars + '   ')`
      observé invalide.
- [x] GREEN après fix : `format-number` + `truncate` + `messaging-utils` = **53/53** vertes.
- [x] Non-régression : les suites préexistantes de ces 3 fichiers restent vertes (aucune assertion
      d'ancien comportement).
- [x] Type-check : compilation ts-jest OK (les tests s'exécutent), signatures inchangées.

## Candidats écartés ce cycle (documentés)
- **Réactions post/comment « throw vs swap »** (`PostReactionService`/`CommentReactionService`
  `MAX_REACTIONS_PER_USER=1` lève au 2e emoji au lieu de swap comme message/attachment) : **décision
  produit** (throw / swap / multi-emoji) + domaine réactions en dev parallèle (#1475, #1479). Reporté
  (F68).
- **socketio-events cleanup** items #1 (`NOTIFICATION` générique), #2 (`STORY_TRANSLATION_UPDATED`),
  #3 (`READ_STATUS_UPDATED`) : #2 déjà résolu (docs stale), #3 en cours dans #1483, #1 = migration
  cross-client large.

## Améliorations futures (report)
- **F68** (décision produit) : unifier la sémantique des réactions post/comment sur le swap
  (comme message/attachment) — à trancher avec le produit.
- **F51b**, **F56b** (LOW) : reportés des itérations précédentes.
- **F65b** (LOW) : `formatCompactNumber` n'a pas de palier `T` (trillion) — au-delà de ~1000B affiche
  `"1050.0B"`. Acceptable (comportement antérieur préservé), à ajouter si un compteur l'exige.
</content>
