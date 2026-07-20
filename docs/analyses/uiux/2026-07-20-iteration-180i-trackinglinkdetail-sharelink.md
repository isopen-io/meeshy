# Iteration 180i — `TrackingLinkDetailView` : partage natif `ShareLink`

**Date** : 2026-07-20
**Écran** : `apps/ios/Meeshy/Features/Main/Views/TrackingLinkDetailView.swift`
**Type** : HIG / composant natif / dette technique
**Piste** : iOS (suffixe `i`)

## Contexte

Écran de détail d'un lien de tracking (propriétaire) : header, barre d'actions
(Copier / Partager / QR Code / Supprimer), statistiques, breakdown géo/appareils,
timeline des clics, configuration UTM. Déjà entièrement localisé (`String(localized:)`),
Dynamic Type via fontes sémantiques, couleurs de marque (`MeeshyColors.trackingAccent`,
`brandPrimary`, `indigo300`). Candidat explicitement listé en fin d'analyse 171i
(« Restent candidats … `TrackingLinkDetailView` ») pour la migration `ShareLink`.

## Déficit identifié (1, non-typo)

### Bouton « Partager » réimplémentait la feuille de partage à la main

Le bouton **Partager** de l'`actionsBar` construisait manuellement la feuille :

```swift
detailActionButton("Partager", icon: "square.and.arrow.up", ...) {
    guard let url = URL(string: link.shortUrl) else { return }
    let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
    presentVC(av)   // parcours connectedScenes → top-VC + ancrage popover iPad manuel
}
```

Problèmes :
- **~15 lignes de plomberie UIKit** (`UIActivityViewController` + parcours
  `UIApplication.shared.connectedScenes` → top-VC dans `presentVC`) pour un simple
  partage d'URL, là où l'app dispose déjà de `ShareLink` natif (idiome dominant :
  **10 fichiers**).
- **Ancrage popover iPad manuel** obligatoire (`popoverPresentationController`) sous
  peine de crash — fragile, à maintenir à la main.
- Diverge du reste de l'app (précédent 171i : `CommunityLinkDetailView` migré au même
  motif).

## Correctif

Extraction d'un `actionButtonLabel(_:icon:color:)` partagé (le visuel des 4 tuiles),
consommé à l'identique par `detailActionButton` (Button) **et** par un nouveau
`shareActionButton` basé sur `ShareLink(item:)` :

```swift
private var shareActionButton: some View {
    let label = String(localized: "tracking.link.detail.share", ...)
    return Group {
        if let url = URL(string: link.shortUrl) {
            ShareLink(item: url) { actionButtonLabel(label, icon: "square.and.arrow.up", color: .trackingAccent) }
        } else {
            ShareLink(item: link.shortUrl) { actionButtonLabel(...) }   // fallback String, jamais de crash
        }
    }
}
```

- `ShareLink` (iOS 16.0+, plancher app) : ancrage iPad **gratuit**, feuille système,
  aperçu de lien enrichi (item `URL`).
- Fallback `ShareLink(item: String)` si l'URL est malformée → aucun `guard … return`
  silencieux, aucun crash possible.
- **0 changement visuel** : `actionButtonLabel` porte `.frame(maxWidth: .infinity)`,
  les 4 tuiles restent équi-réparties dans le `HStack`.

## Ce qui N'est PAS touché (justifié)

- **Partage du QR Code** (`generateQRAndShare` → `presentVC`) reste en
  `UIActivityViewController` : le `UIImage` du QR est **généré à la volée au tap**
  (CIFilter), donc non disponible en amont pour un `ShareLink(item:)`. `presentVC`
  reste référencé → aucun code mort.
- Noms de paramètres UTM (`"Campaign"`, `"Source"`, `"Medium"` dans `utmInfoSection`) :
  termes techniques standards de la spec UTM (utm_campaign/source/medium), conservés
  en l'état comme partout ailleurs.
- Chaînes de statistiques, breakdown, timeline : déjà localisées.

## Périmètre

- **1 fichier**, **0 logique métier** (contrat `TrackingLinkDetailView(link:)` inchangé).
- **0 clé i18n neuve** (`tracking.link.detail.share` réutilisée).
- **0 test** : aucun test ne référence la vue ; changement de structure de vue SwiftUI
  (Button → ShareLink) non couvrable en unit test sans infra snapshot — cohérent avec
  le précédent 171i.
- **0 contention** : aucune PR iOS ouverte ne touche `TrackingLinkDetailView`
  (recherche PR + grep tests vérifiés).

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26 / Swift 6.2 + run simu 18.2).
- Parité visuelle : `actionButtonLabel` partagé garantit un rendu identique.
- `presentVC` / `UIActivityViewController` toujours utilisés (QR) → pas de warning
  « unused ».

## Statut

**SOLDÉ 180i** — `TrackingLinkDetailView` chemin de partage d'URL migré au
`ShareLink` natif. Ne plus réintroduire de `UIActivityViewController` manuel pour l'URL.
Restent candidats (fichiers distincts, vérifier contention) : `AffiliateView`,
`ConversationMediaViews`, `ConversationListView` (certains légitimement manuels :
multi-items / activités custom / images générées à la volée).
