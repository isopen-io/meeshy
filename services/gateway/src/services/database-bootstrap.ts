/**
 * La SÉQUENCE de démarrage de la base — extraite de `server.ts` pour qu'elle
 * soit EXÉCUTABLE par un témoin (#6581).
 *
 * Ce qui vit ici tient en une phrase : **ce qui est un invariant de CHAQUE
 * boot passe HORS de la porte `shouldInitialize()`, ce qui est un ensemencement
 * passe DEDANS.** Cette porte ne s'ouvre que sur une base VIDE — ses six
 * lectures rendent toutes une ligne sur une base saine —, et l'y oublier produit
 * du code MORT qui se lit comme un correctif livré :
 *
 *  · `ensurePostGeoIndex` a payé cette confusion d'un 500 en production le
 *    2026-08-25 (`$geoNear requires a 2d or 2dsphere index`) ;
 *  · `ensureSeedAccountsVerified` la rejouait au premier jet de #6581.
 *
 * Tant que la séquence vivait en ligne dans `initializeServices()`, le seul
 * témoin possible de sa forme était un `grep` sur `server.ts` — une lecture de
 * TEXTE, qui reste verte quand le comportement disparaît. Elle prend donc un
 * CONTRAT (`DatabaseBootstrapSteps`) qu'un double implémente, et l'ordre des
 * appels devient observable.
 *
 * ORDRE, et pourquoi :
 *  1. les invariants de SCHÉMA d'abord — ils s'appliquent à une base déjà
 *     peuplée, donc jamais derrière la porte ;
 *  2. l'ensemencement, derrière la porte, qui n'a de sens que sur une base vide ;
 *  3. la vérification d'e-mail des comptes semés APRÈS l'ensemencement, pour que
 *     la base fraîchement semée et la base héritée passent par le MÊME site.
 */

export type DatabaseBootstrapSteps = {
  ensurePostGeoIndex(): Promise<void>;
  ensureFriendRequestIndexes(): Promise<void>;
  ensureContactDeltaIndex(): Promise<void>;
  shouldInitialize(): Promise<boolean>;
  initializeDatabase(): Promise<void>;
  ensureSeedAccountsVerified(): Promise<void>;
};

export type BootstrapLogger = { info(message: string): void };

const SILENT: BootstrapLogger = { info: () => {} };

export async function bootstrapDatabase(
  steps: DatabaseBootstrapSteps,
  logger: BootstrapLogger = SILENT,
): Promise<void> {
  await steps.ensurePostGeoIndex();
  await steps.ensureFriendRequestIndexes();
  await steps.ensureContactDeltaIndex();

  if (await steps.shouldInitialize()) {
    logger.info(
      process.env.FORCE_DB_RESET === 'true'
        ? '🔄 FORCE_DB_RESET=true - Database will be completely reset and reinitialized'
        : '🔧 Database initialization required, starting...',
    );
    await steps.initializeDatabase();
    logger.info('✅ Database initialization completed successfully');
  } else {
    logger.info('✅ Database already initialized, skipping initialization');
  }

  await steps.ensureSeedAccountsVerified();
}
