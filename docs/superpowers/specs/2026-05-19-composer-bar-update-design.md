# Composer Bar Update — Design

- **Date** : 2026-05-19
- **Statut** : design validé (brainstorming) — en attente du plan d'implémentation
- **Périmètre** : iOS uniquement (`apps/ios/` + `packages/MeeshySDK/MeeshyUI`)

Deux volets indépendants, regroupés car ils touchent tous deux la `UniversalComposerBar`.

## Volet 1 — Barre d'enregistrement audio : 3 actions

### Problème
Pendant l'enregistrement d'un message vocal, la `recordingBar` (pilule iMessage,
`UniversalComposerBar+Recording.swift`) n'offre que deux contrôles : `[X]` annuler
et `[↑]`. Il manque une voie « arrêter et déposer en pièce jointe » pour pouvoir
éditer / ajouter du texte avant l'envoi, distincte de l'envoi direct.

### Objectif
La `recordingBar` expose **trois** actions explicites :

```
+--------------------------------------------------+
| (X)   ~~~waveform~~~ 0:12      [#]      (^)      |
+--------------------------------------------------+
  (X) = annuler          [#] = stop -> pièces      (^) = envoyer
                                jointes (éditable)        directement
```

| Contrôle | Action | Callback |
|---|---|---|
| `[X]` annuler | stop + supprime le fichier temporaire — **inchangé** | `onCancelRecording` |
| `[▣]` stop→PJ | stop + dépose l'audio en pièce jointe ; la `recordingBar` disparaît, le composer revient en mode texte (vignette audio + champ texte) ; **pas d'éditeur plein écran** | `onStopRecordingToAttachment` *(nouveau)* |
| `[↑]` envoyer | stop + envoie le message vocal **immédiatement** (brut, sans éditeur ni prévisualisation) | `onSendRecording` |

- `[▣]` et `[↑]` respectent le minimum 0,5 s (`minimumSendableDuration`) : un
  enregistrement trop court est traité comme une annulation (comportement actuel).
- Glyphes : `[▣]` = carré / stop ; `[↑]` garde la flèche.

### Câblage — contexte message (`ConversationView`)
- `onStopRecordingToAttachment` → nouvelle fonction `stopRecordingToAttachment()` :
  garde `audioRecorder.duration > 0.5` (sinon `cancelRecording()`) ; `let url =
  audioRecorder.stopRecording()` ; `composerState.pendingAudioURL = url` ; ajoute
  `MessageAttachment.audio(durationMs:color:)` à `composerState.pendingAttachments`.
  **Aucun éditeur plein écran.**
- `onSendRecording` → nouvelle fonction `sendRecordingDirectly()` : même stop + ajout
  d'attachement, puis `sendMessageWithAttachments()` immédiatement.
- La fonction actuelle `stopAndPreviewRecording()` (éditeur plein écran forcé au
  stop) est **supprimée**. L'édition devient **opt-in** : la vignette audio dans la
  zone des pièces jointes est déjà tap-pour-éditer — `handleAttachmentPreviewTap`
  → `scrollState.audioToEdit` → `MeeshyAudioPreviewView` (rogner / écouter). Ce
  flux existant est conservé tel quel.
- *Changement de comportement assumé* : `[↑]` n'ouvre plus de prévisualisation —
  il envoie. La prévisualisation/édition passe par `[▣]` puis tap sur la vignette.

### Câblage — contexte story / commentaire (enregistrement interne)
La `UniversalComposerBar` gère l'enregistrement en interne pour ces contextes
(pas de délégation à `AudioRecorderManager`). Le `stopRecording()` interne crée
déjà un `ComposerAttachment.voice`. Comportement des 3 contrôles :
- `[X]` → annule (discard).
- `[▣]` → crée la vignette `ComposerAttachment.voice` et **reste** dans le composer.
- `[↑]` → crée la vignette puis déclenche l'envoi.

## Volet 2 — Langue du composer

### Problème
`DefaultComposerLanguage.resolve()` (`ComposerModels.swift:114`) lit la disposition
clavier (`UITextInputMode.activeInputModes.first?.primaryLanguage`) — sur un clavier
anglais elle renvoie `"en"`, d'où « tous ont EN ». De plus le détecteur automatique
fige la langue trop tôt (seuil 10 mots, ou confiance > 0,8).

### 2.1 — Défaut FR forcé
`DefaultComposerLanguage.resolve()` renvoie désormais **`"fr"` en constante** — la
lecture de `UITextInputMode` est retirée. Conséquences :
- `ConversationComposerState.selectedLanguage` (= `resolve()`) démarre en `"fr"`.
- `UniversalComposerBar.currentLanguage` est déjà `"fr"` — cohérent.
- Règle aussi la « non-persistance » : le défaut ne dérive plus vers EN au message
  suivant. La machinerie `DraftStore` reste inchangée (hors périmètre — forcer FR
  rend le point caduc).
- Cohérence : `ConversationViewModel.detectKeyboardLanguage()` (fallback d'envoi
  quand `originalLanguage` est nil) renvoie aussi `"fr"` en constante.

L'utilisateur garde le sélecteur de langue manuel (`languageSelectorPill`) pour
changer ponctuellement.

### 2.2 — Détecteur : seuil 18 mots, sans verrou anticipé
`TextAnalyzer.swift` (`packages/MeeshySDK/Sources/MeeshyUI/Utilities/`) :
- `wordCountThreshold` : **10 → 18**.
- Condition de verrouillage dans `performAnalysis` : aujourd'hui
  `wordCount >= wordCountThreshold || confidence > 0.8`. Nouveau :
  **`wordCount >= wordCountThreshold` seul** — le verrou anticipé par confiance
  est retiré. Tant que 18 mots ne sont pas atteints, le détecteur **continue à
  ré-interpréter** la langue à chaque frappe (debounce 0,3 s inchangé).

→ Ensemble cohérent : le composer démarre en FR ; si l'utilisateur tape en anglais,
le détecteur bascule vers EN en cours de frappe (jusqu'à 18 mots), puis fige.

## Fichiers

**Volet 1**
- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar.swift` — nouveau callback `onStopRecordingToAttachment` ; clarifier `onSendRecording`.
- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Recording.swift` — `recordingBar` : 3ᵉ bouton ; méthodes composer `stopRecordingToAttachment()` / `sendRecording()`.
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift` — câblage des callbacks.
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift` — `stopRecordingToAttachment()` + `sendRecordingDirectly()` ; suppression de `stopAndPreviewRecording()`.

**Volet 2**
- `apps/ios/Meeshy/Features/Main/Components/ComposerModels.swift` — `DefaultComposerLanguage.resolve()` → `"fr"` constant.
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` — `detectKeyboardLanguage()` → `"fr"` constant.
- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/TextAnalyzer.swift` — `wordCountThreshold` 18 + condition de verrouillage.

## Tests
- `TextAnalyzer` : la détection continue tant que `wordCount < 18` ; verrou à `>= 18` ; un texte court à forte confiance n'est **pas** figé prématurément.
- `DefaultComposerLanguage.resolve()` renvoie `"fr"`.
- `detectKeyboardLanguage()` renvoie `"fr"`.
- Volet 1 (logique parent) : `stopRecordingToAttachment()` ajoute bien une pièce jointe audio à `pendingAttachments` ; `sendRecordingDirectly()` ajoute puis déclenche l'envoi ; garde 0,5 s.
- `./apps/ios/meeshy.sh build` et `./apps/ios/meeshy.sh test` verts ; contrôle visuel des 3 boutons sur simulateur.

## Hors périmètre
- Correction de la machinerie de persistance des drafts (`DraftStore`) — forcer FR rend le point caduc.
- Pour story / commentaire, `[▣]` dépose la vignette mais l'éditeur audio plein écran (`MeeshyAudioPreviewView`) n'est branché que pour le contexte message — pas d'extension de l'édition aux stories/commentaires.
- Aucun changement du verrou manuel : choisir une langue dans `languageSelectorPill` fige toujours le détecteur (`textAnalyzer.lockToLanguage`).

## Risques
- Supprimer `stopAndPreviewRecording()` retire la prévisualisation au stop — c'est intentionnel, mais à vérifier en QA visuelle (l'édition reste accessible via tap sur la vignette).
- `TextAnalyzer` est dans `MeeshyUI` (`defaultIsolation(MainActor)`) — la suite de tests du seuil ne doit pas être `@MainActor` si elle teste de la logique pure ; ajuster `nonisolated` si besoin.
- Le contexte story/comment partage la `recordingBar` : le 3ᵉ bouton doit s'y comporter correctement (création de `ComposerAttachment.voice`), pas seulement dans le contexte message.
