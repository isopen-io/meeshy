// Configuration Jest pour les tests unitaires du service Fastify

// Configuration des timeouts pour les tests
jest.setTimeout(10000);

// Mock des variables d'environnement pour les tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.GRPC_SERVER_URL = 'localhost:50051';
