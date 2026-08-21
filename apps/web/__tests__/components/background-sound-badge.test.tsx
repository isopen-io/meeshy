/**
 * F3 — L'annonce du fond + 🔇, côté web (B3.3-6).
 *
 * `backgroundAnnouncement(sound, meta)` est le résolveur PUR — miroir exact
 * du contrat B5 iOS (`AudioChipDisplay.backgroundAnnouncement`), MÊMES cas :
 * pas de piste ⇒ `null` (existence, B3.5) ; piste ORIGINALE ⇒ `♫〰`, si et
 * seulement si (provenance, B3.4) ; piste de bibliothèque avec métadonnées
 * ⇒ crédit complet `titre · @pseudo · M:SS` ; sans métadonnées (cache froid)
 * ⇒ forme crédit générique `♫ —`, JAMAIS un repli vers `♫〰` qui mentirait
 * sur la provenance.
 *
 * Le composant `BackgroundSoundBadge` n'existe QUE si une piste existe :
 * sans piste, il rend RIEN — pas de placeholder. Le bouton 🔇 n'est monté
 * que si l'annonce est non nulle, et bascule l'état muet du lecteur LOCAL
 * via `onToggleMute` (le composant ne possède aucun lecteur lui-même).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { BackgroundSoundV3 } from '@meeshy/shared/types/canvas-v3';

import { BackgroundSoundBadge, backgroundAnnouncement } from '@/components/v2/BackgroundSoundBadge';

const originalSound: BackgroundSoundV3 = { source: { t: 'original' }, volume: 1 };
const librarySound: BackgroundSoundV3 = { source: { t: 'library', soundId: 'snd_nuits_ete' }, volume: 1 };

describe('backgroundAnnouncement — résolveur pur (miroir B5)', () => {
  it('returns null when there is no track (existence, B3.5)', () => {
    expect(
      backgroundAnnouncement(undefined, { title: 'Nuits d’été', username: 'sam', durationSeconds: 15 }),
    ).toBeNull();
    expect(backgroundAnnouncement(null)).toBeNull();
  });

  it('announces the waveform for an ORIGINAL track (provenance, B3.4)', () => {
    expect(backgroundAnnouncement(originalSound, { title: undefined, username: undefined })).toBe('♫〰');
  });

  it('announces the full credit form for a library track with metadata', () => {
    expect(
      backgroundAnnouncement(librarySound, { title: 'Nuits d’été', username: 'sam', durationSeconds: 15 }),
    ).toBe('Nuits d’été · @sam · 0:15');
  });

  it('keeps the generic credit form for a library track without metadata — never falls back to the waveform', () => {
    expect(
      backgroundAnnouncement(librarySound, { title: null, username: null, durationSeconds: null }),
    ).toBe('♫ —');
  });

  it('does not double the @ when the resolved username already carries one', () => {
    expect(backgroundAnnouncement(librarySound, { title: undefined, username: '@sam' })).toBe('@sam');
  });
});

describe('BackgroundSoundBadge — le composant (B3.5 existence, B3.6 bouton)', () => {
  it('renders nothing when there is no track — no placeholder', () => {
    const { container } = render(<BackgroundSoundBadge sound={undefined} muted />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('background-sound-mute-toggle')).toBeNull();
  });

  it('renders the waveform announcement and mounts the 🔇 button for an original track', () => {
    render(<BackgroundSoundBadge sound={originalSound} muted />);
    expect(screen.getByTestId('background-sound-announcement')).toHaveTextContent('♫〰');
    expect(screen.getByTestId('background-sound-mute-toggle')).toBeInTheDocument();
  });

  it('renders the full credit for a library track with metadata', () => {
    render(
      <BackgroundSoundBadge
        sound={librarySound}
        title="Nuits d'été"
        username="sam"
        durationSeconds={15}
        muted={false}
      />,
    );
    expect(screen.getByTestId('background-sound-announcement')).toHaveTextContent("Nuits d'été · @sam · 0:15");
  });

  it('toggles the LOCAL player mute state through onToggleMute — the badge owns no player', () => {
    const onToggleMute = jest.fn();
    render(<BackgroundSoundBadge sound={originalSound} muted onToggleMute={onToggleMute} />);

    fireEvent.click(screen.getByTestId('background-sound-mute-toggle'));

    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  it('labels the button with the action available, mirroring the muted state', () => {
    const { rerender } = render(
      <BackgroundSoundBadge sound={originalSound} muted muteLabel="Mute" unmuteLabel="Unmute" />,
    );
    expect(screen.getByTestId('background-sound-mute-toggle')).toHaveAccessibleName('Unmute');

    rerender(
      <BackgroundSoundBadge sound={originalSound} muted={false} muteLabel="Mute" unmuteLabel="Unmute" />,
    );
    expect(screen.getByTestId('background-sound-mute-toggle')).toHaveAccessibleName('Mute');
  });
});
