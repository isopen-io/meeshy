import { render, screen } from '@testing-library/react';
import { RiverLaneHeaderStrip } from '../RiverLaneHeaderStrip';
import type { RiverLaneHeader } from '@meeshy/shared/utils/river-lanes';

const railX = (laneIndex: number) => laneIndex * 300 + 150;

const headers: readonly RiverLaneHeader[] = [
  { laneIndex: 0, laneId: 'me', colorSeed: 'Moi', isViewer: true, alpha: 1 },
  { laneIndex: 1, laneId: 'alice', colorSeed: 'Alice', isViewer: false, alpha: 0.5 },
];

describe('RiverLaneHeaderStrip — l\'en-tête nomme la ligne qu\'on lit (§7ter B)', () => {
  it('rend un en-tête par entrée SERVIE — jamais recalculé, jamais d\'opacité nulle inventée', () => {
    render(<RiverLaneHeaderStrip headers={headers} railX={railX} widthPx={600} youLabel="Toi" />);
    expect(screen.getAllByTestId('river-lane-header')).toHaveLength(2);
  });

  it('le lecteur (isViewer) affiche youLabel, jamais colorSeed', () => {
    render(<RiverLaneHeaderStrip headers={headers} railX={railX} widthPx={600} youLabel="Toi" />);
    const entries = screen.getAllByTestId('river-lane-header');
    expect(entries[0]).toHaveTextContent('TOI');
  });

  it('une voix nommée affiche colorSeed en majuscules', () => {
    render(<RiverLaneHeaderStrip headers={headers} railX={railX} widthPx={600} youLabel="Toi" />);
    const entries = screen.getAllByTestId('river-lane-header');
    expect(entries[1]).toHaveTextContent('ALICE');
  });

  it('pose l\'alpha SERVI par la loi tel quel (jamais un fondu recalculé par la peau)', () => {
    render(<RiverLaneHeaderStrip headers={headers} railX={railX} widthPx={600} youLabel="Toi" />);
    const entries = screen.getAllByTestId('river-lane-header');
    expect((entries[0] as HTMLElement).style.opacity).toBe('1');
    expect((entries[1] as HTMLElement).style.opacity).toBe('0.5');
  });

  it('une liste vide (aucune occupation à cette hauteur) ne rend aucun en-tête', () => {
    render(<RiverLaneHeaderStrip headers={[]} railX={railX} widthPx={600} youLabel="Toi" />);
    expect(screen.queryByTestId('river-lane-header')).not.toBeInTheDocument();
  });

  it('est aria-hidden — le nom vit déjà dans la bulle en tête de groupe (§7ter A2)', () => {
    render(<RiverLaneHeaderStrip headers={headers} railX={railX} widthPx={600} youLabel="Toi" />);
    expect(screen.getByTestId('river-lane-header-strip')).toHaveAttribute('aria-hidden', 'true');
  });

  it('consomme river.laneHeader.height en CSS pur', () => {
    render(<RiverLaneHeaderStrip headers={headers} railX={railX} widthPx={600} youLabel="Toi" />);
    const strip = screen.getByTestId('river-lane-header-strip');
    expect(strip.style.height).toBe('var(--lentille-river-lane-header-height)');
  });

  it('deux entrées peuvent partager le même laneIndex sans collision de clé React (partage de colonne §7ter C)', () => {
    const sharedColumn: readonly RiverLaneHeader[] = [
      { laneIndex: 0, laneId: 'alice', colorSeed: 'Alice', isViewer: false, alpha: 0.3 },
      { laneIndex: 0, laneId: 'bob', colorSeed: 'Bob', isViewer: false, alpha: 0.3 },
    ];
    render(<RiverLaneHeaderStrip headers={sharedColumn} railX={railX} widthPx={600} youLabel="Toi" />);
    expect(screen.getAllByTestId('river-lane-header')).toHaveLength(2);
  });
});
