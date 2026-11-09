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
| Branche de travail de la session courante | `claude/practical-fermat-jsk76s` |

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
| **82w** | 2026-11-09 | `claude/practical-fermat-jsk76s` | → `dev` | ⏳ ouverte |

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

## Prochaine itération : **83w**
Revue fraîche `apps/web` — voir les pistes 83w+ en pied de
`docs/analyses/uiux/2026-11-09-iteration-82w.md` (gate d'harmonie à 14/8 :
`lens-preview-line.tsx` (5, fini « rainbow » = couleur de tiers → exemption),
`message-menu`/`message-edit-composer`, `comment-compose-bar`, letterbox admin ;
+ axe épuration, toujours non entamé).
