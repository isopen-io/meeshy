import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { EMOJI_CATEGORY_IDS, loadEmojiIndex, loadEmojiNames } from '@/lib/emoji/emoji-catalogue';
import { EMOJI_SKIN_TONE_KEY } from '@/lib/emoji/emoji-skin-tone';
import { EMOJI_RECENTS_KEY } from '@/lib/emoji-recents';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadEmojiPickerCatalog } from '@/lib/i18n-emoji-picker-catalog';
import { LONG_PRESS_MS } from '@/lib/view/long-press';
import { EXTENDED_REACTIONS } from '@/lib/view/message-actions';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { EMOJI_SEARCH_LIMIT, EmojiPickerSheet } from './emoji-picker-sheet';

/**
 * LA FEUILLE D'EMOJIS COMPLÈTE (#10531) — miroir d'`EmojiPickerSheet` (iOS) :
 * les catégories, la recherche et les récents, sur TOUS les emojis. Elle
 * s'ouvre sur ce qu'elle sait déjà montrer (suggestions et récents) ; la table
 * arrive à côté, une catégorie à la fois à l'écran.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('ar'), loadEmojiPickerCatalog('fr'), loadEmojiPickerCatalog('ar')]);
});

afterEach(() => {
  mounter.unmountAll();
  localStorage.clear();
  document.documentElement.lang = 'fr';
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const open = async (onPick: (emoji: string) => void = () => {}, onClose: () => void = () => {}) =>
  mounter.mount(<EmojiPickerSheet title="Insérer un emoji" onPick={onPick} onClose={onClose} />);

const tabs = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const tab = (host: HTMLElement, id: string) => {
  const found = host.querySelector<HTMLButtonElement>(`[data-emoji-category="${id}"]`);
  if (found === null) throw new Error(`catégorie absente : ${id}`);
  return found;
};
const cells = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[data-emoji]')].map((cell) => cell.dataset.emoji);
const cell = (host: HTMLElement, emoji: string) => {
  const found = host.querySelector<HTMLButtonElement>(`[data-emoji="${emoji}"]`);
  if (found === null) throw new Error(`emoji absent : ${emoji}`);
  return found;
};
const panel = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-emoji-panel]');
const press = (target: HTMLElement, key: string) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};
const search = async (host: HTMLElement, query: string) => {
  mounter.type(host, 'input[type="search"]', query);
  // La table et les noms arrivent par import() à la première recherche : sur
  // une machine froide, deux tours de boucle ne suffisent pas à les voir posés.
  await Promise.all([loadEmojiIndex(), loadEmojiNames('fr'), loadEmojiNames('ar')]);
  await mounter.settle();
  await mounter.settle();
};

describe('la feuille d’emojis — à l’ouverture', () => {
  test('elle montre aussitôt les vingt emojis proposés, sans attendre la table', async () => {
    const host = await open();
    expect(panel(host)?.dataset.emojiPanel).toBe('recent');
    expect(cells(host)).toEqual([...EXTENDED_REACTIONS]);
    expect(host.textContent).toContain('Suggestions');
    expect(host.textContent).not.toContain('Utilisés récemment');
  });

  test('dix catégories, nommées pour le lecteur d’écran, « Récents » choisie', async () => {
    const host = await open();
    expect(tabs(host).map((button) => button.dataset.emojiCategory)).toEqual([...EMOJI_CATEGORY_IDS]);
    expect(tabs(host).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Récents',
      'Smileys et émotions',
      'Personnes et gestes',
      'Animaux et nature',
      'Nourriture et boissons',
      'Activités',
      'Voyages et lieux',
      'Objets',
      'Symboles',
      'Drapeaux',
    ]);
    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Catégories d’emojis');
    expect(tabs(host).map((button) => button.getAttribute('aria-selected'))).toEqual(['true', ...Array.from({ length: 9 }, () => 'false')]);
    expect(panel(host)?.getAttribute('role')).toBe('tabpanel');
    expect(panel(host)?.getAttribute('aria-labelledby')).toBe(tab(host, 'recent').id);
    expect(tab(host, 'recent').getAttribute('aria-controls')).toBe(panel(host)?.id ?? '');
  });

  test('chaque cible fait 44 points : catégories et emojis', async () => {
    const host = await open();
    for (const target of [...tabs(host), ...host.querySelectorAll<HTMLButtonElement>('[data-emoji]')]) {
      expect({ label: target.getAttribute('aria-label'), height: target.style.minHeight, width: target.style.minWidth }).toEqual({
        label: target.getAttribute('aria-label'),
        height: '44px',
        width: '44px',
      });
    }
  });

  test('la recherche est un champ nommé', async () => {
    const host = await open();
    const field = host.querySelector<HTMLInputElement>('input[type="search"]');
    expect(field?.getAttribute('aria-label')).toBe('Rechercher un emoji');
    expect(field?.getAttribute('placeholder')).toBe('Rechercher un emoji');
  });
});

describe('la feuille d’emojis — les catégories', () => {
  test('choisir une catégorie montre SES emojis, tous, et elle seule', async () => {
    const host = await open();
    await mounter.click(tab(host, 'animals'));
    const animals = (await loadEmojiIndex()).byGroup.get('animals')?.map((entry) => entry.emoji) ?? [];

    expect(tab(host, 'animals').getAttribute('aria-selected')).toBe('true');
    expect(panel(host)?.dataset.emojiPanel).toBe('animals');
    expect(cells(host)).toEqual(animals);
    expect(animals.length).toBeGreaterThan(100);
    expect(cells(host)).toContain('🐶');
    expect(cells(host)).not.toContain('😀');
  });

  test('toutes les catégories réunies couvrent la table entière', async () => {
    const host = await open();
    const seen: string[] = [];
    for (const id of EMOJI_CATEGORY_IDS.filter((candidate) => candidate !== 'recent')) {
      await mounter.click(tab(host, id));
      seen.push(...cells(host).filter((emoji): emoji is string => emoji !== undefined));
    }
    expect(seen.length).toBe((await loadEmojiIndex()).all.length);
    expect(seen.length).toBeGreaterThan(1800);
  });

  test('au clavier : les flèches changent de catégorie, Fin va à la dernière', async () => {
    const host = await open();
    tab(host, 'recent').focus();
    press(tab(host, 'recent'), 'ArrowRight');
    await mounter.settle();
    expect(tab(host, 'smileys').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(host, 'smileys'));
    expect(tabs(host).filter((button) => button.tabIndex === 0).map((button) => button.dataset.emojiCategory)).toEqual(['smileys']);

    press(tab(host, 'smileys'), 'End');
    await mounter.settle();
    expect(tab(host, 'flags').getAttribute('aria-selected')).toBe('true');
    expect(cells(host)).toContain('🇫🇷');
  });

  test('de droite à gauche, la flèche gauche avance', async () => {
    document.documentElement.lang = 'ar';
    const host = await open();
    expect(tab(host, 'recent').getAttribute('aria-label')).toBe('الأخيرة');
    tab(host, 'recent').focus();
    press(tab(host, 'recent'), 'ArrowLeft');
    await mounter.settle();
    expect(tab(host, 'smileys').getAttribute('aria-selected')).toBe('true');
  });
});

describe('la feuille d’emojis — la grille au clavier', () => {
  test('une seule tabulation entre dans la grille, les flèches s’y déplacent', async () => {
    const host = await open();
    const all = [...host.querySelectorAll<HTMLButtonElement>('[data-emoji]')];
    expect(all.filter((button) => button.tabIndex === 0).length).toBe(1);
    expect(all[0]?.tabIndex).toBe(0);

    all[0]?.focus();
    press(all[0] as HTMLButtonElement, 'ArrowRight');
    expect(document.activeElement).toBe(all[1] ?? null);
    press(all[1] as HTMLButtonElement, 'End');
    expect(document.activeElement).toBe(all[all.length - 1] ?? null);
    await mounter.settle();
    const after = [...host.querySelectorAll<HTMLButtonElement>('[data-emoji]')];
    expect(after.filter((button) => button.tabIndex === 0).map((button) => button.dataset.emoji)).toEqual([after[after.length - 1]?.dataset.emoji]);
  });

  test('la grille est un groupe nommé', async () => {
    const host = await open();
    const grid = host.querySelector('[data-emoji-grid]');
    expect(grid?.getAttribute('role')).toBe('group');
    expect(grid?.getAttribute('aria-label')).toBe('Suggestions');
  });
});

describe('la feuille d’emojis — la recherche', () => {
  test('chercher par nom rend les emojis de toute la table, dans la langue du lecteur', async () => {
    const host = await open();
    await search(host, 'chat');
    expect(panel(host)?.dataset.emojiPanel).toBe('search');
    expect(cells(host)).toContain('🐱');
    expect(cells(host)).not.toContain('🐶');
    expect(tabs(host).some((button) => button.getAttribute('aria-selected') === 'true')).toBe(false);
  });

  test('sans résultat, la feuille le dit', async () => {
    const host = await open();
    await search(host, 'xyzzy');
    expect(cells(host)).toEqual([]);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Aucun emoji trouvé');
  });

  test('les résultats sont bornés : une lettre ne monte pas mille boutons', async () => {
    const host = await open();
    await search(host, 'a');
    expect(cells(host).length).toBe(EMOJI_SEARCH_LIMIT);
    expect(EMOJI_SEARCH_LIMIT).toBeLessThanOrEqual(200);
  });

  test('choisir une catégorie quitte la recherche', async () => {
    const host = await open();
    await search(host, 'chat');
    await mounter.click(tab(host, 'food'));
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('');
    expect(panel(host)?.dataset.emojiPanel).toBe('food');
    expect(cells(host)).toContain('🍎');
  });
});

describe('la feuille d’emojis — choisir', () => {
  test('l’emoji choisi est rendu à l’hôte et retenu comme récent', async () => {
    const picked: string[] = [];
    const host = await open((emoji) => picked.push(emoji));
    await mounter.click(tab(host, 'animals'));
    await mounter.click(cell(host, '🐶'));

    expect(picked).toEqual(['🐶']);
    expect(localStorage.getItem(EMOJI_RECENTS_KEY)).toBe('["🐶"]');
  });

  test('à la réouverture, les récents sont proposés avant les suggestions, le dernier en tête', async () => {
    localStorage.setItem(EMOJI_RECENTS_KEY, JSON.stringify(['🦄', '🐶']));
    const host = await open();
    expect(host.textContent).toContain('Utilisés récemment');
    expect(cells(host).slice(0, 2)).toEqual(['🦄', '🐶']);
    expect(cells(host).slice(2)).toEqual([...EXTENDED_REACTIONS]);
    expect([...host.querySelectorAll('[data-emoji-grid]')].map((grid) => grid.getAttribute('aria-label'))).toEqual(['Utilisés récemment', 'Suggestions']);
  });

  test('un stockage illisible n’empêche ni d’ouvrir ni de choisir', async () => {
    localStorage.setItem(EMOJI_RECENTS_KEY, '{oops');
    const picked: string[] = [];
    const host = await open((emoji) => picked.push(emoji));
    expect(cells(host)).toEqual([...EXTENDED_REACTIONS]);
    await mounter.click(cell(host, '🎉'));
    expect(picked).toEqual(['🎉']);
    expect(localStorage.getItem(EMOJI_RECENTS_KEY)).toBe('["🎉"]');
  });

  test('la feuille est un dialogue titré, que son bouton ferme', async () => {
    const closed: string[] = [];
    const host = await open(() => {}, () => closed.push('fermée'));
    const dialog = host.querySelector('dialog');
    expect(document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Insérer un emoji');
    await mounter.click(host.querySelector<HTMLButtonElement>('[data-sheet-close]'));
    expect(closed).toEqual(['fermée']);
  });
});

/**
 * LES TEINTES DE PEAU (#10533) — un appui long, un clic droit ou Maj+F10 sur
 * un emoji qui en accepte ouvre ses six variantes ; la teinte choisie est
 * retenue sur l'appareil et s'applique ensuite d'office à TOUS les emojis qui
 * en acceptent une (une préférence, comme `message.emojiSkinTone`).
 */
describe('la feuille d’emojis — les teintes de peau', () => {
  /* La table ET le menu des teintes arrivent par import() : le témoin les attend, puis lit. */
  const ready = async (host: HTMLElement) => {
    await Promise.all([loadEmojiIndex(), import('./emoji-tone-menu')]);
    await mounter.settle();
    await mounter.settle();
    return host;
  };
  const menu = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-emoji-tones]');
  const tones = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[data-emoji-tones] [role="menuitemradio"]')];
  const tone = (host: HTMLElement, name: string) => {
    const found = host.querySelector<HTMLButtonElement>(`[data-emoji-tone="${name}"]`);
    if (found === null) throw new Error(`teinte absente : ${name}`);
    return found;
  };
  /* `lazy` suspend à son premier rendu, même module déjà chargé : un tour le laisse se poser. */
  const shiftF10 = async (target: HTMLElement) => {
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    });
    await mounter.settle();
  };
  const rightClick = async (target: HTMLElement): Promise<boolean> => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => {
      target.dispatchEvent(event);
    });
    await mounter.settle();
    return event.defaultPrevented;
  };

  test('un emoji qui accepte une teinte l’annonce ; les autres non', async () => {
    const host = await ready(await open());
    expect(cell(host, '👍').getAttribute('aria-haspopup')).toBe('menu');
    expect(cell(host, '👍').dataset.emojiBase).toBe('👍');
    expect(cell(host, '😂').getAttribute('aria-haspopup')).toBeNull();
    expect(cell(host, '😂').dataset.emojiBase).toBeUndefined();
    expect(menu(host)).toBeNull();
  });

  test('Maj+F10 ouvre ses six variantes : un menu nommé, des cibles de 44 points, le focus sur la teinte en cours', async () => {
    const host = await ready(await open());
    await shiftF10(cell(host, '👍'));

    expect(menu(host)?.getAttribute('role')).toBe('menu');
    expect(menu(host)?.getAttribute('aria-label')).toBe('Teintes de peau 👍');
    expect(tones(host).map((button) => button.textContent)).toEqual(['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿']);
    expect(tones(host).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Par défaut',
      'Claire',
      'Moyennement claire',
      'Moyenne',
      'Moyennement foncée',
      'Foncée',
    ]);
    expect(tones(host).map((button) => button.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
    for (const button of tones(host)) expect({ height: button.style.minHeight, width: button.style.minWidth }).toEqual({ height: '44px', width: '44px' });
    expect(document.activeElement).toBe(tone(host, 'default'));
  });

  test('le clic droit l’ouvre aussi ; sur un emoji sans teinte, il reste celui du navigateur', async () => {
    const host = await ready(await open());

    expect(await rightClick(cell(host, '😂'))).toBe(false);
    expect(menu(host)).toBeNull();
    expect(await rightClick(cell(host, '🙏'))).toBe(true);
    expect(menu(host)?.dataset.emojiTones).toBe('🙏');
  });

  test('l’appui long l’ouvre, et le relâcher qui suit ne choisit pas l’emoji', async () => {
    const picked: string[] = [];
    const host = await ready(await open((emoji) => picked.push(emoji)));
    const target = cell(host, '👏');
    act(() => {
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 }));
    });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40)));
    act(() => {
      target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(menu(host)?.dataset.emojiTones).toBe('👏');
    expect(picked).toEqual([]);
  });

  test('une fois le relâcher passé, Entrée sur le même emoji le choisit de nouveau', async () => {
    const picked: string[] = [];
    const host = await ready(await open((emoji) => picked.push(emoji)));
    const target = cell(host, '👏');
    act(() => {
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 }));
    });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40)));
    act(() => {
      target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
    });
    await mounter.settle();
    await mounter.click(target);

    expect(picked).toEqual(['👏']);
  });

  test('un appui court choisit l’emoji, sans ouvrir ses teintes', async () => {
    const picked: string[] = [];
    const host = await ready(await open((emoji) => picked.push(emoji)));
    await mounter.click(cell(host, '👍'));

    expect(picked).toEqual(['👍']);
    expect(menu(host)).toBeNull();
  });

  test('choisir une teinte rend la variante à l’hôte, la retient, et la range dans les récents', async () => {
    const picked: string[] = [];
    const host = await ready(await open((emoji) => picked.push(emoji)));
    await shiftF10(cell(host, '👍'));
    await mounter.click(tone(host, 'medium'));

    expect(picked).toEqual(['👍🏽']);
    expect(localStorage.getItem(EMOJI_SKIN_TONE_KEY)).toBe('medium');
    expect(localStorage.getItem(EMOJI_RECENTS_KEY)).toBe('["👍🏽"]');
    expect(menu(host)).toBeNull();
  });

  test('la teinte retenue s’applique ensuite d’office, à tous les emojis qui en acceptent une', async () => {
    localStorage.setItem(EMOJI_SKIN_TONE_KEY, 'medium-dark');
    const picked: string[] = [];
    const host = await ready(await open((emoji) => picked.push(emoji)));

    expect(cell(host, '👍🏾').dataset.emojiBase).toBe('👍');
    expect(cell(host, '🙏🏾').dataset.emojiBase).toBe('🙏');
    expect(cells(host)).toContain('😂');
    expect(cells(host)).not.toContain('👍');

    await mounter.click(tab(host, 'people'));
    await mounter.settle();
    expect(cells(host)).toContain('👋🏾');
    expect(cells(host)).not.toContain('👋');
    expect(cells(host)).toContain('🧑‍🤝‍🧑');

    await mounter.click(cell(host, '👋🏾'));
    expect(picked).toEqual(['👋🏾']);
  });

  test('le menu d’un emoji déjà teinté coche la teinte en cours, et « Par défaut » y revient', async () => {
    localStorage.setItem(EMOJI_SKIN_TONE_KEY, 'dark');
    const picked: string[] = [];
    const host = await ready(await open((emoji) => picked.push(emoji)));
    await shiftF10(cell(host, '👍🏿'));

    expect(tones(host).map((button) => button.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false', 'false', 'true']);
    expect(document.activeElement).toBe(tone(host, 'dark'));

    await mounter.click(tone(host, 'default'));
    expect(picked).toEqual(['👍']);
    expect(localStorage.getItem(EMOJI_SKIN_TONE_KEY)).toBe('default');
  });

  test('un récent garde la teinte avec laquelle il a été envoyé, et offre encore ses variantes', async () => {
    localStorage.setItem(EMOJI_RECENTS_KEY, JSON.stringify(['👍🏻']));
    localStorage.setItem(EMOJI_SKIN_TONE_KEY, 'dark');
    const host = await ready(await open());

    expect(cells(host).slice(0, 1)).toEqual(['👍🏻']);
    await shiftF10(cell(host, '👍🏻'));
    expect(menu(host)?.dataset.emojiTones).toBe('👍');
  });

  test('au clavier : les flèches parcourent les teintes, Échap referme le menu sans fermer la feuille et rend le focus à l’emoji', async () => {
    const closed: string[] = [];
    const host = await ready(await open(() => {}, () => closed.push('fermée')));
    await shiftF10(cell(host, '👍'));

    press(tone(host, 'default'), 'ArrowRight');
    expect(document.activeElement).toBe(tone(host, 'light'));
    press(tone(host, 'light'), 'End');
    expect(document.activeElement).toBe(tone(host, 'dark'));
    press(tone(host, 'dark'), 'ArrowLeft');
    expect(document.activeElement).toBe(tone(host, 'medium-dark'));

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      tone(host, 'medium-dark').dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(menu(host)).toBeNull();
    expect(closed).toEqual([]);
    expect(document.activeElement).toBe(cell(host, '👍'));
    expect(localStorage.getItem(EMOJI_SKIN_TONE_KEY)).toBeNull();
  });

  test('de droite à gauche, la flèche gauche avance dans les teintes', async () => {
    document.documentElement.lang = 'ar';
    const host = await ready(await open());
    await shiftF10(cell(host, '👍'));
    press(tone(host, 'default'), 'ArrowLeft');

    expect(document.activeElement).toBe(tone(host, 'light'));
  });

  test('changer de catégorie ou chercher referme le menu', async () => {
    const host = await ready(await open());
    await shiftF10(cell(host, '👍'));
    await mounter.click(tab(host, 'animals'));
    expect(menu(host)).toBeNull();
  });
});
