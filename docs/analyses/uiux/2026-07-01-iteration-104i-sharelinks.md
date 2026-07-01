# UI/UX Analysis — Iteration 104i (2026-07-01) — ShareLinksView

## Scope
**iOS exclusivement** (suffixe `i`). Écran **`ShareLinksView`** (« Liens de partage » —
statistiques + liste de liens de partage avec bouton copier + navigation vers le détail).
Thème : **accessibilité** (Dynamic Type sur les glyphes actionnables + VoiceOver), avec un
vrai **défaut a11y comblé** (bouton copier icône-seule sans intitulé).

> **Contexte de contention (run 2026-07-01)** : essaim massif d'agents iOS parallèles. Ma
> première tentative de ce run (99i `CommunityLinkDetailView`, PR #1276) a été **fermée comme
> superseded** — un agent parallèle avait mergé le même travail sur `main` via #1272 (`bb1ca52e9`)
> dans la fenêtre entre mon check de contention et mon push. Idem pour #1274/#1292 (mêmes courses
> sur CommunityLinkDetailView). Leçon appliquée : re-vérifier `list_pull_requests` **juste avant
> le push** et choisir une surface au grep-état `raw>0 / relative=0` non prise. PR ouvertes au
> moment du choix : #1292 (`AudioFullscreenView` 103i), #1290 (web), #1289 (`EditPostSheet` 100i).
> `ShareLinksView` = **aucune PR** → surface disjointe. Numéro **104i** (> 103i, plus haute PR iOS).

Vérification : CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur iOS 18.2) = build de
validation (SwiftUI ne compile pas sous Linux). **Aucun test neuf** : sweep de présentation +
traits a11y déclaratifs, aucune logique modifiée (parité 90i/93i/99i). `MeeshyFont`/`MeeshyColors`
résolus via `@_exported import MeeshyUI` → aucun import ajouté.

## Contexte / point de départ
`ShareLinksView.swift` (257 lignes). Le **texte** utilisait déjà des polices sémantiques
scalables (`.headline`, `.title2`, `.caption`, `.subheadline`, `.footnote`, `.caption2`) → déjà
Dynamic-Type-friendly. Les **7 sites** `.font(.system(size:))` restants étaient tous des glyphes
ou du chrome. Palette déjà tokenisée (`MeeshyColors.shareAccent`/`brandPrimary`/`neutral500`,
`theme.*`). Le vrai défaut : le **bouton copier** de chaque ligne (`doc.on.doc`, icône-seule)
n'avait **aucun `.accessibilityLabel`** → VoiceOver annonçait « doc.on.doc » ou rien.

## iOS Findings

### Dynamic Type — glyphes actionnables migrés (3/7)
| Ligne | Rôle | Avant | Après |
|---|---|---|---|
| 80 | bouton header « Créer » `plus.circle.fill` | `.system(size: 22)` | `MeeshyFont.relative(22)` |
| 102 | icône de carte de stat (`link`/`checkmark.circle.fill`/…) | `.system(size: 20)` | `MeeshyFont.relative(20)` |
| 202 | glyphe du bouton copier `doc.on.doc` | `.system(size: 16)` | `MeeshyFont.relative(16)` |

### 4 glyphes gardés figés + commentés
| Ligne | Rôle | Décision |
|---|---|---|
| 62 | `chevron.left` 16pt header retour | chrome nav (métaphore fixe), figé — doctrine 82i/87i/90i. `.accessibilityLabel(a11y.back)` déjà présent. |
| 152 | `link.badge.plus` 40pt hero état vide | décoratif ≥40pt, figé + `.accessibilityHidden(true)` — doctrine 84i/87i. |
| 173 | glyphe de ligne `link`/`link.badge.minus` 16pt dans cercle fixe 40×40 | figé (déborderait) + `.accessibilityHidden(true)` — doctrine 74i/86i (le nom du lien adjacent porte le sens). |
| 208 | `chevron.right` 12pt disclosure | chrome décoratif, figé + `.accessibilityHidden(true)` (la ligne est un `NavigationLink`). |

### VoiceOver (4 traits + 1 défaut comblé)
- **`.accessibilityLabel` sur le bouton copier** (ligne 202, clé SSOT existante `common.copyLink`,
  déjà utilisée par `CommunityLinksView`/`TrackingLinksView` → **0 clé neuve**) — **comble un vrai
  défaut** : le bouton icône-seule était muet au lecteur d'écran.
- `.accessibilityElement(children: .combine)` sur chaque carte de stat (lit « 5, Liens » d'un bloc)
  + `.accessibilityHidden(true)` sur son icône décorative.
- `.accessibilityHidden(true)` sur les glyphes décoratifs (hero, glyphe de ligne, chevron disclosure).
- `.accessibilityAddTraits(.isHeader)` sur l'en-tête « MES LIENS » (rotor, doctrine 86i).

## Périmètre délibérément exclu (ne pas re-flagger)
- **Texte déjà en polices sémantiques** (`.headline`/`.title2`/`.caption`/…) → déjà scalable, intact.
- **Palette déjà tokenisée** (`shareAccent`/`brandPrimary`/`neutral500`/`theme.*`) → aucun swap.
- **4 glyphes figés** (lignes 62, 152, 173, 208) : figés à dessein — ne pas proposer migration.
- **`ShareLinkDetailView`** (destination du `NavigationLink`) = surface distincte, hors-scope ici.

## Anti-repetition check
`list_pull_requests` (2026-07-01, juste avant push) : 3 PR ouvertes (#1292 `AudioFullscreenView`,
#1290 web, #1289 `EditPostSheet`) — **aucune** ne touche `ShareLinksView`. Distinct de
`SharePickerView` (mergé) et de `ShareLinkDetailView`. Surface neuve, 0 mention historique.

## Status : ✅ analyse complète + corrections appliquées
3 migrations Dynamic Type / 4 glyphes figés documentés / 5 traits VoiceOver (dont 1 défaut réel
comblé) — **1 fichier**, 0 logique / 0 clé i18n neuve / 0 test neuf. Force-push branche
`claude/upbeat-euler-spied4` + PR ; CI `ios-tests.yml` ; merge dans `main` après CI verte.
Voir plan `2026-07-01-plan-iteration-104i-sharelinks`.

### Annotation post-correction (ne pas reproduire)
**NE PLUS re-flagger** pour Dynamic Type les glyphes de `ShareLinksView` (soldés 104i). Les 4
`.system(size:)` figés (chevron.left 16, hero 40, glyphe de ligne 16 en cercle 40×40, chevron.right
12) sont **volontairement** figés. Bouton copier désormais labellisé (`common.copyLink`).

### Différé prioritaire iOS 105i+
- Dynamic Type grandes surfaces (une par itération, vérifier PR ouvertes avant) : `StoryViewerView+Content`
  (31, ⚠️ collision i18n #1174), `ConversationView+Composer` (22, lot critique prudent),
  `OnboardingAnimations` (17), `AudioEffectsPanel` (9), `VideoFilterControlView` (7), `FeedView` (7).
- Audit `.textSelection(.enabled)` sur les vues de détail à valeurs copiables (`ShareLinkDetailView`).
