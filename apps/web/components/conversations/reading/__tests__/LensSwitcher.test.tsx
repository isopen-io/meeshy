import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LensSwitcher } from '../LensSwitcher';

const t = (key: string, fallback?: string) => fallback ?? key;

function setup(mode: 'focal' | 'script' | 'bubble' = 'focal') {
  const onModeChange = jest.fn();
  const onToggleDensity = jest.fn();
  render(
    <LensSwitcher
      mode={mode}
      onModeChange={onModeChange}
      onToggleDensity={onToggleDensity}
      t={t}
    />
  );
  return { onModeChange, onToggleDensity };
}

describe('LensSwitcher — 3 choix, apprenables par cœur', () => {
  it('exposes exactly the three retained lenses and nothing else', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Lentille' }));

    const items = await screen.findAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent)).toEqual(['focal', 'script', 'bubble']);
  });

  it('marks the active lens so the current mode is never a guess', async () => {
    setup('script');

    await userEvent.click(screen.getByRole('button', { name: 'Lentille' }));

    const active = await screen.findByRole('menuitem', { current: true });
    expect(active).toHaveTextContent('script');
  });

  it('reports the chosen lens', async () => {
    const { onModeChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Lentille' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'bubble' }));

    expect(onModeChange).toHaveBeenCalledWith('bubble');
  });

  // `Aa` : un geste, sans ouvrir le menu.
  it('toggles density straight from the toolbar', async () => {
    const { onToggleDensity, onModeChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Densité de lecture' }));

    expect(onToggleDensity).toHaveBeenCalledTimes(1);
    expect(onModeChange).not.toHaveBeenCalled();
  });
});
