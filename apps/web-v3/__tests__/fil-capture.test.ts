import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import type { Contexte } from '@/lib/realtime/fil-contexte';
import { bulleOptimiste, ETAT_VIDE } from '@/lib/realtime/fil-etat';
import { memoriseHorsLigne, relisLaFile } from '@/lib/realtime/fil-reserve';
import { prendsLaCapture } from '@/lib/realtime/capture';

/**
 * LE MICRO ET LA POSITION (#5061) — le module qui les prend en main.
 *
 * `MediaRecorder` et `navigator.geolocation` n'existent pas dans jsdom : les
 * deux sont posés ici, à la manière d'un vrai navigateur — un flux, des
 * événements `dataavailable`/`stop`, un callback de succès ou d'erreur —
 * jamais en ré-implémentant `prendsLaCapture` à côté (§ CLAUDE.md, « un
 * témoin qui ne peut pas tomber n'est pas un témoin »).
 */

const LANGUES = ['fr'];

const etat = (): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'T', membres: 2, presence: { participants: [], presents: [] }, messages: [], plusAncien: null },
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

/** Un `MediaRecorder` posé à la main — un flux, des écouteurs, un `stop` qui livre le dernier morceau puis l'événement `stop`. */
class FauxMediaRecorder {
  static dernier: FauxMediaRecorder | null = null;
  readonly mimeType = 'audio/webm;codecs=opus';
  private readonly ecouteurs = new Map<string, ((evenement: unknown) => void)[]>();
  arrete = false;
  constructor(public readonly flux: unknown) {
    FauxMediaRecorder.dernier = this;
  }
  addEventListener(type: string, ecouteur: (evenement: unknown) => void): void {
    const liste = this.ecouteurs.get(type) ?? [];
    liste.push(ecouteur);
    this.ecouteurs.set(type, liste);
  }
  start(): void {
    this.arrete = false;
  }
  stop(): void {
    this.arrete = true;
    (this.ecouteurs.get('dataavailable') ?? []).forEach((e) => e({ data: new Blob(['un-octet-de-vocal'], { type: this.mimeType }) }));
    (this.ecouteurs.get('stop') ?? []).forEach((e) => e(undefined));
  }
}

const posePisteMock = (accorde: boolean): { readonly getUserMedia: jest.Mock } => {
  const piste = { getTracks: () => [{ stop: jest.fn() }] };
  const getUserMedia = jest.fn(() => (accorde ? Promise.resolve(piste) : Promise.reject(new Error('refuse'))));
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  return { getUserMedia };
};

const poseGeolocalisationMock = (): { readonly getCurrentPosition: jest.Mock } => {
  const getCurrentPosition = jest.fn();
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  return { getCurrentPosition };
};

const monte = (): { readonly main: HTMLElement; readonly ctx: Contexte; readonly applique: jest.Mock; readonly envoieLaBulle: jest.Mock } => {
  document.open();
  document.write(documentDuFil(etat()));
  document.close();
  const main = document.querySelector<HTMLElement>('main')!;
  const ctx = {
    main,
    config: { conversation: 'c1', nom: 'Amina', langues: LANGUES, moi: 'u1' },
    droits: { canSendMessages: true, canSendFiles: true, canSendImages: true, canViewHistory: true },
    etat: ETAT_VIDE,
    fichiers: new Map(),
    enLigne: true,
  } as unknown as Contexte;
  const applique = jest.fn();
  const envoieLaBulle = jest.fn(async () => undefined);
  prendsLaCapture({ ctx, applique, envoieLaBulle });
  return { main, ctx, applique, envoieLaBulle };
};

afterEach(() => {
  jest.restoreAllMocks();
  FauxMediaRecorder.dernier = null;
});

describe('actualise() révèle micro et position selon la capacité du navigateur ET le droit d’écrire', () => {
  it('les cache tant qu’aucune capacité navigateur n’est posée', () => {
    const { main } = monte();
    expect(main.querySelector<HTMLButtonElement>('#bouton-micro')?.hidden).toBe(true);
    expect(main.querySelector<HTMLButtonElement>('#bouton-position')?.hidden).toBe(true);
  });

  it('les révèle dès que MediaRecorder/getUserMedia et geolocation existent, avec le droit d’écrire', () => {
    posePisteMock(true);
    poseGeolocalisationMock();
    (global as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxMediaRecorder;
    const { main } = monte();
    expect(main.querySelector<HTMLButtonElement>('#bouton-micro')?.hidden).toBe(false);
    expect(main.querySelector<HTMLButtonElement>('#bouton-position')?.hidden).toBe(false);
    delete (global as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  });
});

describe('le vocal — MediaRecorder, un envoi optimiste, le MÊME transport qu’une pièce jointe', () => {
  beforeEach(() => {
    posePisteMock(true);
    (global as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxMediaRecorder;
  });

  afterEach(() => {
    delete (global as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  });

  it('tap micro → getUserMedia → état d’enregistrement visible', async () => {
    const { main } = monte();
    main.querySelector<HTMLButtonElement>('#bouton-micro')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(main.querySelector('form.composeur')?.classList.contains('enregistre')).toBe(true);
    expect(main.querySelector<HTMLElement>('#enregistrement')?.hidden).toBe(false);
  });

  it('stop → envoyer-vocal → une bulle optimiste PUIS envoieLaBulle, avec un fichier posé dans ctx.fichiers', async () => {
    const { main, applique, envoieLaBulle, ctx } = monte();
    main.querySelector<HTMLButtonElement>('#bouton-micro')!.click();
    await Promise.resolve();
    await Promise.resolve();
    main.querySelector<HTMLButtonElement>('.envoyer-vocal')!.click();

    expect(applique).toHaveBeenCalledTimes(1);
    const [, suivant] = applique.mock.calls[0] as [Contexte, { bulles: readonly { pieces: readonly unknown[]; envoi: string }[] }];
    expect(suivant.bulles).toHaveLength(1);
    expect(suivant.bulles[0]?.pieces).toHaveLength(1);
    expect(suivant.bulles[0]?.envoi).toBe('en-attente');

    expect(envoieLaBulle).toHaveBeenCalledTimes(1);
    expect(ctx.fichiers.size).toBe(1);
    const [fichier] = [...ctx.fichiers.values()][0] ?? [];
    expect(fichier?.type).toBe('audio/webm;codecs=opus');
    // La barre d'enregistrement se referme aussitôt.
    expect(main.querySelector('form.composeur')?.classList.contains('enregistre')).toBe(false);
  });

  it('annuler → aucune bulle, aucun envoi', async () => {
    const { main, applique, envoieLaBulle } = monte();
    main.querySelector<HTMLButtonElement>('#bouton-micro')!.click();
    await Promise.resolve();
    await Promise.resolve();
    main.querySelector<HTMLButtonElement>('.annuler-vocal')!.click();

    expect(applique).not.toHaveBeenCalled();
    expect(envoieLaBulle).not.toHaveBeenCalled();
    expect(main.querySelector('form.composeur')?.classList.contains('enregistre')).toBe(false);
  });

  it('getUserMedia refusé — la voix du geste sert le refus, le composeur reste intact', async () => {
    posePisteMock(false);
    const { main, applique } = monte();
    main.querySelector<HTMLButtonElement>('#bouton-micro')!.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(main.querySelector<HTMLElement>('#refus-du-composeur')?.hidden).toBe(false);
    expect(main.querySelector<HTMLElement>('#refus-du-composeur')?.textContent).toContain('microphone');
    expect(applique).not.toHaveBeenCalled();
    expect(main.querySelector('form.composeur')?.classList.contains('enregistre')).toBe(false);
  });
});

describe('la position — getCurrentPosition, un lieu, jamais des coordonnées perdues', () => {
  it('succès → envoieLaBulle avec une bulle qui porte le LIEU (latitude/longitude)', () => {
    const { getCurrentPosition } = poseGeolocalisationMock();
    getCurrentPosition.mockImplementation((succes: (p: unknown) => void) => succes({ coords: { latitude: 6.5244, longitude: 3.3792 } }));
    const { main, applique, envoieLaBulle } = monte();

    main.querySelector<HTMLButtonElement>('#bouton-position')!.click();

    expect(applique).toHaveBeenCalledTimes(1);
    const [, suivant] = applique.mock.calls[0] as [Contexte, { bulles: readonly { lieu: { latitude: number; longitude: number } | null }[] }];
    expect(suivant.bulles[0]?.lieu).toEqual({ latitude: 6.5244, longitude: 3.3792, nom: null, adresse: null });
    expect(envoieLaBulle).toHaveBeenCalledTimes(1);
  });

  it('refus — la voix du geste sert le refus, jamais un plantage', () => {
    const { getCurrentPosition } = poseGeolocalisationMock();
    getCurrentPosition.mockImplementation((_succes: unknown, echec: (e: unknown) => void) => echec(new Error('denied')));
    const { main, applique } = monte();

    expect(() => main.querySelector<HTMLButtonElement>('#bouton-position')!.click()).not.toThrow();
    expect(main.querySelector<HTMLElement>('#refus-du-composeur')?.hidden).toBe(false);
    expect(applique).not.toHaveBeenCalled();
  });
});

describe('detruit() — aucune fuite (dimension 3, § 12.11 étage 3)', () => {
  it('arrête un enregistrement en cours et coupe la piste', async () => {
    posePisteMock(true);
    (global as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxMediaRecorder;
    document.open();
    document.write(documentDuFil(etat()));
    document.close();
    const main = document.querySelector<HTMLElement>('main')!;
    const ctx = {
      main,
      config: { conversation: 'c1', nom: 'Amina', langues: LANGUES, moi: 'u1' },
      droits: { canSendMessages: true, canSendFiles: true, canSendImages: true, canViewHistory: true },
      etat: ETAT_VIDE,
      fichiers: new Map(),
      enLigne: true,
    } as unknown as Contexte;
    const capture = prendsLaCapture({ ctx, applique: jest.fn(), envoieLaBulle: jest.fn(async () => undefined) });
    main.querySelector<HTMLButtonElement>('#bouton-micro')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(() => capture.detruit()).not.toThrow();
    delete (global as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  });
});


/**
 * UNE POSITION PARTAGÉE HORS LIGNE EST UN ENVOI COMME UN AUTRE (revue de
 * #5061). La réserve n'écrivait que le texte, la langue et les fichiers : une
 * bulle de LIEU, qui n'a ni l'un ni l'autre, y perdait sa seule donnée. Au
 * rechargement, `relisLaFile` la jetait en silence (`texte === '' &&
 * fichiers.length === 0`) — un envoi perdu sans un mot, ce que le § 7
 * interdit ; et sans le jeter, elle serait repartie VIDE, en 400.
 */
describe('la file hors ligne garde le lieu d’une bulle', () => {
  const reserveEnMemoire = () => {
    const carte = new Map<string, unknown>();
    return {
      carte,
      r: {
        lis: async (cle: string) => carte.get(cle),
        ecris: async (cle: string, valeur: unknown) => {
          carte.set(cle, valeur);
        },
        efface: async (cle: string) => {
          carte.delete(cle);
        },
        cles: async (prefixe: string) => [...carte.keys()].filter((cle) => cle.startsWith(prefixe)).sort(),
      },
    };
  };

  const contexteDeReserve = (r: ReturnType<typeof reserveEnMemoire>['r']): Contexte =>
    ({
      r,
      cles: { file: 'file:', brouillon: 'brouillon:' },
      config: { conversation: 'c1', nom: 'Amina', langues: LANGUES, moi: 'u1' },
      fichiers: new Map<string, readonly File[]>(),
      etat: ETAT_VIDE,
    }) as unknown as Contexte;

  it('mémorise le lieu, puis le relit — la bulle revient avec sa position', async () => {
    const { r } = reserveEnMemoire();
    const ctx = contexteDeReserve(r);
    const bulle = {
      ...bulleOptimiste({
        clientMessageId: 'c-1',
        texte: '',
        auteur: 'Amina',
        auteurId: 'u1',
        langue: 'fr',
        horsLigne: true,
        maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
        lieu: { latitude: 48.8566, longitude: 2.3522, nom: 'Café Le Central', adresse: '12 rue de Rivoli' },
      }),
    };
    await memoriseHorsLigne(ctx, bulle);

    const relu = contexteDeReserve(r);
    await relisLaFile(relu);
    expect(relu.etat.bulles).toHaveLength(1);
    expect(relu.etat.bulles[0]?.lieu).toEqual({ latitude: 48.8566, longitude: 2.3522, nom: 'Café Le Central', adresse: '12 rue de Rivoli' });
    expect(relu.etat.bulles[0]?.envoi).toBe('hors-ligne');
  });

  it('ne ressuscite rien quand l’entrée n’a ni texte, ni pièce, ni lieu', async () => {
    const { r, carte } = reserveEnMemoire();
    carte.set('file:2026-09-01T12:30:00.000Z:c-2', { clientMessageId: 'c-2', texte: '', langue: 'fr', ecritA: '2026-09-01T12:30:00.000Z', pieces: [] });
    const relu = contexteDeReserve(r);
    await relisLaFile(relu);
    expect(relu.etat.bulles).toHaveLength(0);
  });
});
