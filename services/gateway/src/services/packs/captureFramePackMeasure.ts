/**
 * LA MESURE DES PACKS DE CAPTURE (#10169, lot LC ; décision #10187) — ce que la
 * décision de téléchargement (LC2, #10170) attend : combien de comptes ont
 * RETIRÉ chaque ambiance, et combien l'ont RÉINSTALLÉE après l'avoir retirée.
 *
 * Elle ne collecte rien de neuf : elle lit les choix d'installation que le
 * moteur tient déjà (`UserStickerPack`, clé `capture-frame.<slug>`). Une
 * ambiance installée d'office n'a AUCUNE ligne tant que personne n'y touche :
 * une ligne `installedAt: null` est un retrait, une ligne datée une
 * réinstallation explicite.
 *
 * Fail-closed sur l'identité : la sortie ne porte AUCUN identifiant de compte,
 * seulement des comptes DISTINCTS par (ambiance, état), et toute cellule de
 * moins de `CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS` comptes est supprimée (elle se
 * compte seulement parmi `suppressedCells`). Lecture seule : un `findMany`.
 *
 * Appelée par `scripts/measure-capture-frame-packs.ts` (staging à la clôture de
 * LC, production 30 jours après la promotion) ; aucune route.
 */
import { parsePackChoiceKey } from '@meeshy/shared/types/content-pack';
import { prefixRange } from '../../utils/prefix-range';

export const CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS = 5;

const CAPTURE_KEY_PREFIX = 'capture-frame.';

export type CaptureFramePackChoiceRow = { readonly userId: string; readonly packSlug: string; readonly installedAt: Date | null };

export type CaptureFramePackState = 'removed' | 'reinstalled';

export type CaptureFramePackCell = { readonly slug: string; readonly state: CaptureFramePackState; readonly accounts: number };

export type CaptureFramePackMeasure = {
  readonly cells: readonly CaptureFramePackCell[];
  /** Les cellules retenues parce qu'elles comptaient moins de `CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS` comptes. */
  readonly suppressedCells: number;
  /** Les comptes distincts qui ont touché au moins une ambiance — un total, jamais une liste ; `null` sous le seuil. */
  readonly accounts: number | null;
};

const STATE_ORDER: readonly CaptureFramePackState[] = ['removed', 'reinstalled'];

type Choice = { readonly userId: string; readonly slug: string; readonly state: CaptureFramePackState };

const choiceOf = (row: CaptureFramePackChoiceRow): Choice | null => {
  const key = parsePackChoiceKey(row.packSlug);
  if (key === null || key.domain !== 'capture-frame') return null;
  return { userId: row.userId, slug: key.slug, state: row.installedAt === null ? 'removed' : 'reinstalled' };
};

const cellKey = (slug: string, state: CaptureFramePackState): string => `${slug}\u0000${state}`;

export function measureCaptureFramePacks(rows: readonly CaptureFramePackChoiceRow[], minAccounts: number = CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS): CaptureFramePackMeasure {
  const choices = rows.flatMap((row) => {
    const choice = choiceOf(row);
    return choice === null ? [] : [choice];
  });
  const byCell = choices.reduce((cells, choice) => {
    const key = cellKey(choice.slug, choice.state);
    const accounts = cells.get(key)?.accounts ?? new Set<string>();
    return new Map(cells).set(key, { slug: choice.slug, state: choice.state, accounts: new Set(accounts).add(choice.userId) });
  }, new Map<string, { readonly slug: string; readonly state: CaptureFramePackState; readonly accounts: ReadonlySet<string> }>());
  const counted = [...byCell.values()]
    .map(({ slug, state, accounts }) => ({ slug, state, accounts: accounts.size }))
    .sort((a, b) => a.slug.localeCompare(b.slug) || STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
  const cells = counted.filter((cell) => cell.accounts >= minAccounts);
  const accounts = new Set(choices.map((choice) => choice.userId)).size;
  return { cells, suppressedCells: counted.length - cells.length, accounts: accounts >= minAccounts ? accounts : null };
}

export type CaptureFramePackMeasurePrisma = {
  readonly userStickerPack: {
    readonly findMany: (args: {
      readonly where: { readonly packSlug: { readonly gte: string; readonly lt: string } };
      readonly select: { readonly userId: true; readonly packSlug: true; readonly installedAt: true };
    }) => Promise<readonly CaptureFramePackChoiceRow[]>;
  };
};

export async function readCaptureFramePackMeasure(prisma: CaptureFramePackMeasurePrisma): Promise<CaptureFramePackMeasure> {
  const rows = await prisma.userStickerPack.findMany({
    // Un intervalle, jamais `startsWith` : Prisma le traduit en regex sans échapper le point (#11492).
    where: { packSlug: prefixRange(CAPTURE_KEY_PREFIX) },
    select: { userId: true, packSlug: true, installedAt: true },
  });
  return measureCaptureFramePacks(rows);
}
