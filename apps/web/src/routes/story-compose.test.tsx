import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, test } from 'bun:test';

import type { ProtectedMediaDeps } from '@/lib/api/protected-media';
import { sessionStore } from '@/lib/api/session';
import type { PublicationKind } from '@/lib/stories/publication-kind';
import { createStudioDraftStore, type StudioDraftStore } from '@/lib/stories/studio-draft-store';
import { buttonNamed } from '@/test-support/act-mount';
import StoryComposeScreen from './story-compose';
import {
  VIEWER_ID,
  fakeRect,
  flush,
  harness,
  image,
  mount,
  onePageSnapshot,
  publishButton,
  registerStudioBench,
  removeButton,
  selectFile,
  typeText,
  unmountAll,
} from '@/test-support/story-studio-bench';

/**
 * `StoryComposeScreen` (#6900) — le critère de fin (Publier inerte sans
 * contenu, aperçu par le moteur dès qu'un fond est choisi, brouillon relu
 * après remontage sur échec) ET les défauts relevés en revue-correction : un
 * média PRÊT restauré se publie sans remontée, une intention de publier hors
 * ligne part au retour du réseau, un invité est refusé avant tout octet, un
 * fichier hors de sa porte est refusé, une montée échouée se réessaie.
 *
 * Tout le réseau passe par `StoryStudioDeps` INJECTÉ (transport JSON, client
 * TUS, magasin de brouillons) — aucun `globalThis.fetch` rebranché, aucune
 * dépendance à l'ordre d'import des singletons.
 */

registerStudioBench();

describe('StoryComposeScreen — le bouton Publier est INERTE sans contenu (loi 4)', () => {
  test('brouillon vide : désactivé, et un clic n’envoie rien', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    expect(publishButton(el)?.disabled).toBe(true);
    act(() => publishButton(el)!.click());
    await flush();
    expect(bench.posts).toHaveLength(0);
  });

  test('un texte l’ARME, le vider le désarme', () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    expect(publishButton(el)?.disabled).toBe(false);
    typeText(el, '   ');
    expect(publishButton(el)?.disabled).toBe(true);
  });
});

describe('StoryComposeScreen — l’aperçu par le moteur PARTAGÉ (D-79)', () => {
  test('[data-scene-player] monte dès qu’un fond est choisi, sur l’URL LOCALE, et la montée finit « Prêt »', async () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-scene-player]')).toBeNull();

    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);

    expect(el.querySelector('[data-scene-player]')).not.toBeNull();
    expect(el.querySelector('[data-scene-player] img')?.getAttribute('src')?.startsWith('blob:')).toBe(true);
    expect(el.querySelector('[data-asset-phase="ready"]')?.textContent).toContain('Prêt');
  });

  test('le champ de texte porte la langue composée (`lang`)', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('#story-studio-text')?.getAttribute('lang')).toBeTruthy();
  });

  test('le texte tapé se DESSINE par le moteur ([data-scene-text]) — jamais SEULEMENT dans le champ de saisie (défaut 5, revue-correction)', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-scene-text]')).toBeNull();

    typeText(el, 'Recette studio');
    expect(el.querySelector('[data-scene-text]')?.textContent).toBe('Recette studio');
  });

  test('le champ de saisie est TRANSPARENT — le texte visible vient du moteur, pas d’une seconde peinture (défaut 5)', () => {
    const el = mount(harness({}).deps);
    const textarea = el.querySelector('#story-studio-text');
    expect(textarea?.getAttribute('class')).toContain('text-transparent');
    expect(textarea?.getAttribute('style') ?? '').not.toContain('text-shadow');
  });

  test('la saisie ADOPTE la boîte RÉELLEMENT peinte par [data-scene-text], au pixel près — jamais une largeur/hauteur fixes (défaut 1, revue-correction)', () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    const stage = el.querySelector<HTMLElement>('[data-scene-stage]');
    const textNode = el.querySelector<HTMLElement>('[data-scene-text]');
    expect(stage).not.toBeNull();
    expect(textNode).not.toBeNull();

    // La carte occupe (50,100)-(350,600) sur l'écran ; le moteur peint le
    // texte dans une boîte NARROW, décentrée verticalement — exactement ce
    // qu'un texte court, shrink-to-fit, rend en pratique.
    stage!.getBoundingClientRect = () => fakeRect({ top: 100, left: 50, width: 300, height: 500 });
    textNode!.getBoundingClientRect = () => fakeRect({ top: 260, left: 140, width: 120, height: 30 });

    // Un second caractère force `useLayoutEffect` (dépendance `draft.text`) à
    // remesurer SYNCHRONEMENT, dans le MÊME tour — jamais un `flush` qui
    // masquerait un défaut d'alignement d'un frame.
    typeText(el, 'Bonjour!');

    const textarea = el.querySelector<HTMLTextAreaElement>('#story-studio-text')!;
    // Relatif à la carte : top 260-100=160, left 140-50=90.
    expect(textarea.style.top).toBe('160px');
    expect(textarea.style.left).toBe('90px');
    expect(textarea.style.width).toBe('120px');
    expect(textarea.style.height).toBe('30px');
    // La forme centrée par défaut (translation à 50 %) ne doit PLUS gouverner
    // une fois la boîte réelle connue — elle décalait le curseur d'une ligne
    // entière au-dessus du texte (défaut 1).
    expect(textarea.style.transform).toBe('');
  });
});

describe('StoryComposeScreen — le son de fond s’ÉCOUTE, avec un vrai bouton (défaut 6, revue-correction)', () => {
  test('aucun son posé ⇒ ni lecteur audio ni bouton', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-story-studio-sound]')).toBeNull();
    expect(el.querySelector('[data-story-studio-sound-toggle]')).toBeNull();
  });

  test('un son posé ⇒ un <audio> sur l’URL LOCALE et un bouton 44 px qui COUPE/RÉTABLIT effectivement le son', async () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'sound', new File([new Uint8Array([1, 2, 3])], 'son.m4a', { type: 'audio/mp4' }));
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);

    const soundAudio = el.querySelector<HTMLAudioElement>('[data-story-studio-sound]');
    expect(soundAudio?.getAttribute('src')?.startsWith('blob:')).toBe(true);

    const toggle = el.querySelector<HTMLButtonElement>('[data-story-studio-sound-toggle]')!;
    expect(toggle.getBoundingClientRect).toBeDefined();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(soundAudio?.muted).toBe(true);

    act(() => toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector<HTMLAudioElement>('[data-story-studio-sound]')?.muted).toBe(false);

    act(() => toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector<HTMLAudioElement>('[data-story-studio-sound]')?.muted).toBe(true);
  });
});

/**
 * #7015, revue-correction — **LE TROISIÈME `<audio>` DE LA MÊME SOURCE ÉLUE.**
 *
 * L'aperçu du studio élit sa piste avec `electBackgroundTrack`, la MÊME
 * fonction que le lecteur de story et celui des Réels — et posait sa `src`
 * TELLE QUELLE. Sur un fichier local (`blob:`) c'est juste ; sur une piste
 * servie par `GET /api/v1/static/…` — la route AUTHENTIFIÉE — la balise part
 * sans en-tête et rend `401`.
 *
 * **CE QUE LA MESURE DIT, ET CE QU'ELLE NE DIT PAS.** La bibliothèque de sons
 * n'est PAS encore branchée au studio web (`background-sound.ts` : « `library`
 * reste HORS PÉRIMÈTRE ») : aujourd'hui, `draft.sound.previewUrl` est un
 * `blob:` (fichier choisi) ou un `/api/v1/attachments/file/…` (brouillon
 * restauré, route SANS authentification). Cette surface n'est donc pas
 * atteignable en production À CETTE DATE — elle le devient au premier
 * emprunt, et le brouillon RESTAURÉ est le chemin exact par lequel une piste
 * empruntée y entrerait. Le témoin passe par lui : le studio partage désormais
 * le SITE UNIQUE du transport protégé, au lieu d'attendre que la bibliothèque
 * rouvre le défaut que ce lot vient de fermer deux fois.
 */
const SON_EMPRUNTE = '/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a';

function draftsAvecSonEmprunte(): StudioDraftStore {
  const drafts = createStudioDraftStore(null);
  drafts.set(
    VIEWER_ID,
    onePageSnapshot({ texts: [{ id: 't1', text: 'Sur une piste empruntée' }], sound: { postMediaId: 'pm-lib', fileUrl: SON_EMPRUNTE } }),
  );
  return drafts;
}

/** Le type que la route SERT (`EXT_TO_MIME`, `soundFormats.ts`) — un `200` non
 * typé n'est plus une piste depuis la revue-correction. */
function mediaDepsDeTest(options: { readonly typeServi?: string } = {}): ProtectedMediaDeps {
  return {
    credential: () => ({ kind: 'registered', token: 'jeton-du-temoin' }),
    fetchImpl: (() =>
      Promise.resolve(new Response(new Blob(['octets'], { type: options.typeServi ?? 'audio/x-m4a' }), { status: 200 }))) as typeof fetch,
    createObjectURL: () => 'blob:meeshy/studio',
    revokeObjectURL: () => undefined,
  };
}

describe('StoryComposeScreen — la piste PROTÉGÉE de l’aperçu (#7015)', () => {
  test('l’URL protégée n’est JAMAIS posée en `src` — l’aperçu reçoit une URL d’objet', async () => {
    const el = mount({ ...harness({ drafts: draftsAvecSonEmprunte() }).deps, media: mediaDepsDeTest() });
    await flush(() => el.querySelector('[data-scene-player]') !== null && el.querySelector('[data-story-studio-sound]') !== null);

    const soundAudio = el.querySelector<HTMLAudioElement>('[data-story-studio-sound]');
    expect(soundAudio?.getAttribute('src')).toBe('blob:meeshy/studio');
    expect(soundAudio?.getAttribute('src')).not.toContain('/api/v1/static/');
  });

  test('une piste indisponible ⇒ ni lecteur ni bouton — jamais un contrôle INERTE (loi 4)', async () => {
    const el = mount({ ...harness({ drafts: draftsAvecSonEmprunte() }).deps, media: mediaDepsDeTest({ typeServi: 'text/html' }) });
    await flush(() => el.querySelector('[data-scene-player]') !== null);
    expect(el.querySelector('[data-story-studio-sound]')).toBeNull();
    // Le bouton COUPER/RÉTABLIR d'une piste qui ne jouera jamais n'aurait
    // aucun effet : il ne se dessine pas.
    expect(el.querySelector('[data-story-studio-sound-toggle]')).toBeNull();
  });
});

describe('StoryComposeScreen — le brouillon SURVIT, et un média PRÊT n’est jamais remonté', () => {
  test('un POST /posts refusé garde le texte ; relu après remontage', async () => {
    const drafts = createStudioDraftStore(null);
    const el = mount(harness({ postsStatus: () => 500, drafts }).deps);
    typeText(el, 'Ma légende');
    act(() => publishButton(el)!.click());
    await flush(() => el.querySelector('[role="alert"]') !== null);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('La passerelle est indisponible.');
    expect(publishButton(el)?.disabled).toBe(false);

    unmountAll();
    const remounted = mount(harness({ drafts }).deps);
    expect(remounted.querySelector<HTMLTextAreaElement>('#story-studio-text')?.value).toBe('Ma légende');
  });

  test('un fond DÉJÀ MONTÉ, restauré après un échec, se publie avec SON postMediaId — aucune nouvelle montée', async () => {
    const drafts = createStudioDraftStore(null);
    const failing = harness({ postsStatus: () => 500, drafts });
    const el = mount(failing.deps);
    selectFile(el, 'visual', image());
    typeText(el, 'Au soleil');
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    act(() => publishButton(el)!.click());
    await flush(() => el.querySelector('[role="alert"]') !== null);
    expect(failing.posts).toHaveLength(1);

    unmountAll();
    const retrying = harness({ drafts });
    const remounted = mount(retrying.deps);
    expect(remounted.querySelector('[data-asset-phase="ready"]')).not.toBeNull();
    expect(publishButton(remounted)?.disabled).toBe(false);

    act(() => publishButton(remounted)!.click());
    await flush(() => retrying.posts.length > 0);

    expect(retrying.uploadCreations()).toBe(0);
    expect(retrying.posts[0]!.mediaIds).toEqual(['pm-1']);
    const effects = retrying.posts[0]!.storyEffects as { scenes: Array<{ objects: Array<{ payload: Record<string, unknown> }> }> };
    expect(effects.scenes[0]!.objects.map((o) => o.payload.postMediaId).filter(Boolean)).toEqual(['pm-1']);
  });

  test('une publication qui RÉUSSIT purge le brouillon', async () => {
    const drafts = createStudioDraftStore(null);
    const el = mount(harness({ drafts }).deps);
    typeText(el, 'Une story qui part');
    await flush(() => drafts.get(VIEWER_ID) !== null);
    act(() => publishButton(el)!.click());
    await flush(() => drafts.get(VIEWER_ID) === null);
    expect(drafts.get(VIEWER_ID)).toBeNull();
  });

  test('une story PUBLIÉE ne peut pas repartir : Publier reste inerte jusqu’à la navigation', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Une seule fois');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    await flush();
    expect(publishButton(el)?.disabled).toBe(true);
    act(() => publishButton(el)!.click());
    await flush();
    expect(bench.posts).toHaveLength(1);
  });

  test('retirer le fond a un EFFET : plus de moteur, plus de postMediaId envoyé, et le retrait est persisté', async () => {
    const drafts = createStudioDraftStore(null);
    const bench = harness({ drafts });
    const el = mount(bench.deps);
    selectFile(el, 'visual', image());
    typeText(el, 'Sans fond finalement');
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);

    act(() => removeButton(el, 'Retirer le fond')!.click());
    await flush();
    // Le TEXTE reste : un document texte seul est un fond de COULEUR + texte
    // (`composeStoryCanvas` — « une story sans visuel porte un fond de
    // couleur »), donc le moteur continue de peindre — sans image, ni
    // postMediaId (défaut 5, revue-correction : le texte se dessine par le
    // moteur, y compris quand il est la SEULE forme posée).
    expect(el.querySelector('[data-scene-player] img')).toBeNull();
    expect(el.querySelector('[data-scene-text]')?.textContent).toBe('Sans fond finalement');
    expect(drafts.get(VIEWER_ID)?.pages[0]?.background).toBeUndefined();

    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]!.mediaIds).toEqual([]);
  });
});

describe('StoryComposeScreen — les états refus, hors-ligne et échec de montée', () => {
  test('un INVITÉ lit le refus avant de composer : aucune porte de fichier', () => {
    act(() => {
      sessionStore.getState().establishGuest({
        sessionToken: 'anon',
        guest: { participantId: null, nickname: 'Invité', conversationId: 'c1', link: 'l1', mayWrite: true },
      });
    });
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-story-studio-refusal]')?.textContent).toContain('Un compte est nécessaire pour créer une story.');
    expect(el.querySelector('input[type="file"]')).toBeNull();
  });

  test('hors ligne, Publier ARME l’intention sans rien envoyer ; au retour du réseau, la story part seule', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Écrit dans le métro');
    act(() => publishButton(el)!.click());
    await flush();
    expect(bench.posts).toHaveLength(0);
    expect(publishButton(el)?.textContent).toBe('En attente du réseau…');

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    await flush(() => bench.posts.length > 0);
    expect(bench.posts).toHaveLength(1);
    // Défaut 4 (revue-correction) : le texte de scène ne se recopie JAMAIS
    // dans `content` — le studio n'a pas de champ légende, et l'envoyer y
    // ferait rendre le texte DEUX FOIS chez le lecteur.
    expect('content' in bench.posts[0]!).toBe(false);
    const effects = bench.posts[0]!.storyEffects as { scenes: Array<{ objects: Array<{ kind: string; payload: Record<string, unknown> }> }> };
    const textObject = effects.scenes[0]!.objects.find((o) => o.kind === 'text');
    expect(textObject?.payload.text).toBe('Écrit dans le métro');
  });

  test('une intention armée hors ligne puis VIDÉE ne ment pas au retour du réseau', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Finalement non');
    act(() => publishButton(el)!.click());
    await flush();
    typeText(el, '');
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(bench.posts).toHaveLength(0);
    expect(publishButton(el)?.textContent).toBe('Publier la story');
  });

  test('une image posée par la porte du SON est refusée, et rien ne part', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    selectFile(el, 'sound', image());
    await flush();
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Choisissez un fichier audio.');
    expect(bench.uploadCreations()).toBe(0);
  });

  test('une montée coupée se DIT, bloque Publier, et « Réessayer » la relance sur le même fichier', async () => {
    let failing = true;
    const bench = harness({ uploadsFail: () => failing });
    const el = mount(bench.deps);
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-asset-phase="failed"]') !== null);

    expect(el.querySelector('[data-asset-phase="failed"]')?.textContent).toContain('Réseau indisponible.');
    expect(publishButton(el)?.disabled).toBe(true);

    failing = false;
    act(() => buttonNamed(el, 'Réessayer')!.click());
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    expect(el.querySelector('[data-asset-phase="ready"]')).not.toBeNull();
    expect(publishButton(el)?.disabled).toBe(false);
  });
});

describe('StoryComposeScreen — le COMPOSER UNIQUE : `[Publier … | ▾]` (#7497)', () => {
  const kindToggle = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-publish-kind-toggle]');
  const kindChoice = (kind: PublicationKind) => document.querySelector<HTMLButtonElement>(`[data-publish-kind-choice="${kind}"]`);

  test('sans toucher au chevron, la story part comme indiqué — `type: STORY`, et la capsule le NOMME', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    expect(publishButton(el)?.textContent).toBe('Publier la story');
    typeText(el, 'Une story');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]?.type).toBe('STORY');
  });

  test('ouvert depuis la porte du fil, le studio publie un POST — le même canevas', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'POST');
    expect(publishButton(el)?.textContent).toBe('Publier le post');
    expect(el.querySelector('h1')?.textContent).toBe('Nouvelle publication');
    typeText(el, 'Un post');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]?.type).toBe('POST');
    expect((bench.posts[0]?.storyEffects as { v: number } | undefined)?.v).toBe(3);
  });

  test('le chevron offre les trois formats et PUBLIE au format choisi', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Finalement un post');
    act(() => kindToggle(el)!.click());
    expect(['STORY', 'POST', 'REEL'].map((kind) => kindChoice(kind as PublicationKind) !== null)).toEqual([true, true, true]);
    act(() => kindChoice('POST')!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts).toHaveLength(1);
    expect(bench.posts[0]?.type).toBe('POST');
  });

  test('un réel de texte seul se REFUSE en le disant — ni la capsule ni le menu ne le publient', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'REEL');
    typeText(el, 'Un réel sans vidéo');
    expect(el.querySelector('[data-publish-refusal]')?.getAttribute('data-publish-refusal')).toBe('reel-without-qualifying-media');
    expect(publishButton(el)?.disabled).toBe(true);
    act(() => kindToggle(el)!.click());
    expect(kindChoice('REEL')?.getAttribute('aria-disabled')).toBe('true');
    act(() => kindChoice('REEL')!.click());
    await flush();
    expect(bench.posts).toHaveLength(0);
  });
});

describe('StoryComposeScreen — l’audience se choisit, voyage et se retient (#7683)', () => {
  const pastille = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-audience]');
  const choice = (visibility: string) => document.querySelector<HTMLButtonElement>(`[data-audience-choice="${visibility}"]`);
  const dialogOpen = () => document.querySelector('dialog[open]');
  const kindToggle = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-publish-kind-toggle]');
  const kindChoice = (kind: PublicationKind) => document.querySelector<HTMLButtonElement>(`[data-publish-kind-choice="${kind}"]`);
  /** La feuille se charge À LA DEMANDE (`lazy`, comme `LanguageSheet`) : son
   * premier rendu attend le module, le témoin attend la feuille OUVERTE. */
  async function openSheet(host: ParentNode): Promise<void> {
    act(() => pastille(host)!.click());
    await flush(() => choice('PUBLIC') !== null);
  }

  test('choisir « Amis » puis publier ⇒ le corps porte `visibility: FRIENDS`', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Pour mes contacts');
    await openSheet(el);
    act(() => choice('FRIENDS')!.click());
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]?.visibility).toBe('FRIENDS');
  });

  test('ne rien choisir, publier ⇒ la clé `visibility` est ABSENTE (le défaut reste une règle serveur, D-111)', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Sans audience choisie');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(Object.hasOwn(bench.posts[0]!, 'visibility')).toBe(false);
  });

  test('choisir « Amis », publier ⇒ la mémoire survit à la purge du brouillon, et un remontage la relit', async () => {
    const drafts = createStudioDraftStore(null);
    const bench = harness({ drafts });
    const el = mount(bench.deps);
    typeText(el, 'Une story pour mes amis');
    await openSheet(el);
    act(() => choice('FRIENDS')!.click());
    act(() => publishButton(el)!.click());
    await flush(() => drafts.get(VIEWER_ID) === null);

    expect(drafts.get(VIEWER_ID)).toBeNull();
    expect(drafts.lastAudience(VIEWER_ID)).toBe('FRIENDS');

    unmountAll();
    const remounted = harness({ drafts });
    const el2 = mount(remounted.deps);
    expect(pastille(el2)?.getAttribute('data-audience-value')).toBe('FRIENDS');
    expect(pastille(el2)?.getAttribute('data-audience-source')).toBe('chosen');

    typeText(el2, 'Encore une story');
    act(() => publishButton(el2)!.click());
    await flush(() => remounted.posts.length > 0);
    expect(remounted.posts[0]?.visibility).toBe('FRIENDS');
  });

  test('un brouillon SEMÉ avec la mémoire seule (aucun snapshot) ⇒ la pastille lit la mémoire à l’ouverture', () => {
    const drafts = createStudioDraftStore(null);
    drafts.rememberAudience(VIEWER_ID, 'COMMUNITY');
    const el = mount(harness({ drafts }).deps);
    expect(pastille(el)?.getAttribute('data-audience-value')).toBe('COMMUNITY');
    expect(pastille(el)?.getAttribute('data-audience-source')).toBe('chosen');
  });

  test('le brouillon (rang 1) prime sur la mémoire (rang 2)', () => {
    const drafts = createStudioDraftStore(null);
    drafts.set(VIEWER_ID, onePageSnapshot({ texts: [{ id: 't1', text: 'x' }], visibility: 'PRIVATE' }));
    drafts.rememberAudience(VIEWER_ID, 'COMMUNITY');
    const el = mount(harness({ drafts }).deps);
    expect(pastille(el)?.getAttribute('data-audience-value')).toBe('PRIVATE');
  });

  test('un brouillon NOMINATIF (version antérieure, donnée altérée) ne part jamais : la mémoire prend le relais, le corps ne porte pas ONLY', async () => {
    const drafts = createStudioDraftStore(null);
    drafts.set(VIEWER_ID, onePageSnapshot({ texts: [{ id: 't1', text: 'Brouillon ancien' }], visibility: 'ONLY' }));
    drafts.rememberAudience(VIEWER_ID, 'COMMUNITY');
    const bench = harness({ drafts });
    const el = mount(bench.deps);
    expect(pastille(el)?.getAttribute('data-audience-value')).toBe('COMMUNITY');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]?.visibility).toBe('COMMUNITY');
  });

  test('la feuille offre les six, dans l’ordre iOS ; ONLY/EXCEPT sont grisés AVEC leur raison, sans effet', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Un texte');
    await openSheet(el);

    expect(dialogOpen()).not.toBeNull();
    const rows = Array.from(document.querySelectorAll<HTMLElement>('dialog[open] [data-audience-choice]'));
    expect(rows.map((row) => row.getAttribute('data-audience-choice'))).toEqual(['PUBLIC', 'COMMUNITY', 'FRIENDS', 'EXCEPT', 'ONLY', 'PRIVATE']);

    for (const refused of ['ONLY', 'EXCEPT']) {
      const row = choice(refused)!;
      expect(row.getAttribute('aria-disabled')).toBe('true');
      expect(row.querySelector('[data-audience-caption]')?.textContent).toBe('Le choix de personnes n’est pas encore disponible sur le web.');
    }

    act(() => choice('ONLY')!.click());
    expect(dialogOpen()).not.toBeNull();
    expect(pastille(el)?.getAttribute('data-audience-source')).toBe('default');

    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(Object.hasOwn(bench.posts[0]!, 'visibility')).toBe(false);
  });

  test('chaque rangée porte SON glyphe — six tracés distincts (PostVisibility.icon)', async () => {
    const el = mount(harness({}).deps);
    await openSheet(el);
    const traces = Array.from(document.querySelectorAll('dialog[open] [data-audience-choice]')).map((row) => row.querySelector('svg')?.innerHTML);
    expect(traces).toHaveLength(6);
    expect(new Set(traces).size).toBe(6);
  });

  test('rien choisi : la feuille désigne le DÉFAUT comme rangée courante, « par défaut » — la même chose que la pastille', async () => {
    const el = mount(harness({}).deps, 'POST');
    await openSheet(el);
    const current = Array.from(document.querySelectorAll('dialog[open] [data-audience-choice][aria-current="true"]'));
    expect(current.map((row) => row.getAttribute('data-audience-choice'))).toEqual(['PUBLIC']);
    expect(choice('PUBLIC')?.querySelector('[data-audience-caption]')?.textContent).toBe('Tout le monde, y compris hors abonnés · par défaut');
    expect(choice('FRIENDS')?.querySelector('[data-audience-caption]')?.textContent).toBe('Vos contacts acceptés');
  });

  test('toucher la rangée du défaut en fait un CHOIX : il part dans le corps et se mémorise', async () => {
    const drafts = createStudioDraftStore(null);
    const bench = harness({ drafts });
    const el = mount(bench.deps);
    typeText(el, 'Un défaut assumé');
    await openSheet(el);
    act(() => choice('FRIENDS')!.click());
    expect(pastille(el)?.getAttribute('data-audience-source')).toBe('chosen');
    expect(drafts.lastAudience(VIEWER_ID)).toBe('FRIENDS');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]?.visibility).toBe('FRIENDS');
  });

  test('choisir une audience CHOISISSABLE applique ET ferme la feuille ; la coche la suit', async () => {
    const el = mount(harness({}).deps);
    await openSheet(el);
    act(() => choice('PRIVATE')!.click());
    expect(dialogOpen()).toBeNull();
    expect(pastille(el)?.getAttribute('data-audience-value')).toBe('PRIVATE');
    await openSheet(el);
    expect(choice('PRIVATE')?.getAttribute('aria-current')).toBe('true');
    expect(choice('PRIVATE')?.querySelector('[data-audience-caption]')?.textContent).toBe('Vous seul — rien n’est publié');
  });

  test('la note de portée est présente ; aucun titre Mentions ni Hashtags', async () => {
    const el = mount(harness({}).deps);
    await openSheet(el);
    expect(document.querySelector('dialog[open] [data-audience-scope]')).not.toBeNull();
    const heading = Array.from(document.querySelectorAll('dialog[open] h2, dialog[open] h3')).find((n) =>
      /mentions|hashtags/i.test(n.textContent ?? ''),
    );
    expect(heading).toBeUndefined();
  });

  test('rien choisi : la pastille dit ce que la passerelle PARTIRAIT — FRIENDS pour une story, PUBLIC pour un post', () => {
    const story = mount(harness({}).deps, 'STORY');
    expect(pastille(story)?.getAttribute('data-audience-value')).toBe('FRIENDS');
    expect(pastille(story)?.getAttribute('data-audience-source')).toBe('default');
    unmountAll();

    const post = mount(harness({}).deps, 'POST');
    expect(pastille(post)?.getAttribute('data-audience-value')).toBe('PUBLIC');
    expect(pastille(post)?.getAttribute('data-audience-source')).toBe('default');
  });

  test('rien choisi : le menu « Publier comme » dit l’audience de CHAQUE format ; un choix explicite s’applique aux trois', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Un texte, pour que le menu soit atteignable');
    act(() => kindToggle(el)!.click());
    expect(kindChoice('STORY')?.querySelector('[data-publish-kind-audience]')?.textContent).toBe('Contacts');
    expect(kindChoice('POST')?.querySelector('[data-publish-kind-audience]')?.textContent).toBe('Public');
    act(() => kindToggle(el)!.click());

    await openSheet(el);
    act(() => choice('FRIENDS')!.click());
    act(() => kindToggle(el)!.click());
    for (const kind of ['STORY', 'POST', 'REEL'] as const) {
      expect(kindChoice(kind)?.querySelector('[data-publish-kind-audience]')?.textContent).toBe('Contacts');
    }
  });

  test('la pastille annonce « Audience » comme nom, la valeur — et « par défaut » tant que rien n’est choisi — comme description', async () => {
    const el = mount(harness({}).deps);
    const button = pastille(el)!;
    expect(button.getAttribute('aria-label')).toBe('Audience');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('Contacts · par défaut');

    await openSheet(el);
    expect(pastille(el)!.getAttribute('aria-expanded')).toBe('true');
    act(() => choice('COMMUNITY')!.click());
    expect(document.getElementById(pastille(el)!.getAttribute('aria-describedby')!)?.textContent).toBe('Communautés');
  });

  test('hors ligne : l’audience choisie VOYAGE avec l’intention armée, et part au retour du réseau', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Écrit hors ligne, pour mes communautés');
    await openSheet(el);
    act(() => choice('COMMUNITY')!.click());
    act(() => publishButton(el)!.click());
    await flush();
    expect(bench.posts).toHaveLength(0);

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]?.visibility).toBe('COMMUNITY');
  });

  test('un INVITÉ ne voit aucune pastille : rien du studio ne se peint sans session', () => {
    act(() => {
      sessionStore.getState().establishGuest({
        sessionToken: 'anon',
        guest: { participantId: null, nickname: 'Invité', conversationId: 'c1', link: 'l1', mayWrite: true },
      });
    });
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-story-studio-refusal]')).not.toBeNull();
    expect(pastille(el)).toBeNull();
  });

  test('en ALLEMAND, la pastille et la feuille lisent le catalogue — jamais un libellé français en dur', async () => {
    document.documentElement.lang = 'de';
    try {
      const el = mount(harness({}).deps, 'POST');
      expect(pastille(el)?.textContent).toBe('Öffentlich · Standard');
      await openSheet(el);
      expect(choice('ONLY')?.querySelector('[data-audience-caption]')?.textContent).toBe('Die Personenauswahl ist im Web noch nicht verfügbar.');
    } finally {
      document.documentElement.lang = 'fr';
    }
  });
});

describe('StoryComposeScreen — ouvert par l’accueil post-inscription (#7729)', () => {
  const mountFromOnboarding = (deps: Parameters<typeof mount>[0]) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<StoryComposeScreen deps={deps} requestedAudience="FRIENDS" origin="onboarding" />);
    });
    return {
      container,
      dispose: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  };

  test('l’audience demandée part, la croix ramène au parcours, et la publication y revient avec sa récompense', async () => {
    /* Le banc tourne sur `about:blank`, où l'historique ne peut rien
       pousser : l'adresse du studio est posée d'abord, comme dans la vraie
       navigation depuis la carte « Montre-toi ». */
    const happyDom: unknown = Reflect.get(window, 'happyDOM');
    const setUrl: unknown = typeof happyDom === 'object' && happyDom !== null ? Reflect.get(happyDom, 'setURL') : undefined;
    const before = window.location.href;
    const goTo = (url: string) => {
      if (typeof setUrl === 'function') Reflect.apply(setUrl, happyDom, [url]);
    };
    goTo('http://localhost/stories/new?audience=friends&from=onboarding');
    const bench = harness({});
    const { container, dispose } = mountFromOnboarding(bench.deps);
    expect(container.querySelector('a[href="/onboarding"]')).not.toBeNull();

    typeText(container, 'Nouveau sur Meeshy 👋');
    act(() => publishButton(container)!.click());
    await flush(() => window.location.pathname === '/onboarding');

    expect(bench.posts[0]?.visibility).toBe('FRIENDS');
    expect(`${window.location.pathname}${window.location.search}`).toBe('/onboarding?story=published');
    dispose();
    goTo(before);
  });
});
