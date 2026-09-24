#!/usr/bin/env node
/**
 * VÉRIFIE QUE **TOUTE** SURFACE QUI MONTE `Avatar` LUI DONNE UN `src` (#6975).
 *
 * LE GATE DE PIXELS (`check-avatar-pixels.mjs`) prouve que la loi PEINT. Il ne
 * peut pas prouver qu'aucune surface n'est OUBLIÉE : il n'interroge que les
 * écrans qu'il ouvre, et une application de soixante routes en a toujours un
 * qu'aucun navigateur de gate ne visite. Le défaut de #6975 était exactement
 * de cette forme — douze surfaces servaient la photo, dix-sept ne la servaient
 * pas, et la différence n'était visible qu'en lisant les dix-sept.
 *
 * C'EST DONC UNE GARDE D'INVENTAIRE, et elle vaut pour la surface qui n'existe
 * pas encore : la dix-huitième, écrite dans six mois, rougira ici à la seconde
 * où elle monte un avatar muet. La leçon du dépôt est qu'une énumération porte
 * DEUX affirmations — « ces sites appliquent la règle » (vérifiable) et « ce
 * sont les sites où la règle s'applique » (presque jamais vérifiée). Ce script
 * vérifie la seconde, qui est celle qui a manqué.
 *
 * LES EXEMPTIONS SONT NOMMÉES, PAS DEVINÉES. Une surface ne peut être muette
 * que si la donnée n'existe PAS — jamais parce qu'on ne l'a pas branchée. Le
 * registre ci-dessous porte, pour chacune, où la chaîne s'interrompt et ce
 * qu'il faudrait ouvrir pour la fermer. Une exemption dont le site a disparu
 * rougit aussi : sans quoi le registre survivrait aux surfaces qu'il décrit et
 * mentirait en silence (leçon « un détecteur par nom sort VERT par absence »).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

/**
 * LES SURFACES AUTORISÉES À NE PAS SERVIR DE PHOTO — parce que la donnée
 * n'atteint pas le composant, avec l'endroit EXACT où la chaîne s'arrête.
 */
/**
 * LE REGISTRE EST VIDE (#6985) — et c'est un état, pas un oubli.
 *
 * Il portait `components/typing-roster-cell.tsx` (2 avatars), au motif que
 * `TypingEntry` ne porte aucune photo et que la charge `typing:start` n'en
 * sert pas. L'exemption nommait elle-même les deux issues possibles : élargir
 * le fil, « soit que l'hôte (`routes/thread-modes.tsx`) résolve le frappeur
 * contre `conversation.participants` ».
 *
 * C'est la seconde qui a été retenue : élargir `typing:start` aurait dupliqué
 * l'avatar à chaque frappe de chaque personne, alors que l'hôte a déjà ses
 * participants en cache. La chaîne est donc fermée, et l'exemption tombe —
 * comme ce fichier l'exige de toute exemption dont le motif a disparu.
 *
 * Une surface ne peut revenir ici que si la donnée n'existe PAS, jamais parce
 * qu'on ne l'a pas branchée, et avec l'endroit EXACT où la chaîne s'arrête.
 */
const EXEMPTIONS = [];

/**
 * LES RELAIS (#7828) — un composant qui ENVELOPPE `Avatar` et lui RÉPAND ses
 * props (`<Avatar {...props} />`) ne choisit aucune photo : c'est son hôte
 * qui la choisit. Le relais sort donc du compte, et sa BALISE y entre à la
 * place de la sienne — sans quoi renommer `<Avatar` en `<AuthorAvatar` dans la
 * bulle et la rangée plate les aurait fait sortir de l'inventaire, VERTES par
 * absence (« un renommage inverse les gardes qui reconnaissent par le nom »).
 *
 * Un relais qui cesserait de répandre ses props rougit : il choisirait alors
 * lui-même, et devrait servir un `src` comme tout le monde.
 */
const RELAIS = [{ fichier: 'components/author-avatar.tsx', balise: '<AuthorAvatar' }];
const BALISES = ['<Avatar', ...RELAIS.map((relais) => relais.balise)];

const fichiers = [];
const parcours = (dir) => {
  for (const entry of readdirSync(dir)) {
    const chemin = join(dir, entry);
    if (statSync(chemin).isDirectory()) {
      parcours(chemin);
      continue;
    }
    if (!entry.endsWith('.tsx') || entry.includes('.test.')) continue;
    fichiers.push(chemin);
  }
};
parcours(SRC);

/**
 * LE TEXTE D'UN ÉLÉMENT JSX, de `<Avatar` à sa fermeture — compté en
 * PROFONDEUR d'accolades pour qu'un `{...(x ? { src } : {})}` imbriqué ne
 * coupe pas l'élément au premier `>` rencontré dans une expression.
 */
const elementAt = (source, start) => {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
};

/**
 * `src` SOUS SES TROIS ÉCRITURES du dépôt : l'attribut (`src={x}`), la clé
 * d'un objet répandu (`{...( … ? { src: x } : {})}`) et son RACCOURCI
 * (`{...(x === undefined ? {} : { src })}`) — cette troisième forme a fait
 * rougir ce gate sur un site CORRECT à sa première écriture, faute de la
 * reconnaître. Un détecteur qui ne connaît qu'une syntaxe mesure la syntaxe,
 * pas la règle.
 */
const SRC_PROP = /(^|[\s{,])src\s*(?:[=:]|[},])/;

const muettes = new Map();
for (const chemin of fichiers) {
  const source = readFileSync(chemin, 'utf8');
  const cle = relative(SRC, chemin);
  const relais = RELAIS.some((r) => r.fichier === cle);
  for (const balise of BALISES) {
    for (let i = source.indexOf(balise); i !== -1; i = source.indexOf(balise, i + 1)) {
      /* `<AvatarQuelqueChose` n'est pas `<Avatar` — la limite de mot compte. */
      const apres = source[i + balise.length];
      if (apres !== undefined && /[A-Za-z0-9_]/.test(apres)) continue;
      const element = elementAt(source, i);
      if (SRC_PROP.test(element)) continue;
      if (relais && balise === '<Avatar' && /\{\.\.\.props\}/.test(element)) continue;
      muettes.set(cle, (muettes.get(cle) ?? 0) + 1);
    }
  }
}

const failures = [];

for (const exemption of EXEMPTIONS) {
  const trouvees = muettes.get(exemption.fichier) ?? 0;
  if (trouvees === 0) {
    failures.push(
      `EXEMPTION PÉRIMÉE — « ${exemption.fichier} » ne monte plus aucun avatar muet : retirer son entrée du registre (raison enregistrée : ${exemption.pourquoi})`,
    );
    continue;
  }
  if (trouvees !== exemption.combien) {
    failures.push(
      `EXEMPTION DÉSACCORDÉE — « ${exemption.fichier} » monte ${trouvees} avatar(s) muet(s), le registre en déclare ${exemption.combien}`,
    );
  }
  muettes.delete(exemption.fichier);
}

for (const [fichier, combien] of muettes) {
  failures.push(
    `AVATAR MUET — « ${fichier} » monte ${combien} \`Avatar\` sans \`src\`. La photo se résout par \`avatarOf\` / \`participantAvatarOf\` (\`lib/view/conversation.ts\`), qui appliquent la loi PARTAGÉE \`resolveParticipantAvatar\` — jamais une boucle \`participant.avatar ?? participant.user?.avatar\` recopiée sur place. Si la donnée n'atteint VRAIMENT pas ce composant, l'inscrire dans EXEMPTIONS en disant OÙ la chaîne s'arrête.`,
  );
}

if (failures.length > 0) {
  console.error('check-avatar-src: ROUGE');
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
const exemptes = EXEMPTIONS.reduce((n, e) => n + e.combien, 0);
console.log(
  `check-avatar-src: vert — ${fichiers.length} fichiers balayés, chaque \`Avatar\` sert un \`src\` sauf ${exemptes} mont(s) exempté(s) et documenté(s).`,
);
