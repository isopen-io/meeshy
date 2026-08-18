import {
  usernamePatternSource,
  registerRequestSchema,
} from '../types/api-schemas';
import { AuthSchemas, updateUsernameSchema, CommonSchemas } from '../utils/validation';
import { usernameSchema } from '../types/validation';
import {
  createUserValidationSchema,
  updateUserProfileValidationSchema,
} from '../types/validation/admin-user';

const REJECTED = ['la lionne noire', 'a b', ' ab', 'ab ', 'a\tb', 'josé', 'a.b', 'a@b'];
const ACCEPTED = ['abc', 'a_b-1', 'ABC123', '__', '--'];

describe('usernamePatternSource', () => {
  it('est ancré des deux côtés', () => {
    expect(usernamePatternSource.startsWith('^')).toBe(true);
    expect(usernamePatternSource.endsWith('$')).toBe(true);
  });

  // `pattern` en JSON Schema est une recherche ECMA-262 NON ancrée : Ajv fait
  // exactement `new RegExp(source).test(value)`. Reproduire cette sémantique ici
  // teste le vrai comportement d'Ajv sans tirer la dépendance dans ce paquet.
  // Le verdict d'Ajv RÉEL, monté dans Fastify, est vérifié côté gateway.
  const ajvSemantics = (value: string) => new RegExp(usernamePatternSource).test(value);

  it.each(REJECTED)('rejette %j', (value) => {
    expect(ajvSemantics(value)).toBe(false);
  });

  it.each(ACCEPTED)('accepte %j', (value) => {
    expect(ajvSemantics(value)).toBe(true);
  });
});

describe('registerRequestSchema (couche Ajv)', () => {
  it('porte le pattern sur username', () => {
    // Le typeof d'abord : sans lui, l'égalité serait vraie À VIDE tant que ni le
    // schéma ni la source ne sont définis — le test passerait sans rien prouver.
    expect(typeof registerRequestSchema.properties.username.pattern).toBe('string');
    expect(registerRequestSchema.properties.username.pattern).toBe(usernamePatternSource);
  });
});

// Chaque schéma username exporté doit rendre le MÊME verdict que la couche Ajv.
// La garde porte sur le COMPORTEMENT, pas sur l'absence textuelle du littéral :
// un schéma qui réintroduirait sa propre copie divergente échouerait ici.
const zodUsernameGates: ReadonlyArray<readonly [string, (value: string) => boolean]> = [
  ['AuthSchemas.register', (v) => AuthSchemas.register.shape.username.safeParse(v).success],
  ['updateUsernameSchema', (v) => updateUsernameSchema.shape.newUsername.safeParse(v).success],
  ['CommonSchemas.username', (v) => CommonSchemas.username.safeParse(v).success],
  ['usernameSchema', (v) => usernameSchema.safeParse(v).success],
  ['admin create', (v) => createUserValidationSchema.shape.username.safeParse(v).success],
  ['admin update', (v) => updateUserProfileValidationSchema.shape.username.safeParse(v).success],
];

describe.each(zodUsernameGates)('schéma Zod %s', (_name, accepts) => {
  it.each(['la lionne noire', 'a b', 'josé'])('rejette %j', (value) => {
    expect(accepts(value)).toBe(false);
  });

  it('accepte un handle conforme assez long pour toutes les bornes', () => {
    expect(accepts('a_b-1234')).toBe(true);
  });
});
