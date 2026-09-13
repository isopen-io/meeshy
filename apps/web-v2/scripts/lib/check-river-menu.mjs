/**
 * LA LIGNE « RIVIÈRE » DU MENU DE LECTURE — les deux moitiés de sa raison
 * (#5696), extraites de `check-reading-mode.mjs` : l'hôte est HORS BUDGET de
 * taille (1 290 lignes avant ce travail, plafond dur 1 200) et `CLAUDE.md`
 * interdit d'y AJOUTER — « on extrait d'abord, on ajoute ensuite ». Même
 * dispositif que `lib/check-summary.mjs` : ce module reçoit LE compteur de
 * défauts (`expect`) et LA pose de schéma (`setScheme`), il n'en fabrique
 * aucun.
 *
 * CE QU'IL MESURE — la ligne « Rivière » reste désactivée dans les DEUX
 * situations, et sa raison ne ment dans NI l'une NI l'autre :
 *
 *   · SOUS LE SEUIL (`c-deploiement`, `memberCount: 3`) : elle DIT combien
 *     de membres il y a — le troisième libellé du catalogue
 *     (« S'ouvrira à 5 personnes actives — N aujourd'hui »), inatteignable
 *     tant que `decision.ts` passait `activeParticipantCount: null` ;
 *   · DÉJÀ ÉLIGIBLE (`c-salon-riviere`, `memberCount: 5`) : la loi partagée
 *     l'accorde (`riverReason: 'eligible'`) mais `river` reste hors
 *     `THREAD_RENDERABLE_MODES` — la raison ne doit JAMAIS promettre un
 *     seuil déjà atteint (« S'ouvrira à 5 — 5 aujourd'hui », le libellé FAUX
 *     qu'iOS montre drapeau `riviere_mode` OFF,
 *     `ReadingModeLensSheet.swift:91-99`). La quatrième forme
 *     (« Bientôt disponible ») le dit sans mentir.
 */

/** Le libellé de la quatrième forme — `RIVER_NOT_RENDERED_REASON` de `src/lib/reading-mode/catalog.ts`. */
/* L'HORLOGE ÉPINGLÉE (#6130) — voir `instant.mjs`. Ce module ouvre le menu de
   lecture sur le même corpus daté que son hôte : il partageait donc sa fenêtre
   de rouge nocturne, sans porter lui-même la moindre assertion de date. */
import { pageÀInstantFigé } from './instant.mjs';

export const RIVER_NOT_RENDERED_REASON = 'Bientôt disponible';

/**
 * Les assertions de la ligne « Rivière » sur un groupe SOUS LE SEUIL — jouées
 * dans le menu déjà ouvert par l'hôte (bloc « --- 2 »), sur `c-deploiement`
 * (`memberCount: 3`, `fixtures.ts`).
 */
export async function assertRiverBelowThreshold({ riverRow, expect }) {
  expect((await riverRow.isDisabled()) === true, 'Rivière est désactivée');

  const reason = ((await riverRow.textContent()) ?? '').trim();
  expect(
    /S'ouvrira à 5 personnes actives — 3 aujourd'hui/.test(reason),
    `Rivière dit COMBIEN de membres il y a (3) — le troisième libellé est atteignable (« ${reason} »)`,
  );
}

/**
 * La ligne « Rivière » sur un groupe DÉJÀ ÉLIGIBLE (`c-salon-riviere`,
 * `memberCount: 5`) : grisée, motivée, et jamais un seuil déjà atteint.
 */
export async function checkEligibleRiverRow({ browser, BASE, setScheme, expect }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setScheme(context, 'dark');
  const page = await pageÀInstantFigé(context);
  await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: /Mode de lecture/ }).click();
  await page.waitForTimeout(200);

  const riverRow = page.getByRole('menuitemradio', { name: /Rivière/ });
  expect(
    (await riverRow.isDisabled()) === true,
    'Rivière (groupe ÉLIGIBLE, memberCount 5) reste désactivée — ce travail ne la rend pas encore',
  );

  const reason = ((await riverRow.textContent()) ?? '').trim();
  expect(
    reason.includes(RIVER_NOT_RENDERED_REASON),
    `Rivière éligible porte la raison « ${RIVER_NOT_RENDERED_REASON} » (« ${reason} »)`,
  );
  expect(
    !/aujourd'hui/.test(reason),
    `Rivière éligible NE PROMET PAS un seuil déjà atteint — jamais « … aujourd'hui » (« ${reason} »)`,
  );

  await context.close();
}
