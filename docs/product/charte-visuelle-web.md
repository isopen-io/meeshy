# Charte visuelle du web — une couleur se LIT, elle ne s'écrit pas

> Issue #8879 · directive porteur du 2026-09-30 · décision `apps/web/decisions.md` § D-157.
> S'applique à `apps/web` (web, PWA, coque Android). Le Kotlin natif est gelé.

La source des couleurs est le SDK : `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`
et `DesignTokens.swift`, dérivés vers `packages/design-tokens/ios.css` (généré — jamais édité :
`node packages/design-tokens/scripts/generate-from-ios.mjs`). Les noms web vivent dans
`apps/web/src/styles/ios.css` (`@theme inline`) et `app.css`. Une couleur qui manque s'AJOUTE dans
`MeeshyColors.swift`, puis se régénère.

## 1. Les rôles unifiés

Quand la table héritée (`packages/design-tokens/{tokens,dark,light}.css`) et le SDK donnaient deux
rôles à une couleur, **le rôle du SDK gagne** : la table pointe vers `var(--ios-…)`.

| rôle hérité | sombre | clair |
|---|---|---|
| `--color-bg` / `-bg-sunken` / `-surface` / `-surface-raised` | `--ios-surface` / `--ios-media-backdrop` / `--ios-surface-card` / `--ios-indigo-950` | valeur / `--ios-indigo-50` / valeur / `--ios-surface` |
| `--color-text` · `-text-muted` · `-text-subtle` | `--ios-ink` · `--ios-ink-2` · `--ios-ink-3` | `--ios-ink` · **valeur** · **valeur** (AA sur les voiles) |
| `--color-border` · `-strong` · `-interactive` | `--ios-edge` · `--ios-neutral-600` · `--ios-neutral-500` | `--ios-edge` · `--ios-neutral-400` · `--ios-neutral-500` |
| `--color-accent-200/300/400`, `-primary-soft/-softer` | rampe `--ios-indigo-*` | rampe `--ios-indigo-*` |
| `--color-primary` | `--ios-indigo-400` (**pas** 500 : 4,43:1 en encre) | `--ios-indigo-600` |
| `--color-success` · `-warning` · `-danger` | `--ios-success` · `--ios-warning` · `--ios-error` | **valeurs assombries** (AA) |
| `--color-overlay` | `--ios-scrim-strong` | `--ios-scrim` |
| `--text-2xs/xs/base/md/xl/4xl` | `--ios-font-footnote/subhead/body/headline/title/largeTitle` | idem |
| `--space-1…6` · `--radius-lg/xl/2xl/pill` | `--ios-space-*` · `--ios-radius-lg/xl/xxl/full` (2xl : 26 → **24**) | idem |

Restent des valeurs : ce qu'iOS n'a pas (voiles d'état, ombres, palette d'avatars) et la présence,
dont la source est `packages/shared/utils/user-presence.ts`. `check-jetons.mjs` mesure la table
résolue (sdk compris) : `cd apps/web && bun run check:tokens`.

## 2. Motif → jeton

**Le contexte décide** : une encre posée sur un MÉDIA (photo, vidéo, story, réel, vidéo d'appel)
n'est pas une encre posée sur un APLAT (bouton plein, badge), ni une encre d'écran.

| motif trouvé | contexte | remplacement |
|---|---|---|
| `text-white`, `'#fff'`, `'white'` | sur un aplat marque/accent/erreur | `text-ios-on-brand` · `var(--color-ios-on-brand)` |
| `text-white`, `'#fff'`, `'white'` | sur un média | `text-on-media` · `var(--color-on-media)` |
| blanc 85–90 % | sur un média | `text-on-media-2` · `var(--color-on-media-2)` |
| blanc 50–80 % | sur un média | `text-on-media-3` · `var(--color-on-media-3)` |
| blanc 8–18 % en fond (`bg-white/15`) | sur un média | `bg-media-fill` · `var(--color-media-fill)` |
| blanc 20–30 % en filet | sur un média | `border-media-hairline` · `var(--color-media-hairline)` |
| `bg-black`, `'#000'`, `'#111'` | fond d'une visionneuse | `bg-media-backdrop` · `var(--color-media-backdrop)` |
| noir 25–40 % | disque derrière une icône, dégradé sous le chrome | `bg-scrim-soft` · `var(--color-scrim-soft)` |
| noir 45–55 % | sous un texte posé sur un média | `bg-scrim` · `var(--color-scrim)` |
| noir 60–95 % | ce qui assombrit un média | `bg-scrim-strong` · `var(--color-scrim-strong)` |
| `backdrop:bg-black/40` | voile d'une feuille | `backdrop:bg-veil` |
| `color-mix(…, black)` / `(…, white)` (ombrer, éclaircir) | tout | le même mélange sur `var(--color-media-backdrop)` / `var(--color-on-media)` |
| ombre `rgba(0,0,0,x)` | carte, menu | `shadow-soft` / `shadow-cast` |
| `#6366f1` · `#4f46e5` · `#4338ca` · `#818cf8` · `#a5b4fc` · `#1e1b4b` | marque | `var(--color-ios-brand)` · `var(--ios-indigo-600)` · `var(--color-ios-brand-deep)` · `var(--color-i400)` · `var(--color-i300)` · `var(--ios-indigo-950)` |
| `#8b5cf6` · `#a855f7` | violet | `var(--ios-purple-600)` · `var(--ios-purple-500)` |
| rouge (`#ef4444`, `#f87171`, `#dc2626`) | TEXTE, icône | `var(--color-error)` — mais sur une surface TOUJOURS sombre (média, appel, visionneuse) `var(--ios-error)` : `--color-error` suit le schéma et tombe à `#c81e1e` en clair, illisible sur du verre sombre |
| rouge | APLAT (raccrocher, badge) + encre blanche | `var(--ios-error-strong)` + `var(--color-ios-on-brand)` |
| vert (`#34d399`, `#10b981`, `#22c55e`) | texte · aplat | `var(--color-success)` · `var(--ios-success)` (surface toujours sombre : `var(--ios-success)` pour les deux) |
| ambre (`#fbbf24`, `#f59e0b`) | texte · aplat | `var(--color-warning)` · `var(--ios-warning)` (surface toujours sombre : `var(--ios-warning)` pour les deux) |
| bleu (`#60a5fa`, `#3b82f6`, `#0ea5e9`) | info · épinglé | `var(--ios-info)` · `var(--ios-pinned)` |
| orange `#f97316` · gris `#9ca3af`/`#6b7280` | éphémère · neutre | `var(--ios-state-ephemeral)` · `var(--ios-neutral-400/500)` |
| `#09090b` · `#13111c` · `#eef2ff` | fond · carte · encre | `var(--color-ios-surface)` · `var(--color-ios-card)` · `var(--color-ios-ink)` |
| gris de texte secondaire / discret | écran | `var(--color-ios-ink-2)` · `var(--color-ios-ink-3)` |
| filet de carte, séparateur de rangées | écran | `var(--color-ios-hairline)` (bord de bulle/rangée 0,5 px : `var(--color-edge)`) |
| contour de champ, de bouton secondaire | écran | `var(--color-ios-outline)` |
| remplissage neutre (puce, bouton secondaire) | écran | `var(--color-ios-fill)` |
| panneau sombre translucide (`rgba(17,16,24,.92)`) | au-dessus du contenu | classe `glass-prominent` (appel : `glass-call`) |
| couleur de présence | avatar | `PRESENCE_HEX` / `presenceTone` de `@meeshy/shared/utils/user-presence` |
| couleur de conversation | fil | `var(--accent)` (dérivée — jamais recopiée) |

Un mélange de jetons (`color-mix(in srgb, var(--color-ios-ink-3) 22%, transparent)`) n'est pas
une violation, mais le dosage canonique existe presque toujours ci-dessus : le préférer.

## 3. Primitives — un site chacune

| primitive | site | usage |
|---|---|---|
| bouton principal / secondaire / destructif / icône / sur média | `src/styles/ui.css` (`@utility`), nommés par `BUTTON` de `src/components/ui-chrome.tsx` | `className="btn-primary"` ; accent : `style={{ backgroundColor: 'var(--accent)' }}` en surcharge. Le destructif est un TEXTE rouge sur voile rouge, jamais du blanc sur du rouge |
| confirmation | `src/components/confirm-dialog.tsx` | `tone="destructive"` |
| en-tête d'écran | `ScreenHeader` + `BackGlyph` (`ui-chrome.tsx`), hauteur `SCREEN_HEADER_HEIGHT` (64) | retour à GAUCHE dans `CHROME_ACTION_HIT_CLASS` (44), titre `text-body font-semibold` |
| action ronde du chrome | `ChromeActionDisc` + `CHROME_ACTION_HIT_CLASS` (`chrome-action.tsx`) | disque 28 dans une cible 44, teinte `currentColor` |
| verre | `.glass` / `.glass-prominent` / `.glass-card` / `.glass-call` (`styles/glass.css`), `GlassSurface` | jamais un `backdrop-filter` ailleurs |
| feuille | `Sheet` (`sheet.tsx`) | voile `backdrop:bg-veil` |
| champ | `Field` (`field.tsx`) | rayon `rounded-field` (14) |
| section groupée | `GroupedSection`, `RowIcon` (`grouped-section.tsx`) | carte `var(--color-ios-card)` + filet `var(--color-ios-hairline)` |
| icônes | `Glyph` / `GlyphSvg` (`glyph.tsx`, glyphes SF extraits — aucune autre bibliothèque) | `size={GLYPH_SIZE.xs|sm|md|lg|xl}` = 12 / 14 / 16 / 20 / 28 ; illustration : `--glyph-large` 40 |

**Typographie** (pile native, aucune police chargée hors styles de story) :
`text-check` 10 · `text-mini` 11 · `text-time` 12 · `text-title` 13 · `text-caption` 14 ·
`text-bubble` 15 · `text-input` 16 · `text-body` 17 · `text-thread` 22 · `text-large-title` 28 ·
`text-hero` 34. `text-chip` (13) = `text-title` ; `text-secondary` (15) = `text-bubble`. Titre
d'en-tête : `text-body font-semibold` ; grand titre d'écran : `text-large-title font-bold`.
À ne plus employer : `text-screen` (30), `text-section` (26), `text-brand` (19, collision avec la
couleur `brand`), `text-sm/lg/2xl` de Tailwind.

**Rayons** : `rounded-chip`/`rounded-full` capsule · `rounded-tile` 10 · `rounded-quote` 12 ·
`rounded-field` = `rounded-row-ios` 14 · `rounded-card` = `rounded-media` 16 · `rounded-bubble` 18 ·
`rounded-hero` 20 · `rounded-field-ios` 22 · `rounded-sheet` 24. `rounded-[Npx]` → le rôle du même
pas.

**Fonds** : écran `var(--color-ios-surface)` · carte `var(--color-ios-card)` · surélevé
`var(--ios-indigo-950)` en sombre (`--color-surface-raised`) · au-dessus du contenu : verre.

**Traits** : filet 1 px `var(--color-ios-hairline)` · bord 0,5 px `var(--color-edge)` ·
contour de contrôle `var(--color-ios-outline)` · focus : le couple global de `app.css`, jamais redéfini.

## 4. Plein écran

Image d'un commentaire, média d'une conversation, story, réel : le chrome est posé sur un média,
donc il se peint dans l'échelle `on-media` / `media-*` / `scrim-*` ci-dessus, et ses boutons isolés
sont des `btn-on-media`. La forme commune des visionneuses (répondre, réagir, contrôles) relève du
contrat de chrome des visionneuses (#8879, lot « Contrat »).

## 5. Exemptions — la couleur d'un tiers

Le gate `apps/web/scripts/check-design-harmony.mjs` refuse, dans les chaînes du code : hexadécimal,
`rgb()`/`hsl()`, classe à couleur arbitraire, `bg|text|border…-white|black` brut, mot-clé
`white`/`black` servi comme couleur, teinte de palette Tailwind.

**Chemins exemptés** (toutes leurs couleurs sont d'un tiers, ou peintes hors du DOM) — la raison
de chacun est dans `EXEMPT_PATHS` : `lib/api/fixtures*` (utilisateurs fictifs), `lib/canvas/`
(scène choisie par l'auteur), `lib/calls/frames/`, `lib/calls/call-montage*`,
`lib/calls/face-effects*`, `lib/calls/call-recording-compositor` (canvas), `lib/calls/call-speaker-color`
(identité dérivée), `lib/effects-playback`, `lib/view/effects-runner` (effet choisi par
l'expéditeur), `lib/export/` (modèles choisis par l'utilisateur), `lib/accent.ts` (accent dérivé),
`lib/languages.ts` (couleur d'une langue). **Hors périmètre** (autre milestone) : `story-compose-*`,
`use-studio-*`, `publication-compose*`, `composer*`, `status-compose*`, les tests, `test-support/`.

**Une ligne de tiers dans un fichier de chrome** se déclare en commentaire, sur la ligne ou la
précédente — la raison est obligatoire :

```tsx
// harmony-exempt: fond choisi par l'auteur de la story
style={{ backgroundColor: story.background }}
{/* harmony-exempt: logo Google Play, couleurs de la marque */}
```

Cas légitimes : fond et texte d'une story, couleur d'un sticker, logo d'une marque tierce, aperçu
d'un cadre ou d'un effet peint en canvas. Une palette CATÉGORIELLE recopiée d'une vue iOS (catégories
de notifications, destinations du menu flottant) n'est pas un tiers : elle doit remonter dans le SDK ;
d'ici là elle se marque en nommant sa source —
`// harmony-exempt: miroir de NotificationListView.swift, à remonter dans le SDK (#8879)`.

```bash
cd apps/web
bun run check:design-harmony                                   # tout src/, exit 1 s'il reste une violation
node scripts/check-design-harmony.mjs --files components/a.tsx # un sous-ensemble (chemins relatifs à src/)
node scripts/check-design-harmony.mjs --json                   # le rapport
```
