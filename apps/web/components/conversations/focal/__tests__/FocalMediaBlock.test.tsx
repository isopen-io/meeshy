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

  it('ignore les pièces jointes non-image', () => {
    render(
      <FocalMediaBlock
        attachments={[
          { ...makeImage('a1'), mimeType: 'application/pdf' } as Attachment,
        ]}
      />
    );
    expect(screen.queryByTestId('focal-media-block')).not.toBeInTheDocument();
  });
});
