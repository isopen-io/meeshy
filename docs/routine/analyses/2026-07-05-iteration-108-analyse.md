# Iteration 108 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `968550a` (« feat(android/settings): persisted light/dark/system theme #1504 »),
working tree propre. Branche de travail `claude/brave-archimedes-3kjwj4` recréée depuis
`origin/main` (`git checkout -B … origin/main`), 0 commit non-mergé à préserver.

**10 PR ouvertes au démarrage** (#1498–#1509), très concentrées :
- iOS realtime (#1509 — typing teardown), Android settings (#1508 — interface language)
- gateway translation `url-content.ts` / F76 (#1507), calls (#1506, #1502, #1498)
- gateway socketio auth join-order (#1505), shared email-validator / F73 (#1503)
- gateway reactions self-heal (#1501), gateway normalize / F72 (#1499)

Cible retenue ce cycle **strictement disjointe** de toutes : `apps/web/utils/language-detection.ts`
(`detectBestInterfaceLanguage`), qu'aucune PR ouverte ne touche.

### Revue d'ingénierie (constat de démarrage)
Balayage ciblé (agent d'exploration) des utilitaires **purs / quasi-purs** de `packages/shared/utils/`,
`apps/web/utils/`, `apps/web/lib/`, `services/gateway/src/utils/`, hors zones déjà traitées (F57–F78 :
`initials`, `truncate`, `format-number`, `calendar-date`, `mention-parser`, `conversation-helpers`,
`duration-format`, `relative-time`, `time-remaining`, `presence-format`, `email-validator`,
`normalize`, `url-content`, `xss-protection`, `mention-display`, `generateCommunityIdentifier`,
`CircuitBreaker`, `buildAttachmentUrl`, `blocking`). Le code s'est révélé exceptionnellement propre
(sweeps systématiques antérieurs). Trois candidats remontés :

1. **F79 — `detectBestInterfaceLanguage` omet `es`** — RETENU (impact utilisateur réel, aligné cœur
   produit « Prisme Linguistique », correctif d'une ligne, callers live).
2. **`getDefaultPermissions` (`user-adapter.ts`) sensible à la casse du rôle** — écarté ce cycle :
   hypothèse (rôle arrivant en minuscules à ce point d'adaptation) non prouvée sur le flux réel ;
   à instruire séparément si un cas live est confirmé. Reporté (§ futur, F80).
3. **`normalizeForDisplay` (`link-identifier.ts`) — strip `mshy_` mort (no-op)** — écarté : code mort,
   0 impact utilisateur (le préfixe `mshy_` provient d'un autre module qui ne passe jamais par cette
   fonction). Reporté (§ futur, F81, faible valeur).

## Cible : F79 — `detectBestInterfaceLanguage` n'auto-détecte jamais l'espagnol, pourtant langue d'interface expédiée

### Current state
`apps/web/utils/language-detection.ts` expose `detectBestInterfaceLanguage()` — **source de la sélection
automatique de la langue de l'UI (chrome)** au premier montage. Consommée par
`apps/web/hooks/use-language.ts:85` et `:120` (choix de la langue d'interface à l'initialisation).
Implémentation d'origine :
```ts
const interfaceLanguages = ['en', 'fr', 'pt']; // Langues d'interface supportées
const browserLanguages = navigator.languages || [navigator.language || 'en'];
for (const lang of browserLanguages) {
  const languageCode = lang.split('-')[0].toLowerCase();
  if (interfaceLanguages.includes(languageCode)) return languageCode;
}
return 'en';
```

### Problems identified
- **[LIVE] UI en anglais pour tout navigateur hispanophone.** `navigator.languages = ['es-ES', 'en-US']`
  → renvoie `'en'` (le loop ignore `es`, absent de la liste, puis matche `en`). `['es-419']`
  (Amérique latine) → `'en'` (aucun match, fallback). Pourtant :
  - le bundle de traduction **`apps/web/locales/es/` existe et est complet** ;
  - `es` est une entrée **first-class** de `INTERFACE_LANGUAGES` (`apps/web/types/frontend.ts:78`),
    **placée avant `fr`/`pt`** — qui, elles, SONT auto-détectées ;
  - le sélecteur de langue **propose déjà** l'espagnol à l'utilisateur.
- La fonction jumelle `getUserPreferredLanguage` (même fichier, langue de **contenu**) gère `es`
  correctement via `isSupportedLanguage` — divergence de comportement entre les deux détecteurs
  du même module.

### Root cause
Liste blanche codée en dur `['en', 'fr', 'pt']` : l'espagnol a été oublié à l'ajout du bundle
`locales/es`. Ce n'est **pas** le cas intentionnel de `de`/`it` (présentes dans `INTERFACE_LANGUAGES`
mais délibérément non auto-détectées car **sans bundle** — repli gracieux sur `en` documenté dans
`frontend.ts:63-74`). `es` a un bundle → son omission est un défaut, pas un choix.

### Business impact
Violation directe du **Prisme Linguistique** (cœur produit Meeshy) sur la surface UI : un utilisateur
hispanophone — la 2ᵉ population de langue maternelle au monde — reçoit une interface anglaise alors que
Meeshy expédie et propose l'espagnol. Friction linguistique exactement là où le produit promet la
transparence. L'état de l'art (Telegram/WhatsApp/Signal) sélectionne la locale de l'appareil sans
configuration.

### Technical impact
Correctif purement local : ajout de `'es'` à la liste blanche → `['en', 'es', 'fr', 'pt']` = exactement
les 4 langues d'interface **avec bundle complet**. Les deux callers (`use-language.ts`) héritent
automatiquement. `de`/`it` restent volontairement exclues (repli `en` inchangé). Aucun changement de
signature, d'import ou de contrat.

### Risk assessment
Très faible. Comportement **identique** pour en/fr/pt et pour de/it (toujours `en`), **corrigé** pour es.
Fonction déterministe-selon-entrée (lit `navigator.languages`), entièrement testable via le harness jest
existant (mock `navigator.languages`).

### Proposed improvements (implémenté ce cycle)
- `interfaceLanguages = ['en', 'es', 'fr', 'pt']` + commentaire explicitant le critère (« bundle complet »)
  et la raison de l'exclusion de/it.
- 3 tests de régression : `['es-ES','en-US'] → 'es'`, `['es-419'] → 'es'`, `['it-IT','de-DE'] → 'en'`
  (garde-fou anti-régression sur l'exclusion intentionnelle de/it).

### Validation criteria
- `apps/web` : `language-detection.test.ts` 35/35 (32 existants + 3 nouveaux), `use-language.test.tsx`
  24/24. RED prouvé d'abord (les 2 cas `es` → `'en'` avant correctif).

## Backlog reporté (§ futur)
- **F80** — `getDefaultPermissions` (`user-adapter.ts`) sensible à la casse : `rolePermissions[role]`
  sans normalisation ; un rôle en minuscules retomberait sur `USER` (0 permission). À confirmer sur un
  flux live avant fix (`rolePermissions[role.toUpperCase()] || rolePermissions.USER`).
- **F81** — `normalizeForDisplay` (`link-identifier.ts`) : `.replace('mshy_', '')` mort (branche
  `linkId` ne contient jamais `mshy_`). Code mort, faible valeur.
- F69, F74, F75, F77, F78 (itérations antérieures) : toujours reportés (0 caller live / décision produit
  requise).
