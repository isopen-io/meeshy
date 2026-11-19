import { describe, expect, test } from 'bun:test';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyBlurDisc, MeeshyMapPin, MeeshyMapPinPreview, MeeshyPinCluster, meeshyMapPinRecipe } from './meeshy-map-pin';

const { mount, act } = kitMount();
const face = <span>LM</span>;

describe('MeeshyMapPin — la recette en valeurs', () => {
  test('contenu de 48, de 56 choisi, de 38 pour la mienne ; cible de 44 au moins', () => {
    expect(meeshyMapPinRecipe({}).content).toBe(48);
    expect(meeshyMapPinRecipe({ isSelected: true }).content).toBe(56);
    expect(meeshyMapPinRecipe({ kind: 'own' }).content).toBe(38);
    expect(meeshyMapPinRecipe({ kind: 'own' }).tapTarget).toBeGreaterThanOrEqual(44);
  });

  test('la pointe n’existe que pour une épingle exacte d’une autre personne', () => {
    expect(meeshyMapPinRecipe({ precision: 'exact' }).drawsPoint).toBe(true);
    expect(meeshyMapPinRecipe({ precision: { area: 53 } }).drawsPoint).toBe(false);
    expect(meeshyMapPinRecipe({ kind: 'own' }).drawsPoint).toBe(false);
    expect(meeshyMapPinRecipe({ kind: 'ghost' }).drawsPoint).toBe(false);
  });

  test('le disque vaut deux fois le rayon reçu, et n’est pas dessiné sous 32 de rayon', () => {
    expect(meeshyMapPinRecipe({ precision: { area: 53 } })).toMatchObject({ drawsDisc: true, discDiameter: 106 });
    expect(meeshyMapPinRecipe({ precision: { wide: 86 } }).discDiameter).toBe(172);
    expect(meeshyMapPinRecipe({ precision: { area: 22 } }).drawsDisc).toBe(false);
    expect(meeshyMapPinRecipe({ precision: { area: 32 } }).drawsDisc).toBe(true);
    expect(meeshyMapPinRecipe({ precision: 'exact' }).drawsDisc).toBe(false);
  });

  test('la mienne : onde permanente, ni disque ni pointe ; le fantôme : ni onde ni disque', () => {
    expect(meeshyMapPinRecipe({ kind: 'own', precision: { area: 90 } })).toMatchObject({ drawsPulse: true, drawsDisc: false, drawsPoint: false });
    expect(meeshyMapPinRecipe({ kind: 'ghost', isLive: true, precision: { area: 90 } })).toMatchObject({ drawsPulse: false, drawsDisc: false });
  });

  test('l’onde suit isLive, se coupe quand la position est périmée, et devient un anneau fixe sous mouvement réduit', () => {
    expect(meeshyMapPinRecipe({}).drawsPulse).toBe(false);
    expect(meeshyMapPinRecipe({ isLive: true }).drawsPulse).toBe(true);
    expect(meeshyMapPinRecipe({ isLive: true, isStale: true }).drawsPulse).toBe(false);
    expect(meeshyMapPinRecipe({ isLive: true, reduceMotion: true })).toMatchObject({ drawsPulse: true, pulseAnimates: false });
  });

  test('le disque passe à 28 % choisi, reste à 18 % sinon, et devient pointillé périmé', () => {
    expect(meeshyMapPinRecipe({ precision: { area: 53 } }).discOpacity).toBe(0.18);
    expect(meeshyMapPinRecipe({ precision: { area: 53 }, isSelected: true }).discOpacity).toBe(0.28);
    expect(meeshyMapPinRecipe({ precision: { area: 53 }, isStale: true }).discDashed).toBe(true);
  });

  test('appuyée : échelle 0,94', () => {
    expect(meeshyMapPinRecipe({ isPressed: true }).pressScale).toBe(0.94);
    expect(meeshyMapPinRecipe({}).pressScale).toBe(1);
  });
});

describe('MeeshyMapPin — ce qu’on lit et ce qu’on touche', () => {
  test('sans action : une image nommée, jamais un bouton', () => {
    const container = mount(<MeeshyMapPin label="Léo Marchetti, quartier">{face}</MeeshyMapPin>);
    const pin = container.querySelector('[data-kit-map-pin]') as HTMLElement;
    expect(pin.getAttribute('role')).toBe('img');
    expect(pin.getAttribute('aria-label')).toBe('Léo Marchetti, quartier');
    expect(container.querySelector('button')).toBeNull();
  });

  test('avec une action : un bouton nommé, l’action part une fois, choisi se dit', () => {
    let presses = 0;
    const container = mount(
      <MeeshyMapPin label="Léo" hint="Ouvre sa fiche" isSelected onPress={() => (presses += 1)}>
        {face}
      </MeeshyMapPin>,
    );
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Léo');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('Ouvre sa fiche');
    act(() => button.click());
    expect(presses).toBe(1);
  });

  test('le mot sous l’épingle est coupé à 18 caractères, et below le remplace', () => {
    const container = mount(<MeeshyMapPin label="Léo" caption="un quartier très très lointain">{face}</MeeshyMapPin>);
    expect((container.querySelector('[data-kit-pin-caption]')?.textContent ?? '').length).toBeLessThanOrEqual(18);
    const replaced = mount(
      <MeeshyMapPin label="Léo" caption="quartier" below={<b data-below="">encore 42 min</b>}>
        {face}
      </MeeshyMapPin>,
    );
    expect(replaced.querySelector('[data-below]')).not.toBeNull();
    expect(replaced.querySelector('[data-kit-pin-caption]')).toBeNull();
  });

  test('le disque de flou se cache à la voix, et ne se dessine pas sous 32', () => {
    const drawn = mount(<MeeshyBlurDisc radius={53} tint="#A855F7" />);
    expect(drawn.querySelector('[data-kit-blur-disc]')?.getAttribute('aria-hidden')).toBe('true');
    expect(mount(<MeeshyBlurDisc radius={22} />).querySelector('[data-kit-blur-disc]')).toBeNull();
  });

  test('la grappe : rien sous 2, « 99+ » au-delà de 99, trois contenus au plus', () => {
    expect(mount(<MeeshyPinCluster label="Un" count={1} />).querySelector('[data-kit-pin-cluster]')).toBeNull();
    const container = mount(
      <MeeshyPinCluster label="Quatre personnes" count={120}>
        <i>1</i>
        <i>2</i>
        <i>3</i>
        <i>4</i>
      </MeeshyPinCluster>,
    );
    expect(container.querySelectorAll('[data-kit-pin-cluster-item]').length).toBe(3);
    expect(container.querySelector('[data-kit-pin-count]')?.textContent).toBe('99+');
  });

  test('la grappe sans contenu : un disque plein à la teinte ; un toucher rend l’action', () => {
    let presses = 0;
    const container = mount(<MeeshyPinCluster label="12 publications" count={12} onPress={() => (presses += 1)} />);
    expect(container.querySelector('[data-kit-pin-cluster-fill]')).not.toBeNull();
    act(() => (container.querySelector('button') as HTMLButtonElement).click());
    expect(presses).toBe(1);
  });

  test('l’aperçu est une seule cible nommée, avec sa légende', () => {
    const container = mount(<MeeshyMapPinPreview label="Alfama, Lisbonne" title="Alfama, Lisbonne" subtitle="Quartier · encore 42 min" onPress={() => {}} background={<i />}>{face}</MeeshyMapPinPreview>);
    expect(container.querySelectorAll('button').length).toBe(1);
    expect(container.textContent).toContain('Quartier · encore 42 min');
  });
});
