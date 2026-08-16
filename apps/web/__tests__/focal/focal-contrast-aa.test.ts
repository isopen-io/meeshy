/**
 * WF-113 — contraste WCAG AA des nouvelles surfaces Focal, calcul EN TEST,
 * MÊME patron que `lentille-contrast.ts` (WL-102) : les fonctions pures
 * (`hexToRgb`, `relativeLuminance`, `contrastRatio`, `hslToRgb`) sont
 * RÉUTILISÉES verbatim, jamais réimplémentées.
 *
 * Deux surfaces couvertes :
 *   1. Citation (`FocalQuotedReply`) — le TEXTE du nom de l'auteur cité passe
 *      par `resolveBridgeTintColor` (garanti ≥ 4,5:1, déjà prouvé dans
 *      `FocalQuotedReply.test.tsx` en thème clair ; ce fichier ajoute le
 *      thème SOMBRE pour compléter « deux thèmes » — critère LWS-10 repris
 *      pour le fil).
 *   2. « Toi » indigo (`FocalIdentityHeader`, `#6366F1`, contrat §WS-4
 *      `MeeshyColors.indigo500`) — un littéral hérité TEL QUEL du contrat
 *      iOS, SANS passer par `resolveBridgeTintColor` (ce n'est pas un pont,
 *      c'est une identité de marque). Ce test MESURE, ne fabrique rien :
 *      **constat honnête** — voir le commentaire sur le vecteur « thème
 *      clair » ci-dessous.
 */
import { hexToRgb, hslToRgb, contrastRatio } from '@/components/conversations/lentille/lentille-contrast';
import { resolveBridgeTintColor } from '@/components/conversations/lentille/lentille-contrast';
import { resolveFocalAuthorAccent } from '@/components/conversations/focal/focal-row-utils';

// MÊMES triplets HSL que `lentille-contrast.ts` (dupliqués ici pour la même
// raison que ce fichier les duplique lui-même de `globals.css` : pas de
// `getComputedStyle` hors navigateur).
const LIGHT_BACKGROUND = hslToRgb(0, 0, 100);
const DARK_BACKGROUND = hslToRgb(224, 71.4, 4.1);

const AA_MIN_RATIO = 4.5;

describe('Contraste AA — citation (FocalQuotedReply, texte du nom via resolveBridgeTintColor)', () => {
  const sampleAuthors = ['Alice', 'Bob', 'Zoé', 'Chen Wei', 'Fatima Al-Rashid'];

  it('thème clair : le nom de l\'auteur cité passe ≥ 4.5:1 pour un échantillon d\'auteurs', () => {
    sampleAuthors.forEach((name) => {
      const accent = resolveFocalAuthorAccent(name);
      const tinted = resolveBridgeTintColor(accent, 'light');
      expect(contrastRatio(hexToRgb(tinted), LIGHT_BACKGROUND)).toBeGreaterThanOrEqual(AA_MIN_RATIO);
    });
  });

  it('thème sombre : le nom de l\'auteur cité passe ≥ 4.5:1 pour un échantillon d\'auteurs', () => {
    sampleAuthors.forEach((name) => {
      const accent = resolveFocalAuthorAccent(name);
      const tinted = resolveBridgeTintColor(accent, 'dark');
      expect(contrastRatio(hexToRgb(tinted), DARK_BACKGROUND)).toBeGreaterThanOrEqual(AA_MIN_RATIO);
    });
  });
});

describe('Contraste — "Toi" indigo (#6366F1, littéral hérité du contrat §WS-4)', () => {
  const YOU_INDIGO = hexToRgb('#6366F1');

  it('thème sombre : passe AA (≥ 4.5:1) contre le fond sombre', () => {
    expect(contrastRatio(YOU_INDIGO, DARK_BACKGROUND)).toBeGreaterThanOrEqual(AA_MIN_RATIO);
  });

  it(
    "thème clair : constat honnête — la couleur littérale du contrat (#6366F1) N'ATTEINT PAS 4.5:1 " +
      'contre un fond blanc pur (mesuré ≈ 4.47:1, faute de ≈ 0.03). Ni fabriqué ni masqué : ce test ' +
      'VERROUILLE le résultat mesuré pour qu\'un futur ajustement de teinte (ou un fond légèrement ' +
      'off-white) le fasse remonter à l\'attention plutôt que de rester silencieux. FINDING WF-113, ' +
      'à trancher en revue (REV-4) : accepter la parité avec iOS (qui hérite du même littéral, aucune ' +
      'garantie AA promise par le contrat pour "Toi" — seul le pont ✦ en porte une explicitement), ou ' +
      'router "Toi" par resolveBridgeTintColor comme la citation.',
    () => {
      const ratio = contrastRatio(YOU_INDIGO, LIGHT_BACKGROUND);
      expect(ratio).toBeGreaterThan(4.4);
      expect(ratio).toBeLessThan(AA_MIN_RATIO);
    }
  );
});
