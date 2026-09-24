import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';

import { MediaUnavailable } from './media-unavailable';

/**
 * L'ÉTAT DESSINÉ D'UN MÉDIA ABSENT (#7022) — UN seul, pour les TROIS surfaces.
 *
 * Il existait déjà, et une seule fois : `MediaUnavailable` dans
 * `story-parts.tsx`, réservé au lecteur de story, avec son libellé français
 * écrit en dur. Le post et le message n'avaient RIEN — une référence morte y
 * laissait un trou, ou l'icône de lien brisé du navigateur. Le porteur a
 * tranché : « ceci doit être résolu correctement pour les story, postes ET
 * messages ».
 *
 * TROIS EXIGENCES, et chacune a son témoin ci-dessous :
 *
 * 1. **DESSINÉ** — jamais un `<img src="">` ni un `return null` : le premier
 *    fait peindre au navigateur son icône de lien brisé ET lui fait redemander
 *    le document courant ; le second laisse un trou qui se lit comme une panne
 *    de mise en page.
 * 2. **SILENCIEUX** — aucune alerte, aucun bouton « réessayer » : il n'y a
 *    rien à retenter, les octets ont disparu. Mais silencieux ne veut pas dire
 *    MUET pour un lecteur d'écran (dimension 5) : la boîte porte son rôle et
 *    son libellé, dans la langue d'interface (dimension 9).
 * 3. **NON DESTRUCTEUR** — il occupe la place du média et rien d'autre. La
 *    story, le post ou le message qui l'entoure reste entier, c'est ce que
 *    garde le gate navigateur `check-medias-absents.mjs`.
 */
describe('MediaUnavailable — #7022', () => {
  beforeAll(async () => {
    await loadInterfaceCatalog('fr');
    await loadInterfaceCatalog('de');
  });

  test('DESSINÉ — il rend une boîte, jamais une image vide ni un trou', () => {
    const html = renderToStaticMarkup(<MediaUnavailable language="fr" />);

    expect(html).not.toBe('');
    expect(html).not.toContain('<img');
    expect(html).toContain('data-media-unavailable');
  });

  /**
   * `data-media-unavailable` PORTE le ton servi, et ce n'est pas décoratif :
   * un gate navigateur qui compterait des enfants ou chercherait une classe
   * mesurerait la mise en page, pas l'état. L'attribut dit CE QUI EST, et
   * survit à tout remaniement visuel.
   */
  test('le ton servi est LISIBLE sur la boîte — c’est l’ancre du gate, pas une classe', () => {
    expect(renderToStaticMarkup(<MediaUnavailable language="fr" />)).toContain('data-media-unavailable="over-media"');
    expect(renderToStaticMarkup(<MediaUnavailable language="fr" tone="on-card" />)).toContain('data-media-unavailable="on-card"');
  });

  test('ANNONCÉ — un lecteur d’écran reçoit un rôle et un libellé, pas une boîte muette', () => {
    const html = renderToStaticMarkup(<MediaUnavailable language="fr" />);

    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${translate('fr', 'media.unavailable')}"`);
  });

  test('DANS LA LANGUE DU LECTEUR — le libellé n’est pas écrit en dur', () => {
    const allemand = renderToStaticMarkup(<MediaUnavailable language="de" />);

    expect(allemand).toContain(translate('de', 'media.unavailable'));
    expect(allemand).not.toContain(translate('fr', 'media.unavailable'));
  });

  /**
   * SILENCIEUX. Un « réessayer » sur un fichier dont les octets ont disparu
   * est un contrôle sans effet (loi 4) — il AFFIRME une capacité qu'il n'a
   * pas, et invite l'utilisateur à rejouer le 404 lui-même.
   */
  test('SILENCIEUX — aucun bouton, aucune invite à retenter ce qui ne reviendra pas', () => {
    const html = renderToStaticMarkup(<MediaUnavailable language="fr" />);

    expect(html).not.toContain('<button');
    expect(html.toLowerCase()).not.toContain('réessayer');
  });

  /**
   * LE COMPACT sert les surfaces étroites — la vignette d'une story citée dans
   * un message (44 px de côté), une case de pellicule. Le libellé y serait
   * illisible et déborderait ; l'ANNONCE, elle, reste (le rôle et le libellé
   * sont sur la boîte, jamais sur le texte).
   */
  test('COMPACT — sous une certaine taille le libellé se retire, l’annonce jamais', () => {
    const html = renderToStaticMarkup(<MediaUnavailable language="fr" compact />);

    expect(html).not.toContain(translate('fr', 'media.unavailable') + '</p>');
    expect(html).toContain(`aria-label="${translate('fr', 'media.unavailable')}"`);
  });
});
