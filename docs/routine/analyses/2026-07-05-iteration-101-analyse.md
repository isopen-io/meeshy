# Iteration 101 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `3509e57` (« fix(ios/calls): unconditional VoIP registration … (#1484) » — HEAD au démarrage
après `git reset --hard origin/main`, working tree propre). Branche de travail
`claude/brave-archimedes-sn3tuo` recréée depuis `origin/main` (`git checkout -B … origin/main`),
0 commit non-mergé à préserver.

**8 PR ouvertes au démarrage**, très concentrées : gateway réactions (#1479 `Post/CommentReactionHandler`,
#1475 `AttachmentReactionService`), livraison/envoi de message (#1486 `RedisDeliveryQueue`/`MessageHandler`,
#1483 `read-status` events), mentions (#1481 `mention-parser`/`MentionService`), langue (#1477
`conversation-helpers`/`validation`), iOS stories (#1473), Android profile (#1485). Cible retenue
**strictement disjointe** de toutes : deux **utilitaires de formatage d'affichage purs** côté web
(`apps/web/utils/truncate.ts`, `apps/web/utils/format-number.ts`), qu'aucune PR ouverte ne touche.

### Revue d'ingénierie (constat de démarrage)
Revue ciblée (agent d'exploration) des zones peu contestées : utilitaires purs `packages/shared/utils`
et `apps/web/utils`, service de présence gateway. Les utilitaires `shared` (call-summary, duration-format,
relative-time, time-remaining, presence-visibility, email-validator, participant-helpers,
notification-strings) sont propres et bien couverts. Trois candidats web remontés, deux confirmés comme
**défauts non ambigus** (F65, F66), le troisième écarté comme **parité intentionnelle** (voir plus bas).

## Cible : F65 + F66 — deux utilitaires de formatage d'affichage web produisent une sortie fausse aux cas limites

### Current state

**F65 — `truncateFilename` (`apps/web/utils/truncate.ts:15-21`)** tronque un nom de fichier en préservant
l'extension (`rapport-annuel-2026.pdf` → `rapport-an....pdf`). L'implémentation présumait que **tout**
nom possède une extension :

```ts
const ext = filename.split('.').pop() || '';         // sans point → nom entier
const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')); // lastIndexOf = -1 → substring(0,-1) = ''
const truncatedName = nameWithoutExt.substring(0, maxLength - ext.length - 4) + '...'; // budget négatif → ''
return `${truncatedName}.${ext}`;                    // → "....{nomEntier}"
```

**F66 — `formatCompactNumber` (`apps/web/utils/format-number.ts:14-20`)** abrège un compteur (K/M/B, une
décimale). Le palier est choisi sur la magnitude **brute**, mais le nombre affiché est arrondi
`.toFixed(1)` **après** le choix du palier.

Appelés en production :
- `truncateFilename` : `MarkdownViewer.tsx:196`, `PDFViewerWrapper.tsx:111` (nom de pièce jointe affiché).
- `formatCompactNumber` : `PostDetail.tsx`, `CommunityCarousel.tsx`, `me/page.tsx` (compteurs likes /
  commentaires / membres).

### Problems identified
- **F65 — sortie plus longue que l'entrée, préfixée `....`** pour tout nom **sans extension** (`Makefile`,
  `README`, pièces jointes sans point) : `truncateFilename('averylongnamewithoutanyextensionhere', 16)`
  retournait `'....averylongnamewithoutanyextensionhere'` (**40 caractères** — plus long que l'entrée ET
  que `maxLength`). Même dépassement quand l'**extension** dépasse le budget (`file.superlongextension`).
  Le but même du helper — **raccourcir** — était inversé.
- **F66 — `1000.0K` au lieu de `1.0M`** à la frontière de palier. Pour `value ∈ [999_950, 999_999]`,
  `abs < 1_000_000` ⇒ palier K ⇒ `999_999/1000 = 999.999` arrondi à `"1000.0"` ⇒ `"1000.0K"`. Idem
  M→B (`999_999_999` → `"1000.0M"`) et sur les négatifs (`-999_999` → `"-1000.0K"`). C'est **exactement**
  le défaut « 2000.0k au lieu de 2.0M » que la docstring du fichier revendique déjà avoir corrigé un
  palier plus bas.

### Root cause
- **F65** : réutilisation de `filename.lastIndexOf('.')` et `split('.').pop()` sans garde du cas « pas de
  point » (`lastIndexOf` = `-1`) ni du cas « extension plus longue que le budget » (`maxLength - ext - 4`
  négatif). `String.substring`/`slice` avec index négatif renvoient `''` au lieu d'échouer — dépassement
  silencieux.
- **F66** : sélection du palier sur `abs` brut, arrondi de la mantisse **après**. Une mantisse `< 1000`
  avant arrondi peut atteindre `1000.0` après — le palier n'est jamais promu.

### Business impact
Deux régressions d'affichage visibles sur des surfaces sociales de premier plan (compteurs de feed /
communauté, noms de pièces jointes). `"1000.0K"` et un nom de fichier tronqué **plus long** que
l'original sont des artefacts perçus comme des bugs de finition — précisément le type de détail où l'état
de l'art (YouTube/X/Instagram pour les compteurs, Telegram/Slack pour les noms) se distingue.

### Technical impact
- 2 fichiers production (`truncate.ts`, `format-number.ts`), fonctions **pures** — aucun changement de
  signature, d'import ou de contrat public. Se propage automatiquement aux 5 appelants.
- **F65** garantit `output.length <= maxLength` (pour `maxLength >= 4`) dans tous les cas de troncature,
  jamais de préfixe `....`, extension préservée quand le budget le permet.
- **F66** : promotion de palier au seuil `999_950` / `999_950_000` (valeurs qui arrondissent à `1.0` dans
  le palier supérieur) — zéro artefact `1000.0` sur toute la plage, symétrie négative préservée.

### Risk assessment
Très faible. Fonctions pures, sans effet de bord, sans dépendance. Aucun appelant ne s'appuyait sur la
sortie boguée (le test « no-extension » n'assertait que `.toContain('...')`, masquant le dépassement ;
le test compteurs n'exerçait aucune valeur juste sous la frontière). RED-GREEN prouvé + balayages
exhaustifs (`0→1.2 Md` sans artefact `1000.0` ; noms mixtes/accentués/multi-points × budgets `8..32`
tous `<= maxLength`).

### Proposed improvements (implémenté ce cycle)
- **F65** : garde du cas « pas d'extension usable » (`lastIndexOf('.') <= 0` — couvre `-1` et les dotfiles
  `.gitignore`) → troncature simple `head + '...'` clampée à `maxLength - 3` ; garde du cas « extension
  ≥ budget » → même repli. Format avec-extension inchangé (`head....ext`, longueur exacte `maxLength`).
- **F66** : abaissement des seuils de palier à `999_950` (M) et `999_950_000` (B) + commentaire expliquant
  la frontière d'arrondi.

### Expected benefits
- Zéro nom de fichier tronqué plus long que l'entrée ; zéro préfixe `....`.
- Zéro compteur `1000.0K` / `1000.0M` — roulement propre `999.9K → 1.0M`, `999.9M → 1.0B`.
- Renforcement des tests existants (le test no-extension n'asservissait plus rien).

### Implementation complexity
Faible (2 fonctions pures, ~8 lignes nettes + tests). Aucun changement de signature/contrat.

### Validation criteria
- [x] RED prouvé d'abord (script Node autonome, impls copiées verbatim) : 7 assertions échouent sur le
      code courant (`....averylongname…`, `1000.0K`, `1000.0M`, `-1000.0K`).
- [x] GREEN après fix : mêmes assertions + balayages exhaustifs → toutes vertes.
- [x] Tests jest ajoutés/renforcés : `truncate.test.ts` (no-ext `<= maxLength`, long-ext, dotfile, sweep
      mixte), `format-number.test.ts` (frontières K→M et M→B, négatifs).
- [ ] CI verte après push (jest web non exécutable localement — monorepo non bootstrappé ; logique
      vérifiée en Node autonome).

## Candidats écartés ce cycle (documentés)
- **F67 — `formatPresenceLabel` ignore le flag `isOnline`** (`apps/web/utils/presence-format.ts:20`) :
  **écarté — parité intentionnelle, pas un bug**. Le libellé « En ligne » est dérivé de la fraîcheur de
  `lastActiveAt` (`< 1 min`), pas de `isOnline`. Vérification côté iOS
  (`packages/MeeshySDK/…/RelativeTimeFormatter.swift:102` `lastSeenString`) : la contrepartie iOS dérive
  **elle aussi** « En ligne » purement du timestamp (`seconds < 60`) et **ne prend aucun flag `isOnline`**
  — son commentaire dit explicitement « Mirrors the web `formatPresenceLabel` contract ». Honorer
  `isOnline` côté web **divergerait** du contrat iOS partagé. Le champ `isOnline` de l'option web est du
  code mort (documente la donnée disponible) ; le retirer imposerait de toucher l'appelant profil pour un
  gain nul. Laissé tel quel.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/` (composition défunte, module fantôme).
- **F56b** (LOW) : symétriser le gateway pour émettre un `likeCount` absolu sur
  `post:reaction-added/removed` — **collision potentielle avec PR #1479** (`PostReactionHandler`) ;
  à faire dans une itération gateway dédiée après merge de #1479.
- **F67** (docs uniquement) : champ `isOnline` mort dans `FormatPresenceLabelOptions` — retrait cosmétique
  optionnel, sans changement de comportement, à faire seulement si une itération touche déjà `presence-format`.
