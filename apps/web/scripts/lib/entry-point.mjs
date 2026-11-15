/**
 * LE PILOTE D'UN GATE NE TOURNE QUE S'IL EST EXÉCUTÉ (#7869).
 *
 * Un gate importable par son témoin garde son `main()` derrière cette
 * question. Les deux chemins sont comparés RÉSOLUS : node rend
 * `import.meta.url` sans ses liens symboliques et laisse `process.argv[1]` tel
 * qu'il a été tapé ; les comparer bruts rendait le gate muet — rc 0, aucune
 * sortie — dès qu'il était lancé par un chemin à lien symbolique.
 *
 * Usage : `if (isEntryPoint({ moduleUrl: import.meta.url, invokedPath: process.argv[1] })) main();`
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const resolvedPath = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
};

export const isEntryPoint = ({ moduleUrl, invokedPath }) => {
  const invoked = invokedPath === undefined ? undefined : resolvedPath(invokedPath);
  return invoked !== undefined && invoked === resolvedPath(fileURLToPath(moduleUrl));
};
