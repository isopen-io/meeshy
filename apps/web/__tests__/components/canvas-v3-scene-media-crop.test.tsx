/**
 * #5085 — **le recadrage traversait la passerelle sans lecteur.**
 *
 * `payload` est déclaré `z.record(z.string(), z.unknown())` dans
 * `canvas-v3.ts` — permissif PAR CONTRAT. Les clés `cropX/cropY/cropW/cropH`
 * écrites par iOS passaient donc la validation, arrivaient jusqu'ici, et
 * n'étaient lues par personne : **une image recadrée sur iOS se rendait
 * ENTIÈRE sur le web**, sans qu'un seul test ne rougisse.
 *
 * Un schéma permissif n'a pas de site où refuser, et un lecteur qui ignore un
 * champ ne se distingue pas d'un lecteur qui ne l'a jamais reçu. C'est la
 * forme du § « une énumération de sites porte DEUX affirmations » : le lot iOS
 * savait dire « ces sites appliquent la règle », pas « ce sont les sites où la
 * règle s'applique ».
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import { CanvasV3Scene } from '@/components/v2/CanvasV3Scene';

function mediaScene(payload: Record<string, unknown>): CanvasV3 {
  return {
    v: 3,
    scenes: [
      {
        id: 's1',
        objects: [
          {
            id: 'm1',
            kind: 'media',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'bg',
            z: 0,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload: { mediaURL: 'https://cdn.test/photo.jpg', mediaType: 'image', ...payload },
          },
        ],
      },
    ],
  };
}

/** La bande du bas d'une source 1:1 : moitié basse, pleine largeur. */
const BANDE_BASSE = { cropX: 0, cropY: 0.5, cropW: 1, cropH: 0.5 };

describe('CanvasV3Scene — le recadrage d’un média (#5085)', () => {
  describe('un FOND plein cadre', () => {
    it('reste en inset-0 quand aucune borne ne voyage', () => {
      render(<CanvasV3Scene doc={mediaScene({ isBackground: true })} sceneIndex={0} />);
      const img = screen.getByTestId('canvas-v3-object-m1');
      expect(img.tagName).toBe('IMG');
      expect(img.className).toContain('inset-0');
      expect(img.getAttribute('style') ?? '').not.toContain('width: 200%');
    });

    /**
     * Le web n'a pas d'équivalent de `CALayer.contentsRect` : montrer une
     * FRACTION sans ré-encoder demande d'agrandir puis de décaler sous un
     * conteneur qui coupe. C'est ce que `contentsRect` fait en interne — d'où
     * l'identité du rendu, et le fait qu'aucun pixel n'est retouché.
     */
    it('agrandit et décale le média sous un conteneur qui coupe', () => {
      render(<CanvasV3Scene doc={mediaScene({ isBackground: true, ...BANDE_BASSE })} sceneIndex={0} />);
      const cadre = screen.getByTestId('canvas-v3-object-m1');
      expect(cadre.className).toContain('overflow-hidden');

      const img = screen.getByTestId('canvas-v3-media-m1');
      const style = img.getAttribute('style') ?? '';
      // Moitié basse ⇒ hauteur doublée, décalage d'une hauteur d'image.
      expect(style).toContain('height: 200%');
      expect(style).toContain('top: -100%');
      expect(style).toContain('width: 100%');
    });

    /**
     * **Un recadrage amputé n'a pas de repli sensé.** Le compléter
     * fabriquerait un cadrage que personne n'a posé, et le rendrait
     * indiscernable d'un vrai — donc il ne se lit pas du tout.
     */
    it('ignore un recadrage amputé plutôt que de le compléter', () => {
      render(<CanvasV3Scene doc={mediaScene({ isBackground: true, cropX: 0, cropY: 0.5, cropW: 1 })} sceneIndex={0} />);
      expect(screen.getByTestId('canvas-v3-object-m1').className).toContain('inset-0');
    });

    /** Un recadrage PLEIN est l'absence de recadrage — pas un cadre à monter. */
    it('traite un recadrage plein comme une absence', () => {
      render(
        <CanvasV3Scene
          doc={mediaScene({ isBackground: true, cropX: 0, cropY: 0, cropW: 1, cropH: 1 })}
          sceneIndex={0}
        />,
      );
      expect(screen.getByTestId('canvas-v3-object-m1').className).toContain('inset-0');
    });
  });

  describe('un média POSÉ', () => {
    /**
     * **Un média recadré n'a plus les proportions de son FICHIER.** Poser
     * `aspectRatio` brut laisserait la carte à la forme de la source et
     * letterboxerait la bande dedans : le recadrage se verrait comme une
     * MARGE, pas comme un cadrage — un défaut qui a l'air d'un réglage.
     */
    it('la carte prend le rapport EFFECTIF, pas celui du fichier', () => {
      render(<CanvasV3Scene doc={mediaScene({ aspectRatio: 1, ...BANDE_BASSE })} sceneIndex={0} />);
      const style = screen.getByTestId('canvas-v3-object-m1').getAttribute('style') ?? '';
      // 1:1 dont on garde une bande deux fois plus large que haute ⇒ 2.
      expect(style).toContain('aspect-ratio: 2');
    });

    it('la carte garde le rapport du fichier quand rien n’est recadré', () => {
      render(<CanvasV3Scene doc={mediaScene({ aspectRatio: 0.5625 })} sceneIndex={0} />);
      const style = screen.getByTestId('canvas-v3-object-m1').getAttribute('style') ?? '';
      expect(style).toContain('aspect-ratio: 0.5625');
    });

    it('le média posé applique les bornes, comme le fond', () => {
      render(<CanvasV3Scene doc={mediaScene({ aspectRatio: 1, ...BANDE_BASSE })} sceneIndex={0} />);
      const style = screen.getByTestId('canvas-v3-media-m1').getAttribute('style') ?? '';
      expect(style).toContain('height: 200%');
      expect(style).toContain('top: -100%');
    });

    it('sans recadrage, il reste en object-contain', () => {
      render(<CanvasV3Scene doc={mediaScene({ aspectRatio: 1 })} sceneIndex={0} />);
      expect(screen.getByTestId('canvas-v3-media-m1').className).toContain('object-contain');
    });
  });
});
