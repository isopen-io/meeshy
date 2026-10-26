import { promises as fs } from 'fs';
import path from 'path';
import { unsealAllAtRestFiles } from '../../services/attachments/atRest/atRestUnseal';
import { AT_REST, allAtRestRecords, designatedKeyring, mongoAtRestStore } from './atRestMongo';
import type { NamedMigration } from './types';

/**
 * #13100 — le RETOUR ARRIÈRE du scellement au repos, à jouer AVANT de
 * redéployer une passerelle plus ancienne que ce lot : chaque fichier scellé
 * est rouvert en place et sa ligne part (`atRestUnseal.ts`). Les lignes de
 * scellement dont le fichier n'existe plus sont retirées. À blanc par défaut ;
 * en production, feu vert du porteur et sauvegarde vérifiée avant --apply —
 * rouvrir remet du clair sur le disque.
 */
export const serverAtRestAttachmentFilesUnseal: NamedMigration = {
  name: '2026-10-26-server-at-rest-attachment-files-unseal',
  issue: '#13100',
  summary: 'RETOUR ARRIÈRE : rouvre en place les fichiers scellés au repos, avant de redéployer une passerelle antérieure',
  async run({ db, dryRun, env, log }) {
    const uploadRoot = env.UPLOAD_PATH || '/app/uploads';
    const records = await allAtRestRecords(db);
    const orphans = (await db.collection(AT_REST).find({}, { projection: { storageKey: 1 } }).toArray())
      .filter((doc) => typeof doc.storageKey !== 'string');
    const access = { store: mongoAtRestStore(db), keyring: designatedKeyring(db, env) };
    const missing = await Promise.all(records.map(async (record) => ((await fs.stat(path.join(uploadRoot, record.storageKey)).then(() => false, () => true)) ? record.storageKey : null)));
    const absentKeys = missing.filter((key): key is string => key !== null);
    log(`  lignes sans fichier : ${absentKeys.length + orphans.length}`);
    if (!dryRun) {
      await Promise.all(absentKeys.map((storageKey) => db.collection(AT_REST).deleteOne({ storageKey })));
      await Promise.all(orphans.map((doc) => db.collection(AT_REST).deleteOne({ _id: doc._id })));
    }
    await unsealAllAtRestFiles({ uploadRoot, access, records: async () => records.filter((record) => !absentKeys.includes(record.storageKey)) }, { dryRun, log });
  },
};
