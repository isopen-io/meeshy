import { afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { AdminCheckbox, AdminSwitch } from '@/components/admin/form';
import { loadAdminInterfaceCatalog, ADMIN_LANGUAGES, type AdminInterfaceCatalog, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { LanguagesDetailTable } from './admin-languages-parts';

/**
 * **L'ÉPURE DE L'ADMINISTRATION (#18486, #17584)** — l'écran NOMME, le (i) explique. Chaque
 * témoin tient le CONTRAT que l'utilisateur lit : ce qui reste visible au repos, la question
 * que porte le (i), la note qui reste lue du lecteur d'écran, et les textes retirés dans
 * TOUTES les langues.
 */

const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const catalogs: Partial<Record<AdminLanguage, AdminInterfaceCatalog>> = {};
beforeAll(async () => {
  for (const language of ADMIN_LANGUAGES) catalogs[language] = await loadAdminInterfaceCatalog(language);
});
afterEach(() => mounter.unmountAll());

const entry = (language: AdminLanguage, key: string): string | undefined => (catalogs[language] as Readonly<Record<string, string>>)[key];

/** Le texte que l'on LIT au repos : tout sauf ce qui est réservé au lecteur d'écran. */
const visibleText = (root: Element): string => {
  const copy = root.cloneNode(true) as Element;
  copy.querySelectorAll('.sr-only').forEach((node) => node.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const infoButton = (root: Element, question: string): HTMLButtonElement | null => root.querySelector<HTMLButtonElement>(`button[aria-label="${question}"]`);
const noteOf = (root: Element, button: HTMLButtonElement | null): Element | null => root.querySelector(`[id="${button?.getAttribute('aria-controls') ?? ''}"]`);

describe('le kit : un champ range son explication derrière un (i)', () => {
  test('AdminSwitch : le libellé nomme, la note n’est pas lue au repos mais reste décrite au lecteur d’écran', async () => {
    const host = await mount(<AdminSwitch id="s" label="Menu replié" hint="Le menu démarre réduit." hintQuestion="Que change ce réglage ?" checked={false} onToggle={() => undefined} />);

    expect(visibleText(host)).toBe('Menu replié');
    const button = infoButton(host, 'Que change ce réglage ?');
    expect(button).not.toBeNull();
    expect(noteOf(host, button)?.textContent).toBe('Le menu démarre réduit.');
    expect(noteOf(host, button)?.classList.contains('sr-only')).toBe(true);
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-describedby')).toBe(noteOf(host, button)?.id ?? 'absent');
  });

  test('AdminSwitch : le (i) ouvre la note, qui se lit alors', async () => {
    const host = await mount(<AdminSwitch id="s" label="Menu replié" hint="Le menu démarre réduit." hintQuestion="Que change ce réglage ?" checked={false} onToggle={() => undefined} />);

    await mounter.click(infoButton(host, 'Que change ce réglage ?'));

    expect(visibleText(host)).toContain('Le menu démarre réduit.');
  });

  test('AdminCheckbox : même contrat', async () => {
    const host = await mount(<AdminCheckbox id="c" label="Cases" hint="Détail." hintQuestion="À quoi sert ce réglage ?" checked={false} onToggle={() => undefined} />);

    expect(visibleText(host)).toBe('Cases');
    expect(noteOf(host, infoButton(host, 'À quoi sert ce réglage ?'))?.textContent).toBe('Détail.');
  });

  test('sans question, la note reste visible (les repères du chantier ne s’épurent pas)', async () => {
    const host = await mount(<AdminSwitch id="s" label="Menu replié" hint="Orientation." checked={false} onToggle={() => undefined} />);

    expect(visibleText(host)).toContain('Orientation.');
  });
});

describe('Analytique > Langues : la note du tableau passe derrière un (i)', () => {
  test('le tableau garde ses colonnes ; la définition de « Évolution » ne se lit qu’à la demande', async () => {
    const host = await mount(<LanguagesDetailTable language="fr" rows={[{ code: 'fr', messageCount: 10, userCount: 3, percentage: 80, growth: 12 }]} />);

    const button = infoButton(host, 'Comment lire ce tableau ?');
    expect(button).not.toBeNull();
    expect(noteOf(host, button)?.textContent).toContain('variation du nombre de messages');
    expect(visibleText(host)).not.toContain('variation du nombre de messages');
  });

  test('le lecteur d’écran annonce le tableau par le titre de SON bloc, « Détail par langue »', async () => {
    const host = await mount(<LanguagesDetailTable language="fr" rows={[{ code: 'fr', messageCount: 10, userCount: 3, percentage: 80, growth: 12 }]} />);

    expect(host.querySelector('table caption')?.textContent).toBe('Détail par langue');
  });
});

describe('Diffusions : l’état vide tient en une ligne et une action', () => {
  test('« Aucune diffusion. » et « Écrire une diffusion » dans les quatre langues', () => {
    const expected: Record<AdminLanguage, readonly [string, string]> = {
      fr: ['Aucune diffusion.', 'Écrire une diffusion'],
      en: ['No broadcast.', 'Write a broadcast'],
      es: ['Ninguna difusión.', 'Escribir una difusión'],
      pt: ['Nenhuma transmissão.', 'Escrever uma transmissão'],
    };
    for (const language of ADMIN_LANGUAGES) {
      expect(entry(language, 'admin.broadcast.list.empty')).toBe(expected[language][0]);
      expect(entry(language, 'admin.broadcast.list.emptyAction')).toBe(expected[language][1]);
      expect(entry(language, 'admin.broadcast.list.emptyHint')).toBeUndefined();
    }
  });
});

describe('les sous-titres qui répètent le titre sont supprimés', () => {
  const REMOVED = [
    'admin.ranking.subtitle',
    'admin.monitoring.subtitle',
    'admin.ops.subtitle',
    'admin.posts.subtitle',
    'admin.community.subtitle',
    'admin.invitation.subtitle',
    'admin.moderation.subtitle',
    'admin.settings.subtitle',
    'admin.quickEdit.subtitle',
  ];
  test('aucune langue ne porte plus ces clés', () => {
    for (const language of ADMIN_LANGUAGES) for (const key of REMOVED) expect({ language, key, value: entry(language, key) }).toEqual({ language, key, value: undefined });
  });
});

describe('les phrases qui ne servent plus à rien ne sont pas déplacées : elles sont fusionnées', () => {
  test('Signalements : UNE phrase dit que le choix ne bannit ni ne retire rien', () => {
    expect(entry('fr', 'admin.moderation.actions.hint')).toBeUndefined();
    expect(entry('fr', 'admin.moderation.handling.actionHint')).toBe('Ce choix est consigné ; il ne bannit ni ne retire rien.');
  });

  test('Saisons du Jeu : « rien n’est appliqué » se dit une seule fois', () => {
    expect(entry('fr', 'admin.gameSeasons.ai.hint')).not.toMatch(/rien n’est appliqué/i);
    expect(entry('fr', 'admin.gameSeasons.proposal.notApplied')).toMatch(/rien n’est appliqué/i);
  });
});

describe('les confirmations ne répètent plus le journal d’audit', () => {
  test('une ligne commune du ConfirmSheet, plus dans les corps', () => {
    expect(entry('fr', 'admin.kit.confirm.audited')).toBe('Ce geste est consigné au journal d’audit.');
    const keys = Object.keys(catalogs.fr ?? {}).filter((key) => /(\.body|confirmBody|Body|\.confirm)$/.test(key) && !key.endsWith('motive'));
    const repeated = keys.filter((key) => /consigné[^.]*journal|inscrit au journal/i.test(entry('fr', key) ?? ''));
    expect(repeated).toEqual([]);
  });
});

describe('une longue explication d’acte, de capacité ou de sauvegarde est raccourcie', () => {
  test('aucune explication d’acte du journal ne dépasse 200 caractères (français)', () => {
    const long = Object.keys(catalogs.fr ?? {})
      .filter((key) => /^admin\.audit\.action\..*\.explain$/.test(key))
      .filter((key) => (entry('fr', key) ?? '').length > 200);
    expect(long).toEqual([]);
  });

  test('la sauvegarde se dit en une phrase, le détail va derrière le (i)', () => {
    expect(entry('fr', 'admin.monitoring.backups.hint')).toBe('Sauvegarde complète chaque nuit.');
    expect(entry('fr', 'admin.monitoring.backups.detail')).toContain('base vérifiée');
  });

  test('la purge des images dit sa conséquence en une phrase', () => {
    expect((entry('fr', 'admin.ops.action.image-prune.body') ?? '').length).toBeLessThan(200);
    expect(entry('fr', 'admin.ops.action.image-prune.body')).toContain('staging et la production');
    expect(entry('fr', 'admin.ops.action.image-prune.detail')).toContain('conteneurs en marche');
  });

  test('la révélation d’un lien de partage tient en une phrase', () => {
    expect(entry('fr', 'admin.shareLink.confirm.reveal.body')).toBe('Ces clés ouvrent la conversation et ne s’affichent qu’une fois.');
    expect(entry('fr', 'admin.shareLink.confirm.reveal.detail')).toContain('Quiconque les détient');
  });
});

describe('les repères restent visibles (règle 7)', () => {
  test('Sessions et Événements : une phrase d’orientation', () => {
    expect(entry('fr', 'admin.security.sessions.intro')).toBe('Sessions ouvertes du membre : en révoquer une le déconnecte de cet appareil.');
    expect(entry('fr', 'admin.security.events.intro')).toBe('Connexions et changements de sécurité du compte, du plus récent au plus ancien.');
  });

  test('Chiffrement de bout en bout : la rangée dit que la traduction reste (sur l’appareil) et que le mode ne se retire pas', () => {
    const said: Record<AdminLanguage, RegExp> = {
      fr: /appareil.*ne se retire jamais/,
      en: /device.*can never be turned off/,
      es: /dispositivo.*nunca se retira/,
      pt: /dispositivo.*nunca é removida/,
    };
    for (const language of ADMIN_LANGUAGES) expect({ language, text: entry(language, 'admin.enum.encryption.e2ee.explain') ?? '' }).toEqual({ language, text: expect.stringMatching(said[language]) });
  });

  test('Lien de partage : les permissions disent ce qu’un invité peut faire', () => {
    expect(entry('fr', 'admin.shareLink.section.permissions.intro')).toBe('Ce qu’un invité peut faire dans la conversation, figé à son arrivée.');
  });

  test('chaque langue porte ces phrases', () => {
    for (const language of ADMIN_LANGUAGES) {
      for (const key of ['admin.security.sessions.intro', 'admin.security.events.intro', 'admin.shareLink.section.permissions.intro', 'admin.kit.confirm.audited', 'admin.kit.info.setting', 'admin.kit.info.capability']) {
        expect({ language, key, present: (entry(language, key) ?? '') !== '' }).toEqual({ language, key, present: true });
      }
    }
  });
});
