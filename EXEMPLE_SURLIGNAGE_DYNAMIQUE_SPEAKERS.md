# Exemple : Surlignage Dynamique des Speakers

**Date** : 19 janvier 2026
**Objectif** : Démontrer visuellement comment fonctionne le surlignage coloré pendant la lecture audio

---

## 🎬 Principe de Fonctionnement

Le composant `TranscriptionViewer` affiche **tout le texte de manière continue**, et pendant la lecture audio, seul le segment actuellement lu est **surligné en gras avec un fond coloré** selon le speaker.

---

## 📖 Séquence Visuelle Complète

### Exemple Audio : Conversation entre 2 personnes

**Segments :**
1. **s0** (Vous - 92%) : "Bonjour comment vas-tu ?" (0.0s - 1.4s)
2. **s1** (15%) : "Salut ça va bien merci" (1.6s - 3.8s)

---

### 🕐 État Initial : 0.0s (Avant lecture)

```
┌──────────────────────────────────────────────────────────┐
│ 👥 2 locuteurs détectés                                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Bonjour comment vas-tu ? Salut ça va bien merci        │
│                                                          │
│  Locuteurs: 🔵 Vous (92%)  🟣 s1 (15%)                   │
└──────────────────────────────────────────────────────────┘
```

**CSS appliqué :**
```css
span.segment {
  color: #334155; /* text-slate-700 */
  font-weight: normal;
}
```

---

### ⏱️ Temps : 0.5s (Vous parlez - segment actif)

```
┌──────────────────────────────────────────────────────────┐
│ 👥 2 locuteurs détectés                                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ╔══════════════════════╗                               │
│  ║ Bonjour comment vas-tu ? ║ Salut ça va bien merci    │
│  ╚══════════════════════╝                               │
│  └─ BLEU GRAS (Vous parlez)                             │
│                                                          │
│  Locuteurs: 🔵 Vous (92%)  🟣 s1 (15%)                   │
└──────────────────────────────────────────────────────────┘
```

**CSS appliqué au segment actif :**
```css
span.segment-active {
  color: #1d4ed8; /* text-blue-700 */
  background-color: #dbeafe; /* bg-blue-100 */
  font-weight: bold;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  transition: all 200ms;
}
```

**Code HTML généré :**
```html
<span class="segment-active" style="color: #1d4ed8; background: #dbeafe; font-weight: bold;">
  Bonjour comment vas-tu ?
</span>
<span class="segment">
  Salut ça va bien merci
</span>
```

---

### ⏱️ Temps : 2.0s (Autre speaker - changement de couleur)

```
┌──────────────────────────────────────────────────────────┐
│ 👥 2 locuteurs détectés                                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Bonjour comment vas-tu ?  ╔══════════════════════╗     │
│                              ║ Salut ça va bien merci ║   │
│                              ╚══════════════════════╝     │
│                              └─ VIOLET GRAS (s1 parle)   │
│                                                          │
│  Locuteurs: 🔵 Vous (92%)  🟣 s1 (15%)                   │
└──────────────────────────────────────────────────────────┘
```

**CSS appliqué au nouveau segment actif :**
```css
span.segment-active {
  color: #7c3aed; /* text-purple-700 */
  background-color: #ede9fe; /* bg-purple-100 */
  font-weight: bold;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  transition: all 200ms;
}
```

**Code HTML généré :**
```html
<span class="segment">
  Bonjour comment vas-tu ?
</span>
<span class="segment-active" style="color: #7c3aed; background: #ede9fe; font-weight: bold;">
  Salut ça va bien merci
</span>
```

---

### ⏱️ Temps : 4.0s (Lecture terminée)

```
┌──────────────────────────────────────────────────────────┐
│ 👥 2 locuteurs détectés                                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Bonjour comment vas-tu ? Salut ça va bien merci        │
│                                                          │
│  Locuteurs: 🔵 Vous (92%)  🟣 s1 (15%)                   │
└──────────────────────────────────────────────────────────┘
```

**CSS appliqué :**
```css
span.segment {
  color: #334155; /* text-slate-700 */
  font-weight: normal;
}
```

---

## 🎨 Palette de Couleurs Complète

| Speaker | Condition | Couleur Texte | Couleur Fond | Usage |
|---------|-----------|---------------|--------------|-------|
| **Vous** | `voiceScore >= 0.6` | `#1d4ed8` (Bleu) | `#dbeafe` (Bleu clair) | Utilisateur identifié |
| **s0** | Premier speaker | `#7c3aed` (Violet) | `#ede9fe` (Violet clair) | Speaker 0 par défaut |
| **s1** | Deuxième speaker | `#15803d` (Vert) | `#dcfce7` (Vert clair) | Speaker 1 |
| **s2** | Troisième speaker | `#c2410c` (Orange) | `#fed7aa` (Orange clair) | Speaker 2 |
| **s3** | Quatrième speaker | `#be185d` (Rose) | `#fce7f3` (Rose clair) | Speaker 3 |
| **s4** | Cinquième speaker | `#0f766e` (Teal) | `#ccfbf1` (Teal clair) | Speaker 4 |

---

## 🔄 Animation de Transition

### Logique CSS

```css
.segment {
  display: inline;
  color: #334155;
  font-weight: normal;
  transition: all 200ms ease-in-out; /* Transition douce */
}

.segment-active {
  display: inline;
  font-weight: bold;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  transition: all 200ms ease-in-out; /* Transition douce */
}

/* Exemple pour speaker "Vous" */
.segment-active.speaker-user {
  color: #1d4ed8;
  background-color: #dbeafe;
}

/* Exemple pour speaker s1 */
.segment-active.speaker-s1 {
  color: #7c3aed;
  background-color: #ede9fe;
}
```

### Séquence d'Animation

```
Temps 0.0s → 0.5s :
  Segment 1 : normal → (fade 200ms) → BLEU GRAS

Temps 1.4s → 1.6s :
  Segment 1 : BLEU GRAS → (fade 200ms) → normal
  Segment 2 : normal → (fade 200ms) → VIOLET GRAS

Temps 3.8s → 4.0s :
  Segment 2 : VIOLET GRAS → (fade 200ms) → normal
```

---

## 💻 Code React Simplifié

### Structure du Rendu

```tsx
function TranscriptionViewer({ segments, currentTime, isPlaying }) {
  const activeIndex = useMemo(() => {
    const currentMs = currentTime * 1000;
    return segments.findIndex(
      seg => currentMs >= seg.startMs && currentMs <= seg.endMs
    );
  }, [segments, currentTime]);

  return (
    <div>
      {segments.map((segment, index) => {
        const isActive = index === activeIndex && isPlaying;
        const colors = getSpeakerColor(segment.speakerId, segment.voiceScore);

        return (
          <span
            key={index}
            className={`
              inline transition-all duration-200
              ${isActive
                ? `font-bold ${colors.text} ${colors.bg} px-1 rounded`
                : 'text-slate-700'
              }
            `}
          >
            {segment.text}{' '}
          </span>
        );
      })}
    </div>
  );
}
```

---

## 📱 Exemple Complet avec 3 Speakers

### Segments

1. **s0** (Vous - 92%) : "Bonjour à tous" (0.0s - 1.0s)
2. **s1** (15%) : "Salut comment ça va" (1.2s - 2.5s)
3. **s2** (12%) : "Très bien merci" (2.7s - 3.5s)

### Séquence Visuelle

#### Temps 0.5s - s0 parle (Bleu)
```
🔵 Bonjour à tous  Salut comment ça va Très bien merci
   ^^^^^^^^^^^^^^^^
```

#### Temps 1.8s - s1 parle (Violet)
```
Bonjour à tous  🟣 Salut comment ça va  Très bien merci
                   ^^^^^^^^^^^^^^^^^^^
```

#### Temps 3.0s - s2 parle (Vert)
```
Bonjour à tous  Salut comment ça va  🟢 Très bien merci
                                         ^^^^^^^^^^^^^^^
```

---

## ✨ Avantages de Cette Approche

### 1. **Lisibilité Optimale**
- Texte continu, facile à lire
- Pas de badges encombrants
- Focus sur le contenu

### 2. **Feedback Visuel Clair**
- On voit immédiatement qui parle
- Changement de couleur = changement de speaker
- Comme des sous-titres colorés

### 3. **Performance**
- Un seul élément actif à la fois
- Transitions CSS légères (200ms)
- `content-visibility: auto` pour segments hors vue

### 4. **Accessibilité**
- Contraste WCAG AA respecté
- Gras + couleur = double indication
- Fonctionne en mode daltonien (gras reste visible)

---

## 🎯 Cas d'Usage

### ✅ Conversation 2 personnes
```
🔵 Vous : "Comment vas-tu ?"
🟣 Ami : "Ça va bien merci"
```

### ✅ Réunion 4 personnes
```
🔵 Vous : "Bonjour à tous"
🟣 Alice : "Salut"
🟢 Bob : "Hello"
🟠 Charlie : "Coucou"
```

### ✅ Interview (1 interviewer + 1 interviewé)
```
🔵 Vous : "Pouvez-vous vous présenter ?"
🟣 Invité : "Je m'appelle Jean..."
🔵 Vous : "Merci pour cette présentation"
```

---

**Date de création** : 19 janvier 2026
**Auteur** : Claude Sonnet 4.5
**Version** : 1.0
