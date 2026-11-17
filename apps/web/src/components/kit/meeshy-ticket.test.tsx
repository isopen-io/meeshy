import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount, spokenText } from '@/test-support/kit-mount';

import { contrastRatio } from './kit-color';
import { MeeshyTicket, meeshyTicketMask, meeshyTicketRecipe } from './meeshy-ticket';

const { mount, render, act } = kitMount();

const glyph = <svg data-glyph="" />;
const ticket = (container: HTMLElement): HTMLElement => container.querySelector('[data-kit-ticket]') as HTMLElement;

describe('MeeshyTicket — la recette en valeurs', () => {
  test('coupe à 125 · 77 · 61 (hero, row, compact), rayon 22, encoches de 18, pointillé de 1,5', () => {
    expect((['hero', 'row', 'compact'] as const).map((size) => meeshyTicketRecipe({ size }).cut)).toEqual([125, 77, 61]);
    expect(meeshyTicketRecipe({})).toMatchObject({ radius: 22, notch: 18, dash: 1.5, dashMargin: 16 });
  });

  test('code en chasse fixe de 20 · 12 · 11,5 selon la taille ; pastille de 44 (36 en compact)', () => {
    expect((['hero', 'row', 'compact'] as const).map((size) => meeshyTicketRecipe({ size }).codeSize)).toEqual([20, 12, 11.5]);
    expect(meeshyTicketRecipe({ size: 'row' }).badge).toBe(44);
    expect(meeshyTicketRecipe({ size: 'compact' }).badge).toBe(36);
  });

  test('en hero le titre devient sur-titre de 11 ; sinon Nunito 17', () => {
    expect(meeshyTicketRecipe({ size: 'hero' }).titleSize).toBe(11);
    expect(meeshyTicketRecipe({ size: 'row' }).titleSize).toBe(17);
  });

  test('mini : vertical, 104 de large, ni code ni trailing', () => {
    expect(meeshyTicketRecipe({ size: 'mini' })).toMatchObject({ width: 104, showsCode: false, showsTrailing: false, isVertical: true });
  });

  test('pressé : échelle 0,97 ; survolé : monte de 4 ; soulevé : 1,03 et 2,5° ; sélectionné : liseré de 2', () => {
    expect(meeshyTicketRecipe({ isPressed: true }).scale).toBe(0.97);
    expect(meeshyTicketRecipe({ isHovered: true }).lift).toBe(4);
    expect(meeshyTicketRecipe({ isDragging: true })).toMatchObject({ scale: 1.03, tilt: 2.5 });
    expect(meeshyTicketRecipe({ isSelected: true }).selectionRule).toBe(2);
  });

  test('mouvement réduit : le fond change, l’échelle non ; le retournement devient un fondu', () => {
    expect(meeshyTicketRecipe({ isPressed: true, reduceMotion: true }).scale).toBe(1);
    expect(meeshyTicketRecipe({ isFlipped: true, reduceMotion: true })).toMatchObject({ flip: 'crossfade', rotation: 0 });
    expect(meeshyTicketRecipe({ isFlipped: true })).toMatchObject({ flip: 'rotate', rotation: 180 });
  });

  test('fantôme : pas de fond, contour en tirets ; barré : titre et code barrés, pastille éteinte', () => {
    expect(meeshyTicketRecipe({ kind: 'ghost' })).toMatchObject({ fill: 'none', borderStyle: 'dashed' });
    expect(meeshyTicketRecipe({ kind: 'struck' })).toMatchObject({ strikesText: true, badgeOff: true });
    expect(meeshyTicketRecipe({ kind: 'normal' })).toMatchObject({ fill: 'raised', borderStyle: 'solid' });
  });

  test('l’encre de la pastille se choisit au contraste, 4,5:1 sur les quatre teintes', () => {
    for (const tint of ['#818CF8', '#4F46E5', '#FBBF24', '#34D399']) {
      const recipe = meeshyTicketRecipe({ tint });
      expect(contrastRatio(recipe.badgeInk, tint)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('le masque découpe deux encoches centrées sur la coupe, quelle que soit la largeur', () => {
    const mask = meeshyTicketMask({ cut: 77, notch: 18 });
    expect(mask).toContain('radial-gradient');
    expect(mask).toContain('77px');
    expect(mask).toContain('9px');
    expect(meeshyTicketMask({ cut: 125, notch: 18 })).not.toBe(mask);
  });
});

describe('MeeshyTicket — un seul élément, nommé', () => {
  test('titre, code, chiffre, puis l’état en mots, sont dits ensemble', () => {
    const container = mount(<MeeshyTicket title="Studio — invités" code="meeshy.me/chat/studio" figure="23" figureCaption="/ 50 arrivées" kind="struck" statusLabel="Expiré" />);
    const spoken = spokenText(ticket(container)).replace(/\s+/g, ' ');
    expect(spoken).toContain('Studio — invités');
    expect(spoken).toContain('meeshy.me/chat/studio');
    expect(spoken).toContain('23');
    expect(spoken).toContain('Expiré');
  });

  test('le code n’est jamais traduit et reste de gauche à droite, même en arabe', () => {
    const container = mount(<MeeshyTicket title="x" code="AISSA-7K2" />);
    const code = container.querySelector('[data-kit-ticket-code]') as HTMLElement;
    expect(code.getAttribute('dir')).toBe('ltr');
    expect(code.getAttribute('translate')).toBe('no');
  });

  test('titre ou code vide : refusé ; ghost et struck demandent le mot écrit', () => {
    expect(() => mount(<MeeshyTicket title="" code="x" />)).toThrow();
    expect(() => mount(<MeeshyTicket title="x" code="" />)).toThrow();
    expect(() => mount(<MeeshyTicket title="x" code="y" kind="ghost" />)).toThrow();
    expect(() => mount(<MeeshyTicket title="x" code="y" kind="struck" />)).toThrow();
  });

  test('sans onPress le billet n’est pas un bouton ; avec, un seul lien étiré dessous, jamais un bouton dans un bouton', () => {
    expect(mount(<MeeshyTicket title="x" code="y" />).querySelector('[data-kit-ticket-hit]')).toBeNull();
    let presses = 0;
    const container = mount(<MeeshyTicket title="x" code="y" onPress={() => (presses += 1)} stub={<button type="button">Copier</button>} />);
    const hit = container.querySelector('[data-kit-ticket-hit]') as HTMLElement;
    expect(hit.tagName).toBe('BUTTON');
    expect(hit.querySelector('button')).toBeNull();
    act(() => hit.click());
    expect(presses).toBe(1);
  });

  test('presser un bouton du talon ne presse pas le billet', () => {
    let presses = 0;
    let copies = 0;
    const container = mount(<MeeshyTicket title="x" code="y" onPress={() => (presses += 1)} stub={<button type="button" onClick={() => (copies += 1)}>Copier</button>} />);
    act(() => (container.querySelector('[data-kit-ticket-stub] button') as HTMLElement).click());
    expect(copies).toBe(1);
    expect(presses).toBe(0);
  });

  test('sélectionné : la coche remplace trailing et le billet dit « sélectionné »', () => {
    const container = mount(<MeeshyTicket title="x" code="y" isSelected selectedLabel="sélectionné" trailing={<i data-trailing="" />} onPress={() => {}} />);
    expect(container.querySelector('[data-trailing]')).toBeNull();
    expect(container.querySelector('[data-kit-ticket-hit]')?.getAttribute('aria-pressed')).toBe('true');
    expect(spokenText(container)).toContain('sélectionné');
  });

  test('chargement : la découpe reste, le contenu est un squelette', () => {
    const container = mount(<MeeshyTicket title="x" code="y" kind="loading" />);
    expect(container.querySelector('[data-kit-skeleton]')).not.toBeNull();
    expect(container.querySelector('[data-kit-ticket-code]')).toBeNull();
  });

  test('la pastille porte le glyphe muet', () => {
    const container = mount(<MeeshyTicket title="x" code="y" glyph={glyph} tint="#34D399" />);
    expect(container.querySelector('[data-glyph]')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('MeeshyTicket — le retournement', () => {
  test('isFlipped est la seule cause ; le côté caché n’est ni touchable ni lu', () => {
    const container = mount(<MeeshyTicket title="Parrainage" code="AISSA-7K2" back={<p data-back="">QR du code</p>} isFlipped={false} flipLabels={{ front: 'recto', back: 'verso' }} />);
    expect(container.querySelector('[data-kit-ticket-back]')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('[data-kit-ticket-front]')?.hasAttribute('inert')).toBe(false);
    render(<MeeshyTicket title="Parrainage" code="AISSA-7K2" back={<p data-back="">QR du code</p>} isFlipped flipLabels={{ front: 'recto', back: 'verso' }} />);
    expect(container.querySelector('[data-kit-ticket-back]')?.hasAttribute('inert')).toBe(false);
    expect(container.querySelector('[data-kit-ticket-front]')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('[data-kit-ticket-front]')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('le verso n’est construit qu’au premier retournement', () => {
    const container = mount(<MeeshyTicket title="x" code="y" back={<p data-back="">QR</p>} isFlipped={false} />);
    expect(container.querySelector('[data-back]')).toBeNull();
    render(<MeeshyTicket title="x" code="y" back={<p data-back="">QR</p>} isFlipped />);
    expect(container.querySelector('[data-back]')).not.toBeNull();
    render(<MeeshyTicket title="x" code="y" back={<p data-back="">QR</p>} isFlipped={false} />);
    expect(container.querySelector('[data-back]')).not.toBeNull();
  });

  test('au retournement le mot du côté s’annonce, une fois, poliment', () => {
    const container = mount(<MeeshyTicket title="x" code="y" back={<p>QR</p>} isFlipped={false} flipLabels={{ front: 'recto', back: 'verso' }} />);
    const live = container.querySelector('[data-kit-ticket-announce]') as HTMLElement;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    render(<MeeshyTicket title="x" code="y" back={<p>QR</p>} isFlipped flipLabels={{ front: 'recto', back: 'verso' }} />);
    expect(live.textContent).toBe('verso');
  });

  test('sans back, isFlipped est ignoré', () => {
    const container = mount(<MeeshyTicket title="x" code="y" isFlipped />);
    expect(ticket(container).getAttribute('data-flipped')).toBeNull();
  });

  test('onFlippedChange n’est jamais appelé par le billet : l’hôte décide', () => {
    let calls = 0;
    const container = mount(<MeeshyTicket title="x" code="y" back={<p>QR</p>} onFlippedChange={() => (calls += 1)} onPress={() => {}} />);
    act(() => (container.querySelector('[data-kit-ticket-hit]') as HTMLElement).click());
    expect(calls).toBe(0);
  });
});

describe('MeeshyTicket — pureté', () => {
  test('aucun type du domaine, aucun singleton, aucun verre dessiné ici', () => {
    for (const file of ['./meeshy-ticket.tsx', './meeshy-ticket-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|backdrop-filter/);
    }
  });
});
