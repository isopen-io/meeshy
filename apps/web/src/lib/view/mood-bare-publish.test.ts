import { describe, expect, test } from 'bun:test';

import { moodPublishStep } from './mood-bare-publish';

/**
 * **UNE HUMEUR SANS UN MOT SE CONFIRME** (#10527) — la règle, hors de l'écran.
 * Le verdict ne dépend que du MOT : l'emoji et le réseau sont jugés ailleurs
 * (`publiable`), et les mêler ici ferait deux portes pour un même refus.
 */
describe('moodPublishStep', () => {
  test('sans aucun mot, on demande avant de publier', () => {
    expect(moodPublishStep({ note: '' })).toBe('ask');
  });

  test('des espaces seuls ne sont pas un mot — c’est ce que le serveur recevrait', () => {
    expect(moodPublishStep({ note: '  \n\t ' })).toBe('ask');
  });

  test('un mot suffit : rien n’est demandé', () => {
    expect(moodPublishStep({ note: ' ça va ' })).toBe('publish');
  });
});
