/**
 * WF-112 — `FocalMediaBlock`.
 *
 * behaviour-matrix:F08 — « les grilles médias restent conservées ...,
 * posées nues dans la rangée ». Portée PARTIELLE assumée (documentée dans
 * `FocalMediaBlock.tsx` et le rapport WF-113) : le radius 16 et le rendu
 * NU (sans bulle) sont prouvés ; la géométrie exacte des slots 1/2/3/4+
 * (`gridMaxWidth 300`, largeurs 149/178.8/119.2) n'est PAS reproduite par ce
 * lot — aucune loi `FocalMediaGridLayout` partagée n'existe encore côté web.
 */
import { render, screen } from '@testing-library/react';
import { FocalMediaBlock } from '../FocalMediaBlock';
import type { Attachment } from '@meeshy/shared/types/attachment';

function makeImage(id: string): Attachment {
  return {
    id,
    messageId: 'm1',
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 10,
    fileUrl: `https://example.com/${id}.jpg`,
  } as Attachment;
}

describe('FocalMediaBlock — médias radius 16, nus (F08)', () => {
  it('ne rend rien sans pièce jointe image', () => {
    const { container } = render(<FocalMediaBlock attachments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rend le conteneur au radius du token thread.media.radius (16)', () => {
    render(<FocalMediaBlock attachments={[makeImage('a1')]} />);
    expect(screen.getByTestId('focal-media-block')).toHaveStyle({
      borderRadius: 'var(--lentille-thread-media-radius)',
    });
  });

  it('rend une image par pièce jointe image', () => {
    render(<FocalMediaBlock attachments={[makeImage('a1'), makeImage('a2')]} />);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  /**
   * TÉMOIN RETOURNÉ EXPRÈS — parité du 2026-08-17.
   *
   * Il affirmait « ignore les pièces jointes non-image », et c'était
   * exactement le défaut : ce que le bloc « ignorait », l'utilisateur ne le
   * voyait NULLE PART. Un vocal seul, une vidéo seule, un PDF seul rendaient
   * une rangée vide dans Focal comme dans Script, quand la vue Bulles les
   * montrait. Le bloc n'ignore plus : la grille NUE du contrat reste réservée
   * aux images, et tout le reste part au renderer de la vue Bulles
   * (`MessageAttachments`), RÉUTILISÉ.
   */
  it('les pièces jointes NON-image partent au renderer de la vue Bulles (elles étaient jetées)', () => {
    render(
      <FocalMediaBlock
        attachments={[
          { ...makeImage('a1'), mimeType: 'application/pdf', originalName: 'a1.pdf' } as Attachment,
        ]}
      />
    );
    // Pas de grille nue : ce n'est pas une image.
    expect(screen.queryByTestId('focal-media-block')).not.toBeInTheDocument();
    // …mais plus de silence non plus.
    expect(screen.getByTestId('focal-attachment-block')).toBeInTheDocument();
  });

  it('images ET non-images cohabitent — chacune par son renderer', () => {
    render(
      <FocalMediaBlock
        attachments={[
          makeImage('a1'),
          { ...makeImage('a2'), mimeType: 'audio/mpeg', originalName: 'a2.mp3' } as Attachment,
        ]}
      />
    );
    expect(screen.getByTestId('focal-media-block')).toBeInTheDocument();
    expect(screen.getByTestId('focal-attachment-block')).toBeInTheDocument();
  });
});
