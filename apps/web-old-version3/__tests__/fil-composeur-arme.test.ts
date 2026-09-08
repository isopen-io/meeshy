import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { FEUILLE_DU_FIL, FEUILLE_DES_GESTES } from '@/app/connecte/fil-feuille';
import { message, type Message } from '@/lib/api/fil';
import { citationDeReponse } from '@/lib/api/citations';
import { prendsLeComposeur, type ContextePourEnvoi } from '@/lib/realtime/composeur';
import { ETAT_VIDE, bulleOptimiste } from '@/lib/realtime/fil-etat';
import { envoieLaModification } from '@/lib/realtime/fil-gestes';

/**
 * LE COMPOSEUR ARMÉ (§ 12.10.1, issue #5163) — ce que le SERVEUR a déjà armé
 * (`?repondre=` / `?modifier=`, le chemin NOMINAL en 3G rurale : le menu est
 * un `<form method="get">` cliqué AVANT que le module n'arrive) et ce que le
 * module arme ensuite. Le témoin ouvre le document SERVI dans jsdom, comme
 * `fil-peinture.test.ts` : jamais un balisage fabriqué à la main.
 */

const LANGUES = ['fr', 'en'];
const ORIGINE = 'https://gate.test';

const servi = (id: string, contenu: string): Message =>
  message(
    {
      id,
      content: contenu,
      originalLanguage: 'en',
      createdAt: '2026-09-01T12:00:00.000Z',
      senderId: 'u2',
      sender: { id: 'p2', displayName: 'Ibrahim' },
      translations: [{ language: 'fr', content: `${contenu} (fr)` }],
    },
    'u1',
    LANGUES,
    ORIGINE,
  )!;

const R1 = servi('r1', 'Hello');
const R2 = servi('r2', 'Second');

const ACTIFS = {
  passerelle: ORIGINE,
  actifs: Object.fromEntries(
    ['participate', 'liste', 'feed', 'notifs', 'contacts', 'recherche', 'liens', 'commentaires', 'plein', 'navigateur', 'composer', 'socket'].map((nom) => [
      nom,
      { nom: `${nom}.js`, url: `/__v3/rt/${nom}.js`, corps: '' },
    ]),
  ),
} as unknown as EtatDuFil['tempsReel'];

const etat = (contexte: EtatDuFil['contexte'], brouillon = ''): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'T', membres: 2, presence: { participants: ['u2'], presents: [] }, messages: [R2, R1], plusAncien: null },
  lecteur: { id: 'u1', nom: 'Amina', langues: LANGUES },
  erreur: null,
  brouillon,
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  composeur: { genre: 'ouvert' },
  contexte,
  tempsReel: ACTIFS,
  plein: null,
  profil: null,
});

const monte = (contexte: EtatDuFil['contexte'], brouillon = '') => {
  document.open();
  document.write(documentDuFil(etat(contexte, brouillon)));
  document.close();
  const main = document.querySelector<HTMLElement>('main')!;
  const envois: { texte: string; contexte: ContextePourEnvoi }[] = [];
  // Le document SERVI porte toujours son composeur : le double `null` de
  // `prendsLeComposeur` ne décrit pas cet état.
  const controleur = prendsLeComposeur({
    main,
    gabarit: main.querySelector<HTMLTemplateElement>('template'),
    brouillon: null,
    surBrouillon: () => undefined,
    frappe: { commence: () => undefined, cesse: () => undefined },
    surEnvoi: (texte, _fichiers, ctx) => envois.push({ texte, contexte: ctx }),
  })!;
  const champ = main.querySelector<HTMLTextAreaElement>('#champ-texte')!;
  const envoie = (texte: string): void => {
    champ.value = texte;
    main.querySelector<HTMLFormElement>('form.composeur')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  };
  const apercus = (): readonly string[] =>
    [...main.querySelectorAll<HTMLElement>('#contexte-du-composeur li.citation')].map((li) => li.dataset.cite ?? '');
  return { main, controleur, envois, champ, envoie, apercus };
};

describe('le composeur ADOPTE le contexte que le serveur a armé', () => {
  it('`?repondre=` : l’envoi porte la réponse, pas un message nu', () => {
    const { envois, envoie } = monte({ genre: 'reponse', cible: R1 });
    envoie('Bien reçu');
    expect(envois).toEqual([{ texte: 'Bien reçu', contexte: { genre: 'reponse', cible: 'r1' } }]);
  });

  it('`?modifier=` : l’envoi ÉDITE le message visé, il n’en poste pas un neuf', () => {
    const { envois, envoie } = monte({ genre: 'modification', cible: R1 });
    envoie('Hello, corrigé');
    expect(envois).toEqual([{ texte: 'Hello, corrigé', contexte: { genre: 'modification', cible: 'r1' } }]);
  });

  it('sans contexte servi, un envoi reste un message nu', () => {
    const { envois, envoie } = monte(null);
    envoie('Salut');
    expect(envois).toEqual([{ texte: 'Salut', contexte: null }]);
  });

  it('« Annuler » désarme SANS naviguer, et rend le brouillon d’avant', () => {
    const { main, envois, envoie, champ } = monte({ genre: 'reponse', cible: R1 }, 'brouillon en cours');
    const annuler = main.querySelector<HTMLAnchorElement>('#contexte-du-composeur a.annuler')!;
    const evenement = new MouseEvent('click', { cancelable: true, bubbles: true });
    annuler.dispatchEvent(evenement);
    expect(evenement.defaultPrevented).toBe(true);
    expect(champ.value).toBe('brouillon en cours');
    envoie('Salut');
    expect(envois).toEqual([{ texte: 'Salut', contexte: null }]);
  });

  it('une modification annulée ne laisse PAS le texte du message visé dans le champ', () => {
    const { controleur, champ } = monte({ genre: 'modification', cible: R1 });
    expect(champ.value).toBe('Hello');
    controleur.desarme();
    expect(champ.value).toBe('');
  });
});

describe('le bandeau de citation dit TOUJOURS ce que l’envoi porte', () => {
  it('armer une réponse à un AUTRE message remplace la citation SERVIE', () => {
    const { controleur, apercus, envois, envoie } = monte({ genre: 'reponse', cible: R1 });
    expect(apercus()).toEqual(['r1']);
    controleur.armeLaReponse(citationDeReponse({ cible: 'r2', source: 'Ibrahim' }));
    expect(apercus()).toEqual(['r2']);
    envoie('ok');
    expect(envois[0]?.contexte).toEqual({ genre: 'reponse', cible: 'r2' });
  });

  it('désarmer puis réarmer LE MÊME message repeint sa citation — le bandeau ne reste pas vide', () => {
    const { controleur, apercus } = monte(null);
    controleur.armeLaReponse(citationDeReponse({ cible: 'r1', source: 'Ibrahim' }));
    expect(apercus()).toEqual(['r1']);
    controleur.desarme();
    expect(apercus()).toEqual([]);
    controleur.armeLaReponse(citationDeReponse({ cible: 'r1', source: 'Ibrahim' }));
    expect(apercus()).toEqual(['r1']);
  });
});

describe('la feuille du fil habille ce que le fil rend', () => {
  /**
   * Le menu d'une ligne était RENDU sans une ligne de style : son rond tombait
   * à la taille par défaut du navigateur et ses trois boutons sous 44 px
   * (charte règle 4). L'atome partagé avec `/chats` et `/links` est la SEULE
   * source de cette forme.
   */
  it('sert l’atome du menu de ligne — rond de 44 px, boutons de 44 px', () => {
    expect(FEUILLE_DES_GESTES).toMatch(/\.actions>summary\{[^}]*width:var\(--target-min\)/);
    expect(FEUILLE_DES_GESTES).toMatch(/\.actions button\{[^}]*min-height:var\(--target-min\)/);
    // Et le DOCUMENT du fil le porte — le témoin des cibles à 360 px n'a rien
    // à mesurer si la feuille reste dans son module.
    expect(documentDuFil(etat(null))).toContain('.actions>summary{');
  });

  /** Les trois autres écrans pleins partagent `FEUILLE_DU_FIL` sans rendre une seule ligne : ils ne paient pas ce menu. */
  it('ne le met PAS dans la feuille que la galerie, /notifications et /post/:id partagent', () => {
    expect(FEUILLE_DU_FIL).not.toContain('.actions>summary{');
  });

  it('pose le bandeau du contexte sur SA propre ligne, au-dessus du champ', () => {
    expect(FEUILLE_DES_GESTES).toMatch(/\.composeur \.contexte\{[^}]*flex-basis:100%/);
    expect(FEUILLE_DU_FIL).not.toContain('.composeur .contexte{');
    expect(documentDuFil(etat(null))).toContain('.composeur .contexte{');
  });
});

/**
 * UN REFUS RÉTABLIT LA BULLE — et RÉARME le composeur. `rends()` remettait le
 * texte dans un composeur que `envoie()` venait de DÉSARMER : réessayer y
 * postait un message NEUF, doublon visible de tous, au lieu de rééditer le
 * message visé.
 */
describe('une modification refusée (403) rétablit la bulle ET garde son armement', () => {
  const contexteDeTest = (monte_: ReturnType<typeof monte>) => {
    const bulle = {
      ...bulleOptimiste({ clientMessageId: 'cid_x', texte: 'Hello', auteur: 'Amina', auteurId: 'u1', langue: 'en', horsLigne: false, maintenant: Date.now() }),
      id: 'r1',
      deMoi: true,
      envoi: 'servi' as const,
      langueOriginale: 'en',
      texteOriginal: 'Hello',
    };
    const ctx = {
      main: monte_.main,
      config: { passerelle: ORIGINE, nom: 'Amina' },
      creance: { genre: 'membre', jeton: 'j' },
      etat: { ...ETAT_VIDE, bulles: [bulle] },
      socket: null,
      pret: false,
      ferme: false,
      composeur: monte_.controleur,
      p: { liste: monte_.main.querySelector('ol.lignes')! },
    } as unknown as Parameters<typeof envoieLaModification>[0];
    return { ctx, bulle };
  };

  it('remet le texte ORIGINAL dans la bulle, affiche la raison, et le prochain envoi ÉDITE encore', async () => {
    const m = monte({ genre: 'modification', cible: R1 });
    const { ctx, bulle } = contexteDeTest(m);
    const applique = jest.fn((c: { etat: unknown }, suivant: unknown) => {
      c.etat = suivant;
    });
    // Un DOUBLE de réponse, pas un `Response` : jsdom n'en fournit pas, et le
    // constructeur absent tombait dans le `.catch(() => null)` de `demande` —
    // le témoin aurait vu le refli générique au lieu de la phrase servie.
    globalThis.fetch = jest.fn(async () => ({
      status: 403,
      json: async () => ({ success: false, error: { message: 'Modification refusée' } }),
    })) as unknown as typeof fetch;

    m.champ.value = 'Hello, corrigé';
    m.main.querySelector<HTMLFormElement>('form.composeur')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await envoieLaModification(ctx, applique as never, 'r1', 'Hello, corrigé');

    const dernier = applique.mock.calls.at(-1)?.[1] as { bulles: readonly { texte: string }[] };
    expect(dernier.bulles[0]).toEqual(bulle);
    expect(m.main.querySelector<HTMLElement>('#refus-du-composeur')!.hidden).toBe(false);
    expect(m.main.querySelector<HTMLElement>('#refus-du-composeur')!.textContent).toBe('Modification refusée');
    expect(m.champ.value).toBe('Hello, corrigé');

    m.envois.length = 0;
    m.main.querySelector<HTMLFormElement>('form.composeur')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(m.envois).toEqual([{ texte: 'Hello, corrigé', contexte: { genre: 'modification', cible: 'r1' } }]);
  });

  /**
   * DÉFAUT #5163 §6, CHEMIN SOCKET — le refus ANGLAIS nommé (« 24-hour limit
   * exceeded ») traversait tel quel depuis l'accusé `message:edit` ; il est
   * désormais traduit par le MÊME site que le chemin REST (`traduitLeRefusServi`,
   * `lib/api/fil.ts`), appelé par les deux transports.
   */
  it('un refus SOCKET (message:edit) affiche la phrase TRADUITE, jamais l’anglais de la passerelle', async () => {
    const m = monte({ genre: 'modification', cible: R1 });
    const { ctx, bulle } = contexteDeTest(m);
    const applique = jest.fn((c: { etat: unknown }, suivant: unknown) => {
      c.etat = suivant;
    });
    const emis: { evenement: string; charge: unknown }[] = [];
    (ctx as unknown as { socket: unknown }).socket = {
      timeout: () => ({
        emit: (evenement: string, charge: unknown, rappel: (erreur: unknown, reponse: unknown) => void) => {
          emis.push({ evenement, charge });
          rappel(null, { success: false, error: 'You can no longer edit this message (24-hour limit exceeded)' });
        },
      }),
    };
    (ctx as unknown as { pret: boolean }).pret = true;

    await envoieLaModification(ctx, applique as never, 'r1', 'Hello, corrigé');

    expect(emis).toEqual([{ evenement: 'message:edit', charge: { messageId: 'r1', content: 'Hello, corrigé' } }]);
    const dernier = applique.mock.calls.at(-1)?.[1] as { bulles: readonly { texte: string }[] };
    expect(dernier.bulles[0]).toEqual(bulle);
    expect(m.main.querySelector<HTMLElement>('#refus-du-composeur')!.textContent).toBe(
      'Ce message ne peut plus être modifié : la fenêtre de 24 heures est dépassée.',
    );
  });
});

/**
 * DÉFAUTS #5163 §7-8 — le composeur, en MODIFICATION :
 *   §7 — vider le champ face à une cible SANS pièce affiche la raison SANS
 *        RIEN ÉMETTRE (un champ vide n'est plus un contrôle sans effet) ;
 *        face à une cible AVEC pièce, le vide PART (retirer une légende est
 *        une édition valide) ;
 *   §8 — « Enregistrer » un texte IDENTIQUE à l'original désarme SANS RIEN
 *        ÉMETTRE — la passerelle marquerait sinon le message « modifié »
 *        pour tous et effacerait ses traductions pour un texte inchangé.
 */
describe('le composeur en modification n’émet ni un champ vide sans pièce, ni un texte inchangé', () => {
  it('« Enregistrer » avec le texte INCHANGÉ désarme SANS émettre', () => {
    const { envois, envoie, champ, main } = monte({ genre: 'modification', cible: R1 });
    expect(champ.value).toBe('Hello');
    envoie('Hello');
    expect(envois).toEqual([]);
    // Désarmé : le bandeau du contexte n'est plus servi.
    expect(main.querySelector<HTMLElement>('#contexte-du-composeur')!.hidden).toBe(true);
  });

  it('« Enregistrer » un texte inchangé APRÈS un espace de trop désarme quand même (comparaison sur le texte NORMALISÉ)', () => {
    const { envois, envoie } = monte({ genre: 'modification', cible: R1 });
    envoie('  Hello  ');
    expect(envois).toEqual([]);
  });

  it('un champ VIDÉ sur une cible SANS pièce affiche la raison, SANS émettre, et reste ARMÉ', () => {
    const { envois, envoie, main } = monte({ genre: 'modification', cible: R1 });
    envoie('');
    expect(envois).toEqual([]);
    expect(main.querySelector<HTMLElement>('#refus-du-composeur')!.hidden).toBe(false);
    expect(main.querySelector<HTMLElement>('#refus-du-composeur')!.textContent).toBe('Le message est vide.');
    // Reste ARMÉ — jamais désarmé par un refus (comme le refus serveur, § précédent).
    expect(main.querySelector<HTMLElement>('#contexte-du-composeur')!.hidden).toBe(false);
  });

  it('un champ VIDÉ sur une cible AVEC pièce PART — retirer une légende est une édition valide', () => {
    const CIBLE = { ...R1, id: 'r1', pieces: [{ id: 'p1', type: 'image', url: 'x', nom: 'x.png', poids: 10, largeur: null, hauteur: null, duree: null, transcription: null, langueDeTranscription: null, texteOriginal: null }] } as unknown as Message;
    const { envois, envoie, main } = monte({ genre: 'modification', cible: CIBLE });
    envoie('');
    expect(envois).toEqual([{ texte: '', contexte: { genre: 'modification', cible: 'r1' } }]);
    expect(main.querySelector<HTMLElement>('#refus-du-composeur')!.hidden).toBe(true);
  });
});
