## Leçon 316 — un correctif posé sur un store ne protège que ce qui PASSE par lui, et le document qui décrit une surface comme « autonome » décrit aussi l'écriture qu'on n'a pas corrigée (2026-08-29, cycle 137)

Le cycle 136 a retiré du store `user-preferences-store` la classe « un
instantané ENTIER envoyé depuis une TRANCHE » (leçon 315) : trois écritures
passées en `PATCH` du seul soumis, gardées par six témoins qui assertent la
méthode ET le corps. Le lot était complet **pour le store**.

Deux écrans de réglages écrivaient les MÊMES documents sans passer par lui —
`app/notifications/preferences/page.tsx` (15 champs d'amorce sur 33) et
`components/settings/ApplicationSettings.tsx` (17 sur 22) — chacun avec son
`useState`, son `fetch`, son `PUT`. Le correctif ne les a pas touchés parce
qu'il ne pouvait pas : rien ne relie un store à un écran qui ne l'importe pas.

> **Un correctif de forme se propage par les IMPORTS, jamais par le sujet.**
> Avant de clore un lot qui corrige la façon d'écrire une ressource, ne pas
> demander « ai-je corrigé tous les appels de ce module ? » mais **« qui d'autre
> écrit cette ressource, par quelque chemin que ce soit ? »** — la requête juste
> vise l'ENDPOINT et le VERBE (`grep "method: 'PUT'"`), jamais le module qu'on
> vient de réparer.

**Et la connaissance manquante était déjà écrite, dans le lot précédent.**
`mirrored-preference-categories.ts` — fichier du cycle 134, relu au cycle 136 —
dit mot pour mot : « le bloc `notifications` du store n'a aucun consommateur en
production (**l'écran `/notifications/preferences` tient son propre état
local**) ». La phrase servait à justifier de ne PAS doubler la catégorie. Sa
seconde moitié — un écran qui tient son propre état tient aussi sa propre
écriture, et cette écriture n'a été corrigée par personne — n'a jamais été lue.

> **Une phrase écrite pour justifier une ABSTENTION porte souvent, en creux, une
> obligation.** « X est autonome, donc je n'ai rien à faire pour X ici » se
> retourne en « X est autonome, donc tout ce que ce lot corrige, X le porte
> encore ». Quand une note explique pourquoi une surface sort du périmètre,
> demander ce que cette surface fait à la place — c'est la question que la note
> a répondue sans la poser.

Trois corollaires mesurés :

- **Un chargement dont l'échec est absorbé transforme un écran de réglages en
  bouton de remise à zéro.** Les deux écrans font `if (response.ok) { … }` sans
  branche `else` et rendent leur amorce de DÉFAUTS, bouton d'enregistrement
  actif, sans un signe. En `PUT`, le geste suivant estampait ces défauts :
  `callsEnabled` rallumé (les appels entrants, catégorie délibérément
  indépendante de `pushEnabled`), `dndUtcOffsetMinutes` remis à 0 — la fenêtre
  « ne pas déranger » repassant en UTC, neuf heures de décalage pour Tokyo —,
  `showPreview` rendu à `true`, le contenu des messages revenant sur l'écran
  verrouillé de qui l'avait masqué. **Un écran qui ne sait pas dire « je n'ai
  rien lu » finit par écrire ce qu'il n'a pas lu.**
- **Un champ `optional()` SANS `default()` n'est pas remis au défaut par un
  remplacement : il est EFFACÉ.** Les cinq horodatages de consentement du
  document `application` sont dans ce cas — Zod (mode strip) les omet, `update:
  { application: validated }` les supprime. `ConsentValidationService` les lit
  avec priorité `UserPreferences.application > User` : un consentement accordé
  par la seule API préférences (chemin popup iOS) n'a pas de colonne de repli.
  **Recenser ce qu'un `PUT` perd, c'est lire le schéma en DEUX passes : ce que
  les `default()` réécrivent, et ce que l'absence de `default()` supprime.**
- **La question « quelles clés l'utilisateur a-t-il soumises ? » ne se répond
  jamais depuis l'état affiché** — après un chargement raté, cet état EST l'état
  de défauts. Elle se répond par une liste tenue au GESTE (`useRef(new Set())`,
  alimentée par l'unique entonnoir de mutation). Et cette liste s'oublie par
  SOUSTRACTION de ce qui vient de partir, jamais par `clear()` : les contrôles
  restent vivants pendant le vol, et tout oublier au retour perd la bascule
  faite entre-temps — un geste qui ne partirait ni maintenant ni au geste
  suivant, l'écran affichant une valeur que le serveur ignore. `hasChanges`
  portait déjà ce défaut, en pire : le bouton d'enregistrement disparaissait
  avec lui.
