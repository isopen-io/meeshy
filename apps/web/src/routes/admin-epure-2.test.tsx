import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AdminStatCard } from '@/components/admin/stat-card';
import { ADMIN_LANGUAGES, loadAdminInterfaceCatalog, type AdminInterfaceCatalog, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { StatsSection } from './admin-analytics-parts';
import { TextField } from './admin-broadcast-fields';

/**
 * **L'ÉPURE DE L'ADMINISTRATION, 2/3 (#18486, #17584)** — l'administration confirme en une
 * phrase et détaille à la demande. Le contrat : ce qui reste visible au repos, la QUESTION
 * que porte chaque (i), la note qui reste lue du lecteur d'écran, et les textes retirés ou
 * raccourcis dans TOUTES les langues, sans clé orpheline ni lecteur sans clé.
 */

const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const catalogs: Partial<Record<AdminLanguage, AdminInterfaceCatalog>> = {};
beforeAll(async () => {
  for (const language of ADMIN_LANGUAGES) catalogs[language] = await loadAdminInterfaceCatalog(language);
});
afterEach(() => mounter.unmountAll());

const entry = (language: AdminLanguage, key: string): string | undefined => (catalogs[language] as Readonly<Record<string, string>>)[key];

const visibleText = (root: Element): string => {
  const copy = root.cloneNode(true) as Element;
  copy.querySelectorAll('.sr-only').forEach((node) => node.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};
const infoButton = (root: Element, question: string): HTMLButtonElement | null => root.querySelector<HTMLButtonElement>(`button[aria-label="${question}"]`);
const noteOf = (root: Element, button: HTMLButtonElement | null): Element | null => root.querySelector(`[id="${button?.getAttribute('aria-controls') ?? ''}"]`);

const REMOVED = [
  "admin.audit.list.emptyHint",
  "admin.conversation.list.emptyHint",
  "admin.agentPanel.tracked.emptyHint",
  "admin.agentPanel.logs.emptyHint",
  "admin.agentPanel.queue.emptyHint",
  "admin.broadcast.compose.field.subject.hint",
  "admin.lang.subtitle",
  "admin.lang.empty.hint",
  "admin.lang.detail.caption",
  "admin.lang.pairs.caption",
  "admin.shareLink.list.emptyHint",
  "admin.tracking.list.emptyHint",
  "admin.invitation.list.emptyHint",
  "admin.moderation.list.emptyHint",
  "admin.posts.empty.hint",
  "admin.community.empty.hint",
  "admin.monitoring.breakers.emptyHint",
  "admin.conversation.fiche.notFoundHint",
  "admin.broadcast.fiche.notFoundHint",
  "admin.invitation.fiche.notFoundHint",
  "admin.shareLink.fiche.notFoundHint",
  "admin.tracking.fiche.notFoundHint",
  "admin.moderation.fiche.notFoundHint",
  "admin.posts.notFound.hint",
  "admin.community.notFound.hint",
] as const;

const SHORTENED_FR: Readonly<Record<string, string>> = {
  "admin.audit.subtitle": "Chaque geste d’administration et chaque lecture du privé laissent une trace.",
  "admin.conversation.subtitle": "Le contenu des messages ne se lit que sous motif écrit, depuis la fiche.",
  "admin.conversation.reading.hint": "Lecture sous motif écrit, consignée à votre nom.",
  "admin.conversation.card.links.hint": "{count} lien(s) de partage",
  "admin.agentPanel.subtitle": "Les conversations où l’agent intervient.",
  "admin.broadcast.list.subtitle": "À tous les comptes ou à une partie d’entre eux.",
  "admin.broadcast.notice.noRecipients": "Aucun compte ne correspond à cette audience : recréez la diffusion avec un autre ciblage.",
  "admin.broadcast.notice.noEmailRecipients": "Aucun compte de cette audience n’a d’e-mail vérifié : seule la publication dans l’application est possible.",
  "admin.broadcast.notice.inAppFailedNoMessage": "Publication dans l’application échouée : rien n’a été livré.",
  "admin.settings.access.intro": "Ce que votre rôle vous permet de faire.",
  "admin.analytics.subtitle": "Aucun contenu de message n’est lu ici.",
  "admin.analytics.calls.transitions.caption": "En moyenne par appel",
  "admin.monitoring.routes.saturated": "La mesure est saturée : {count} échantillons non ventilés par plateforme et version.",
  "admin.ops.containers.subtitle": "Relevés chaque minute ; touchez-en un pour le détail.",
  "admin.ops.shared": "Hôte partagé : staging et production tournent sur cette machine.",
  "admin.scale.abuse.intro": "Une opération au-dessus du seuil ne crédite qu’une fois par contenu.",
  "admin.scale.links.intro": "Une visite compte une fois par visiteur, par lien et par fenêtre, jamais celle du créateur.",
  "admin.gameSeasons.subtitle": "Une saison ouverte ou passée ne se réécrit pas.",
  "admin.gameSeasons.copy.hint": "Sept langues, trois textes chacune.",
  "admin.shareLink.subtitle": "Liens qui ouvrent une conversation à des invités.",
  "admin.tracking.subtitle": "Liens suivis et clics qu’ils rapportent.",
};

const ADDED = [
  "admin.conversation.reading.langQuestion",
  "admin.conversation.reading.langNote",
  "admin.conversation.card.links.whereQuestion",
  "admin.conversation.card.links.whereNote",
  "admin.agentPanel.reset.whereQuestion",
  "admin.broadcast.compose.field.name.hintQuestion",
  "admin.broadcast.compose.field.body.hintQuestion",
  "admin.settings.space.foldedQuestion",
  "admin.people.password.notifyQuestion",
  "admin.dash.zone.refresh.question",
  "admin.dash.zone.usage.question",
  "admin.dash.zone.trends.question",
  "admin.analytics.activity.distribution.question",
  "admin.analytics.activity.hourly.question",
  "admin.analytics.calls.reasons.question",
  "admin.analytics.measure.question",
  "admin.kit.info.stat",
  "admin.ranking.periodQuestion",
  "admin.scale.abuse.question",
  "admin.scale.abuse.detail",
  "admin.scale.links.question",
  "admin.scale.links.detail",
  "admin.gameSeasons.editor.question",
  "admin.gameSeasons.copy.question",
  "admin.gameSeasons.copy.detail",
  "admin.gameSeasons.export.question",
] as const;

describe('les textes qui répètent ou qui n’apprennent rien sont supprimés de TOUTES les langues', () => {
  test('aucune langue ne porte plus ces clés', () => {
    for (const language of ADMIN_LANGUAGES) for (const key of REMOVED) expect({ language, key, value: entry(language, key) }).toEqual({ language, key, value: undefined });
  });

  test('aucun écran ne lit plus une clé supprimée', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (item.isDirectory()) walk(join(dir, item.name));
        else if (/\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name) && !dir.includes('interface-catalogs')) files.push(join(dir, item.name));
      }
    };
    walk(join(import.meta.dir, '..'));
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const key of REMOVED) expect({ key, read: source.includes(`'${key}'`) }).toEqual({ key, read: false });
  });
});

describe('les libellés raccourcis le sont dans les quatre langues, traduits', () => {
  test('le français porte la phrase visée', () => {
    for (const [key, text] of Object.entries(SHORTENED_FR)) expect({ key, text: entry('fr', key) }).toEqual({ key, text });
  });

  test('en, es et pt portent une version traduite, jamais le français recopié', () => {
    for (const language of ['en', 'es', 'pt'] as const)
      for (const key of Object.keys(SHORTENED_FR)) {
        const value = entry(language, key);
        expect({ language, key, defined: value !== undefined && value.length > 0 }).toEqual({ language, key, defined: true });
        expect({ language, key, copied: value === SHORTENED_FR[key] }).toEqual({ language, key, copied: false });
      }
  });
});

describe('les questions et les notes des (i) existent dans toutes les langues', () => {
  test('chaque clé ajoutée est servie, et traduite', () => {
    for (const language of ADMIN_LANGUAGES)
      for (const key of ADDED) {
        const value = entry(language, key);
        expect({ language, key, defined: value !== undefined && value.length > 0 }).toEqual({ language, key, defined: true });
        if (language !== 'fr') expect({ language, key, copied: value === entry('fr', key) }).toEqual({ language, key, copied: false });
      }
  });

  test('une question se pose en question', () => {
    for (const language of ADMIN_LANGUAGES)
      for (const key of ADDED.filter((candidate) => /[qQ]uestion$/.test(candidate)))
        expect({ language, key, question: (entry(language, key) ?? '').trim().endsWith('?') }).toEqual({ language, key, question: true });
  });
});

describe('un champ de formulaire de diffusion range sa note derrière un (i)', () => {
  test('le libellé nomme ; la question nomme le (i) ; la note reste décrite au lecteur d’écran', async () => {
    const host = await mount(<TextField id="name" label="Nom" hint="Les destinataires ne le voient pas." hintQuestion="Qui voit ce nom ?" value="" onChange={() => undefined} />);

    expect(visibleText(host)).toBe('Nom');
    const button = infoButton(host, 'Qui voit ce nom ?');
    expect(button).not.toBeNull();
    expect(noteOf(host, button)?.textContent).toBe('Les destinataires ne le voient pas.');
    expect(noteOf(host, button)?.classList.contains('sr-only')).toBe(true);
    expect(host.querySelector('input')?.getAttribute('aria-describedby')).toContain(noteOf(host, button)?.id ?? 'absent');

    await mounter.click(button);
    expect(visibleText(host)).toContain('Les destinataires ne le voient pas.');
  });

  test('sans question, la note reste visible', async () => {
    const host = await mount(<TextField id="name" label="Nom" hint="Orientation." value="" onChange={() => undefined} />);
    expect(visibleText(host)).toContain('Orientation.');
  });
});

describe('une carte de chiffre range sa légende explicative derrière un (i)', () => {
  test('la valeur seule au repos, la légende lue du lecteur d’écran', async () => {
    const host = await mount(
      <AdminStatCard language="fr" anchor="total" label="Appels" value="12" note={{ question: 'Que mesure ce chiffre ?', text: 'Un relevé par participant : un appel à deux en compte deux' }} />,
    );

    expect(visibleText(host)).toBe('Appels12');
    const button = infoButton(host, 'Que mesure ce chiffre ?');
    expect(noteOf(host, button)?.textContent).toContain('un appel à deux en compte deux');
    expect(noteOf(host, button)?.classList.contains('sr-only')).toBe(true);
  });
});

describe('une section de statistiques : la période reste lue, la définition passe derrière un (i)', () => {
  test('la mention de période est visible ; la définition est derrière sa question', async () => {
    const host = await mount(
      <StatsSection id="pairs" title="Paires" windowNote="Période : 7 jours" note="Les traductions produites." noteQuestion="Que montre cette section ?">
        <div />
      </StatsSection>,
    );

    expect(visibleText(host)).toBe('Paires Période : 7 jours');
    const button = infoButton(host, 'Que montre cette section ?');
    expect(noteOf(host, button)?.textContent).toBe('Les traductions produites.');
  });
});
