/** Base64 standard (avec remplissage), celui de `Data.base64EncodedString()` et du schéma `BASE64` de l'annuaire. */
export function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export class Base64Error extends Error {
  constructor() {
    super('e2ee: base64 illisible');
    this.name = 'Base64Error';
  }
}

export function fromBase64(text: string): Uint8Array {
  try {
    const binary = atob(text);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new Base64Error();
  }
}
