# Fiabilité de la traduction audio Prisme (iOS + web + défauts)

**Date** : 2026-08-09
**Statut** : design validé, prêt pour plan d'implémentation
**Périmètre** : `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` (iOS, priorité — frontend de référence sur lequel les autres se calquent) ; `apps/web/hooks/use-audio-translation.ts` et `apps/web/components/audio/SimpleAudioPlayer.tsx` (web) ; `packages/shared/types/preferences/audio.ts` et `services/gateway/src/services/ConsentValidationService.ts` (défauts de génération audio). Trois symptômes rapportés ensemble car ils partagent la même cause racine : l'audio n'est pas traité comme le texte vis-à-vis du Prisme Linguistique, qui prescrit une résolution automatique sans action manuelle.

## Contexte produit

Le principe Prisme (CLAUDE.md racine) : l'utilisateur consomme tout le contenu — texte ET audio — automatiquement dans sa langue préférée (`systemLanguage > regionalLanguage > customDestinationLanguage > deviceLocale > 'fr'`), sans geste manuel. Pour le texte, `preferredTranslation(for:)`/`resolveUserPreferredLanguage` appliquent déjà cette règle intégralement. Pour l'audio, l'investigation (2026-08-09) montre trois écarts distincts par rapport à ce principe.

## Problème 1 — iOS : la piste audio ne suit jamais la langue préférée

### Constat de départ (état actuel du code)

`AudioPlayerView` sépare deux notions qui devraient être unifiées : la langue affichée dans le bandeau de transcription, et la langue réellement JOUÉE.

- `selectedAudioLanguage` (`AudioPlayerView.swift:715`) est seedé dès l'`init` (`:849-851`) avec `AudioPlayerView.resolveInitialTranscriptionLanguage(initialTranscriptionLanguage)` — la langue Prisme déjà résolue en amont par l'app (`ConversationMediaViews.resolvedPreferredTranscriptionLanguage`, `:678-690`, qui suit bien `systemLanguage > regional > custom`).
- Mais `hasUserSelectedAudioLanguage` (`:728`) démarre **inconditionnellement à `false`** et ne passe à `true` que dans `switchToLanguage` (`:993-1013`), le seul point atteint par un tap explicite sur un pill de langue ou un changement du binding `externalLanguage`.
- `resolvePlaybackUrl` (`:1379-1394`, fonction pure statique testable) ne bascule sur une traduction que si `isUserSelected == true` (`:1385`, `guard isUserSelected, selectedLanguage != "orig"`). Sinon, retourne toujours `originalUrl`.

Conséquence : la langue Prisme résolue sert **uniquement** à préremplir le texte du bandeau de transcription — jamais à choisir la piste audio jouée. Ce choix est documenté explicitement dans le code (commentaires « B9 fix », `:716-727` et `:1365-1378`) comme une décision délibérée antérieure, pas un oubli : « this ONLY seeds the transcription display — it never changes which audio track plays, that stays the original by default ». Une régression existante (`AudioPlayerViewPlaybackLanguageTests.swift`) verrouille ce comportement.

**Ce spec renverse cette décision antérieure, sur demande explicite du propriétaire produit (2026-08-09) : l'audio doit suivre la langue préférée automatiquement, comme le texte.** Ce n'est pas un oubli corrigé, c'est un changement de politique produit assumé — à documenter comme tel pour qu'un futur lecteur du code ne le « recorrige » pas par erreur en sens inverse.

### Approche retenue

Renommer `hasUserSelectedAudioLanguage` → `hasExplicitAudioLanguage` (le nom `hasUserSelected...` devient trompeur : le flag représente désormais « la lecture doit suivre `selectedAudioLanguage` », que ce soit par seed Prisme automatique ou par tap explicite — pas seulement par action utilisateur). Le seeder à l'`init`, juste après `_selectedAudioLanguage` (`:849-851`) :

```swift
self._selectedAudioLanguage = State(
    initialValue: AudioPlayerView.resolveInitialTranscriptionLanguage(initialTranscriptionLanguage)
)
self._hasExplicitAudioLanguage = State(
    initialValue: AudioPlayerView.resolveInitialTranscriptionLanguage(initialTranscriptionLanguage) != "orig"
)
```

Aucun autre point d'écriture ne change : `switchToLanguage` (`:993-1013`) continue de poser le flag à `true` sur tap explicite (déjà `true` si Prisme avait déjà résolu une langue — no-op idempotent), et `resolvePlaybackUrl` garde exactement la même signature/logique (`isUserSelected` renommé `hasExplicitLanguage` en paramètre, comportement inchangé : le vrai changement est uniquement la valeur initiale du flag côté appelant).

Ceci respecte automatiquement la règle Prisme #1 (pas de traduction disponible dans la langue préférée ⇒ afficher l'original, jamais `translations.first`) car `resolveInitialTranscriptionLanguage`/`resolvedPreferredTranscriptionLanguage` la respectent déjà en amont : si aucune traduction ne matche, la valeur résolue est `"orig"`/`nil`, donc le nouveau flag reste `false` et la lecture reste sur l'original — comportement identique à aujourd'hui dans ce cas précis.

### Approches écartées

- **Supprimer entièrement `hasExplicitAudioLanguage` et faire dépendre `resolvePlaybackUrl` uniquement de `selectedLanguage != "orig"`** : fonctionnellement équivalent dans TOUS les cas actuels (le flag devient redondant si son seul rôle est de suivre la même valeur que `selectedLanguage != "orig"`), mais supprime un point d'extension déjà nommé et documenté qui pourrait servir plus tard (télémétrie « choix explicite vs Prisme », persistance différenciée). Écarté pour rester au diff minimal et ne pas modifier la signature de `resolvePlaybackUrl` sans raison.
- **Ne rien changer côté iOS, corriger seulement le bug web** : rejeté explicitement par le propriétaire produit — iOS est le frontend de référence sur lequel les autres se calquent, il doit être corrigé en premier/ensemble, pas laissé de côté.

## Problème 2 — Web : la langue sélectionnée se fige au premier rendu

### Constat de départ (état actuel du code)

`useAudioTranslation` (`apps/web/hooks/use-audio-translation.ts`) calcule `initialLanguage` une seule fois (`:116-124`, `useMemo` sur les valeurs de montage) et l'utilise comme valeur d'initialisation de `useState` (`:126`). Trois `useEffect` s'abonnent aux événements socket progressifs (`onAudioTranslation` déprécié `:154-177`, `onAudioTranslationsProgressive`/`onAudioTranslationsCompleted` `:180-221`) et alimentent `translatedAudios` au fil de l'arrivée des traductions — mais **aucun ne re-dérive `selectedLanguage`**. Seul un tap utilisateur explicite (`AudioControls.tsx:183,230`) appelle `setSelectedLanguage`.

`SimpleAudioPlayer` est monté avec `key={attachment.id}` (`MessageAttachments.tsx:110`), une clé stable qui ne change jamais pour un même attachment — pas de remount qui réinitialiserait l'état quand la traduction arrive.

**Conséquence concrète, cas le plus courant en usage réel** : un audio fraîchement envoyé/reçu n'a encore aucune traduction au premier rendu (`initialTranslatedAudios` vide) → `initialLanguage` résout `'original'` → `selectedLanguage` reste bloqué sur `'original'` **pour toujours**, y compris après que la traduction Prisme arrive quelques secondes plus tard via socket. Seul un reload de page ou un tap manuel en sort. C'est très probablement la cause directe du symptôme rapporté (« certains audios traduits ne sont pas lus dans la langue choisie »).

Second problème indépendant : `SimpleAudioPlayer.tsx:66-76` calcule `userLanguages` (passé au hook) en réimplémentant à la main `[systemLanguage, regionalLanguage, customDestinationLanguage]`, sans `deviceLocale` (4e priorité) ni repli `'fr'` — violation explicite de la règle `apps/web/CLAUDE.md` (« JAMAIS appeler resolveUserLanguage directement… toujours passer par resolveUserPreferredLanguage/getUserLanguagePreferences »).

### Approche retenue

**2a. Résolution auto réactive, pas seulement au montage.** Extraire la boucle de résolution (`:117-123`) en fonction pure réutilisable :

```ts
function resolveAutoLanguage(
  userLanguages: string[] | undefined,
  translatedAudios: readonly SocketIOTranslatedAudio[],
  originalLanguage: string | undefined
): string {
  if (!userLanguages?.length || translatedAudios.length === 0) return 'original';
  if (originalLanguage && userLanguages.includes(originalLanguage)) return 'original';
  for (const lang of userLanguages) {
    if (translatedAudios.find(t => t.targetLanguage === lang && t.url)) return lang;
  }
  return 'original';
}
```

Utilisée (a) comme initialiseur de `useState` (inchangé en pratique, évite un flash visuel « original » avant re-résolution), ET (b) dans un nouvel effet qui re-déclenche la résolution à chaque mise à jour de `translatedAudios` — tant que l'utilisateur n'a pas fait de choix explicite :

```ts
const hasManualSelectionRef = useRef(false);

const handleSetSelectedLanguage = useCallback((language: string) => {
  hasManualSelectionRef.current = true;
  setSelectedLanguage(language);
}, []);

useEffect(() => {
  if (hasManualSelectionRef.current) return;
  setSelectedLanguage(resolveAutoLanguage(userLanguages, translatedAudios, transcription?.language));
}, [translatedAudios, userLanguages, transcription?.language]);
```

`handleSetSelectedLanguage` remplace `setSelectedLanguage` dans la valeur RETOURNÉE par le hook (même nom exposé côté interface publique — `AudioControls.tsx:183,230` n'ont besoin d'aucun changement), en interne c'est elle qui pose le ref avant de déléguer au setter React. Miroir exact de la distinction iOS seed-automatique / tap-explicite (`hasExplicitAudioLanguage` / `switchToLanguage`).

**2b. Remplacer le calcul manuel par l'utilitaire partagé.** Dans `SimpleAudioPlayer.tsx:66-76` :

```ts
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';

const userLanguages = useMemo(() => {
  if (!user) return undefined;
  const langs = getUserLanguagePreferences(user);
  return langs.length > 0 ? langs : undefined;
}, [user]);
```

`getUserLanguagePreferences` (`apps/web/utils/user-language-preferences.ts:129-131`) délègue à `resolveUserLanguagesOrdered` (`@meeshy/shared`, source de vérité) et injecte `deviceLocale` en 4e priorité — gain immédiat sans autre changement, la liste résultante reste compatible avec la boucle `resolveAutoLanguage` (ordre de priorité, pas de doublons).

### Approches écartées

- **Remonter le composant à l'arrivée de la traduction (changer la `key`)** : plus simple en apparence, mais perd l'état de lecture en cours (position, `isPlaying`) si une traduction arrive pendant que l'utilisateur écoute déjà l'original — régression UX. L'effet réactif ciblé n'a pas cet effet de bord.
- **Toujours re-résoudre même après sélection manuelle** : rejeté — une traduction qui arrive APRÈS que l'utilisateur a explicitement choisi une langue (ou l'original) ne doit pas lui reprendre la main, exactement comme iOS ne réagit qu'au premier seed puis laisse le tap gagner définitivement.

## Problème 3 — Défauts de génération audio désalignés du texte

### Constat de départ (état actuel du code)

`AudioPreferenceSchema`/`AUDIO_PREFERENCE_DEFAULTS` (`packages/shared/types/preferences/audio.ts:10,15,19` et `:37-49`) : `transcriptionEnabled`/`textTranslationEnabled` par défaut `true`, mais `audioTranslationEnabled`/`ttsEnabled` par défaut **`false`** — asymétrie sans équivalent côté texte.

`ConsentValidationService.getConsentStatus` (`services/gateway/src/services/ConsentValidationService.ts:112-123`) a son **propre** repli codé en dur, indépendant du schema partagé :

```ts
const boolPref = (value: unknown, defaultValue: boolean): boolean =>
  typeof value === 'boolean' ? value : defaultValue;
const audioTranslationEnabled =
  !!audioPrefs.audioTranslationEnabledAt || boolPref(audioPrefs.audioTranslationEnabled, false); // :121
const translatedAudioGenerationEnabled =
  !!audioPrefs.translatedAudioGenerationEnabledAt || boolPref(audioPrefs.ttsEnabled, false); // :123
```

`processAudioAttachment` (`MessageTranslationService.ts:2424-2429`) vide `targetLanguages` quand `!canGenerateTranslatedAudio` — silencieusement, seule la transcription est faite, sans erreur exposée au client. Comme `canGenerateTranslatedAudio = translatedAudioGenerationEnabled && canTranslateAudio` et `canTranslateAudio = audioTranslationEnabled && canTranscribeAudio && canTranslateText` (`:135-138`), tant qu'aucun des deux booléens n'a été explicitement écrit par le client (`PATCH /me/preferences/audio`), **aucune langue traduite n'est jamais générée pour personne**, sans que l'expéditeur ni le destinataire ne le sachent.

### Approche retenue

Flip des deux défauts à `true`, aux DEUX endroits (le schema seul ne suffit pas) :

1. `packages/shared/types/preferences/audio.ts:15,19` (`AudioPreferenceSchema`) et `:40,42` (`AUDIO_PREFERENCE_DEFAULTS`) : `audioTranslationEnabled`/`ttsEnabled` → `true`.
2. `ConsentValidationService.ts:121,123` : `boolPref(audioPrefs.audioTranslationEnabled, false)` → `boolPref(audioPrefs.audioTranslationEnabled, true)`, idem `:123` pour `ttsEnabled`.

**Aucune migration nécessaire.** `boolPref` ne retombe sur le défaut QUE quand le champ JSON est absent (`typeof value === 'boolean'` faux) — jamais persisté, calculé à chaque lecture. Un utilisateur qui a explicitement désactivé (`false` écrit via `PATCH /me/preferences/audio`) garde son choix intact ; seul celui qui n'a jamais touché au réglage bascule sur le nouveau défaut, immédiatement après déploiement, sans backfill.

**Ce flip ne contourne aucun consentement RGPD existant.** `canTranscribeAudio = audioTranscriptionEnabled && hasVoiceDataConsent` (`:135`) — `hasVoiceDataConsent` reste un gate distinct, posé sur un vrai consentement explicite (`voiceDataConsentAt`), inchangé par ce spec. `audioTranslationEnabled`/`ttsEnabled` ne retirent qu'une couche d'opt-in redondante AU-DESSUS d'un consentement déjà accordé par ailleurs — un utilisateur n'ayant jamais donné son consentement voix reste bloqué exactement comme aujourd'hui.

### Approches écartées

- **Ne changer que le schema partagé, pas `ConsentValidationService`** : laisserait le comportement identique en pratique (le service a son propre repli dupliqué, jamais dérivé du schema) — corrigerait un fichier sans effet observable, rejeté.
- **Ajouter un backfill/migration explicite** : inutile et risqué — écrirait `true` dans des documents où l'utilisateur avait peut-être une raison de laisser le champ absent plutôt que de le poser à `false` explicitement ; la lecture en négatif (absent ⇒ nouveau défaut) suffit et ne touche jamais un choix explicite.

## Tests (TDD)

**Problème 1 (iOS, `packages/MeeshySDK/Tests/MeeshyUITests/Media/`)** :
- Réécrire `AudioPlayerViewPlaybackLanguageTests.swift` : le fichier actuel verrouille explicitement l'ancien comportement (« B9 finding », commentaires `:5-14`) — il doit être mis à jour pour documenter le NOUVEAU contrat, pas seulement patché mécaniquement. `test_autoSeededLanguage_isUserSelectedFalse_returnsOriginal` et `test_init_neverMarksLanguageAsUserSelected` inversent leur assertion (un seed Prisme valide DOIT désormais marquer `hasExplicitAudioLanguage = true` et piloter la lecture). Les tests sur le tap explicite (`orig` explicite, langue sans traduction disponible) restent valides tels quels — seul le nom du paramètre change (`isUserSelected` → `hasExplicitLanguage`).
- Ajouter un cas : seed avec `initialTranscriptionLanguage = nil` (ou résolvant à `"orig"`) → `hasExplicitAudioLanguage` reste `false`, lecture sur l'original (non-régression du cas « pas de traduction disponible »).

**Problème 2 (web, `apps/web/hooks/__tests__/` ou équivalent)** :
- `resolveAutoLanguage` : cas purs (aucune traduction, traduction correspondante disponible plus tard, langue originale déjà dans les préférences ⇒ reste `'original'`, aucune correspondance ⇒ `'original'`).
- Hook : `translatedAudios` mis à jour APRÈS le montage (simulateur d'événement socket progressif) fait bien passer `selectedLanguage` de `'original'` à la langue préférée, SANS action utilisateur.
- Non-régression : un appel à `setSelectedLanguage` (retourné par le hook) suivi d'une nouvelle mise à jour de `translatedAudios` ne doit PAS écraser le choix explicite de l'utilisateur.
- `SimpleAudioPlayer` : `userLanguages` provient de `getUserLanguagePreferences`, pas d'un calcul local — un utilisateur avec seulement `deviceLocale` renseigné (aucune préférence in-app) obtient désormais une entrée dans `userLanguages` (régression que ce spec corrige explicitement).

**Problème 3 (gateway, `services/gateway/src/__tests__/unit/services/ConsentValidationService.test.ts`)** :
- Préférence audio ABSENTE (jamais écrite) : `canTranslateAudio`/`canGenerateTranslatedAudio` sont désormais `true` (sous réserve du consentement voix de base déjà accordé — cas déjà couvert par les fixtures existantes du fichier).
- Préférence EXPLICITEMENT `false` : reste `false` — non-régression du respect d'un opt-out explicite.
- `hasVoiceDataConsent = false` (pas de consentement voix) : `canTranslateAudio` reste `false` quel que soit `audioTranslationEnabled` — non-régression de la hiérarchie de consentement.
- `packages/shared/types/preferences/__tests__/preferences.test.ts` : mettre à jour les assertions sur `AUDIO_PREFERENCE_DEFAULTS`/schema si elles fixent les anciennes valeurs `false`.

## Hors périmètre

- Points 1 (vue détails lecteurs/langue/position d'écoute) et 2 (notification différée au 1er message) de la demande initiale : sujets indépendants, traités par des specs/plans séparés.
- La divergence de nommage entre les deux endpoints de statut de lecture (`/messages/:id/status-details` vs `/messages/:id/read-status`) et le composant iOS mort `MessageInfoSheet.swift` : hors périmètre de ce spec audio, à traiter dans le spec du point 1.
- Reconciliation « langues demandées vs langues reçues » côté translator pour détecter un échec PARTIEL (une langue sur N) sans erreur globale : signalé comme incertain par l'investigation, nécessite une vérification côté `services/translator/` non faite ici — à ouvrir comme suivi séparé si confirmé.
- `MessageProcessor.handleAttachments` avale l'erreur de `processAudioAttachments(...)` en fire-and-forget (`.catch(err => logger.error(...))`, ligne 638-641) sans remonter de statut au client : comportement préexistant non lié aux trois problèmes ci-dessus, non traité ici.
- Persistance différenciée ou télémétrie autour de `hasExplicitAudioLanguage` (iOS) / `hasManualSelectionRef` (web) au-delà de leur rôle actuel de simple garde de lecture : non demandé, pas de cas d'usage identifié.
