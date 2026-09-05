# Historique d'exécution — itérations autonomes (routine)

Journal de continuité des itérations autonomes de qualité. Chaque entrée
enregistre le point de départ, le livrable et la piste suivante, pour qu'une
session reprenne exactement où la précédente s'est arrêtée. L'état des tâches
fait foi sur GitHub (issues + projet « Meeshy — pilotage ») ; ce fichier est un
JOURNAL, pas une source d'état.

---

## Itération 289 — 2026-09-05

- **Branche** : `claude/brave-archimedes-8391g9`
- **Base** : `dev` @ `49c41d21`
- **PR** : (à ouvrir) — **Issue** : #5234 (`Closes`)
- **Domaine** : services/gateway (Prisme Linguistique, filtre bande-passante SERVEUR) + packages/shared
- **Livré** :
  - `makeLanguageFilter(requested)` extrait en SSOT
    (`packages/shared/utils/language-normalize.ts`) : prédicat d'appartenance
    canonicalisant les DEUX côtés via `normalizeLanguageForDedup` (ou `null` =
    servir toutes les langues). Couvert par 6 témoins.
  - Les trois filtres de bande passante routés par la SSOT — traductions texte
    REST (`transformTranslationsToArray`), pistes audio du Prisme REST
    (`cleanAttachmentsForApi`), filtre socket texte+audio
    (`filterMessagePayloadForLanguages`). Ils comparaient la clé STOCKÉE au
    `.toLowerCase()` verbatim : une clé legacy régionale (`'pt-BR'`) était prunée
    face à une demande canonique `'pt'` (le lecteur retombait sur l'original).
  - Moitié symétrique de #5108 (qui n'avait canonicalisé que le code DEMANDÉ).
- **Gates** : vitest shared 2890/2890 · jest gateway 68/68 (4 suites de filtre) +
  197/197 (5 suites consommatrices) · `tsc --noEmit` gateway ET shared EXIT=0.
- **Dimensions mûres** : 6 (Cohérence), 8 (UX/Prisme — la traduction héritée est
  de nouveau servie), 11 (Maintenabilité — une source par règle de langue), 13
  (Complétude).
- **Reste / pistes suivantes** :
  - `getTranslationFromJSON` porte une résolution single-key verbatim-puis-casse
    (cohérente avec le reader `MessageTranslationService`) — candidat à
    unification si un troisième single-key resolver apparaît.
  - Pas d'équivalent `makeLanguageFilter` côté iOS/Android — ouvrir une issue si
    une jumelle divergente y apparaît.
  - Campagne « une source de vérité par règle de langue » : continuer à balayer
    les résolveurs qui comparent/dédupliquent des codes verbatim hors de
    `normalizeLanguageForDedup` / `isSameLanguage` / `makeLanguageFilter`.

## Itération 288 — 2026-09-05

- **Branche** : `claude/brave-archimedes-0czo3h`
- **Base** : `dev` @ `c14dfade`
- **Commit de livraison** : `7bdd50e9`
- **PR** : #5169 — **Issue** : #5167 (`Closes`)
- **Domaine** : apps/web (Prisme Linguistique, face CLIENT) + packages/shared
- **Livré** :
  - `isSameLanguage` extrait en SSOT (`packages/shared/utils/language-normalize.ts`),
    adossé à `normalizeLanguageForDedup`, couvert par 7 témoins.
  - `MessageActionsBar` : 7 comparaisons de langue au `===` brut routées par la
    SSOT (drapeau original/traduit + coche du menu, cassés sur les messages
    hérités région-tagués comme `originalLanguage: 'en-US'`).
  - 5 copies locales de `sameLanguage` supprimées (use-message-display,
    messages-display, TranslationToggle, use-stream-translation, CanvasV3Scene).
- **Gates** : vitest shared 2882/2882 · jest web 208/208 (17 suites) · tsc web
  sans erreur nette introduite (comparaison position-invariante au baseline).
- **Dimensions mûres** : 4 (Fluidité — le contrôle a de nouveau un effet visible),
  6 (Cohérence), 8 (UX), 11 (Maintenabilité — une source par règle d'égalité).
- **Reste / pistes suivantes** :
  - Pas d'équivalent centralisé `isSameLanguage` côté iOS/Android — ouvrir une
    issue si une jumelle divergente y apparaît.
  - Le repo `apps/web` porte ~1180 erreurs `tsc --noEmit` préexistantes (hors
    périmètre) — candidat à une passe de dette dédiée.
  - Campagne « une source de vérité par règle de langue » : continuer à balayer
    les résolveurs (serveur ET clients) qui comparent/dédupliquent des codes
    verbatim hors de `normalizeLanguageForDedup` / `isSameLanguage`.
