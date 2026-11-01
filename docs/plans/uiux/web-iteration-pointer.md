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
| Branche de travail de la session courante | `claude/practical-fermat-0tzqfi` |

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
| **78w** | 2026-11-01 | `claude/practical-fermat-0tzqfi` | → `dev` | ⏳ ouverte |

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

## Prochaine itération : **79w**
Revue fraîche `apps/web` — voir les pistes 79w+ en pied de
`docs/analyses/uiux/2026-11-01-iteration-78w.md`.
