import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { message, type Message } from '@/lib/api/fil';
import { FIL } from '@/lib/contenu/fil';
import type { Contexte } from '@/lib/realtime/fil-contexte';
import { bulleServie, type Bulle } from '@/lib/realtime/fil-etat';
import * as F from '@/lib/realtime/fil-etat';
import { FENETRE_D_ANNULATION_DU_RETRAIT_MS, prendsLesGestes, prendsLesRetraits, reprendLesRetraits } from '@/lib/realtime/fil-gestes';
import { bullesDuDocument, peintre, peins } from '@/lib/realtime/fil-peinture';
import { retraitsEnAttente } from '@/lib/realtime/fil-reserve';
import type { Reserve } from '@/lib/realtime/reserve';

/**
 * « ANNULER » PENDANT LA FENÊTRE OPTIMISTE D'UN RETRAIT (suivi #5163
 * § 12.12) — rien ne part vers la passerelle tant que la fenêtre est ouverte,
 * « Annuler » restaure la bulle à l'identique, et un `message:deleted` reçu
 * D'AUTRUI pendant la fenêtre désarme le différé (rien à annuler, rien à
 * envoyer une seconde fois). Le document est SERVI (`documentDuFil`), comme
 * `fil-gestes-menu.test.ts` — jamais un balisage fabriqué à la main — et
 * `applique` rejoue la VRAIE peinture (`peins`) pour observer ce que le
 * lecteur voit réellement, pas seulement l'état pur.
 */

const LANGUES = ['fr'];
const ORIGINE = 'https://gate.test';

const mienMessage = (id: string, contenu: string): Message =>
  message(
    { id, content: contenu, originalLanguage: 'fr', createdAt: '2026-09-01T12:00:00.000Z', senderId: 'u1', sender: { id: 'p1', displayName: 'Amina' } },
    'u1',
    LANGUES,
    ORIGINE,
  )!;

const M1 = mienMessage('m1', 'Un message que je peux retirer');

const etatDuDocument = (): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'T', membres: 2, presence: { participants: ['u2'], presents: [] }, messages: [M1], plusAncien: null },
  lecteur: { id: 'u1', nom: 'Amina', langues: LANGUES },
  erreur: null,
  brouillon: '',
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  composeur: { genre: 'ouvert' },
  contexte: null,
  tempsReel: null,
  plein: null,
  profil: null,
});

type Emis = { readonly evenement: string; readonly charge: unknown };

const socketDeTest = (repondsPar: (evenement: string, charge: unknown) => { success: boolean; error?: string }) => {
  const recus: Emis[] = [];
  return {
    recus,
    socket: {
      timeout: () => ({
        emit: (evenement: string, charge: unknown, rappel: (erreur: unknown, reponse: unknown) => void) => {
          recus.push({ evenement, charge });
          rappel(null, repondsPar(evenement, charge));
        },
      }),
    },
  };
};

/**
 * UNE RÉSERVE EN MÉMOIRE — le même patron que `fil-capture.test.ts` §
 * « la file hors ligne garde le lieu d'une bulle » : un `Reserve` réel (le
 * TYPE du dépôt, jamais une jumelle), pour observer ce que `differe()` /
 * `annule()` / `flush()` y écrivent et effacent, sans IndexedDB.
 */
const reserveEnMemoire = (): { readonly r: Reserve; readonly carte: Map<string, unknown> } => {
  const carte = new Map<string, unknown>();
  return {
    carte,
    r: {
      lis: async (cle) => carte.get(cle),
      ecris: async (cle, valeur) => {
        carte.set(cle, valeur);
      },
      efface: async (cle) => {
        carte.delete(cle);
      },
      cles: async (prefixe) => [...carte.keys()].filter((cle) => cle.startsWith(prefixe)).sort(),
    },
  };
};

const CLES_DE_TEST = { file: 'file:', brouillon: 'brouillon:', retrait: 'retrait:' } as const;

const monte = ({
  pret = false,
  socket = null,
  cache = false,
  enLigne = true,
  reserve = null,
}: {
  readonly pret?: boolean;
  readonly socket?: unknown;
  readonly cache?: boolean;
  readonly enLigne?: boolean;
  /** `null` — la plupart des témoins ne portent pas sur la persistance ; les leurs la fournissent. */
  readonly reserve?: Reserve | null;
} = {}) => {
  document.open();
  document.write(documentDuFil(etatDuDocument()));
  document.close();
  const main = document.querySelector<HTMLElement>('main')!;
  const p = peintre(main)!;
  let etat: F.EtatDuFil = { bulles: [M1].map(bulleServie), frappeurs: [], presents: [] };
  const ctx = {
    main,
    p,
    etat,
    composeur: null,
    ferme: false,
    socket,
    pret,
    // Les DEUX faits du cycle de vie que le flush interroge (`lifecycle.ts`
    // loi 2) : sans eux, `ctx.enLigne` serait `undefined` et TOUT retrait se
    // reporterait — un harnais qui laisse le sujet au repos ne mesure rien.
    cache,
    enLigne,
    creance: { genre: 'membre', jeton: 'j' },
    config: { passerelle: ORIGINE },
    // `null` — jamais `undefined` — quand aucune réserve n'est fournie :
    // `memoriseLeRetrait`/`oublieLeRetrait`/`retraitsEnAttente`
    // (`fil-reserve.ts`) lisent `ctx.cles` au sens du TYPE, qui ne l'omet
    // jamais (`fil-contexte.ts`).
    r: reserve,
    cles: reserve === null ? null : CLES_DE_TEST,
  } as unknown as Contexte;
  const applique = (c: Contexte, suivant: F.EtatDuFil): void => {
    etat = suivant;
    c.etat = suivant;
    peins(c.p, suivant, Date.now());
  };
  const ligne = (): HTMLElement => main.querySelector<HTMLElement>('li[data-id="m1"]')!;
  const bulle = (): Bulle | undefined => ctx.etat.bulles.find((b) => b.id === 'm1');
  return { ctx, applique, main, p, ligne, bulle };
};

describe('retirer diffère l’envoi — rien ne part pendant la fenêtre', () => {
  it('la ligne porte l’état différé, le bouton « Annuler », et AUCUNE émission', () => {
    const { socket, recus } = socketDeTest(() => ({ success: true }));
    const { ctx, applique, ligne } = monte({ pret: true, socket });
    const retraits = prendsLesRetraits({ ctx, applique });

    retraits.differe('m1');

    expect(ligne().classList.contains('envoi-retrait-differe')).toBe(true);
    expect(ligne().querySelector('.texte')?.textContent).toBe('Message retiré');
    const bouton = ligne().querySelector<HTMLButtonElement>('.annuler-le-retrait');
    expect(bouton).not.toBeNull();
    expect(document.activeElement).toBe(bouton);
    expect(recus).toEqual([]);
  });

  it('le fetch REST (repli sans socket) ne part pas non plus pendant la fenêtre', () => {
    const fetchEspion = jest.fn();
    globalThis.fetch = fetchEspion as unknown as typeof fetch;
    const { ctx, applique } = monte({ pret: false, socket: null });
    const retraits = prendsLesRetraits({ ctx, applique });

    retraits.differe('m1');

    expect(fetchEspion).not.toHaveBeenCalled();
  });
});

describe('Annuler pendant la fenêtre restaure la bulle à l’identique — rien ne part JAMAIS', () => {
  it('restaure texte, réactions, citations et le focus revient sur la ligne', () => {
    jest.useFakeTimers();
    try {
      const avecReaction: F.Bulle = { ...bulleServie(M1), reactions: [{ emoji: '👍', nombre: 1, mienne: false }] };
      const { socket, recus } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, ligne } = monte({ pret: true, socket });
      ctx.etat = { ...ctx.etat, bulles: [avecReaction] };
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      expect(ligne().classList.contains('envoi-retrait-differe')).toBe(true);

      retraits.annule('m1');

      expect(ligne().classList.contains('envoi-retrait-differe')).toBe(false);
      expect(ligne().classList.contains('supprime')).toBe(false);
      expect(ligne().querySelector('.texte')?.textContent).toBe('Un message que je peux retirer');
      expect(document.activeElement).toBe(ligne());

      jest.runAllTimers();
      expect(recus).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('la fenêtre expirée envoie UNE fois, puis confirme sur l’accusé', () => {
  it('un seul message:delete part, et la ligne passe « servie »', () => {
    jest.useFakeTimers();
    try {
      const { socket, recus } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, ligne } = monte({ pret: true, socket });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      expect(recus).toEqual([]);

      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS);
      // Le flush est asynchrone (une Promise résolue synchronement par le
      // socket de test, mais planifiée par un microtask) : laisser la file
      // se vider avant d'observer le résultat.
      return Promise.resolve().then(() => {
        expect(recus).toEqual([{ evenement: 'message:delete', charge: { messageId: 'm1' } }]);
        expect(ligne().classList.contains('envoi-retrait-differe')).toBe(false);
        expect(ligne().classList.contains('supprime')).toBe(true);
        expect(ligne().querySelector('.texte')?.textContent).toBe('Ce message a été supprimé');
        expect(ligne().querySelector('.annuler-le-retrait')).not.toBeNull();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * DÉFAUT DE REVUE #5387 — « la bulle passe de "Message retiré" à "Ce
   * message a été supprimé" EN SILENCE » : `differe()` et `annule()`
   * annoncent déjà leurs deux issues (voir plus bas) ; l'expiration, elle,
   * ne l'était pas.
   */
  it('l’expiration annonce la suppression confirmée dans #annonces-du-fil', async () => {
    jest.useFakeTimers();
    try {
      const { socket } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, main } = monte({ pret: true, socket });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS);
      await Promise.resolve();
      // `annonceLeGeste` arme SA PROPRE minuterie (le vide observable entre
      // deux annonces, voir son doc-comment) — un battement de plus la fait
      // écrire. `await` (et non `return … .then()`) tient les minuteurs
      // FICTIFS actifs jusqu'à cette ligne — le `finally` ne les repose en
      // réels qu'une fois la fonction async intégralement déroulée.
      jest.advanceTimersByTime(0);
      expect(main.querySelector<HTMLElement>('#annonces-du-fil')?.textContent).toBe(FIL.supprime);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('un refus au flush rétablit la bulle et dit sa raison', () => {
  /**
   * « You are not authorized… » (`MessageHandler.ts:1126`) — un refus qui
   * n'a RIEN d'idempotent : le message tient toujours, seul le droit manque.
   * `'Message not found'` ne convient plus à ce témoin depuis la revue
   * (suivi #5163 § 12.12, défaut majeur « rechargé pendant la fenêtre montre
   * le message revenu ») — cette raison-là est désormais traitée comme
   * l'état DÉJÀ atteint (voir le describe suivant), jamais comme un refus.
   */
  it('la ligne redevient visible, la raison est affichée dans #refus-du-composeur', () => {
    jest.useFakeTimers();
    try {
      const { socket, recus } = socketDeTest(() => ({ success: false, error: 'You are not authorized to delete this message' }));
      const { ctx, applique, ligne, main } = monte({ pret: true, socket });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS);
      return Promise.resolve().then(() => {
        expect(recus).toHaveLength(1);
        expect(ligne().classList.contains('supprime')).toBe(false);
        expect(ligne().querySelector('.texte')?.textContent).toBe('Un message que je peux retirer');
        const refus = main.querySelector<HTMLElement>('#refus-du-composeur')!;
        expect(refus.hidden).toBe(false);
        expect(refus.textContent).toBe('You are not authorized to delete this message');
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * IDEMPOTENT — DÉFAUT MAJEUR DE REVUE (suivi #5163 § 12.12, « rechargé
 * pendant la fenêtre montre le message revenu ») : `'Message not found'`
 * (`MessageHandler.ts:1105`) n'est pas un ÉCHEC de CE `DELETE` quand la bulle
 * était bien en retrait différé — c'est l'état DÉJÀ atteint, exactement
 * comme `reagis()` le traite pour une réaction (`fil-mutations.ts`, un 404
 * au retrait d'une réaction absente). Sans ce repli, un retrait REPRIS après
 * un rechargement (`reprendLesRetraits`) dont le `keepalive` de la page
 * précédente avait déjà abouti RESSUSCITAIT la bulle sur ce refus — le
 * défaut même que la reprise corrige, rejoué un cran plus loin.
 */
describe('« Message not found » au flush est IDEMPOTENT — pas un refus', () => {
  it('confirme (jamais ne rétablit), et n’affiche aucun refus', () => {
    jest.useFakeTimers();
    try {
      const { socket, recus } = socketDeTest(() => ({ success: false, error: 'Message not found' }));
      const { ctx, applique, ligne, main } = monte({ pret: true, socket });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS);
      return Promise.resolve().then(() => {
        expect(recus).toHaveLength(1);
        expect(ligne().classList.contains('supprime')).toBe(true);
        expect(ligne().querySelector('.texte')?.textContent).toBe('Ce message a été supprimé');
        expect(main.querySelector<HTMLElement>('#refus-du-composeur')!.hidden).toBe(true);
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('un message:deleted reçu pendant la fenêtre désarme le différé', () => {
  it('à l’expiration : aucun envoi ; Annuler ne restaure pas un message déjà retiré côté serveur', () => {
    jest.useFakeTimers();
    try {
      const { socket, recus } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, ligne } = monte({ pret: true, socket });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      // Un `message:deleted` D'AUTRUI arrive avant l'expiration — exactement
      // ce que `participate.ts` fait de l'événement du même nom.
      applique(ctx, F.retire(ctx.etat, 'm1'));
      expect(ligne().classList.contains('envoi-retrait-differe')).toBe(false);

      // Un clic sur « Annuler » — s'il en restait un — ne restaurerait rien :
      // le message est déjà retiré côté serveur.
      retraits.annule('m1');
      expect(ligne().querySelector('.texte')?.textContent).toBe('Ce message a été supprimé');

      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS);
      return Promise.resolve().then(() => {
        expect(recus).toEqual([]);
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('la fenêtre ne fait RIEN partir d’un onglet caché ni d’un réseau absent', () => {
  /**
   * REVUE — § 8.5 (« onglet caché ⇒ ZÉRO requête ») et § 7 (hors ligne : aucun
   * appel). Une minuterie armée sous les yeux du lecteur expire quelle que
   * soit la suite : sans report, masquer l'onglet dans la fenêtre émettait un
   * `message:delete`, et le masquage coupant le socket
   * (`participate.ts` › `masquage`), le repli émettait un `DELETE`. Les deux
   * transports sont donc observés, pas seulement celui du chemin nominal.
   */
  it('onglet caché : ni émission socket, ni fetch — et la fenêtre reste offerte', () => {
    jest.useFakeTimers();
    try {
      const fetchEspion = jest.fn();
      globalThis.fetch = fetchEspion as unknown as typeof fetch;
      const { socket, recus } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, ligne } = monte({ pret: true, socket, cache: true });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS * 4);

      return Promise.resolve().then(() => {
        expect(recus).toEqual([]);
        expect(fetchEspion).not.toHaveBeenCalled();
        expect(ligne().classList.contains('envoi-retrait-differe')).toBe(true);
        expect(ligne().querySelector('.annuler-le-retrait')).not.toBeNull();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('hors ligne : rien ne part, et le retour du réseau laisse la fenêtre repartir', () => {
    jest.useFakeTimers();
    try {
      const { socket, recus } = socketDeTest(() => ({ success: true }));
      const { ctx, applique } = monte({ pret: true, socket, enLigne: false });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS * 2);
      expect(recus).toEqual([]);

      // Le réseau revient — la minuterie RÉARMÉE trouve `enLigne` vrai et part.
      (ctx as { enLigne: boolean }).enLigne = true;
      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS);
      return Promise.resolve().then(() => {
        expect(recus).toEqual([{ evenement: 'message:delete', charge: { messageId: 'm1' } }]);
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * NOMINATIF (défaut de revue #5387 — « l'aria-label du bouton "Annuler" ne
 * nomme pas le message visé ») : `differe()` peut armer DEUX fenêtres à la
 * fois (m1 ET m2, cf. « detruit() n'envoie plus rien » plus bas) — un
 * `aria-label` générique identique sur les deux boutons ne laisse alors AUCUN
 * moyen d'entendre lequel vise quel message.
 */
describe('l’aria-label du bouton « Annuler » nomme le message visé (#5387)', () => {
  it('differe() pose un aria-label qui reprend le texte du message retiré', () => {
    const { socket } = socketDeTest(() => ({ success: true }));
    const { ctx, applique, ligne } = monte({ pret: true, socket });
    const retraits = prendsLesRetraits({ ctx, applique });

    retraits.differe('m1');

    const bouton = ligne().querySelector<HTMLButtonElement>('.annuler-le-retrait');
    expect(bouton?.getAttribute('aria-label')).toBe(FIL.annulerLeRetrait('Un message que je peux retirer'));
  });

  it('deux retraits simultanés portent des aria-label DIFFÉRENTS', () => {
    const M2 = mienMessage('m2', 'Un second message, bien distinct du premier');
    document.open();
    document.write(documentDuFil({ ...etatDuDocument(), fil: { ...etatDuDocument().fil, messages: [M2, M1] } }));
    document.close();
    const main = document.querySelector<HTMLElement>('main')!;
    const p = peintre(main)!;
    let etat: F.EtatDuFil = { bulles: [M1, M2].map(bulleServie), frappeurs: [], presents: [] };
    const ctx = {
      main,
      p,
      etat,
      composeur: null,
      ferme: false,
      socket: null,
      pret: false,
      cache: false,
      enLigne: true,
      creance: { genre: 'membre', jeton: 'j' },
      config: { passerelle: ORIGINE },
      cles: null,
    } as unknown as Contexte;
    const applique = (c: Contexte, suivant: F.EtatDuFil): void => {
      etat = suivant;
      c.etat = suivant;
      peins(c.p, suivant, Date.now());
    };
    const retraits = prendsLesRetraits({ ctx, applique });

    retraits.differe('m1');
    retraits.differe('m2');

    const labelM1 = main.querySelector<HTMLElement>('li[data-id="m1"] .annuler-le-retrait')?.getAttribute('aria-label');
    const labelM2 = main.querySelector<HTMLElement>('li[data-id="m2"] .annuler-le-retrait')?.getAttribute('aria-label');
    expect(labelM1).not.toBe(labelM2);
    expect(labelM1).toContain('Un message que je peux retirer');
    expect(labelM2).toContain('Un second message');
  });

  it('un message média-seul (texte vide) retombe sur la forme générique', () => {
    const M3 = mienMessage('m3', '');
    document.open();
    document.write(documentDuFil({ ...etatDuDocument(), fil: { ...etatDuDocument().fil, messages: [M3] } }));
    document.close();
    const main = document.querySelector<HTMLElement>('main')!;
    const p = peintre(main)!;
    let etat: F.EtatDuFil = { bulles: [M3].map(bulleServie), frappeurs: [], presents: [] };
    const ctx = {
      main,
      p,
      etat,
      composeur: null,
      ferme: false,
      socket: null,
      pret: false,
      cache: false,
      enLigne: true,
      creance: { genre: 'membre', jeton: 'j' },
      config: { passerelle: ORIGINE },
      cles: null,
    } as unknown as Contexte;
    const applique = (c: Contexte, suivant: F.EtatDuFil): void => {
      etat = suivant;
      c.etat = suivant;
      peins(c.p, suivant, Date.now());
    };
    const retraits = prendsLesRetraits({ ctx, applique });

    retraits.differe('m3');

    const bouton = main.querySelector<HTMLElement>('li[data-id="m3"] .annuler-le-retrait');
    expect(bouton?.getAttribute('aria-label')).toBe('Annuler le retrait du message');
  });
});

describe('le focus ne tombe jamais sur <body> quand la fenêtre se referme', () => {
  /**
   * REVUE — leçon 519, rejouée un cran plus loin par la fenêtre elle-même :
   * `differe` pose le focus sur « Annuler », que la classe d'envoi fait
   * disparaître à l'expiration (`display:none`). Un navigateur RETIRE le
   * focus d'un nœud qui cesse d'être rendu — le lecteur au clavier se
   * retrouvait sur `<body>`, tout en haut du document, sans avoir rien fait.
   */
  it('à l’expiration, le focus revient sur la LIGNE', () => {
    jest.useFakeTimers();
    try {
      const { socket } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, ligne } = monte({ pret: true, socket });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      expect(document.activeElement).toBe(ligne().querySelector('.annuler-le-retrait'));

      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS);
      return Promise.resolve().then(() => {
        expect(document.activeElement).toBe(ligne());
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('un lecteur reparti ailleurs ne se fait pas voler son focus', () => {
    jest.useFakeTimers();
    try {
      const { socket } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, main } = monte({ pret: true, socket });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      const champ = main.querySelector<HTMLTextAreaElement>('.composeur textarea')!;
      champ.focus();

      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS);
      return Promise.resolve().then(() => {
        expect(document.activeElement).toBe(champ);
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * DÉCISION Option A (défauts BLOQUANT et MAJEUR de revue #5387 — « recharger
 * pendant la fenêtre commet le retrait », « deux retraits atteignent la
 * passerelle pour un seul geste ») — `detruit()` N'ENVOIE PLUS RIEN : la
 * version précédente flushait ICI en `DELETE keepalive`, ce qui faisait
 * partir un retrait non confirmé au premier `pagehide` (donc à CHAQUE
 * rechargement pendant la fenêtre, pas seulement à la fermeture réelle de
 * l'onglet), puis un SECOND à l'expiration de la fenêtre REPRISE par le
 * document neuf — deux `DELETE` pour un seul geste. Voir le doc-comment de
 * `detruit` (`fil-gestes.ts`) pour l'arbitrage complet.
 */
describe('detruit() n’envoie plus rien — l’intention reste dans la réserve (décision Option A, #5387)', () => {
  it('deux retraits différés : AUCUNE requête à la destruction, les minuteurs sont purgés', () => {
    jest.useFakeTimers();
    try {
      const M2 = mienMessage('m2', 'Un second message');
      document.open();
      document.write(
        documentDuFil({
          ...etatDuDocument(),
          fil: { ...etatDuDocument().fil, messages: [M2, M1] },
        }),
      );
      document.close();
      const main = document.querySelector<HTMLElement>('main')!;
      const p = peintre(main)!;
      let etat: F.EtatDuFil = { bulles: [M1, M2].map(bulleServie), frappeurs: [], presents: [] };
      const ctx = {
        main,
        p,
        etat,
        composeur: null,
        ferme: false,
        socket: null,
        pret: false,
        cache: false,
        enLigne: true,
        creance: { genre: 'membre', jeton: 'j' },
        config: { passerelle: ORIGINE },
        cles: null,
      } as unknown as Contexte;
      const applique = (c: Contexte, suivant: F.EtatDuFil): void => {
        etat = suivant;
        c.etat = suivant;
        peins(c.p, suivant, Date.now());
      };
      const fetchEspion = jest.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
      globalThis.fetch = fetchEspion as unknown as typeof fetch;

      const retraits = prendsLesRetraits({ ctx, applique });
      retraits.differe('m1');
      retraits.differe('m2');

      retraits.detruit();
      jest.runAllTimers();

      // AUCUNE requête, ni tout de suite, ni après les minuteurs purgés : un
      // écran qui part ne décide plus du sort du retrait à la place du
      // lecteur.
      expect(fetchEspion).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * LE TÉMOIN QUI ARBITRE LE DÉFAUT BLOQUANT — reproduit la SÉQUENCE exacte
   * du rapport de revue : `differe()`, puis l'écran part (`detruit()`,
   * simulant `pagehide` sur un rechargement), puis un document NEUF se
   * monte (`reprendLesRetraits`) et sa fenêtre expire. Une SEULE requête
   * doit jamais atteindre la passerelle pour ce geste — jamais deux.
   */
  it('rechargement pendant la fenêtre : detruit() puis reprendLesRetraits() puis expiration — UN SEUL retrait part, jamais deux', async () => {
    jest.useFakeTimers();
    try {
      const { r } = reserveEnMemoire();
      const { socket: socketAvant, recus: recusAvant } = socketDeTest(() => ({ success: true }));
      const { ctx: ctxAvant, applique: appliqueAvant } = monte({ pret: true, socket: socketAvant, reserve: r });
      const retraitsAvant = prendsLesRetraits({ ctx: ctxAvant, applique: appliqueAvant });

      retraitsAvant.differe('m1');
      // L'ÉCRAN PART — un rechargement déclenche `pagehide` exactement comme
      // une fermeture réelle, AVANT que le document neuf ne charge.
      retraitsAvant.detruit();

      // LE DOCUMENT NEUF — un second `monte()`, la même réserve (persistée),
      // exactement ce qu'un rechargement réel donnerait : la bulle SERVIE
      // n'est PAS `supprime` (rien n'est jamais parti), l'intention est
      // toujours dans la réserve.
      const emissionsApres: Emis[] = [];
      const socketApres = {
        timeout: () => ({
          emit: (evenement: string, charge: unknown, rappel: (erreur: unknown, reponse: unknown) => void) => {
            emissionsApres.push({ evenement, charge });
            rappel(null, { success: true });
          },
        }),
      };
      const { ctx: ctxApres, applique: appliqueApres } = monte({ pret: true, socket: socketApres, reserve: r });
      const retraitsApres = prendsLesRetraits({ ctx: ctxApres, applique: appliqueApres });

      await reprendLesRetraits(ctxApres, retraitsApres);
      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS);
      await Promise.resolve();
      await Promise.resolve();

      expect(emissionsApres.filter((e) => e.evenement === 'message:delete')).toHaveLength(1);
      // ET la fenêtre d'AVANT le rechargement n'a JAMAIS émis quoi que ce
      // soit — son propre `detruit()` s'est tu.
      expect(recusAvant).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('l’état neuf passe toutes les portes du type', () => {
  it('retabli sur une bulle en retrait différé rend l’envoi du snapshot, à l’identique', () => {
    const differee: F.Bulle = { ...bulleServie(M1), supprime: true, texte: '', pieces: [], citations: [], reactions: [], envoi: 'retrait-differe' };
    const avant = F.insere(F.ETAT_VIDE, bulleServie(M1));
    const retabli = F.retabli({ ...avant, bulles: [differee] }, avant.bulles[0]!);
    expect(retabli.bulles[0]).toEqual(avant.bulles[0]);
  });

  it('retireMoiMeme pose l’état retrait-differe, partLeRetrait le fait avancer à en-attente', () => {
    const avant = F.insere(F.ETAT_VIDE, bulleServie(M1));
    const differe = F.retireMoiMeme(avant, 'm1');
    expect(differe.bulles[0]?.envoi).toBe('retrait-differe');
    const parti = F.partLeRetrait(differe, 'm1');
    expect(parti.bulles[0]?.envoi).toBe('en-attente');
  });

  it('partLeRetrait est idempotent — une bulle qui n’est plus retrait-differe n’est pas touchée', () => {
    const avant = F.insere(F.ETAT_VIDE, bulleServie(M1));
    const parti = F.partLeRetrait(avant, 'm1');
    expect(parti).toEqual(avant);
  });
});

/**
 * DÉFAUT MAJEUR DE REVUE (suivi #5163 § 12.12) — « un retrait différé ne
 * survit pas à un rechargement ». `differe()` mémorise désormais
 * l'INTENTION dans la réserve (`memoriseLeRetrait`, `fil-reserve.ts`),
 * `annule()` et `flush()` l'effacent dès que le sort du retrait est décidé —
 * jamais un snapshot de contenu, seulement l'identifiant : c'est la bulle
 * SERVIE par le document neuf qui fait foi au rechargement.
 */
describe('l’intention d’un retrait est DURABLE — la réserve la tient jusqu’à son issue', () => {
  it('differe() écrit l’identifiant dans la réserve, sous le préfixe `retrait`', async () => {
    const { r, carte } = reserveEnMemoire();
    const { socket } = socketDeTest(() => ({ success: true }));
    const { ctx, applique } = monte({ pret: true, socket, reserve: r });
    const retraits = prendsLesRetraits({ ctx, applique });

    retraits.differe('m1');

    expect(await retraitsEnAttente(ctx)).toEqual(['m1']);
    expect(carte.has(`${CLES_DE_TEST.retrait}m1`)).toBe(true);
  });

  it('annule() efface l’intention — plus rien à reprendre à un rechargement suivant', async () => {
    const { r } = reserveEnMemoire();
    const { socket } = socketDeTest(() => ({ success: true }));
    const { ctx, applique } = monte({ pret: true, socket, reserve: r });
    const retraits = prendsLesRetraits({ ctx, applique });

    retraits.differe('m1');
    retraits.annule('m1');

    expect(await retraitsEnAttente(ctx)).toEqual([]);
  });

  it('flush() efface l’intention une fois le retrait envoyé et confirmé', () => {
    jest.useFakeTimers();
    try {
      const { r } = reserveEnMemoire();
      const { socket } = socketDeTest(() => ({ success: true }));
      const { ctx, applique } = monte({ pret: true, socket, reserve: r });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS);
      return Promise.resolve().then(async () => {
        expect(await retraitsEnAttente(ctx)).toEqual([]);
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * REPRENDRE APRÈS UN RECHARGEMENT (défauts majeur et bloquant de revue,
 * suivi #5163 § 12.12 : « ne survit pas à un rechargement » et « le document
 * rechargé montre le message revenu ») — `reprendLesRetraits` lit la réserve
 * UNE fois, au montage, contre la bulle SERVIE par le document neuf.
 */
describe('reprendLesRetraits — au montage, contre l’état SERVI par le document neuf', () => {
  it('la passerelle n’a toujours rien reçu : rejoue differe(), le document ne montre jamais le texte d’origine', async () => {
    const { r } = reserveEnMemoire();
    await r.ecris(`${CLES_DE_TEST.retrait}m1`, { messageId: 'm1' });
    const { socket, recus } = socketDeTest(() => ({ success: true }));
    const { ctx, applique, ligne } = monte({ pret: true, socket, reserve: r });
    const retraits = prendsLesRetraits({ ctx, applique });

    await reprendLesRetraits(ctx, retraits);

    expect(ligne().classList.contains('envoi-retrait-differe')).toBe(true);
    expect(ligne().querySelector('.texte')?.textContent).toBe('Message retiré');
    expect(ligne().querySelector('.annuler-le-retrait')).not.toBeNull();
    // Une fenêtre FRAÎCHE — l'intention reprise n'a rien envoyé toute seule.
    expect(recus).toEqual([]);
  });

  it('la passerelle a déjà tout reçu (bulle SERVIE `supprime`) : rien à rejouer, l’intention est oubliée', async () => {
    const { r, carte } = reserveEnMemoire();
    await r.ecris(`${CLES_DE_TEST.retrait}m1`, { messageId: 'm1' });
    const { socket, recus } = socketDeTest(() => ({ success: true }));
    const { ctx, applique, ligne } = monte({ pret: true, socket, reserve: r });
    // La bulle SERVIE par un document rechargé APRÈS que la passerelle a
    // traité le `keepalive` — le cas du second rechargement du défaut de
    // revue.
    applique(ctx, F.retire(ctx.etat, 'm1'));
    const retraits = prendsLesRetraits({ ctx, applique });

    await reprendLesRetraits(ctx, retraits);

    expect(ligne().classList.contains('envoi-retrait-differe')).toBe(false);
    expect(ligne().querySelector('.texte')?.textContent).toBe('Ce message a été supprimé');
    expect(recus).toEqual([]);
    expect(carte.has(`${CLES_DE_TEST.retrait}m1`)).toBe(false);
  });

  it('un identifiant qui n’est plus dans la fenêtre servie est laissé tel quel — relu au prochain montage', async () => {
    const { r, carte } = reserveEnMemoire();
    await r.ecris(`${CLES_DE_TEST.retrait}m9`, { messageId: 'm9' });
    const { socket } = socketDeTest(() => ({ success: true }));
    const { ctx, applique } = monte({ pret: true, socket, reserve: r });
    const retraits = prendsLesRetraits({ ctx, applique });

    await reprendLesRetraits(ctx, retraits);

    expect(carte.has(`${CLES_DE_TEST.retrait}m9`)).toBe(true);
  });
});

/**
 * LE RETRAIT ET LE RÉTABLISSEMENT S'ANNONCENT AU LECTEUR D'ÉCRAN (#5387) —
 * dans `#annonces-du-fil`, la région SERVIE VIDE (`fil-vue.ts`). Le geste
 * s'annonce SANS voler le focus : le focus, lui, reste sur « Annuler »
 * (déjà couvert plus haut) ou sur la ligne.
 */
describe('le retrait et le rétablissement s’annoncent au lecteur d’écran (#5387)', () => {
  const region = (main: HTMLElement): HTMLElement => main.querySelector<HTMLElement>('#annonces-du-fil')!;

  it('differe() écrit l’annonce de retrait dans #annonces-du-fil', () => {
    jest.useFakeTimers();
    try {
      const { socket } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, main } = monte({ pret: true, socket });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      jest.advanceTimersByTime(0);

      expect(region(main).textContent).toBe(FIL.retraitAnnonce(5));
    } finally {
      jest.useRealTimers();
    }
  });

  it('annule() écrit l’annonce de rétablissement', () => {
    jest.useFakeTimers();
    try {
      const { socket } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, main } = monte({ pret: true, socket });
      const retraits = prendsLesRetraits({ ctx, applique });

      retraits.differe('m1');
      retraits.annule('m1');
      jest.advanceTimersByTime(0);

      expect(region(main).textContent).toBe(FIL.retablissementAnnonce);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reprendLesRetraits() (rechargement) ré-annonce le retrait — gratuit via differe()', async () => {
    const { r } = reserveEnMemoire();
    await r.ecris(`${CLES_DE_TEST.retrait}m1`, { messageId: 'm1' });
    const { socket } = socketDeTest(() => ({ success: true }));
    const { ctx, applique, main } = monte({ pret: true, socket, reserve: r });
    const retraits = prendsLesRetraits({ ctx, applique });

    await reprendLesRetraits(ctx, retraits);
    await new Promise((resolu) => setTimeout(resolu, 0));

    expect(region(main).textContent).toBe(FIL.retraitAnnonce(5));
  });

  /**
   * DEUX ANNONCES SUCCESSIVES IDENTIQUES SONT RE-ANNONCÉES — et ce témoin
   * observe ce qu'un LECTEUR D'ÉCRAN observe : le CONTENU de la région à
   * chaque fin de tâche, jamais le nombre d'écritures faites dessus. Entre
   * deux retraits au MÊME libellé, la région doit REPASSER PAR LE VIDE :
   * sans ce passage, le contenu final est identique au précédent, rien ne
   * change, et le second geste est muet. La version précédente vidait et
   * réécrivait dans la MÊME tâche — deux écritures, un seul état observable :
   * elle ne pouvait être prise en défaut que par un espion sur le setter,
   * c'est-à-dire par l'implémentation.
   */
  it('deux retraits consécutifs : la région repasse par le VIDE, donc chacun s’annonce', () => {
    jest.useFakeTimers();
    try {
      const M2 = mienMessage('m2', 'Un second message');
      document.open();
      document.write(documentDuFil({ ...etatDuDocument(), fil: { ...etatDuDocument().fil, messages: [M2, M1] } }));
      document.close();
      const main = document.querySelector<HTMLElement>('main')!;
      const p = peintre(main)!;
      let etat: F.EtatDuFil = { bulles: [M1, M2].map(bulleServie), frappeurs: [], presents: [] };
      const ctx = {
        main,
        p,
        etat,
        composeur: null,
        ferme: false,
        socket: null,
        pret: false,
        cache: false,
        enLigne: true,
        creance: { genre: 'membre', jeton: 'j' },
        config: { passerelle: ORIGINE },
        cles: null,
      } as unknown as Contexte;
      const applique = (c: Contexte, suivant: F.EtatDuFil): void => {
        etat = suivant;
        c.etat = suivant;
        peins(c.p, suivant, Date.now());
      };
      const retraits = prendsLesRetraits({ ctx, applique });
      const noeud = region(main);

      retraits.differe('m1');
      jest.advanceTimersByTime(0);
      expect(noeud.textContent).toBe(FIL.retraitAnnonce(5));

      retraits.differe('m2');
      // LE VIDE OBSERVABLE — l'état que le lecteur d'écran voit à la fin de
      // CETTE tâche, et sans lequel la seconde annonce n'existerait pas.
      expect(noeud.textContent).toBe('');

      jest.advanceTimersByTime(0);
      expect(noeud.textContent).toBe(FIL.retraitAnnonce(5));
    } finally {
      jest.useRealTimers();
    }
  });

  it('la région ABSENTE ne fait pas planter le geste (même tolérance que afficheLeRefus)', () => {
    jest.useFakeTimers();
    try {
      const { socket } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, main } = monte({ pret: true, socket });
      main.querySelector('#annonces-du-fil')?.remove();
      const retraits = prendsLesRetraits({ ctx, applique });

      expect(() => {
        retraits.differe('m1');
        retraits.annule('m1');
        jest.advanceTimersByTime(0);
      }).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * L'ADRESSE `?retirer=<id>` N'ENGAGE RIEN — UNE NAVIGATION NE SUPPRIME PAS UN
 * MESSAGE (revue de #5387). La fenêtre SANS JavaScript vit dans l'adresse ;
 * une adresse se met en signet, se copie, et le bouton RETOUR y ramène. Si le
 * module l'ADOPTAIT en fenêtre différée, il armerait une minuterie qui
 * supprime cinq secondes plus tard sans que personne n'ait confirmé : revenir
 * en arrière après « Annuler » perdait le message, rouvrir l'adresse aussi.
 * Le module la laisse donc intacte — les deux formulaires POST servis par la
 * porte sont le seul chemin, et « Confirmer le retrait » le seul qui envoie.
 */
describe('l’adresse `?retirer=<id>` n’engage rien, même avec JavaScript (#5387)', () => {
  it('monter le module dessus n’ouvre AUCUNE fenêtre, n’envoie JAMAIS le retrait, et ne touche pas à l’adresse', () => {
    jest.useFakeTimers();
    const fetchEspion = jest.fn();
    globalThis.fetch = fetchEspion as unknown as typeof fetch;
    try {
      const { socket, recus } = socketDeTest(() => ({ success: true }));
      const { ctx, applique, ligne } = monte({ pret: true, socket });
      window.history.replaceState(null, '', '/chats/c1?retirer=m1');

      prendsLesGestes({ ctx, applique, envoieLaBulle: async () => undefined });
      jest.advanceTimersByTime(FENETRE_D_ANNULATION_DU_RETRAIT_MS * 4);

      expect(recus).toEqual([]);
      expect(fetchEspion).not.toHaveBeenCalled();
      expect(ligne().classList.contains('envoi-retrait-differe')).toBe(false);
      // L'ADRESSE RESTE : elle EST l'état que le document rend. La nettoyer
      // désynchroniserait l'URL de ce qui est affiché — un rechargement ou un
      // retour arrière retrouverait alors une page qui ne dit plus ce qu'elle
      // montre.
      expect(window.location.search).toBe('?retirer=m1');
    } finally {
      jest.useRealTimers();
      window.history.replaceState(null, '', '/');
    }
  });
});

/**
 * UNE FENÊTRE SERVIE (`?retirer=<id>`, #5387) N'A JAMAIS DE MENU EN PLUS
 * (défaut MAJEUR de revue « la ligne porte deux fenêtres de retrait à la
 * fois ») — reproduit la séquence EXACTE du bogue : le serveur rend
 * `.retrait-servie` pour la ligne visée (`retrait: 'm1'`), et le PREMIER
 * `peins()` du montage — celui que `participate.ts` exécute AVANT même que
 * `prendsLesGestes`/`reprendLesRetraits` n'existent — repeint depuis l'état
 * que `bullesDuDocument` en tire (`supprime: false`, `envoi: 'servi'`, la
 * passerelle n'ayant rien reçu). Sans la garde de `remplisLeMenu`
 * (`fil-peinture.ts`), ce premier passage clonait un `details.actions` tout
 * neuf à côté des deux formulaires déjà servis.
 */
describe('une fenêtre de retrait SERVIE ne reçoit jamais de menu en plus (#5387)', () => {
  it('le premier peins() du montage ne clone AUCUN details.actions sur une ligne `?retirer=`', () => {
    document.open();
    document.write(documentDuFil({ ...etatDuDocument(), retrait: 'm1' }));
    document.close();
    const main = document.querySelector<HTMLElement>('main')!;
    const p = peintre(main)!;
    const ligne = main.querySelector<HTMLElement>('li[data-id="m1"]')!;

    expect(ligne.querySelector('.retrait-servie')).not.toBeNull();
    expect(ligne.querySelector('details.actions')).toBeNull();

    // LE PREMIER PEINS() DU MONTAGE — exactement celui de `participate.ts`,
    // AVANT `prendsLesGestes` : l'état vient de `bullesDuDocument`, jamais
    // d'une bulle fabriquée à la main, pour ne pas manquer ce que le parseur
    // RÉEL produit sur cette ligne.
    peins(p, { bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, Date.now(), { composeurOuvert: true, estInvite: false });

    expect(ligne.querySelector('.retrait-servie')).not.toBeNull();
    expect(ligne.querySelector('details.actions')).toBeNull();
    // Les deux formulaires servis restent seuls maîtres — Annuler et
    // Confirmer, jamais un troisième contrôle de retrait.
    expect(ligne.querySelectorAll('form').length).toBe(2);
  });

  it('une ligne ORDINAIRE (sans retrait servi) continue de recevoir son menu au premier peins()', () => {
    document.open();
    document.write(documentDuFil(etatDuDocument()));
    document.close();
    const main = document.querySelector<HTMLElement>('main')!;
    const p = peintre(main)!;
    const ligne = main.querySelector<HTMLElement>('li[data-id="m1"]')!;

    // Servie d'origine, sur cette ligne ordinaire (`menuDeLigne`, #5163).
    expect(ligne.querySelector('details.actions')).not.toBeNull();

    peins(p, { bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, Date.now(), { composeurOuvert: true, estInvite: false });

    expect(ligne.querySelector('details.actions')).not.toBeNull();
  });
});
