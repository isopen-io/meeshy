# Iteration 103 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `d94be65` (« Merge PR #1492 — brave-archimedes-5uevhq / F67 DST fix »), working tree propre.
Branche de travail `claude/brave-archimedes-fo6hrw` recréée depuis `origin/main`
(`git checkout -B … origin/main`), 0 commit non-mergé à préserver.

**1 PR ouverte au démarrage : #1493** (Android — profile 30-day activity timeline sparkline,
`apps/android/**` uniquement). **Disjointe** de la cible retenue ici (`apps/web/utils/initials.ts`),
laissée à sa session.

### Revue d'ingénierie (constat de démarrage)
Balayage ciblé (agent d'exploration) des utilitaires **purs** peu contestés de `packages/shared/utils/`
et `apps/web/utils/` (hors zones déjà traitées en itérations 100-102 : `truncate`, `format-number`,
`calendar-date`, `mention-parser`, `conversation-helpers`, `duration-format`, `relative-time`,
`time-remaining`, `presence-format`). Trois défauts non ambigus remontés :

1. **F68 — `getInitials` casse sur les paires de substitution Unicode (emoji)** — RETENU (impact réel,
   larges appelants live).
2. **F69 — `sanitizeFileName` (`xss-protection.ts`) viole son propre plafond de 255 car.** pour un nom
   sans extension — même classe de bug que F65 (`truncateFilename`, déjà corrigé). **Écarté ce cycle :
   0 appelant en production** (grep repo-wide : référencé nulle part hors son fichier + tests). Latent,
   à corriger si une itération câble ce helper ou touche `xss-protection`. Reporté (§ futur).
3. **F70 — `deepCleanTranslationOutput` mange les apostrophes** (contractions FR `l'`, `d'`) via une
   regex de normalisation de guillemets. **Écarté : code mort** — `deepCleanTranslationOutput` n'a
   aucun appelant ; la variante réellement utilisée (`cleanTranslationOutput`) ne contient pas ce
   `replace`. Reporté (§ futur).

## Cible : F68 — `getInitials` produit une demi-paire de substitution isolée pour les noms à emoji

### Current state
`apps/web/utils/initials.ts` expose `getInitials(name, fallback)` — **source unique** des initiales
d'avatar (mot unique → 2 premiers caractères ; multi-mot → 1ᵉʳ car. du 1er + 1ᵉʳ car. du dernier mot ;
majuscules ; null-safe). Implémentation d'origine (branche multi-mot) :
```ts
return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
```
`word[0]` indexe par **unité UTF-16**, pas par point de code. C'est la SSOT de découpe consommée par :
- `apps/web/lib/avatar-utils.ts` (`getUserInitials` / `getMessageInitials`) — largement diffusé ;
- 8 appelants directs : `contacts/page.tsx`, `me/page.tsx`, `ReelPlayer.tsx`,
  `MessageReadStatusDetails.tsx`, `PhoneExistsModal.tsx`, `CallNotification.tsx`,
  `UserDisplay.tsx` (admin).

### Problems identified
- **[LIVE] Glyphe cassé `�` dans l'avatar** pour tout nom d'affichage dont le 1er ou le dernier mot
  commence par un caractère **hors BMP** (emoji, ex. `'🎨'` = paire `🎨`). Reproduit :
  `getInitials('🎨 Studio')` → `"\uD83CS"` (`String.prototype.isWellFormed() === false` — demi-paire
  haute isolée suivie de `S`), rendu `�S`. Idem `getInitials('Studio 🎨')` → `"S\uD83C"` (`�`).
  La branche mot-unique survivait par chance (`slice(0, 2)` garde les 2 unités = 1 emoji), mais un mot
  bi-emoji (`'🎨🎉'`) ne rendait qu'**un seul** emoji au lieu de deux.

### Root cause
`word[0]` (et `slice(0, 2)` sur du texte hors BMP) opèrent sur les **unités UTF-16**. Un point de code
> U+FFFF occupe **deux** unités (paire de substitution) ; en prendre une seule produit un demi-code
invalide. Le découpage d'initiales doit itérer par **point de code Unicode**.

### Business impact
Bug d'affichage silencieux et visible sur **toutes** les surfaces d'avatar (liste de contacts, profil,
notifications d'appel, reels, détails de lecture de message, admin) — précisément là où l'état de l'art
(Telegram/Discord/Slack) affiche un fallback initiales propre. Les emoji dans les noms d'affichage sont
**courants** sur un produit social/chat ; le fallback ratait alors sa seule raison d'être (donner un
repère lisible en l'absence de photo).

### Technical impact
Correction purement locale au fichier SSOT : découpage par point de code via l'itérateur de chaîne
(`[...word]`), immune aux paires de substitution. `getUserInitials` / `getMessageInitials` et les 8
appelants héritent automatiquement du correctif. Aucun changement de signature, d'import ou de contrat.
Corrige aussi le cas secondaire mot-unique bi-emoji (`'🎨🎉'` → deux emoji).

### Risk assessment
Très faible. Comportement **identique** sur l'ASCII/latin (prouvé : les 17 tests existants restent
verts, `slice(0,2)` sur du BMP ≡ `[...].slice(0,2)`) et **corrigé** sur le hors-BMP. Fonction pure,
sans effet de bord ni dépendance.

### Proposed improvements (implémenté ce cycle)
- Branche mot-unique : `[...parts[0]].slice(0, 2).join('')` (2 premiers **points de code**).
- Branche multi-mot : `[...parts[0]][0]` + `[...dernier][0]` (1ᵉʳ point de code de chaque, `?? ''`
  défensif bien que `filter(Boolean)` garantisse des mots non vides).
- JSDoc mis à jour (contrat « point de code, jamais unité UTF-16 » + rationale).

### Expected benefits
- Zéro demi-paire de substitution : `output.isWellFormed()` toujours vrai.
- Initiales lisibles (emoji entier) partout où un nom d'affichage contient un emoji.
- Cas bi-emoji mot-unique corrigé (2 emoji au lieu d'1).

### Implementation complexity
Faible (1 fonction pure, ~6 lignes nettes + 5 tests). Aucun changement de signature/contrat.

### Validation criteria
- [x] RED prouvé d'abord (repro Node, impl copiée verbatim) : `getInitials('🎨 Studio')` → `"\uD83CS"`,
      `isWellFormed() === false`.
- [x] GREEN Node (fix + non-régression sur 12 cas ASCII/emoji mixtes) : toutes vertes, `isWellFormed`
      partout vrai.
- [x] GREEN jest : `__tests__/utils/initials.test.ts` **22/22** (17 existants + 5 emoji :
      multi-mot, dernier-mot, deux-bouts, mot-unique bi-emoji, latin+emoji).

## Candidats écartés ce cycle (documentés)
- **F69 — `sanitizeFileName` (`apps/web/utils/xss-protection.ts:386-390`)** : pour un nom > 255 car.
  **sans point**, `split('.').pop()` renvoie le nom entier ⇒ `substring(0, 255 - len - 1)` négatif ⇒
  `''` ⇒ sortie `'.' + nom` **plus longue** que le plafond (même défaut que F65). **0 appelant
  production** (grep) → impact nul aujourd'hui. À corriger si le helper est câblé ou si une itération
  touche `xss-protection`.
- **F70 — `deepCleanTranslationOutput` (`apps/web/utils/translation-cleaner.ts:44`)** : la regex
  `/["']([^"']*?)["']/g` apparie deux apostrophes comme une paire de guillemets → `l'homme` →
  `l"homme`. **Code mort** (aucun appelant ; `cleanTranslationOutput` réel n'a pas ce `replace`). À
  corriger seulement si `deepClean…` est câblé.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/`.
- **F56b** (LOW) : `likeCount` absolu sur `post:reaction-added/removed`.
- **F60b** (LOW) : parité parsing mention iOS/Android sur `MENTION_HANDLE_CHARS` (tiret).
- **F67b** (LOW) : audit découpage jour-calendaire iOS (`RelativeTimeFormatter`, `Calendar.startOfDay`).
- **F69** (LOW, neuf) : `sanitizeFileName` plafond 255 sur nom sans extension (latent, 0 appelant).
- **F70** (LOW, neuf) : `deepCleanTranslationOutput` apostrophes FR (code mort, 0 appelant).
- **F68b** (LOW, neuf) : contrepartie iOS des initiales (`String` avatar) — vérifier la parité
  point-de-code (Swift `String` itère déjà par grapheme cluster → probablement sain, à confirmer).
