// Configuration Jest pour les tests unitaires du service Fastify

// Configuration des timeouts pour les tests
jest.setTimeout(10000);

// Mock des variables d'environnement pour les tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.GRPC_SERVER_URL = 'localhost:50051';

// Mock @signalapp/libsignal-client (ESM module that Jest can't handle)
jest.mock('@signalapp/libsignal-client', () => {
  // Helper to generate random bytes
  const randomBytes = (length) => {
    const arr = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  };

  // Create mock key pair class
  class MockPrivateKey {
    _keyBytes = randomBytes(32);
    _publicKeyBytes = randomBytes(32);

    static generate() {
      return new MockPrivateKey();
    }
    getPublicKey() {
      const pubBytes = this._publicKeyBytes;
      return {
        serialize: () => pubBytes,
        getPublicKeyBytes: () => pubBytes,
      };
    }
    serialize() {
      return this._keyBytes;
    }
    sign(data) {
      return randomBytes(64);
    }
  }

  class MockIdentityKeyPair {
    _privateKey = new MockPrivateKey();
    _publicKeyBytes = randomBytes(32);

    static generate() {
      return new MockIdentityKeyPair();
    }
    get publicKey() {
      const pubBytes = this._publicKeyBytes;
      return {
        serialize: () => pubBytes,
        getPublicKeyBytes: () => pubBytes,
      };
    }
    get privateKey() {
      return this._privateKey;
    }
    serialize() {
      return randomBytes(64);
    }
    getPublicKey() {
      return this.publicKey;
    }
  }

  class MockPreKeyRecord {
    _id = Math.floor(Math.random() * 16380) + 1;
    _publicKeyBytes = randomBytes(32);

    static new(id, publicKey) {
      const record = new MockPreKeyRecord();
      record._id = id;
      return record;
    }
    id() { return this._id; }
    publicKey() {
      const pubBytes = this._publicKeyBytes;
      return {
        serialize: () => pubBytes,
        getPublicKeyBytes: () => pubBytes
      };
    }
    serialize() {
      return randomBytes(64);
    }
  }

  class MockSignedPreKeyRecord {
    _id = Math.floor(Math.random() * 16380) + 1;
    _publicKeyBytes = randomBytes(32);
    _signature = randomBytes(64);

    static new(id, timestamp, publicKey, privateKey, signature) {
      const record = new MockSignedPreKeyRecord();
      record._id = id;
      return record;
    }
    id() { return this._id; }
    publicKey() {
      const pubBytes = this._publicKeyBytes;
      return {
        serialize: () => pubBytes,
        getPublicKeyBytes: () => pubBytes
      };
    }
    signature() {
      return this._signature;
    }
    serialize() {
      return randomBytes(128);
    }
  }

  return {
    PrivateKey: MockPrivateKey,
    IdentityKeyPair: MockIdentityKeyPair,
    PreKeyRecord: MockPreKeyRecord,
    SignedPreKeyRecord: MockSignedPreKeyRecord,
  };
});
