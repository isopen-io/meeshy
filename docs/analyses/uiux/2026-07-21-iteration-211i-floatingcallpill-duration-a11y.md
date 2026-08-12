# Iteration-211i — FloatingCallPillView: VoiceOver label + value on the call duration

## Contexte

`FloatingCallPillView`
(`apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`) est la
bannière d'appel réduite (façon WhatsApp) incrustée au sommet de l'app quand un
appel est actif et minimisé. Sa seconde ligne (`statusLine`, l. 192-208) affiche,
quand l'appel est **établi**, un glyphe de signal + la **durée courante**
(`Text(formattedDuration)`, format `%02d:%02d` → « 02:34 »).

Le composant est déjà très accessible : le conteneur `pillContent` porte un
libellé « Appel en cours — {username} » + hint + `.isButton` + action
« Réduire en bulle » (l. 164-173) ; les boutons mute/haut-parleur/raccrocher ont
libellés + traits toggle (l. 250-299) ; `statusLine` porte déjà
`.updatesFrequently`.

## Problème (a11y — HIG « nommer ce qu'un contrôle mesure »)

Le libellé VoiceOver de `statusLine` était :

```swift
.accessibilityLabel(pillStatus.isConnected ? formattedDuration : pillStatus.label)
```

Quand l'appel est connecté, le libellé se réduisait à `formattedDuration` — un
**« 02:34 » nu**, sans aucune indication qu'il s'agit de la **durée de l'appel**.
Même défaut « readout numérique sans contexte » que celui soldé en 206i
(`MessageReactionsDetailView`, compteur de réactions) et 210i
(`AudioPostComposerView`, chrono d'enregistrement). Les états pré-connexion
étaient corrects (libellé parlé « Sonnerie… » / « Connexion… » / « Reconnexion… »),
seul l'état connecté était muet de sens.

## Correctif

Séparation libellé (descripteur statique) / valeur (temps courant) sur l'état
connecté, en conservant le libellé parlé des états pré-connexion :

```swift
.accessibilityLabel(pillStatus.isConnected
    ? String(localized: "a11y.call.pill.duration", defaultValue: "Durée d'appel", bundle: .main)
    : pillStatus.label)
.accessibilityValue(pillStatus.isConnected ? formattedDuration : "")
.accessibilityAddTraits(.updatesFrequently)
```

VoiceOver annonce désormais **« Durée d'appel, 02:34 »** pour un appel établi (au
lieu de « 02:34 » nu), et conserve **« Sonnerie… »** / etc. avant connexion (où
la valeur vide n'est pas lue). Le trait `.updatesFrequently` préexistant est
conservé — VoiceOver ne re-annonce pas la durée à chaque seconde de façon
intempestive.

## Portée & sûreté

- **1 fichier**, +6 lignes (dont 4 de commentaire), 0 logique / 0 réseau /
  0 layout / 0 changement visuel / 0 test neuf.
- **1 clé i18n inline** (`a11y.call.pill.duration`), 0 édition `.xcstrings` —
  extraction au build depuis `defaultValue`, alignée sur les clés `call.pill.*` /
  `a11y.call.pill.collapse` déjà inline dans ce fichier.
- `.accessibilityElement(children: .combine)` inchangé ; `.accessibilityLabel`
  remplace le texte combiné, `.accessibilityValue` s'y ajoute. Valeur vide (`""`)
  en pré-connexion → non lue par VoiceOver (no-op).
- Fichier **absent de toute PR ouverte** (vérifié `list_pull_requests`, 23 PR ;
  0 occurrence de `FloatingCallPillView`) → 0 collision essaim `laughing-thompson`.
  Aucune couleur/token touché → 0 recouvrement avec l'audit design-tokens #2246.

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- `.accessibilityLabel` / `.accessibilityValue` sur un élément a11y combiné :
  comportement standard SwiftUI, aucun impact visuel.
- Aucun toolchain Swift dans l'environnement d'exécution (Linux) → vérification
  par inspection + gate CI.

## Statut

✅ Résolu. Ne plus re-flagger `FloatingCallPillView.statusLine` pour le
libellé/valeur VoiceOver de la durée (soldé 211i).

## Pistes 212i+

- Autres affichages de durée d'appel (`CallView` plein écran, `CallBubbleView`
  repliée) — vérifier libellé/valeur VoiceOver + collision essaim.
- Autres readouts numériques nus restants (compteurs/jauges) dans l'app.
