// sharp, résolu sans dépendance neuve : $SHARP_MODULE, sinon le sharp du workspace de la passerelle (services/gateway),
// seul workspace du dépôt qui le déclare. L'encodeur WebP est celui de cette version de sharp : l'épingler, c'est
// épingler les octets des couches.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = () => {
  for (let dir = HERE; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'services/gateway/package.json'))) return dir;
  }
  return null;
};

function load() {
  const require = createRequire(import.meta.url);
  if (process.env.SHARP_MODULE) return require(process.env.SHARP_MODULE);
  const root = repoRoot();
  if (!root) throw new Error('sharp introuvable : poser $SHARP_MODULE.');
  return createRequire(path.join(root, 'services/gateway/package.json'))('sharp');
}

const sharp = load();
sharp.concurrency(1);
export default sharp;
export const sharpVersion = () => sharp.versions;
