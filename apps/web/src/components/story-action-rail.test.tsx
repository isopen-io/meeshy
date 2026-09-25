import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { resolveStoryActionRailPlan, type StoryActionRailInputs } from '@/lib/stories/action-rail';
import { GLYPHS } from '@/components/glyphs';

import { StoryActionRail, type StoryActionRailHandlers } from './story-action-rail';

/**
 * `StoryActionRail` — la CONTRE-ÉPREUVE du rail : un bouton que la loi refuse,
 * ou qu'aucun gestionnaire n'atteint, **n'existe pas dans le DOM**. Le reste
 * (quels boutons pour qui) est éprouvé sans DOM par `action-rail.test.ts` ;
 * ce fichier ne mesure que ce qu'un témoin de loi ne peut pas voir.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

const TOUS: StoryActionRailHandlers = {
  sound: () => {},
  react: () => {},
  reply: () => {},
  forward: () => {},
  repost: () => {},
  views: () => {},
  share: () => {},
  save: () => {},
  comments: () => {},
  translations: () => {},
};

const inputs = (patch: Partial<StoryActionRailInputs> = {}): StoryActionRailInputs => ({
  storyId: 'st-1',
  isOwnStory: false,
  canReply: true,
  hasAudibleSound: true,
  commentCount: 4,
  hasTranslatableContent: true,
  ...patch,
});

async function monter(props: Parameters<typeof StoryActionRail>[0]): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<StoryActionRail {...props} />));
  return container;
}

const actions = (host: HTMLElement): readonly string[] =>
  [...host.querySelectorAll('[data-story-action]')].map((el) => el.getAttribute('data-story-action') ?? '');

describe('le rail rend la loi, et rien qu’elle', () => {
  test('la story d’AUTRUI rend ses boutons dans l’ordre d’iOS — le son en tête', async () => {
    const host = await monter({ plan: resolveStoryActionRailPlan(inputs()), language: 'fr', handlers: TOUS });
    expect(actions(host)).toEqual(['sound', 'react', 'reply', 'forward', 'repost', 'comments', 'translations']);
  });

  test('CONTRE-ÉPREUVE — un bouton dont la loi dit `false` n’est pas dans le DOM', async () => {
    const host = await monter({
      plan: resolveStoryActionRailPlan(inputs({ isOwnStory: true })),
      language: 'fr',
      handlers: TOUS,
    });
    const rendus = actions(host);
    /* Ce que la loi retire sur MA story… */
    expect(rendus).not.toContain('react');
    expect(rendus).not.toContain('reply');
    expect(rendus).not.toContain('repost');
    /* … et ce qu'elle met à la place : l'export, en DEUX boutons qui vont
       toujours ensemble (`StoryExportRailButtons`). Un `disabled`
       annoncerait une action que le produit ne rend pas : on cherche
       l'ABSENCE, pas l'inertie. */
    expect(rendus).toContain('share');
    expect(rendus).toContain('save');
    expect(host.querySelector('[data-story-action="react"]')).toBeNull();
  });

  test('CONTRE-ÉPREUVE — un bouton que la loi autorise mais qu’aucun gestionnaire n’atteint est ABSENT (loi 4)', async () => {
    const host = await monter({
      plan: resolveStoryActionRailPlan(inputs()),
      language: 'fr',
      handlers: { sound: () => {}, react: () => {}, comments: () => {} },
    });
    expect(actions(host)).toEqual(['sound', 'react', 'comments']);
    expect(host.querySelector('[data-story-action="repost"]')).toBeNull();
    expect(host.querySelector('[data-story-action="translations"]')).toBeNull();
  });

  test('« Vues » (#7116) a désormais son tracé et son effet — plan AUTEUR complet', async () => {
    /* `eye` est DÉJÀ dans le socle (`glyphs.ts`) : le rejoindre à la carte du
       rail coûte 0 octet de PLUS, mesuré (voir `GLYPH_OF`, doc-comment). Le
       TROISIÈME garde (le tracé) reste structurel — c'est la loi et le
       gestionnaire qui, ensemble, l'atteignent désormais. */
    const plan = resolveStoryActionRailPlan(inputs({ isOwnStory: true }));
    expect(plan.showsViews).toBe(true);
    const host = await monter({ plan, language: 'fr', handlers: TOUS });
    expect(actions(host)).toContain('views');
  });

  test('« Enregistrer » porte le tracé « télécharger », pas « archiver » (revue #7116)', async () => {
    /* Mesuré le 2026-09-24 : `downloadSimple` rejoint le socle (`glyphs.ts`,
       déjà importé pour `archive`/`eye`/`translate`) SANS faire bouger
       `story_reader` — GLYPHS y est une table PARTAGÉE (chunk `glyph-*.js`),
       jamais dupliquée dans ce chunk (`node scripts/measure-weight.mjs` :
       10,93 Ko avant et après, plafond 11 Ko inchangé). Le miroir de
       `square.and.arrow.down.fill` (iOS, `StoryViewerView+Sidebar.swift:788-795`)
       n'avait donc pas de coût à arbitrer — `archive` restait un FAUX AMI
       sémantique (dimension 6) sans même la justification du poids. */
    const host = await monter({
      plan: resolveStoryActionRailPlan(inputs({ isOwnStory: true })),
      language: 'fr',
      handlers: TOUS,
    });
    const trace = host.querySelector('[data-story-action="save"] svg path')?.getAttribute('d');
    const traceAttendu = /d="([^"]+)"/.exec(GLYPHS.downloadSimple.body)?.[1];
    const traceArchive = /d="([^"]+)"/.exec(GLYPHS.archive.body)?.[1];
    expect(trace).toBe(traceAttendu);
    expect(trace).not.toBe(traceArchive);
  });

  test('un rail sans AUCUN bouton atteignable ne peint pas de barre vide', async () => {
    const host = await monter({ plan: resolveStoryActionRailPlan(inputs()), language: 'fr', handlers: {} });
    expect(host.querySelector('[data-story-action-rail]')).toBeNull();
  });

  test('badges={{ translations: "FR" }} => une capsule data-story-action-badge, texte "FR", aria-hidden', async () => {
    const host = await monter({
      plan: resolveStoryActionRailPlan(inputs()),
      language: 'fr',
      handlers: TOUS,
      badges: { translations: 'FR' },
    });
    const badge = host.querySelector('[data-story-action="translations"] [data-story-action-badge]');
    expect(badge?.textContent).toBe('FR');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('[data-story-action="react"] [data-story-action-badge]')).toBeNull();
  });

  test('sans badge, rien ; un badge sur un bouton ABSENT du rail ne rend rien', async () => {
    const host = await monter({
      plan: resolveStoryActionRailPlan(inputs({ isOwnStory: true })),
      language: 'fr',
      handlers: TOUS,
      badges: { react: 'EN', translations: null },
    });
    /* `react` n'est PAS dans le rail de MA story (la loi le retire) — le
       badge ne rend rien, quoi qu'il porte. */
    expect(host.querySelector('[data-story-action-badge]')).toBeNull();
  });

  test('anchored={{ action: "translations", node }} => node est rendu dans l’enveloppe du bouton', async () => {
    const host = await monter({
      plan: resolveStoryActionRailPlan(inputs()),
      language: 'fr',
      handlers: TOUS,
      anchored: { action: 'translations', node: <div data-la-barre>barre</div> },
    });
    const anchor = host.querySelector('[data-story-action-anchor="translations"]');
    expect(anchor).not.toBeNull();
    expect(anchor?.querySelector('[data-la-barre]')).not.toBeNull();
    expect(anchor?.querySelector('[data-story-action="translations"]')).not.toBeNull();
  });

  test('anchored sur un bouton ABSENT du rail ne rend jamais la surface', async () => {
    const host = await monter({
      plan: resolveStoryActionRailPlan(inputs({ isOwnStory: true })),
      language: 'fr',
      handlers: TOUS,
      anchored: { action: 'react', node: <div data-la-barre>barre</div> },
    });
    expect(host.querySelector('[data-la-barre]')).toBeNull();
  });

  test('le bouton Traductions est dans le DOM quand les trois gardes sont vraies (contre-épreuve retournée)', async () => {
    const host = await monter({
      plan: resolveStoryActionRailPlan(inputs({ hasTranslatableContent: true })),
      language: 'fr',
      handlers: TOUS,
    });
    expect(host.querySelector('[data-story-action="translations"]')).not.toBeNull();
  });
});

describe('ce que chaque bouton ANNONCE et FAIT', () => {
  test('chaque bouton porte un nom accessible et une cible d’au moins 44 px', async () => {
    const host = await monter({ plan: resolveStoryActionRailPlan(inputs()), language: 'fr', handlers: TOUS });
    for (const bouton of host.querySelectorAll('[data-story-action]')) {
      expect(bouton.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
      /* 44×44 EN STYLE, pas en classe : happy-dom ne calcule aucune mise en
         page ni aucune feuille utilitaire, donc une classe `size-11` y serait
         VERTE PAR OMISSION. Le gate navigateur mesure les pixels rendus. */
      const disque = bouton.querySelector('span') as HTMLSpanElement | null;
      expect(disque?.style.width).toBe('44px');
      expect(disque?.style.height).toBe('44px');
    }
  });

  test('un clic appelle le gestionnaire de SON bouton, une seule fois', async () => {
    const appels: string[] = [];
    const host = await monter({
      plan: resolveStoryActionRailPlan(inputs()),
      language: 'fr',
      handlers: { react: () => appels.push('react'), comments: () => appels.push('comments') },
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-story-action="comments"]')?.click();
    });
    expect(appels).toEqual(['comments']);
  });

  test('le compteur n’apparaît qu’au-dessus de zéro — jamais un « 0 » qui n’apprend rien', async () => {
    const host = await monter({
      plan: resolveStoryActionRailPlan(inputs()),
      language: 'fr',
      handlers: TOUS,
      counts: { react: 12, comments: 0 },
    });
    expect(host.querySelector('[data-story-action="react"]')?.textContent).toContain('12');
    expect(host.querySelector('[data-story-action="comments"]')?.textContent).toBe('');
  });

  test('le SON dit son état par `aria-pressed`, jamais par son libellé', async () => {
    const muet = await monter({
      plan: resolveStoryActionRailPlan(inputs()),
      language: 'fr',
      handlers: TOUS,
      pressed: { sound: true },
    });
    const bouton = muet.querySelector('[data-story-action="sound"]');
    expect(bouton?.getAttribute('aria-pressed')).toBe('true');
    const libelleMuet = bouton?.getAttribute('aria-label');

    if (root !== undefined) await act(async () => root?.render(
      <StoryActionRail plan={resolveStoryActionRailPlan(inputs())} language="fr" handlers={TOUS} pressed={{ sound: false }} />,
    ));
    const apres = muet.querySelector('[data-story-action="sound"]');
    expect(apres?.getAttribute('aria-pressed')).toBe('false');
    expect(apres?.getAttribute('aria-label')).toBe(libelleMuet ?? '');
  });

  test('le rail masqué avec le chrome reste MONTÉ — il ne refait pas sa mise en page au relâchement', async () => {
    const host = await monter({ plan: resolveStoryActionRailPlan(inputs()), language: 'fr', handlers: TOUS, hidden: true });
    const rail = host.querySelector('[data-story-action-rail]');
    expect(rail).not.toBeNull();
    /* L'attribut qui le retire des DEUX arbres — pas `aria-hidden`, qui ne
       parle qu'à l'un d'eux et laisserait le sous-arbre tabulable (c'est la
       violation `aria-hidden-focus` : un `Tab` amène le focus dans une région
       que le lecteur d'écran a reçu l'ordre de taire). */
    expect(rail?.hasAttribute('inert')).toBe(true);
    expect(rail?.hasAttribute('aria-hidden')).toBe(false);
  });

  test('le rail VISIBLE ne porte pas l’attribut — jamais un `inert="false"` qui figerait tout', async () => {
    const host = await monter({ plan: resolveStoryActionRailPlan(inputs()), language: 'fr', handlers: TOUS });
    expect(host.querySelector('[data-story-action-rail]')?.hasAttribute('inert')).toBe(false);
  });

  test('le rail masqué ne prend NI le doigt NI la tabulation — sinon il commande par-dessus la feuille', async () => {
    /* LE DÉFAUT QUE CE TÉMOIN FERME. `routes/story.tsx` masque le rail quand
       la feuille de commentaires s'ouvre (`hidden={chromeHidden ||
       commentsOpen}`). L'opacité seule ne retirait que ce que l'ŒIL voit :
       le conteneur portait `pointer-events-none`, mais CHAQUE bouton le
       ré-active (`pointer-events-auto`, pour laisser passer le geste de
       plateau ENTRE les boutons quand le rail est visible). Quatre boutons
       invisibles restaient donc cliquables et tabulables PAR-DESSUS la
       feuille — dont « Commentaires », qui recouvrait le bouton d'envoi du
       composeur.

       Le témoin mesure l'EFFET, pas l'attribut : un bouton d'un sous-arbre
       inerte ne peut pas devenir actif, même par `.focus()` programmatique
       (happy-dom l'applique — même mesure que `story-rail.test.tsx:213`). */
    const host = await monter({ plan: resolveStoryActionRailPlan(inputs()), language: 'fr', handlers: TOUS, hidden: true });
    const bouton = host.querySelector<HTMLButtonElement>('[data-story-action="comments"]');
    expect(bouton).not.toBeNull();
    document.body.focus();
    await act(async () => bouton?.focus());
    expect(document.activeElement).not.toBe(bouton);
  });

  test('un rail masqué n’annonce plus rien — son libellé tombe avec lui', async () => {
    /* Miroir exact du précédent maison (`story-rail.tsx:420-421`) : « une
       région INERTE n'a rien à annoncer : son libellé tombe avec elle, sinon
       c'est lui qui porte le doublon ». */
    const host = await monter({ plan: resolveStoryActionRailPlan(inputs()), language: 'fr', handlers: TOUS, hidden: true });
    expect(host.querySelector('[data-story-action-rail]')?.getAttribute('aria-label')).toBeNull();
  });

  test('le rail est une barre d’outils VERTICALE nommée — un lecteur d’écran sait où il est', async () => {
    const host = await monter({ plan: resolveStoryActionRailPlan(inputs()), language: 'fr', handlers: TOUS });
    const rail = host.querySelector('[data-story-action-rail]');
    expect(rail?.getAttribute('role')).toBe('toolbar');
    expect(rail?.getAttribute('aria-orientation')).toBe('vertical');
    expect(rail?.getAttribute('aria-label')).toBe('Actions de la story');
  });
});

/**
 * **L'ANNEAU D'EXPORT** (#7116) — `save` a une SECONDE forme quand `saving`
 * porte un job. `share` reste un bouton ORDINAIRE tout du long
 * (`StoryExportRailButtons.resolve`, iOS : « Partager reste au premier plan
 * tout du long »).
 */
describe('l’anneau d’export remplace « Enregistrer », jamais « Partager »', () => {
  const plan = () => resolveStoryActionRailPlan(inputs({ isOwnStory: true }));

  test('`saving` absent ⇒ « Enregistrer » reste un bouton plein, comme avant ce lot', async () => {
    const host = await monter({ plan: plan(), language: 'fr', handlers: TOUS });
    expect(host.querySelector('[data-story-action="save"]')).not.toBeNull();
    expect(host.querySelector('[data-story-save-ring]')).toBeNull();
  });

  test('`saving: { progress: 0.4, cancellable: true }` ⇒ l’anneau REMPLACE « Enregistrer », dans un bouton ANNULABLE', async () => {
    const cancels: string[] = [];
    const host = await monter({
      plan: plan(),
      language: 'fr',
      handlers: TOUS,
      saving: { progress: 0.4, cancellable: true },
      onCancelSave: () => cancels.push('cancel'),
    });
    expect(host.querySelector('[data-story-action="save"]')).toBeNull();
    /* « Partager » reste un `<button>` ordinaire tout du long. */
    expect(host.querySelector('[data-story-action="share"]')?.tagName).toBe('BUTTON');

    const ring = host.querySelector('[data-story-save-ring]');
    expect(ring?.getAttribute('role')).toBe('progressbar');
    // 0,4 × 0,9 × 100 = 36 — le même calcul que `percent()`.
    expect(ring?.getAttribute('aria-valuenow')).toBe('36');

    const cancelButton = host.querySelector<HTMLButtonElement>('button[data-story-save-cancel]');
    expect(cancelButton?.getAttribute('aria-label')).toBe('Annuler l’enregistrement');
    await act(async () => cancelButton?.click());
    expect(cancels).toEqual(['cancel']);
  });

  test('LA VALEUR RESTE LISIBLE : l’anneau n’est PAS dans le bouton d’annulation (revue #7116)', async () => {
    /* Les enfants d'un `button` sont PRÉSENTATIONNELS (ARIA, « Children
       Presentational: True ») : un `progressbar` posé DEDANS perd son rôle et
       sa valeur, et le lecteur d'écran n'entendait que « Annuler
       l'enregistrement, bouton ». iOS dit les deux — `accessibilityLabel`
       « Annuler l'enregistrement », `accessibilityValue` « Enregistrement
       N % » (`StoryViewerView+Sidebar.swift:758-787`). */
    const host = await monter({
      plan: plan(),
      language: 'fr',
      handlers: TOUS,
      saving: { progress: 0.4, cancellable: true },
      onCancelSave: () => undefined,
    });
    /* Des BOOLÉENS, pas des nœuds : un nœud happy-dom rendu dans le message
       d'échec fait boucler le formateur de `bun test` sur ses références
       circulaires (mesuré : le témoin rouge ne rendait jamais la main). */
    expect(host.querySelector('[data-story-save-ring]')?.closest('button') === null).toBe(true);
    expect(host.querySelector('button[data-story-save-cancel] [role="progressbar"]') === null).toBe(true);
  });

  test('`cancellable: false` ⇒ l’anneau n’est PAS dans un bouton — aucun contrôle inerte (D-88)', async () => {
    const host = await monter({
      plan: plan(),
      language: 'fr',
      handlers: TOUS,
      saving: { progress: 1, cancellable: false },
    });
    const ring = host.querySelector('[data-story-save-ring]');
    expect(ring !== null).toBe(true);
    expect(host.querySelector('button[data-story-save-cancel]') === null).toBe(true);
    /* La livraison ne publie rien : le ton passe à INERTE et le balayage dit
       « en cours » — l'arc de valeur, lui, reste à 90 % (`downloadShare(1)`). */
    expect(ring?.getAttribute('data-story-save-tone')).toBe('inert');
    expect(ring?.getAttribute('aria-valuenow')).toBe('90');
    expect(ring?.querySelector('[data-story-save-sweep]')).not.toBeNull();
  });

  test('flux SANS longueur (`progress: null`, le cas nominal de la route d’export) ⇒ `aria-busy`, aucun faux « 0 % », un balayage', async () => {
    const host = await monter({
      plan: plan(),
      language: 'fr',
      handlers: TOUS,
      saving: { progress: null, cancellable: true },
      onCancelSave: () => undefined,
    });
    const ring = host.querySelector('[data-story-save-ring]');
    expect(ring?.getAttribute('aria-busy')).toBe('true');
    expect(ring?.hasAttribute('aria-valuenow')).toBe(false);
    expect(ring?.textContent).toBe('');
    expect(ring?.querySelector('[data-story-save-sweep]')).not.toBeNull();
    expect(ring?.getAttribute('data-story-save-tone')).toBe('accent');
  });

  test('LE CHIFFRE NE TOURNE PAS : seul le calque du balayage porte la rotation (revue #7116)', async () => {
    const host = await monter({ plan: plan(), language: 'fr', handlers: TOUS, saving: { progress: 1, cancellable: false } });
    const ring = host.querySelector('[data-story-save-ring]');
    const spinning = [...(ring?.querySelectorAll('.animate-spin') ?? [])];
    expect(spinning.length).toBe(1);
    expect(spinning[0]?.hasAttribute('data-story-save-sweep')).toBe(true);
    expect(ring?.classList.contains('animate-spin')).toBe(false);
  });

  test('la valeur S’ANNONCE en mots (`aria-valuetext`), pas seulement en nombre', async () => {
    const host = await monter({
      plan: plan(),
      language: 'fr',
      handlers: TOUS,
      saving: { progress: 0.4, cancellable: true },
      onCancelSave: () => undefined,
    });
    expect(host.querySelector('[data-story-save-ring]')?.getAttribute('aria-valuetext')).toBe('Enregistrement 36 %');
  });

  test('annulable mais SANS gestionnaire d’annulation ⇒ aucun `<button>` sans effet (loi 4)', async () => {
    const host = await monter({ plan: plan(), language: 'fr', handlers: TOUS, saving: { progress: 0.4, cancellable: true } });
    expect(host.querySelector('[data-story-save-ring]') !== null).toBe(true);
    expect(host.querySelector('button[data-story-save-cancel]') === null).toBe(true);
  });
});
