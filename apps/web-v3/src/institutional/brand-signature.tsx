/** @jsxImportSource preact */
/*
 * PRAGMA OBLIGATOIRE — même raison que `page.tsx` : ce fichier est rendu par
 * `preact-render-to-string` depuis `scripts/prerender-institutional.tsx`, un
 * script bun HORS du pipeline Vite (donc hors de l'alias qui redirige le
 * runtime JSX React vers Preact). Sans elle, le rendu produit une chaîne
 * VIDE sans erreur — le symptôme de #5554, rejoué ici sans la pragma.
 */
import { BRAND_CREDIT, BRAND_SIGNATURE_MASK_PATH, brandVersionLine } from '../lib/brand';

/**
 * LE PIED DE MARQUE — miroir de `BrandSignature.swift`
 * (`apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift`) : la ligne
 * de version, le crédit « Services CEO », le glyphe `AppIconFooter` teinté
 * erreur, empilés avec le même interligne (`VStack(spacing: 4)` → `gap-1`) et
 * le même retrait de 2 px au-dessus du glyphe.
 *
 * QUATRE ÉCARTS ASSUMÉS avec iOS, chacun avec sa raison — un écart sans raison
 * écrite redevient une dérive au cycle suivant :
 *
 * 1. PAS DE NUMÉRO DE BUILD. Le web n'a pas de `CFBundleVersion` ; la ligne se
 *    réduit à `Meeshy {version}` (`src/lib/brand.ts`).
 *
 * 2. `renderingMode(.template)` DEVIENT UN MASQUE CSS. `AppIconFooter` est une
 *    image gabarit côté iOS — seul son alpha compte, le consommateur la teinte.
 *    Le web fait la même chose avec `mask-image` sur un fond `var(--ios-error)`,
 *    le jeton DÉRIVÉ de `MeeshyColors.error` (D-4), et non une couleur écrite.
 *
 * 3. LA HIÉRARCHIE PASSE PAR L'ENCRE ET LE POIDS, PAS PAR L'OPACITÉ. iOS
 *    distingue les deux lignes en posant 0,9 et 0,7 d'opacité sur `textMuted`.
 *    MESURÉ sur les jetons dérivés (`--ios-ink-3` = `textMuted`), ces opacités
 *    donnent 4,44:1 pour la version et 3,09:1 pour le crédit en schéma SOMBRE,
 *    4,12:1 et 2,86:1 en CLAIR — sous le seuil AA de 4,5:1 dans les DEUX
 *    schémas, sur du texte de 14 px. iOS n'est pas tenu par ce seuil, le web
 *    l'est. Les deux niveaux de lecture sont donc rendus par l'ENCRE (`ink-2`
 *    puis `ink-3`, pleines : 9,98:1 et 5,26:1 en sombre, 4,98:1 dans les deux
 *    cas en clair) et par le POIDS `medium` du crédit — le même `.medium` que
 *    `BrandSignature.swift:29-33`, qui portait déjà cette distinction et que la
 *    première version web avait perdu.
 *
 * 4. LA TAILLE VIENT DE L'UTILITAIRE NATIF. `BrandSignature.swift` rend ses
 *    deux lignes à 14 pt ; le jeton correspondant est `--text-sm`, le MÊME que
 *    l'utilitaire natif `text-sm` de Tailwind (`tokens.css` pose `--text-sm`
 *    à la racine, hors de tout `@theme` — donc sans collision de nom avec le
 *    thème du projet). Corrigé à la revue de #5606 (défaut 2) : la feuille des
 *    pages institutionnelles ne déclarait alors AUCUN des rôles typographiques
 *    du projet (`text-body`, `text-screen`, …) dans son `@theme`, ce qui avait
 *    fait poser `fontSize: var(--text-sm)` en ligne ici plutôt que la classe —
 *    `institutional.css` les déclare désormais, et `text-sm` fonctionnait déjà
 *    (utilitaire Tailwind natif, jamais dépendant d'un `@theme` de rôle).
 *
 * ACCESSIBILITÉ — POURQUOI IL N'Y A PAS D'`aria-label` ICI.
 * `.accessibilityElement(children: .combine)` existe sur iOS parce que SwiftUI
 * ferait sinon trois arrêts de balayage pour une seule information. Le web n'a
 * pas ce problème : deux `<p>` se lisent d'affilée, dans l'ordre, et le texte
 * VISIBLE est alors exactement le texte LU. Surtout, un `aria-label` posé sur
 * un conteneur SANS rôle est IGNORÉ — « ARIA in HTML » interdit le nommage sur
 * le rôle `generic`, que `<div>` porte. La première version en posait un : il
 * avait la FORME d'une conformité sans en avoir l'EFFET, et aucun témoin lisant
 * le HTML ne pouvait le voir. Seul le glyphe, décoratif, est masqué.
 */
export function BrandSignature({ version }: { version: string }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-1 text-center text-sm">
      <p style={{ color: 'var(--color-ios-ink-2)' }}>{brandVersionLine(version)}</p>
      <p className="font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
        {BRAND_CREDIT}
      </p>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 28,
          height: 28,
          marginTop: 2,
          opacity: 0.9,
          backgroundColor: 'var(--ios-error)',
          maskImage: `url(${BRAND_SIGNATURE_MASK_PATH})`,
          WebkitMaskImage: `url(${BRAND_SIGNATURE_MASK_PATH})`,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
        }}
      />
    </div>
  );
}
