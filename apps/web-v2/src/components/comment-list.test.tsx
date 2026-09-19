import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { COMMENT_MAX_LENGTH, type PostComment } from '@/lib/api/publication-comments';

import { CommentComposer } from './comment-composer';
import { CommentList, type CommentListState } from './comment-list';
import type { CommentGestureHandlers } from './comment-row';

/**
 * `CommentList` — LES QUATRE ÉTATS DESSINÉS et le PRISME appliqué à une
 * rangée. Un écran blanc n'est pas un état ; et un texte servi dans une autre
 * langue que le document doit le DIRE (`lang=`), sans quoi un lecteur d'écran
 * prononce le français avec une voix anglaise (cycle 122 rendu audible).
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

const NOW = new Date('2026-09-19T12:00:00.000Z');

const etat = (patch: Partial<CommentListState> = {}): CommentListState => ({
  loading: false,
  error: false,
  online: true,
  hasMore: false,
  loadingMore: false,
  ...patch,
});

const comment = (patch: Partial<PostComment> = {}): PostComment => ({
  id: 'c1',
  content: 'Bonjour',
  createdAt: '2026-09-19T11:58:00.000Z',
  author: { id: 'u1', displayName: 'Noa Berger', username: 'noa' },
  ...patch,
});

async function monter(node: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

const liste = (props: {
  comments?: readonly PostComment[];
  state?: CommentListState;
  onRetry?: () => void;
  onMore?: () => void;
  gestures?: CommentGestureHandlers;
}) => (
  <CommentList
    comments={props.comments ?? []}
    state={props.state ?? etat()}
    language="fr"
    preferredLanguages={['fr', 'en']}
    locale="fr-FR"
    now={NOW}
    onRetry={props.onRetry ?? (() => {})}
    onMore={props.onMore ?? (() => {})}
    {...(props.gestures === undefined ? {} : { gestures: props.gestures })}
  />
);

/** Les rappels de geste, avec leur journal — la liste ne connaît PAS le
 * réseau : ce que ces témoins mesurent, c'est qu'un bouton EXISTE là où il
 * doit et qu'il APPELLE (loi 4). L'optimiste et son rollback se mesurent une
 * couche plus bas, dans `lib/api/comment-gestures.test.ts`. */
const gestesDe = (
  patch: Partial<CommentGestureHandlers> = {},
): CommentGestureHandlers & { readonly journal: string[] } => {
  const journal: string[] = [];
  return {
    journal,
    viewerId: 'u-moi',
    onLike: (id, on) => journal.push(`like:${id}:${on ? 'on' : 'off'}`),
    onEdit: (id, content) => journal.push(`edit:${id}:${content}`),
    onDelete: (id) => journal.push(`delete:${id}`),
    failureOf: () => undefined,
    onRetryGesture: (id) => journal.push(`retry:${id}`),
    busyOf: () => false,
    ...patch,
  };
};

/** SUPPRIMER COÛTE DEUX GESTES — le premier ARME, le second détruit. */
const supprimer = async (host: HTMLElement, selecteur = '[data-comment-gesture="delete"]') => {
  await act(async () => host.querySelector<HTMLButtonElement>(selecteur)?.click());
  await act(async () => host.querySelector<HTMLButtonElement>(selecteur)?.click());
};

const MIEN = { id: 'u-moi', displayName: 'Vous', username: 'moi' };

describe('les quatre états — un écran blanc n’en est pas un', () => {
  test('CHARGEMENT sur un cache VIDE : un squelette, jamais un vide muet', async () => {
    const host = await monter(liste({ state: etat({ loading: true }) }));
    expect(host.querySelector('[data-comment-state="loading"]')?.getAttribute('aria-busy')).toBe('true');
  });

  test('CACHE-FIRST — une relecture EN FOND sur une liste peuplée ne détruit rien', async () => {
    const host = await monter(liste({ comments: [comment()], state: etat({ loading: true }) }));
    expect(host.querySelector('[data-comment-state="loading"]')).toBeNull();
    expect(host.querySelectorAll('[data-comment-row]')).toHaveLength(1);
  });

  test('VIDE : un titre et une invitation, pas un blanc', async () => {
    const host = await monter(liste({}));
    expect(host.querySelector('[data-comment-state="empty"]')?.textContent).toContain('Aucun commentaire');
  });

  test('ERREUR : annoncée en alerte, avec un « Réessayer » qui appelle l’hôte', async () => {
    let retries = 0;
    const host = await monter(liste({ state: etat({ error: true }), onRetry: () => (retries += 1) }));
    const bloc = host.querySelector('[data-comment-state="error"]');
    expect(bloc?.getAttribute('role')).toBe('alert');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-retry]')?.click());
    expect(retries).toBe(1);
  });

  test('HORS LIGNE et vide : pas de « Réessayer » — rien ne peut aboutir sans réseau', async () => {
    const host = await monter(liste({ state: etat({ error: true, online: false }) }));
    expect(host.querySelector('[data-comment-retry]')).toBeNull();
    expect(host.querySelector('[data-comment-state="error"]')?.textContent).toContain('Hors ligne');
  });

  test('HORS LIGNE sur une liste PEUPLÉE : on DIT l’état, on n’efface pas ce qui est lu', async () => {
    const host = await monter(liste({ comments: [comment()], state: etat({ online: false }) }));
    expect(host.querySelectorAll('[data-comment-row]')).toHaveLength(1);
    expect(host.querySelector('[data-comment-state="offline"]')?.getAttribute('role')).toBe('status');
  });
});

describe('la pagination et le Prisme', () => {
  test('« Voir plus » n’existe que s’il reste une page, et appelle l’hôte', async () => {
    let more = 0;
    const sans = await monter(liste({ comments: [comment()] }));
    expect(sans.querySelector('[data-comment-more]')).toBeNull();
    if (root !== undefined) {
      await act(async () =>
        root?.render(liste({ comments: [comment()], state: etat({ hasMore: true }), onMore: () => (more += 1) })),
      );
    }
    await act(async () => sans.querySelector<HTMLButtonElement>('[data-comment-more]')?.click());
    expect(more).toBe(1);
  });

  test('UN TÉMOIN DE RANG — un commentaire anglais traduit en français est SERVI en français, et le DIT', async () => {
    /* Le rang 1 du lecteur est `fr` ; l'original est `en`. La règle juste et
       un court-circuit « la langue d'origine est dans le prisme ⇒ l'original »
       rendraient des verdicts DIFFÉRENTS ici — c'est pour cela que le témoin
       se pose ici, et pas sur un commentaire déjà français. */
    const host = await monter(
      liste({
        comments: [
          comment({
            content: 'Which lake is this?',
            originalLanguage: 'en',
            translations: { fr: { text: 'C’est quel lac ?', translationModel: 'nllb-200' } },
          }),
        ],
      }),
    );
    const p = host.querySelector('[data-comment-row] p');
    expect(p?.textContent).toBe('C’est quel lac ?');
    expect(p?.getAttribute('lang')).toBe('fr');
  });

  test('un commentaire DÉJÀ dans la langue du lecteur ne porte PAS de `lang` — la voix ne change pas pour rien', async () => {
    const host = await monter(liste({ comments: [comment({ originalLanguage: 'fr' })] }));
    expect(host.querySelector('[data-comment-row] p')?.hasAttribute('lang')).toBe(false);
  });

  test('une rangée EN VOL se marque, et dit « Envoi en cours » plutôt qu’une heure qu’elle n’a pas', async () => {
    const host = await monter(liste({ comments: [comment({ pending: true })] }));
    expect(host.querySelector('[data-comment-pending]')).not.toBeNull();
    expect(host.querySelector('[data-comment-row]')?.textContent).toContain('Envoi en cours');
  });
});

/**
 * LES TROIS GESTES D'UNE RANGÉE (#7133) — `CommentRowView.swift` : le cœur
 * pour tout le monde, le menu « … » réduit aux actions qui EXISTENT
 * (`:107-111`), c'est-à-dire aux siennes. La passerelle tranche dans le même
 * sens : `PATCH`/`DELETE …/comments/:commentId` gardent l'AUTEUR, pas
 * l'audience (`comments.ts:500-523`).
 */
describe('les gestes d’une rangée — offerts là où ils aboutissent, jamais ailleurs', () => {
  test('AIMER est offert sur TOUTE rangée, et appelle l’hôte', async () => {
    const gestes = gestesDe();
    const host = await monter(liste({ comments: [comment()], gestures: gestes }));
    const bouton = host.querySelector<HTMLButtonElement>('[data-comment-row] [data-comment-gesture="like"]');
    expect(bouton).not.toBeNull();
    await act(async () => bouton?.click());
    /* LA DIRECTION EST ÉLUE ICI, où l'on VOIT l'état du cœur — et elle voyage
       ensuite avec la requête (défaut majeur 2 : `performCommentLike` la
       relisait dans le cache au moment de l'appel). */
    expect(gestes.journal).toEqual(['like:c1:on']);
  });

  test('un cœur DÉJÀ plein demande le RETRAIT — la direction suit ce que le lecteur VOIT', async () => {
    const gestes = gestesDe();
    const host = await monter(liste({ comments: [comment({ isLikedByMe: true, likeCount: 2 })], gestures: gestes }));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="like"]')?.click());
    expect(gestes.journal).toEqual(['like:c1:off']);
  });

  /**
   * **UN SECOND TAP EN VOL ÉTAIT AVALÉ PAR UN BOUTON QUI AVAIT L'AIR
   * DISPONIBLE** (défaut majeur 7). `comment-gestures.ts` posait bien le
   * verrou — miroir de `commentHeartInFlightIds` — mais personne ne le
   * RENDAIT : sur un réseau lent, le lecteur tapait pour retirer son « j'aime »
   * et il ne se passait RIEN, ni bascule, ni requête, ni un mot. iOS
   * désactive la cible (`CommentRowView.swift:284`).
   *
   * `aria-disabled` plutôt que `disabled` : `disabled` sur le bouton qu'on
   * vient d'actionner lui retire le focus, qui retombe sur `<body>` — on
   * corrigerait ce défaut-ci en rejouant le défaut majeur 6.
   */
  test('un geste EN VOL annonce sa cible indisponible, et le second tap n’appelle rien', async () => {
    const gestes = gestesDe({ busyOf: () => true });
    const host = await monter(liste({ comments: [comment()], gestures: gestes }));
    const bouton = host.querySelector<HTMLButtonElement>('[data-comment-gesture="like"]');
    expect(bouton?.getAttribute('aria-disabled')).toBe('true');
    expect(bouton?.getAttribute('aria-busy')).toBe('true');
    await act(async () => bouton?.click());
    expect(gestes.journal).toEqual([]);
  });

  test('MODIFIER et SUPPRIMER n’existent QUE sur son propre commentaire', async () => {
    const gestes = gestesDe();
    const host = await monter(
      liste({ comments: [comment({ id: 'mien', author: MIEN }), comment({ id: 'autrui' })], gestures: gestes }),
    );
    const ligne = (id: string) => host.querySelector(`[data-comment-row="${id}"]`);
    expect(ligne('mien')?.querySelector('[data-comment-gesture="edit"]')).not.toBeNull();
    expect(ligne('mien')?.querySelector('[data-comment-gesture="delete"]')).not.toBeNull();
    expect(ligne('autrui')?.querySelector('[data-comment-gesture="edit"]')).toBeNull();
    expect(ligne('autrui')?.querySelector('[data-comment-gesture="delete"]')).toBeNull();
    /* AIMER, lui, reste offert des deux côtés. */
    expect(ligne('autrui')?.querySelector('[data-comment-gesture="like"]')).not.toBeNull();
  });

  /**
   * **SUPPRIMER EST DESTRUCTEUR, ET SE VOIT** — `CommentRowView.swift:364`
   * pose `Button(role: .destructive)`, que SwiftUI peint en rouge. La v3.1
   * rendait « Supprimer » dans l'encre EXACTE de « Modifier » : deux libellés
   * voisins, même couleur, même poids, l'un réversible et l'autre non — et là
   * où iOS coûte DEUX gestes (ouvrir le menu « … », choisir), le web détruit
   * au PREMIER tap. Le seul signal qui reste est donc la couleur, et elle
   * manquait.
   *
   * Le témoin lit le JETON, jamais une valeur : `--color-error` est le même
   * que celui de l'alerte d'échec (`GestureFailure`), donc une seule encre de
   * refus pour toute la rangée.
   */
  test('SUPPRIMER porte l’encre destructrice, MODIFIER non — le tap irréversible se distingue du tap réversible', async () => {
    const host = await monter(liste({ comments: [comment({ author: MIEN })], gestures: gestesDe() }));
    const encreDe = (geste: string) =>
      host.querySelector<HTMLElement>(`[data-comment-gesture="${geste}"]`)?.style.color ?? '';
    expect(encreDe('delete')).toBe('var(--color-error)');
    expect(encreDe('edit')).not.toBe('var(--color-error)');
  });

  /**
   * **LE BOUTON QUI S'EFFACE EMPORTE LE FOCUS AVEC LUI.** « Modifier » démonte
   * la barre de gestes ENTIÈRE, celui qu'on vient d'actionner compris : sans
   * reprise, le focus retombe sur `<body>` et le lecteur au clavier ou au
   * lecteur d'écran perd sa place — il doit retraverser la page pour trouver
   * le champ qu'il vient d'ouvrir (WCAG 2.4.3). Le composeur tient déjà cette
   * discipline sur le même écran (`comment-composer.tsx:59`,
   * `fieldRef.current?.focus()` quand le texte revient au lecteur).
   *
   * Et le CURSEUR va à la FIN : une sélection totale ferait effacer tout le
   * commentaire à la première frappe de qui voulait corriger une lettre.
   */
  test('« Modifier » DONNE le focus au champ, curseur à la fin — le geste ne perd pas sa place', async () => {
    const host = await monter(liste({ comments: [comment({ content: 'Bonjour', author: MIEN })], gestures: gestesDe() }));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="edit"]')?.click());
    const champ = host.querySelector<HTMLTextAreaElement>('[data-comment-edit-field]');
    expect(champ).not.toBeNull();
    /* L'ATTRIBUT plutôt que l'élément : une comparaison d'objets ferait
       déverser le `window` entier de happy-dom dans le rapport d'échec, et le
       témoin ne dirait plus ce qu'il mesure. */
    expect(document.activeElement?.getAttribute('data-comment-edit-field')).toBe('c1');
    expect(champ?.selectionStart).toBe('Bonjour'.length);
  });

  /**
   * **LES DEUX CHAMPS DU MÊME MÉTIER PORTENT LA MÊME BORNE.** Le composeur
   * pose `maxLength={COMMENT_MAX_LENGTH}` : on ne PEUT pas taper au-delà. Le
   * champ d'édition, lui, laissait taper sans limite et « Enregistrer »
   * s'éteignait ensuite en silence — un bouton devenu inerte sans qu'aucun
   * mot ne dise pourquoi, sur une surface qui revendique pourtant « la MÊME
   * peau que le composeur, c'est le même métier ». Une borne qui n'existe que
   * dans l'un des deux champs se découvre à l'usage, pas à la lecture.
   */
  test('le champ d’édition porte la MÊME borne que le composeur — on ne tape pas au-delà', async () => {
    /* LES DEUX DANS UN SEUL MONTAGE — `monter` ne retient qu'une racine, et
       deux appels en laisseraient une démontée par personne. */
    const host = await monter(
      <>
        {liste({ comments: [comment({ author: MIEN })], gestures: gestesDe() })}
        <CommentComposer language="fr" canWrite onSend={async () => ({ ok: true })} />
      </>,
    );
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="edit"]')?.click());

    const borneDe = (selecteur: string) => host.querySelector(selecteur)?.getAttribute('maxlength') ?? null;
    expect(borneDe('[data-comment-edit-field]')).toBe(borneDe('[data-comment-field]'));
    expect(borneDe('[data-comment-edit-field]')).toBe(String(COMMENT_MAX_LENGTH));
  });

  test('SANS rappels — visiteur anonyme — aucune rangée n’offre de bouton (loi 4)', async () => {
    const host = await monter(liste({ comments: [comment({ author: MIEN })] }));
    expect(host.querySelector('[data-comment-gesture]')).toBeNull();
  });

  test('une rangée EN VOL n’offre aucun geste — son id n’existe pas chez la passerelle', async () => {
    const host = await monter(liste({ comments: [comment({ author: MIEN, pending: true })], gestures: gestesDe() }));
    expect(host.querySelector('[data-comment-gesture]')).toBeNull();
  });

  /** LE NOM ACCESSIBLE VIT SUR LE GLYPHE (`feed-post-card.tsx:85-92`) : un
   * `aria-label` posé sur le BOUTON remplacerait son contenu, et le compte
   * serait INAUDIBLE — le défaut que la rangée de statistiques du fil a déjà
   * payé. C'est donc ce témoin-là, et pas l'attribut de l'enveloppe. */
  test('le cœur ANNONCE son état ET son compte : « Je n’aime plus » sur le glyphe, « 4 » en texte lu', async () => {
    const host = await monter(liste({ comments: [comment({ isLikedByMe: true, likeCount: 4 })], gestures: gestesDe() }));
    const bouton = host.querySelector<HTMLButtonElement>('[data-comment-gesture="like"]');
    expect(bouton?.getAttribute('aria-pressed')).toBe('true');
    expect(bouton?.hasAttribute('aria-label')).toBe(false);
    expect(bouton?.querySelector('svg')?.getAttribute('aria-label')).toBe('Je n’aime plus');
    expect(bouton?.querySelector('svg')?.getAttribute('aria-hidden')).toBeNull();
    expect(bouton?.textContent).toContain('4');
  });

  test('cœur VIDE : le glyphe dit « J’aime » — le nom suit l’état, pas l’inverse', async () => {
    const host = await monter(liste({ comments: [comment({ isLikedByMe: false })], gestures: gestesDe() }));
    const bouton = host.querySelector<HTMLButtonElement>('[data-comment-gesture="like"]');
    expect(bouton?.getAttribute('aria-pressed')).toBe('false');
    expect(bouton?.querySelector('svg')?.getAttribute('aria-label')).toBe('J’aime');
  });

  test('MODIFIER ouvre le champ SUR PLACE, et « Enregistrer » remonte le texte nettoyé', async () => {
    const gestes = gestesDe();
    const host = await monter(liste({ comments: [comment({ id: 'mien', author: MIEN })], gestures: gestes }));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="edit"]')?.click());

    const champ = host.querySelector<HTMLTextAreaElement>('[data-comment-edit-field="mien"]');
    expect(champ?.value).toBe('Bonjour');
    await act(async () => {
      if (champ === null) throw new Error('champ absent');
      champ.value = '  Bonjour à tous  ';
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-edit-save]')?.click());

    expect(gestes.journal).toEqual(['edit:mien:Bonjour à tous']);
    expect(host.querySelector('[data-comment-edit-field="mien"]')).toBeNull();
  });

  test('« Enregistrer » est DÉSACTIVÉ sur un texte vide — annoncé, jamais un bouton actif qui ne fait rien', async () => {
    const host = await monter(liste({ comments: [comment({ id: 'mien', author: MIEN, content: '' })], gestures: gestesDe() }));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="edit"]')?.click());
    expect(host.querySelector<HTMLButtonElement>('[data-comment-edit-save]')?.disabled).toBe(true);
  });

  test('« Annuler » referme sans rien remonter — le texte lu revient', async () => {
    const gestes = gestesDe();
    const host = await monter(liste({ comments: [comment({ id: 'mien', author: MIEN })], gestures: gestes }));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="edit"]')?.click());
    expect(host.querySelector('[data-comment-edit-field="mien"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-edit-cancel]')?.click());
    expect(host.querySelector('[data-comment-edit-field="mien"]')).toBeNull();
    expect(host.querySelector('[data-comment-row] p')?.textContent).toBe('Bonjour');
    expect(gestes.journal).toEqual([]);
  });

  /**
   * **SUPPRIMER DEMANDE DEUX GESTES, COMME SUR iOS** (revue-correction #7135,
   * défaut majeur 5). `CommentRowView.swift:364` enferme le verbe destructeur
   * dans un menu « … » : ouvrir, puis choisir. Le web le posait à découvert,
   * à 4 px du verbe RÉVERSIBLE, et détruisait au PREMIER tap — un pouce qui
   * visait « Modifier » atteignait « Supprimer », sans dialogue et sans
   * annulation. La confirmation sur place coûte le même second geste qu'iOS
   * sans imposer une feuille modale.
   */
  test('SUPPRIMER n’appelle RIEN au premier tap — il s’arme, et le second geste détruit', async () => {
    const gestes = gestesDe();
    const host = await monter(liste({ comments: [comment({ id: 'mien', author: MIEN })], gestures: gestes }));
    const bouton = () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="delete"]');

    await act(async () => bouton()?.click());
    expect(gestes.journal).toEqual([]);
    expect(bouton()?.hasAttribute('data-comment-delete-armed')).toBe(true);
    expect(bouton()?.textContent).toBe('Confirmer');

    await act(async () => bouton()?.click());
    expect(gestes.journal).toEqual(['delete:mien']);
  });

  /**
   * **ET L'ÉCART ENTRE LES DEUX VERBES SE MESURE AU RECTANGLE, pas au
   * texte** : 4 px séparaient deux cibles adjacentes dont l'une est
   * irréversible — moitié moins que le minimum. Le témoin lit le style plutôt
   * que la géométrie (happy-dom ne met pas en page), et l'invariant de
   * navigateur qui mesure les rectangles vit dans `check-post-comments.mjs`.
   */
  test('« Supprimer » est ÉCARTÉ de « Modifier » — le tap irréversible n’est pas collé au réversible', async () => {
    const host = await monter(liste({ comments: [comment({ author: MIEN })], gestures: gestesDe() }));
    const marge = host.querySelector<HTMLElement>('[data-comment-gesture="delete"]')?.style.marginInlineStart ?? '';
    expect(Number.parseInt(marge, 10)).toBeGreaterThanOrEqual(8);
  });

  /** L'ÉTAT D'ERREUR EST VISIBLE ET SE REJOUE — sans ce constat, la rangée
   * revenue à son état d'avant serait indiscernable d'un tap non pris. */
  test('un geste NON CONFIRMÉ est annoncé sur SA rangée, et offre de réessayer', async () => {
    const gestes = gestesDe({
      failureOf: (id) =>
        id === 'c1' ? { message: 'comment.like.error', issue: 'unconfirmed' } : undefined,
    });
    const host = await monter(liste({ comments: [comment(), comment({ id: 'c2' })], gestures: gestes }));

    const alerte = host.querySelector('[data-comment-row="c1"] [data-comment-gesture-error]');
    expect(alerte?.getAttribute('data-comment-gesture-issue')).toBe('unconfirmed');
    expect(alerte?.textContent).toContain('n’a pas été enregistré');
    expect(host.querySelector('[data-comment-row="c2"] [data-comment-gesture-error]')).toBeNull();

    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture-retry]')?.click());
    expect(gestes.journal).toEqual(['retry:c1']);
  });

  /**
   * **« RÉESSAYER » N'ÉTAIT OFFERT QUE LÀ OÙ IL NE PEUT PAS ABOUTIR** (défaut
   * majeur 1). `outcome.ts:40-55` déclare qu'un refus PERMANENT n'offre pas de
   * rejeu — « aucun rejeu ne peut aboutir sans que l'utilisateur agisse
   * D'ABORD ailleurs » —, et c'était exactement la seule classe que la rangée
   * enregistrait, donc la seule qui posait le bouton. Un 403 retapé rendait la
   * même alerte indéfiniment. Le refus dit maintenant sa RAISON à la place.
   *
   * LE TÉMOIN SE POSE SUR LES DEUX CLASSES, jamais sur une seule : le témoin
   * d'avant était vert sur l'une comme sur l'autre.
   */
  test('un REFUS PERMANENT n’offre AUCUN rejeu — il dit sa raison', async () => {
    const gestes = gestesDe({
      failureOf: () => ({ message: 'comment.like.error', issue: 'refused', reason: 'comment.like.limit' }),
    });
    const host = await monter(liste({ comments: [comment()], gestures: gestes }));

    const alerte = host.querySelector('[data-comment-row="c1"] [data-comment-gesture-error]');
    expect(alerte?.getAttribute('role')).toBe('alert');
    expect(alerte?.getAttribute('data-comment-gesture-issue')).toBe('refused');
    expect(alerte?.textContent).toContain('Cinq réactions au maximum par personne.');
    expect(host.querySelector('[data-comment-gesture-retry]')).toBeNull();
  });

  /**
   * **LE FOCUS REVIENT D'OÙ IL EST PARTI** (défaut majeur 6) — la moitié
   * manquante de `473a1289a5`. L'aller était posé ; au RETOUR, « Annuler » et
   * « Enregistrer » démontaient le champ ET leurs deux boutons sans rendre le
   * focus à rien, et qui navigue au clavier repartait du haut du document.
   * Trois des quatre gestes de cette surface perdaient la place du lecteur.
   */
  test('« Annuler » REND le focus au bouton « Modifier » — le retour vaut l’aller', async () => {
    const host = await monter(liste({ comments: [comment({ author: MIEN })], gestures: gestesDe() }));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="edit"]')?.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-edit-cancel]')?.click());
    expect(document.activeElement?.getAttribute('data-comment-gesture')).toBe('edit');
  });

  test('« Enregistrer » aussi — le focus ne retombe pas sur le document', async () => {
    const host = await monter(liste({ comments: [comment({ author: MIEN })], gestures: gestesDe() }));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="edit"]')?.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-edit-save]')?.click());
    expect(document.activeElement?.getAttribute('data-comment-gesture')).toBe('edit');
  });

  /** SUPPRIMER emporte la rangée ENTIÈRE : la destination se lit AVANT
   * l'appel, tant qu'il reste un nœud d'où regarder le voisinage. */
  test('SUPPRIMER donne le focus à la rangée SUIVANTE — la place du lecteur ne disparaît pas avec la rangée', async () => {
    const host = await monter(
      liste({
        comments: [comment({ id: 'mien', author: MIEN }), comment({ id: 'apres' })],
        gestures: gestesDe(),
      }),
    );
    await supprimer(host, '[data-comment-row="mien"] [data-comment-gesture="delete"]');
    const actif = document.activeElement;
    expect(actif?.getAttribute('data-comment-gesture')).toBe('like');
    expect(actif?.closest('[data-comment-row]')?.getAttribute('data-comment-row')).toBe('apres');
  });
});

describe('CommentComposer — le champ se vide avant le réseau, et revient sur un refus', () => {
  const taper = async (host: HTMLElement, texte: string) => {
    const champ = host.querySelector<HTMLTextAreaElement>('[data-comment-field]');
    if (champ === null) throw new Error('champ absent');
    await act(async () => {
      champ.value = texte;
      /* Sous happy-dom, `onChange` d'un champ ne reçoit JAMAIS un `input`
         dispatché — seul `onInput` se déclenche (convention du dépôt,
         `legende-plan.test.tsx`). C'est ce témoin qui a montré que le
         composeur lisait `onChange`, donc n'apprenait la frappe qu'au blur. */
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  test('un visiteur anonyme n’a PAS de champ — la passerelle exige un compte (loi 4)', async () => {
    const host = await monter(<CommentComposer language="fr" canWrite={false} onSend={async () => ({ ok: true })} />);
    expect(host.querySelector('[data-comment-field]')).toBeNull();
    expect(host.querySelector('[data-comment-composer="signed-out"]')?.textContent).toContain('Connectez-vous');
  });

  test('le bouton d’envoi est DÉSACTIVÉ à vide — annoncé, jamais un bouton actif qui ne fait rien', async () => {
    const host = await monter(<CommentComposer language="fr" canWrite onSend={async () => ({ ok: true })} />);
    expect(host.querySelector<HTMLButtonElement>('[data-comment-send]')?.disabled).toBe(true);
    await taper(host, 'salut');
    expect(host.querySelector<HTMLButtonElement>('[data-comment-send]')?.disabled).toBe(false);
  });

  test('envoi réussi : le champ est VIDE — l’optimiste vit dans la liste, pas deux fois', async () => {
    const envoyes: string[] = [];
    const host = await monter(
      <CommentComposer
        language="fr"
        canWrite
        onSend={async (c) => {
          envoyes.push(c);
          return { ok: true };
        }}
      />,
    );
    await taper(host, 'salut');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-send]')?.click());
    expect(envoyes).toEqual(['salut']);
    expect(host.querySelector<HTMLTextAreaElement>('[data-comment-field]')?.value).toBe('');
  });

  test('REFUS : le texte REVIENT au lecteur, et la cause est annoncée', async () => {
    const host = await monter(
      <CommentComposer language="fr" canWrite onSend={async () => ({ ok: false, message: 'comment.send.error' })} />,
    );
    await taper(host, 'salut');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-send]')?.click());
    expect(host.querySelector<HTMLTextAreaElement>('[data-comment-field]')?.value).toBe('salut');
    expect(host.querySelector('[data-comment-notice]')?.textContent).toContain('n’a pas pu être publié');
  });

  /**
   * **ET L'ANNONCE SE VOIT** (revue-correction #7135, défaut majeur 8). Elle
   * vivait en `sr-only`, mesurée à 1 × 1 px : quand la passerelle refusait une
   * publication, tout ce qu'un lecteur qui VOIT obtenait était un champ qui se
   * vide et une rangée fantôme qui reste. La même surface affiche pourtant en
   * clair l'échec d'un GESTE de rangée — l'écran parlait deux langues.
   *
   * Le témoin lit la CLASSE et l'ENCRE, pas une géométrie : happy-dom ne met
   * pas en page, et l'invariant de pixels vit dans `check-post-comments.mjs`.
   */
  test('l’annonce d’un refus n’est PAS `sr-only` — elle porte l’encre d’erreur, comme sur une rangée', async () => {
    const host = await monter(
      <CommentComposer language="fr" canWrite onSend={async () => ({ ok: false, message: 'comment.send.error' })} />,
    );
    await taper(host, 'salut');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-send]')?.click());
    const annonce = host.querySelector<HTMLElement>('[data-comment-notice]');
    expect(annonce?.className).not.toContain('sr-only');
    expect(annonce?.getAttribute('data-comment-notice-issue')).toBe('refused');
    expect(annonce?.style.color).toBe('var(--color-error)');
    /* La VOIX n'y perd rien : `role` et `aria-live` restent. */
    expect(annonce?.getAttribute('role')).toBe('status');
    expect(annonce?.getAttribute('aria-live')).toBe('polite');
  });

  test('… et un NON CONFIRMÉ se voit aussi, en encre neutre — rien n’est perdu, rien n’est acquis', async () => {
    const host = await monter(
      <CommentComposer
        language="fr"
        canWrite
        onSend={async () => ({ ok: true, message: 'comment.gesture.unconfirmed' })}
      />,
    );
    await taper(host, 'salut');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-send]')?.click());
    const annonce = host.querySelector<HTMLElement>('[data-comment-notice]');
    expect(annonce?.className).not.toContain('sr-only');
    expect(annonce?.getAttribute('data-comment-notice-issue')).toBe('unconfirmed');
    expect(annonce?.style.color).not.toBe('var(--color-error)');
    /* ET LA CAUSE NE MENT PAS : un 5xx n'est pas une coupure réseau. */
    expect(annonce?.textContent).not.toContain('hors ligne');
  });

  test('PARTI MAIS NON CONFIRMÉ : le champ se vide QUAND MÊME, et l’état est DIT', async () => {
    /* `ok: true` avec un message — l'optimiste reste posé dans la liste, et
       le silence serait indiscernable d'une confirmation. */
    const host = await monter(
      <CommentComposer language="fr" canWrite onSend={async () => ({ ok: true, message: 'comment.send.pending' })} />,
    );
    await taper(host, 'salut');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-send]')?.click());
    expect(host.querySelector<HTMLTextAreaElement>('[data-comment-field]')?.value).toBe('');
    expect(host.querySelector('[data-comment-notice]')?.textContent).toContain('non confirmé');
  });
});
