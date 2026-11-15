# Plan — Itération 286 : statistiques de traduction temps réel au rang 4 du Prisme

## Objectifs

Aligner la détection de « traduction pertinente pour le lecteur » de
`useStreamTranslation` sur la SSOT du prisme du lecteur, afin que l'incrément de
statistiques descende jusqu'au rang 4 (locale appareil), à parité avec le chemin de
rendu.

## Modules affectés

- `apps/web/hooks/use-stream-translation.ts` (production)
- `apps/web/__tests__/hooks/use-stream-translation.test.ts` (test)

## Phases

1. **RED** — Étendre la fixture `setup` pour accepter un objet utilisateur complet
   (dont `deviceLocale`). Ajouter un témoin : lecteur sans préférence in-app +
   `deviceLocale = 'de'`, traduction reçue vers `de` ⇒ `incrementTranslationCount`
   appelé. Prouver l'échec sur le code d'avant. ✅
2. **GREEN** — Remplacer la construction en ligne de `userLanguages` par
   `getUserLanguagePreferences(user)` (SSOT). Ajuster le `some(...)` (plus besoin du
   cast `as string`, la SSOT rend `string[]`). ✅
3. **REFACTOR** — Commentaire d'ancrage (§ Device Locale). Vérifier qu'aucun import
   ne devient mort (`normalizeLanguageForDedup` reste utilisé par `sameLanguage`). ✅

## Dépendances

`getUserLanguagePreferences` (`utils/user-language-preferences.ts`) — déjà exportée,
déjà consommée par une douzaine de sites. Aucune nouvelle dépendance.

## Risques estimés

Très faibles. La détection ne fait que s'élargir d'un rang réel du prisme. Aucun
impact d'affichage.

## Stratégie de rollback

Revert du commit unique : la substitution est localisée à un bloc de
`handleTranslation` et à la fixture de test.

## Critères de validation

- Nouveau témoin RED→GREEN.
- `npx jest __tests__/hooks` vert (120 suites).
- `tsc` : aucune nouvelle erreur sur le fichier touché.

## Statut

**Terminé.** RED prouvé, GREEN atteint, suites vertes, typecheck sans régression.

## Suivi / améliorations futures

- Cliquet « toute liste de langues de lecteur web passe par la SSOT » (méthode,
  hors périmètre — voir l'analyse).
