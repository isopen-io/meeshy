import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup as render } from 'react-dom/server';

import { INSTITUTIONAL_PATTERN, INSTITUTIONAL_ROUTES } from '../../scripts/lib/institutional-routes.mjs';
import { institutionalHref } from '../lib/institutional-href';
import { ROUTES } from '../routes/route-table';
import { PAGE_CHILD_SAFETY } from './child-safety';
import { PAGE_CONTACT } from './contact';
import { PAGE_FAQ } from './faq';
import { PAGE_HELP } from './help';
import { InstitutionalPage } from './page';
import { INSTITUTIONAL_PAGES } from './pages';
import { PAGE_PRIVACY } from './privacy';
import { PAGE_TERMS } from './terms';
import { pageText } from './text';

/**
 * LES NORMES DE SÉCURITÉ DES ENFANTS (#9923).
 *
 * Google Play exige d'une application sociale ou de messagerie une page
 * PUBLIQUE de normes contre les abus et l'exploitation sexuels d'enfants
 * (CSAE) : l'interdiction, un moyen de signaler DANS l'application, ce que le
 * service fait d'un signalement, la conformité aux lois de protection de
 * l'enfance, et un contact désigné. Chaque témoin ci-dessous garde l'une de ces
 * exigences — et la page n'existe pour l'examinateur que si elle est servie,
 * sans compte, à une adresse que les autres pages lient.
 */
const text = pageText(PAGE_CHILD_SAFETY);
const rows = PAGE_CHILD_SAFETY.sections.flatMap((section) =>
  section.blocks.flatMap((block) => (block.kind === 'encadre' ? block.rows : [])),
);

describe('/child-safety — servie sans compte, comme les autres pages statiques', () => {
  test('l’adresse est déclarée à la source unique des documents préchauffés', () => {
    expect(INSTITUTIONAL_ROUTES).toContain('child-safety');
    for (const path of ['/child-safety', '/child-safety/']) {
      expect(INSTITUTIONAL_PATTERN.test(path)).toBe(true);
    }
    expect(INSTITUTIONAL_PATTERN.test('/child-safety-x')).toBe(false);
  });

  test('le préchauffage écrit exactement les pages de la source unique, celle-ci comprise', () => {
    expect(INSTITUTIONAL_PAGES.map(({ route }) => route).sort()).toEqual([...INSTITUTIONAL_ROUTES].sort());
    expect(INSTITUTIONAL_PAGES.find(({ route }) => route === 'child-safety')?.page).toBe(PAGE_CHILD_SAFETY);
  });

  test('aucune route de l’application ne la place sous la garde de session', () => {
    expect(Object.values(ROUTES).map((r) => r.pattern)).not.toContain('/child-safety');
  });

  test('la coque l’ouvre à l’adresse publique, le web en relatif', () => {
    expect(institutionalHref('child-safety', { shell: true })).toBe('https://meeshy.me/child-safety');
    expect(institutionalHref('child-safety', { shell: false })).toBe('/child-safety');
  });
});

describe('/child-safety — ce que Google Play exige d’y lire', () => {
  test('elle interdit les abus et l’exploitation sexuels d’enfants, CSAM compris', () => {
    expect(text).toMatch(/abus et (l’|l')exploitation sexuels d’enfants/i);
    expect(text).toContain('CSAE');
    expect(text).toContain('CSAM');
    expect(text).toMatch(/pédopiégeage/i);
    expect(text).toMatch(/sextorsion/i);
  });

  test('elle dit comment signaler DANS l’application : message, compte, publication, commentaire', () => {
    expect(text).toMatch(/message[^.]*« Signaler »/i);
    expect(text).toMatch(/fiche[^.]*« Signaler »/i);
    expect(text).toMatch(/publication ou (d’)?un commentaire[^.]*« Signaler »/i);
    expect(text).toContain('Contenu inapproprié');
  });

  test('elle dit comment signaler par e-mail, sans compte, et l’adresse s’ouvre d’un geste', () => {
    expect(rows).toContainEqual({ text: 'safety@meeshy.me', href: 'mailto:safety@meeshy.me' });
    expect(text).toMatch(/sans compte|pas besoin d['’]un compte/i);
  });

  test('elle demande de ne JAMAIS transmettre le contenu lui-même', () => {
    expect(text).toMatch(/ne (le )?(partagez|transférez|joignez)/i);
  });

  test('elle dit ce que Meeshy fait d’un signalement : retrait, suspension, autorités, NCMEC, Pharos', () => {
    expect(text).toMatch(/retir/i);
    expect(text).toMatch(/suspen/i);
    expect(text).toMatch(/autorités compétentes/i);
    expect(text).toContain('NCMEC');
    expect(text).toContain('Pharos');
  });

  test('elle renvoie aux secours quand un enfant est en danger immédiat', () => {
    expect(text).toMatch(/danger immédiat/i);
    expect(text).toContain('112');
    expect(text).toContain('119');
  });

  test('l’âge reste celui des conditions : 13 ans, Meeshy Global en écriture à 18 ans', () => {
    expect(text).toMatch(/13 ans et plus/);
    expect(text).toMatch(/Meeshy Global[^.]*écriture[^.]*18 ans/);
    expect(pageText(PAGE_TERMS)).toMatch(/13 ans et plus/);
  });

  test('elle affirme la conformité aux lois de protection de l’enfance', () => {
    expect(text).toMatch(/lois[^.]*protection de l’enfance/i);
  });

  test('elle nomme un contact désigné', () => {
    const contact = PAGE_CHILD_SAFETY.sections.find((s) => /contact désigné/i.test(s.title));
    expect(contact).toBeDefined();
    expect(contact ? pageText({ ...PAGE_CHILD_SAFETY, sections: [contact] }) : '').toContain('safety@meeshy.me');
  });

  test('elle est datée, et son titre et sa description disent son sujet', () => {
    expect(PAGE_CHILD_SAFETY.mention).toBe('Dernière mise à jour : 22 octobre 2026');
    expect(PAGE_CHILD_SAFETY.title).toBe('Normes de sécurité des enfants');
    expect(PAGE_CHILD_SAFETY.description).toMatch(/exploitation sexuels d’enfants/);
  });

  test('le rendu partagé la sert entière, sans script', () => {
    const html = render(<InstitutionalPage page={PAGE_CHILD_SAFETY} version="2.0.0" />);
    const served = (s: string): string => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;');
    expect(html).toContain(served(PAGE_CHILD_SAFETY.title));
    for (const section of PAGE_CHILD_SAFETY.sections) expect(html).toContain(served(section.title));
    expect(html).toContain('href="mailto:safety@meeshy.me"');
    expect(html).not.toContain('<script');
  });
});

describe('/child-safety — on y arrive depuis les pages voisines', () => {
  const neighbours = [
    ['Conditions', PAGE_TERMS],
    ['Confidentialité', PAGE_PRIVACY],
    ['Aide', PAGE_HELP],
    ['FAQ', PAGE_FAQ],
    ['Contact', PAGE_CONTACT],
  ] as const;
  for (const [name, page] of neighbours) {
    test(`${name} la lie dans sa rangée de suite`, () => {
      expect(page.run.links.map((l) => l.href)).toContain('/child-safety');
    });
  }

  test('les conditions l’interdisent dans l’utilisation acceptable', () => {
    expect(pageText(PAGE_TERMS)).toMatch(/exploitation sexuels d’enfants/);
  });

  test('elle renvoie aux conditions, à la confidentialité et à l’aide', () => {
    const hrefs = PAGE_CHILD_SAFETY.run.links.map((l) => l.href);
    for (const href of ['/terms', '/privacy', '/help']) expect(hrefs).toContain(href);
  });
});
