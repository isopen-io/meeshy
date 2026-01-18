# BetaPlayground Component

## Description

Le composant `BetaPlayground` est un environnement de test interactif pour expérimenter avec les modèles IA Edge fonctionnant directement dans le navigateur. Il permet aux utilisateurs de tester 4 types de modèles d'IA :

1. **LLM Edge** - Génération de texte avec Chrome Built-in AI
2. **Translation** - Traduction avec l'API de traduction native du navigateur
3. **Transcription** - Reconnaissance vocale avec Web Speech API
4. **TTS** - Synthèse vocale (Text-to-Speech)

## Emplacement

```
/Users/smpceo/Documents/v2_meeshy/apps/web/components/settings/BetaPlayground.tsx
```

## Caractéristiques

### Détection automatique des capacités
- Détecte automatiquement quelles APIs sont disponibles dans le navigateur
- Affiche des badges "Available" / "Not Available" pour chaque fonctionnalité
- Affiche des messages d'aide pour activer les fonctionnalités manquantes

### Interface utilisateur
- Toggle "Enable Edge Models" pour activer/désactiver l'ensemble des tests
- Interface à onglets (Tabs) pour chaque modèle
- Zone de texte input responsive
- Bouton "Test" avec états de chargement
- Zone de résultat output
- Métriques en temps réel (latence, tokens/sec, caractères traités)
- Card de compatibilité du navigateur

### Gestion d'état
- Sauvegarde automatique dans localStorage
- Restauration des inputs au rechargement
- États de loading, success, error pour chaque modèle

### Internationalisation (i18n)
- Support complet en anglais et français
- Tous les textes sont traduits via le système i18n du projet
- Namespace : `settings.betaPlayground`

## Utilisation

### Import du composant

```tsx
import { BetaPlayground } from '@/components/settings/BetaPlayground';
```

### Utilisation dans une page

```tsx
export default function BetaPage() {
  return (
    <div className="container mx-auto py-6">
      <BetaPlayground />
    </div>
  );
}
```

## APIs utilisées

### 1. Chrome Built-in AI (Web LLM)

**Status**: Expérimental (Chrome Canary uniquement)

**Activation**:
```
chrome://flags/#optimization-guide-on-device-model
```

**Code d'exemple**:
```typescript
const session = await window.ai?.languageModel?.create?.();
const result = await session.prompt("Hello, world!");
```

### 2. Translation API

**Status**: En développement (Chrome 125+)

**Code d'exemple**:
```typescript
const canTranslate = await window.translation?.canTranslate?.({
  sourceLanguage: 'en',
  targetLanguage: 'fr',
});

const translator = await window.translation?.createTranslator?.({
  sourceLanguage: 'en',
  targetLanguage: 'fr',
});

const result = await translator.translate("Hello, world!");
```

### 3. Web Speech API (Reconnaissance vocale)

**Status**: Disponible (Chrome, Edge, Safari)

**Code d'exemple**:
```typescript
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();

recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'en-US';

recognition.onresult = (event) => {
  const transcript = Array.from(event.results)
    .map((result) => result[0].transcript)
    .join('');
  console.log(transcript);
};

recognition.start();
```

### 4. Speech Synthesis API (TTS)

**Status**: Disponible (Tous les navigateurs modernes)

**Code d'exemple**:
```typescript
const utterance = new SpeechSynthesisUtterance("Hello, world!");
const voices = window.speechSynthesis.getVoices();

utterance.voice = voices[0];
window.speechSynthesis.speak(utterance);
```

## Structure des données

### BrowserCapabilities

```typescript
interface BrowserCapabilities {
  webLLM: boolean;
  translation: boolean;
  speechRecognition: boolean;
  speechSynthesis: boolean;
}
```

### ModelMetrics

```typescript
interface ModelMetrics {
  latency: number;
  tokensPerSecond?: number;
  charactersProcessed?: number;
  modelSize?: number;
  status: 'idle' | 'loading' | 'running' | 'success' | 'error';
  error?: string;
}
```

## Traductions

### Fichiers de traduction

- **Anglais**: `/locales/en/settings.json` (section `betaPlayground`)
- **Français**: `/locales/fr/settings.json` (section `betaPlayground`)

### Clés principales

```typescript
// Titre et description
t('betaPlayground.title')
t('betaPlayground.description')

// Tabs
t('betaPlayground.tabs.llm')
t('betaPlayground.tabs.translation')
t('betaPlayground.tabs.transcription')
t('betaPlayground.tabs.tts')

// Actions
t('betaPlayground.actions.test')
t('betaPlayground.actions.generating')
t('betaPlayground.actions.startRecording')

// Métriques
t('betaPlayground.metrics.status')
t('betaPlayground.metrics.latency')
t('betaPlayground.metrics.tokensPerSecond')

// Erreurs
t('betaPlayground.errors.emptyInput')
t('betaPlayground.errors.llmFailed')

// Succès
t('betaPlayground.success.llm')
t('betaPlayground.success.translation')
```

## LocalStorage

Le composant sauvegarde automatiquement dans `localStorage` :

```json
{
  "enabled": true,
  "llmInput": "User's last LLM prompt",
  "translationInput": "User's last translation text",
  "ttsInput": "User's last TTS text",
  "timestamp": 1705600000000
}
```

**Clé**: `meeshy-beta-playground`

## Compatibilité navigateur

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| LLM Edge | Canary* | ❌ | ❌ | ❌ |
| Translation API | 125+* | ❌ | ❌ | ❌ |
| Speech Recognition | ✅ | ✅ | ❌ | ✅ |
| Speech Synthesis | ✅ | ✅ | ✅ | ✅ |

*Nécessite activation de flags expérimentaux

## Performance

- **Latence LLM**: Variable selon la taille du prompt (100-2000ms)
- **Latence Translation**: ~50-300ms
- **Latence TTS**: Instantané (lecture démarre sous 100ms)
- **Latence Speech Recognition**: Temps réel avec résultats intermédiaires

## Métriques affichées

### Pour LLM
- Latence (ms)
- Tokens par seconde

### Pour Translation
- Latence (ms)
- Caractères traités

### Pour Transcription
- Latence (ms)
- État en temps réel

### Pour TTS
- Latence (ms)
- État de lecture

## Gestion des erreurs

Le composant gère gracieusement les erreurs suivantes :

1. **API non disponible** - Message d'aide avec instructions
2. **Input vide** - Toast d'erreur
3. **Erreur de génération** - Affichage dans les métriques
4. **Timeout** - Détection et rapport
5. **Permissions refusées** - Messages clairs pour l'utilisateur

## Accessibilité

- Labels ARIA sur tous les contrôles
- Navigation au clavier complète
- États de chargement visuels
- Messages d'erreur descriptifs
- Support des lecteurs d'écran

## Mobile

- Interface responsive (Tailwind breakpoints)
- Tabs condensés sur mobile (labels courts)
- Boutons pleine largeur
- Text areas adaptatives
- Support des gestes tactiles (pour TTS et Speech)

## Sécurité & Confidentialité

- **Données locales uniquement** : Aucune donnée n'est envoyée à des serveurs externes
- **Processing Edge** : Tout le traitement se fait dans le navigateur
- **Pas de tracking** : Aucune métrique n'est envoyée à des services tiers
- **LocalStorage** : Les données sont stockées localement et peuvent être effacées à tout moment

## Future enhancements

1. **WebGPU Integration** - Pour accélérer les modèles LLM
2. **Model Selection** - Permettre de choisir entre différents modèles
3. **Export Results** - Télécharger les résultats des tests
4. **Benchmarking** - Comparer les performances entre navigateurs
5. **Streaming** - Afficher les résultats LLM en streaming
6. **Audio Recording** - Enregistrer et rejouer les tests audio
7. **Advanced Metrics** - Graphiques de performance en temps réel

## Développement

### Ajout d'un nouveau modèle

1. Ajouter l'état dans `capabilities`
2. Créer un nouveau TabsContent
3. Implémenter le handler de test
4. Ajouter les traductions
5. Ajouter le badge dans la compatibilité card

### Modification des traductions

Modifier les fichiers :
- `/locales/en/settings.json`
- `/locales/fr/settings.json`

Sous la section `settings.betaPlayground`

### Tests

```bash
# Lancer en dev
npm run dev

# Naviguer vers
http://localhost:3000/settings
```

## Références

- [Chrome Built-in AI](https://developer.chrome.com/docs/ai/built-in)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [Translation API Explainer](https://github.com/WICG/translation-api)
- [SpeechSynthesis API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)

## License

Ce composant fait partie du projet Meeshy et suit la même license que le projet principal.
