# Iteration 74 — Analyse d'optimisation (2026-07-02)

## Protocole renforcé v3 (démarrage) — OK
`main` @ `51359208b`. Branche de travail réalignée sur `origin/main` (force-update détecté, 8173 commits de
retard → `git checkout -B claude/brave-archimedes-snwo1e origin/main`).

Contrôles de démarrage :
- **Doublons d'import** (contrôle v3) : `grep` sur `copyToClipboard` app-wide → **1 seule occurrence par
  fichier**. La régression `TS2300` des iters 70/72 reste résorbée sur `main`.
- **F30 (clipboard)** : convergé (aucun site brut restant, confirmé iter 73).
- **F32 (formatClock)** : réserve documentée iter 73, non ciblée cette itération.
- **Baseline `tsc --noEmit` (apps/web)** : **1198 erreurs pré-existantes** (baseline iter 73).

## Cible iter 74 — F31 : collision de nom `truncateText` + réimplémentation locale + code mort

### Current state
Trois surfaces de troncature de texte coexistaient dans `apps/web` avec la **même dette** :

1. **`utils/truncate.ts`** — `truncateText(text, maxLength): { truncated, isTruncated }` — source unique
   légitime (objet, signale la troncature). Consommée par `MediaAudioCard`, `MediaVideoCard`.
2. **`utils/xss-protection.ts`** — `truncateText(input, maxLength, suffix): string` — variante à coupe au
   **dernier espace**. **Collision de nom** avec (1) mais **signature et sémantique différentes**. Fonction
   de troncature d'affichage **égarée dans un module de protection XSS** (rien de XSS). **Zéro consommateur
   en production** (importée uniquement par son propre test).
3. **`components/contacts/ConversationDropdown.tsx`** — `truncateText(text, maxLength): string` **locale**
   (coupe nette `substring + '...'`), réimplémentation à l'identique de la source unique (1).

### Problems identified
- **Collision de nom inter-modules** : `import { truncateText }` résout deux fonctions incompatibles selon
  le module source → footgun de maintenance (le lecteur doit vérifier l'origine pour connaître le type de
  retour).
- **Code mort exporté** : la variante XSS n'est jamais importée hors test — surface d'API non utilisée
  maintenue et testée pour rien.
- **Réimplémentation locale** : `ConversationDropdown` masque la source unique par une copie manuelle.
- **Placement incohérent** : une fonction d'affichage vit dans `xss-protection.ts`.

### Root causes
Croissance organique : trois besoins de troncature ont produit trois implémentations sans consolidation,
la variante « mot » ayant atterri dans le premier module utilitaire disponible (`xss-protection.ts`).

### Business impact
Faible directement. Indirect : risque d'incohérence UX (deux algorithmes de troncature) et risque de bug
d'import (mauvaise fonction sélectionnée par autocomplétion sous nom identique).

### Technical impact
Dette de maintenabilité : API dupliquée/égarée, code mort, réimplémentation. Résolution → **un seul**
`truncateText` app-wide (`utils/truncate.ts`).

### Risk assessment
**Faible.** `ConversationDropdown` délègue à la source unique (comportement quasi identique : ajout d'un
`.trim()` avant l'ellipse — amélioration mineure). Suppression de code mort sans consommateur prod. Tests
mis à jour en conséquence.

### Proposed improvements (appliqué)
1. `ConversationDropdown.tsx` : suppression de la fonction locale, import de `truncateText` depuis
   `@/utils/truncate`, usage de `.truncated` aux 2 sites d'appel (30 / 50 car.).
2. `utils/xss-protection.ts` : suppression de `truncateText` (code mort égaré) — le module ne garde que ses
   utilitaires XSS (`sanitizeText`, `sanitizeUrl`, `sanitizeNotification`, etc., tous consommés en prod).
3. `utils/__tests__/xss-protection.test.ts` : retrait de l'import + du `describe('truncateText')` (3 cas).

**Non touché** : `components/common/bubble-message/ExpandableMessageText.tsx` → `truncateAtWord` — util
**légitimement colocalisé**, miroir iOS (`BubbleExpandableText.truncateAtWord`), sémantique distincte
(pas de suffixe, `>= 0`). Nom **non colliding** avec `truncateText`. Laissé en place.

### Validation criteria — OK
- `jest __tests__/utils/truncate.test.ts utils/__tests__/xss-protection.test.ts` : **51/51 verts**.
- `tsc --noEmit` (apps/web) : **1198 → 1196** (aucune erreur neuve ; légère baisse par retrait de code mort).
  Aucune erreur dans les 3 fichiers touchés.

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| F32 (reste) | `formatDuration` local encore présent : `AttachmentDetails.tsx`, `AudioPostComposer.tsx` (ms→horloge) | FAIBLE-MOYEN |
| F32-humain | `TriggerSchedulingModal`/`AgentScheduleTimeline` : durée humaine (j/h/min) → source unique distincte si besoin | FAIBLE |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut — flip = validation staging (non autonome) | HAUT (~75 % BP) |
| PROC v3 | Réalignement branche obligatoire au démarrage (retard massif possible) — appliqué | PROCESS |

## Gain
Un **seul** `truncateText` subsiste app-wide (`utils/truncate.ts`). Collision de nom inter-modules éliminée,
code mort retiré de `xss-protection.ts` (module recentré sur le XSS), réimplémentation locale de
`ConversationDropdown` supprimée. Baseline `tsc` légèrement réduite (1198 → 1196), tous les tests concernés
verts.
