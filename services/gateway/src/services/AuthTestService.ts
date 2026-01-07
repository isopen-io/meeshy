import { UserRoleEnum } from '@meeshy/shared/types';

// Interface pour les utilisateurs de test
export interface TestUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
  role: UserRoleEnum;
  password: string;
}

// Comptes de test basés sur COMPTES_DE_TEST.md
export const TEST_USERS: TestUser[] = [
  {
    id: 'alice_fr_id',
    username: 'alice_fr',
    email: 'alice@meeshy.me',
    firstName: 'Alice',
    lastName: 'Dubois',
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    role: UserRoleEnum.ADMIN,
    password: 'password123'
  },
  {
    id: 'bob_en_id',
    username: 'bob_en',
    email: 'bob@meeshy.me',
    firstName: 'Bob',
    lastName: 'Johnson',
    systemLanguage: 'en',
    regionalLanguage: 'es',
    customDestinationLanguage: 'fr',
    role: UserRoleEnum.USER,
    password: 'password123'
  },
  {
    id: 'carlos_es_id',
    username: 'carlos_es',
    email: 'carlos@meeshy.me',
    firstName: 'Carlos',
    lastName: 'García',
    systemLanguage: 'es',
    regionalLanguage: 'en',
    role: UserRoleEnum.USER,
    password: 'password123'
  },
  {
    id: 'dieter_de_id',
    username: 'dieter_de',
    email: 'dieter@meeshy.me',
    firstName: 'Dieter',
    lastName: 'Schmidt',
    systemLanguage: 'de',
    regionalLanguage: 'fr',
    role: UserRoleEnum.USER,
    password: 'password123'
  },
  {
    id: 'li_zh_id',
    username: 'li_zh',
    email: 'li@meeshy.me',
    firstName: 'Li',
    lastName: 'Wei',
    systemLanguage: 'zh',
    regionalLanguage: 'en',
    customDestinationLanguage: 'fr',
    role: UserRoleEnum.USER,
    password: 'password123'
  },
  {
    id: 'yuki_ja_id',
    username: 'yuki_ja',
    email: 'yuki@meeshy.me',
    firstName: 'Yuki',
    lastName: 'Tanaka',
    systemLanguage: 'ja',
    regionalLanguage: 'fr',
    customDestinationLanguage: 'ru',
    role: UserRoleEnum.USER,
    password: 'password123'
  },
  {
    id: 'maria_pt_id',
    username: 'maria_pt',
    email: 'maria@meeshy.me',
    firstName: 'Maria',
    lastName: 'Silva',
    systemLanguage: 'pt',
    regionalLanguage: 'ar',
    role: UserRoleEnum.USER,
    password: 'password123'
  }
];

export class AuthService {
  /**
   * Authentifie un utilisateur par username/password
   */
  static authenticate(username: string, password: string): TestUser | null {
    const user = TEST_USERS.find(u => u.username === username && u.password === password);
    return user || null;
  }

  /**
   * Authentifie un utilisateur par ID
   */
  static authenticateById(userId: string): TestUser | null {
    const user = TEST_USERS.find(u => u.id === userId);
    return user || null;
  }

  /**
   * Génère un token JWT simulé pour les tests
   */
  static generateToken(user: TestUser): string {
    const payload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 heures
    };
    
    // En mode développement, on simule un JWT
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Vérifie un token JWT simulé
   */
  static verifyToken(token: string): { userId: string; username: string; email: string; role: UserRoleEnum } | null {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64').toString());
      
      // Vérifier l'expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      
      return {
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        role: payload.role
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Récupère les permissions d'un utilisateur
   */
  static getUserPermissions(user: TestUser) {
    const { DEFAULT_PERMISSIONS } = require('../../shared/types');
    return DEFAULT_PERMISSIONS[user.role] || DEFAULT_PERMISSIONS[UserRoleEnum.USER];
  }

  /**
   * Vérifie si un utilisateur a une permission spécifique
   */
  static hasPermission(user: TestUser, permission: keyof ReturnType<typeof AuthService.getUserPermissions>): boolean {
    const permissions = this.getUserPermissions(user);
    return permissions[permission] || false;
  }

  /**
   * Vérifie si un utilisateur a un rôle spécifique ou supérieur
   */
  static hasRole(user: TestUser, requiredRole: UserRoleEnum): boolean {
    const { ROLE_HIERARCHY } = require('../../shared/types');
    const userLevel = ROLE_HIERARCHY[user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
  }

  /**
   * Récupère tous les utilisateurs de test
   */
  static getAllUsers(): TestUser[] {
    return TEST_USERS.map(user => ({ ...user, password: '***' }));
  }

  /**
   * Récupère un utilisateur par username
   */
  static getUserByUsername(username: string): TestUser | null {
    return TEST_USERS.find(u => u.username === username) || null;
  }

  /**
   * Récupère un utilisateur par ID
   */
  static getUserById(userId: string): TestUser | null {
    return TEST_USERS.find(u => u.id === userId) || null;
  }
}
