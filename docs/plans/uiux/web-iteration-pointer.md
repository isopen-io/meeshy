# Pointeur de continuité — itérations UI/UX **web** (`w`)

> Fichier court et à jour qui dit **d'où part la prochaine itération web** et
> **où elle fusionne**. Il évite la divergence : une seule ligne de travail,
> synchronisée avec le trunk. (Le gros `branch-tracking.md`, 1,2 Mo, est
> l'HISTORIQUE multi-plateforme ; ce pointeur-ci est le plan de bord web.)

## Doctrine de branche (web)

| | |
|---|---|
| **Base de départ** de chaque itération web | `origin/dev` (resync à chaque tour) |
| **Cible de la PR** | `dev` |
| Branche de travail de la session courante | `claude/practical-fermat-u8t5dq` |

**Pourquoi `dev` et non `main`.** La directive porteur (CLAUDE.md §🚦) tranche :
`dev` **est le staging**, et Claude y est autonome sur tout — toute PR vers `dev`
**fusionne automatiquement dès la CI verte** (#9226). `main` est la branche de
**PUBLICATION**, alimentée par `dev` ; la production n'y reçoit que ce que le
staging a validé (#9223). Viser `main` directement contourne le staging et fait
fermer la PR (précédent documenté dans `branch-tracking.md`, correction
2026-09-05). « Fusionner avant la prochaine itération pour éviter la divergence »
se réalise donc **par `dev`** : c'est le trunk unique sur lequel la ligne web
reste synchronisée, et qui remonte vers `main` par le chemin de publication
normal.

## Protocole par itération

1. `git fetch origin dev` puis repartir de `origin/dev`.
2. Balayer l'anti-doublon : `ls docs/analyses/uiux/` (numéros `w` pris) **et**
   `search_pull_requests` sur le **nom du fichier cible** (pas le numéro).
3. Développer en TDD, pousser tôt le squelette, committer sur la branche de travail.
4. Ouvrir la PR vers `dev` ; elle auto-fusionne au vert. Supprimer la branche
   fusionnée ; la session suivante repart de `dev` à jour.
5. Annoter l'analyse `## ✅ Statut : CORRIGÉ (iter-Nw)` et mettre à jour ce pointeur.

## Dernière itération

| itération | date | branche de travail | PR | état |
|---|---|---|---|---|
| **74w** | 2026-10-21 | `claude/practical-fermat-to2xb3` | [#11384](https://github.com/isopen-io/meeshy/pull/11384) → `dev` | ✅ mergé |
| **75w** | 2026-10-24 | `claude/practical-fermat-o9iiqc` | [#12599](https://github.com/isopen-io/meeshy/pull/12599) → `dev` | ✅ mergé |
| **76w** | 2026-10-25 | `claude/practical-fermat-1peq83` | [#12925](https://github.com/isopen-io/meeshy/pull/12925) → `dev` | ✅ mergé |
| **77w** | 2026-10-31 | `claude/practical-fermat-95xnj5` | → `dev` | ✅ mergé |
| **78w** | 2026-11-01 | `claude/practical-fermat-0tzqfi` | [#14198](https://github.com/isopen-io/meeshy/pull/14198) → `dev` | ✅ mergé |
| **79w** | 2026-11-02 | `claude/practical-fermat-js1tyc` | → `dev` | ✅ mergé |
| **80w** | 2026-11-07 | `claude/practical-fermat-k0hf3y` | → `dev` | ✅ mergé |
| **81w** | 2026-11-08 | `claude/practical-fermat-9e6ean` | → `dev` | ✅ mergé |
| **82w** | 2026-11-09 | `claude/practical-fermat-jsk76s` | → `dev` | ✅ mergé |
| **83w** | 2026-11-10 | `claude/practical-fermat-kt6x2g` | → `dev` | ✅ mergé |
| **84w** | 2026-11-11 | `claude/practical-fermat-y94b4f` | → `dev` | ✅ mergé |
| **85w** | 2026-11-12 | `claude/practical-fermat-l2dnwf` | → `dev` | ✅ mergé |
| **86w** | 2026-11-13 | `claude/practical-fermat-u8t5dq` | → `dev` | ⏳ ouverte |

**86w** — cohérence de positionnement / maintenabilité : le bouton d'envoi de marque
était recopié en **trois jumelles divergentes** — `composer.tsx` (envoi),
`composer-tray.tsx` (envoi vocal) et `message-edit-composer.tsx` (soumission d'édition) :
même fond `linear-gradient(135deg, var(--accent), color-mix(…, white))` et même encre
`text-white`. Les deux premiers sont hors périmètre du gate (`composer*`), le troisième
est scanné (2 des 10 violations). Source unique désormais : le jeton composé
`--send-accent-fill` (`styles/app.css`, `:root`, dérivé de `var(--accent)`, voisin des
`--recording-*`), consommé par `background: var(--send-accent-fill)` ; l'encre passée à
`text-ios-on-brand` (= `--ios-on-brand` = `#fff`, byte-identique, nommée par son rôle).
Le CSS n'étant pas scanné, le littéral `white` quitte entièrement la surface au lieu
d'être exempté. Témoins : `check-design-harmony.test.ts` (describe « le bouton d'envoi »,
33→36) + `message-edit-composer`/`composer`/`composer-tray`/`-heif`/`declared-tokens`
(52/52, non-régression). Gate **10 → 8 violations** (−2, exactement
`message-edit-composer`), **8 → 7 fichiers** ; `tsc` 0. Housekeeping : 85w confirmée
mergée (`edgeFadeMask` sur `dev`, gate mesuré 10/8 à l'ouverture) ; appariement
analyses↔plans 1:1 revérifié (45w→85w). Analyse :
`docs/analyses/uiux/2026-11-13-iteration-86w.md`.

**85w** — cohérence / maintenabilité (famille appel) : le même fondu de bord
(`linear-gradient(…, #000 8px, #000 calc(100% - 8px), transparent)`, masque de
LUMINANCE) était écrit en **trois jumelles divergentes** — `RAIL_FADE`
(`call-control-actions.tsx`), `ROW_EDGE_FADE` (`call-row-keys.ts`), `fade` de
`stripBox` (`call-grid.tsx`) — 6 des 17 violations du gate. Source unique désormais :
`edgeFadeMask(axis)` dans `call-row-keys.ts`, exemptée UNE fois à la ligne
(luminance, hors couleur) ; les trois sites en dérivent, sortie **byte-identique**
(témoin `call-rails.test.tsx:171` inchangé). Et le verre de la pastille d'appel
(`call-floating-pill.tsx`, `color-mix(in srgb, white 22%, transparent)`) ramené à
`var(--color-media-hairline)` — filet blanc 20 %, parité talkie 84w. Témoins :
`check-design-harmony.test.ts` (describe « la famille appel », 29→33) +
`call-rails/bubble/row-keys` (31/31). Gate **17 → 10 violations** (−7, exactement
la famille appel), **12 → 8 fichiers** ; `tsc` 0. Housekeeping : 84w confirmée
mergée (`talkie-header-band` porte `var(--ios-error-strong)` sur `dev`) ; mesure
d'ouverture **remontée 13/10 → 17/12** (poche appel neuve sur `dev`) ; appariement
analyses↔plans 1:1 revérifié (45w→84w). Analyse :
`docs/analyses/uiux/2026-11-12-iteration-85w.md`.

**84w** — cohérence de thème / maintenabilité : le talkie élargi sur la barre
d'en-tête (`components/talkie-header-band.tsx`, transposition de
`TalkieHeaderLiveBar.swift`, #17338) peignait son chrome en **15 littéraux bruts**
(blanc/noir rgba, `#fff`, `#000`) — **15 des 28 violations du gate (54 %)**, la plus
grosse poche de chrome du web, apparue sur `dev` APRÈS 83w. Encre, voiles, filets et
halos ramenés à l'échelle `on-media`/`scrim-soft`/`media-fill`/`media-hairline` (ou
`color-mix` de `var(--color-on-media)` pour les alphas hors dosage canonique), et le
rouge d'enregistrement passé de `var(--color-error)` (illisible sur verre sombre en
thème clair) à `var(--ios-error-strong)` — parité iOS (`errorStrong`) et avec les
autres chromes d'appel. Seules exemptions, déclarées à la ligne : l'onde en CANVAS
(hors du DOM) et le masque de luminance (`#000` = opaque). Témoins :
`check-design-harmony.test.ts` (describe « la barre de talkie élargie », `scanSource`
→ `[]`, 25→29) + `thread-header-talkie.test.tsx` (voile hors ligne re-jetonné
`var(--color-scrim-soft)`). Gate **28 → 13 violations** (−15, exactement
`talkie-header-band.tsx`), **11 → 10 fichiers** ; `tsc` 0. Housekeeping : 83w
confirmée mergée (`lens-preview-line` dérive de `RAINBOW_SPECTRUM` sur `dev`) ;
appariement analyses↔plans 1:1 revérifié (45w→83w). Analyse :
`docs/analyses/uiux/2026-11-11-iteration-84w.md`.

**83w** — cohérence de positionnement / maintenabilité : l'aperçu de liste
(`components/lens-preview-line.tsx`) peignait le fini « rainbow » d'un message avec
un dégradé codé en dur (`#f43f5e, #f59e0b, #22c55e, #3b82f6, #a855f7`) — une
JUMELLE DIVERGENTE du spectre de la maison `RAINBOW_SPECTRUM`
(`@/lib/effects-playback`, miroir iOS `houseSpectrum`), que la bulle
(`effects-runner`) et iOS jouent déjà. Même message « rainbow » ⇒ trois
arcs-en-ciel différents (liste / bulle / iOS), et les 5 dernières hex de la plus
grosse poche du gate. L'aperçu dérive désormais de `RAINBOW_SPECTRUM`
(`linear-gradient(90deg, …join)`) — source unique, pas exemption. Témoins :
`check-design-harmony.test.ts` (describe « le fini arc-en-ciel d'un aperçu »,
`scanSource` → `[]`, 23→25) + `lens-row-preview.test.tsx` (parité : style ⊇
`RAINBOW_SPECTRUM`, ⊄ jumelle). Gate **14 → 9 violations** (−5, exactement
`lens-preview-line.tsx`), **8 → 7 fichiers** ; `tsc` 0. Housekeeping : 82w
confirmée mergée (`mood-page` tokens sur `dev`) ; appariement analyses↔plans 1:1
revérifié (45w→82w). Analyse : `docs/analyses/uiux/2026-11-10-iteration-83w.md`.

**82w** — cohérence de thème / maintenabilité : l'écran d'une humeur reçue
(`components/mood-page.tsx`) peignait son chrome immersif en littéraux bruts —
`text-white` ×4, `rgb(0 0 0 / …)` ×6, `rgb(255 255 255 / .85)`, `black` ×2, `'white'`
— soit **13 des 27 violations du gate d'harmonie (48 %)**, la plus grosse poche de
chrome du produit web. Chacune a pourtant un rôle que la charte nomme : encre sur
média (`text-on-media`), encre sur aplat de marque (`text-ios-on-brand`), voiles
(`var(--color-scrim-soft)` / `var(--color-scrim)`), halo blanc (`var(--color-on-media-2)`),
assombrissement vers le fond média (`var(--color-media-backdrop)`). Les 13 littéraux
remplacés par leur jeton (aucune couleur de tiers ici — que du chrome, donc aucune
exemption). Témoins : `check-design-harmony.test.ts` describe « l'écran d'humeur »
(`scanSource` → `[]`, RED→GREEN, 21→23) + `mood-page.test.tsx` (branche de repli par
marqueur `data-mood-backdrop-fill`, happy-dom ne parsant pas `color-mix(…, var(…))`).
Gate **27 → 14 violations** (−13, exactement `mood-page.tsx`), **9 → 8 fichiers** ;
`tsc` 0. Housekeeping : 81w confirmée mergée (`screen-wait-art` dans `EXEMPT_PATHS`
sur `dev`) ; appariement analyses↔plans 1:1 revérifié (45w→81w). Analyse :
`docs/analyses/uiux/2026-11-09-iteration-82w.md`.

**81w** — maintenabilité / cohérence (périmètre du gate d'harmonie) : l'art GÉNÉRÉ
`components/screen-wait-art.ts` (SVG baké du sticker Mee/Meo « On danse », byte-identique
à sa source `lib/mee/screen-wait-art-source` DÉJÀ exemptée) était compté comme du chrome —
**70 des 92 violations du gate (76 %), tous des faux positifs** noyant les 22 vraies cibles.
Nouvelle entrée `EXEMPT_PATHS` (préfixe serré `components/screen-wait-art`, raison motivée),
posée à côté de l'entrée `lib/mee/` dont elle est le prolongement ; le composant hôte
`screen-wait.tsx` reste du chrome scanné. Témoin : `check-design-harmony.test.ts` describe
« l'art d'attente baké » (RED→GREEN), 20→21. Gate **92 → 22 violations**, **9 → 8 fichiers**.
Housekeeping : 80w confirmée mergée (`DEFAULT_AUTHOR_ACCENT` sur `dev`) ; appariement
analyses↔plans 1:1 revérifié (45w→80w). Analyse : `docs/analyses/uiux/2026-11-08-iteration-81w.md`.

**80w** — cohérence / maintenabilité (classe harmonie, héritée 76w→79w) : l'indigo de
marque `#6366F1` était réécrit EN DUR sur TROIS surfaces web comme accent de repli de
`authorAccentColor()` — `routes/profile-sections.tsx` (`DECOR_ACCENT`),
`components/decor-preview.tsx` et `components/pack-sheet.tsx` (`FALLBACK_ACCENT`) —
trois jumelles divergeant en silence si la marque changeait. Source unique désormais :
`DEFAULT_AUTHOR_ACCENT` (`@meeshy/shared/utils/conversation-colors`, à côté de
`authorAccentColor` et de la palette dont elle est la première entrée indigo). Témoins :
`conversation-colors.test.ts` (parité palette, shared) + `decor-accent-single-source.test.ts`
(re-export + propreté au gate d'harmonie, web), RED→GREEN. Gate d'harmonie 94 → 91 (−3),
11 → 8 fichiers. Housekeeping : 79w confirmée mergée (`media.video.paused` sur `dev`) ;
appariement analyses↔plans 1:1 revérifié (45w→79w) ; sweep i18n texte figé média/overlay
épuisé. Analyse : `docs/analyses/uiux/2026-11-07-iteration-80w.md`.

**79w** — i18n / Prisme UI : la pastille d'état « En pause » de la visionneuse vidéo
(`components/viewer-video-page.tsx`) était écrite EN DUR en français — un texte VISIBLE
À L'ÉCRAN dans toutes les langues sauf le français, alors que le bouton central voisin
du même composant servait déjà `translate(language, 'media.video.pause')`. Site unique
désormais : la clé `media.video.paused` ×7 langues (voisine de `media.video.pause`) +
`translate` + marqueur `data-viewer-paused-badge` ; témoin `viewer-video-paused-i18n.test.tsx`
(RED→GREEN). Housekeeping : 78w confirmée mergée (#14198) ; appariement analyses↔plans
1:1 revérifié (45w→78w). Analyse : `docs/analyses/uiux/2026-11-02-iteration-79w.md`.

**78w** — a11y / i18n : les noms accessibles des pastilles de palier (`TierDots`,
`routes/progression-parts.tsx`) étaient écrits EN DUR en français — un lecteur d'écran
EN/ES/PT/DE/IT/AR entendait un `aria-label` mi-anglais mi-français (« Palier 50 atteint
— earned on september 3, 2026 »). Site unique désormais : `tierListLabel` /
`tierDotLabel` (`lib/view/progression.ts`) + 4 clés `game.progression.tier.*` (partie
`concept`) ×7 langues ; témoin `progression-tier-dots-i18n.test.tsx` (RED→GREEN) +
regex `FRENCH` durcie. Housekeeping : 77w confirmée mergée ; appariement analyses↔plans
1:1 revérifié. Analyse : `docs/analyses/uiux/2026-11-01-iteration-78w.md`.

**77w** — i18n / Prisme UI : la bande « Hors ligne » de la zone Progression (hub +
pages dédiées Badges/Défis/Succès) écrivait son texte EN DUR en français — la SEULE
bande hors-ligne non traduite du produit (le primitif partagé `OfflineNotice` prend
`children`, pas `language`). Site unique désormais : `ProgressionOfflineNotice({scope})`
(`progression-shell.tsx`) + 2 clés `game.page.offline_notice[_brief]` en partie `core`
×7 langues ; témoin `progression-offline-notice.test.tsx` (RED→GREEN). Housekeeping :
76w confirmée mergée. Analyse : `docs/analyses/uiux/2026-10-31-iteration-77w.md`.

**76w** — cohérence du thème : deux littéraux que le gate d'harmonie (#8879) prenait
pour du chrome n'en sont pas — le code QR du lien de parrainage
(`lib/game-photo/referral-qr.ts`, noir-sur-blanc lu par une caméra) et la luminance
d'un masque SVG (`components/game/author-plate.tsx`, blanc = visible / noir = masqué).
Marqués `harmony-exempt` motivés ; gate 96 → 92 ; témoin
`harmony-nonpaint-literals.test.ts`. Housekeeping : 14 analyses web legacy de juin
2026 annotées CLOS — LEGACY. Analyse : `docs/analyses/uiux/2026-10-25-iteration-76w.md`.

**75w** — cohérence du thème clair/sombre : la vignette « Signature » du sélecteur
d'apparence (`appearance-picker-sections.tsx`) DÉRIVE désormais des cotes canoniques
du fond (`backdropStyleVars()` + `withAccent`, dégradé partagé
`styles/appearance-picker.css`) au lieu d'un dégradé jumeau codé en dur qui restait
sombre en thème clair. 3 littéraux de couleur retirés, jumelle divergente supprimée.
Analyse : `docs/analyses/uiux/2026-10-24-iteration-75w.md`.

**74w** — i18n du flux de connexion par lien magique (`magic-link-{validation,
panel,flow}.tsx`) : 11 clés `magicLink.*` ×7 langues + câblage `translate` +
témoin `magic-link-i18n.test.tsx`. Analyse : `docs/analyses/uiux/2026-10-21-iteration-74w.md`.

## Note sur les analyses historiques 60w → 73w

Elles portaient sur le **legacy** Next.js (`apps/web` d'avant #7668, routes `app/`).
Ce code a quitté le dépôt le 2026-09-24. **Leurs pistes « différées 74w+ » pointent
du code supprimé et ne se rejouent pas.** La routine repart d'une revue fraîche de
l'`apps/web` actuel (Vite + Preact). Toutes sont annotées `CORRIGÉ` et closes pour
leur époque.

## Prochaine itération : **87w**
Revue fraîche `apps/web` — voir les pistes 87w+ en pied de
`docs/analyses/uiux/2026-11-13-iteration-86w.md` (gate d'harmonie à **8/7** après
86w : `message-menu` (`, black` ×2, masque de LUMINANCE — candidat exempt motivé ou
helper de fondu partagé, cf. `edgeFadeMask` 85w), `thread-header-bring`/`thread-header-talkie`
(`#fff` encre sur média), `comment-compose-bar.tsx` (▶ sur vignette),
`admin-post-preview` (letterbox `#000`, candidat exempt motivé), `conversation-backdrop`
(`rgba(`), `rank-blason` (`hsl(`) ; + axe épuration, toujours non entamé).
**Toujours REMESURER le gate à l'ouverture** : il peut remonter si `dev` reçoit une
poche neuve entre deux tours (9/7 → 28/11 entre 83w et 84w ; 13/10 → 17/12 entre
84w et 85w ; 10/8 stable entre 85w et 86w).
