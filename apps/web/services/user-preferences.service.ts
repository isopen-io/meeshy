import { apiService } from './api.service';
import type {
  UserConversationPreferences,
  UserConversationCategory,
  CreateUserConversationPreferencesRequest,
  UpdateUserConversationPreferencesRequest,
  CreateUserConversationCategoryRequest,
  UpdateUserConversationCategoryRequest,
  UserPreferencesResponse,
  UserCategoriesResponse,
} from '@meeshy/shared/types/user-preferences';

/**
 * Service pour gérer les préférences utilisateur des conversations
 * Gère les tags personnels, catégories, épinglage, archivage, etc.
 */
export class UserPreferencesService {
  // Cache des préférences utilisateur
  private preferencesCache: Map<string, UserConversationPreferences> = new Map();
  private categoriesCache: UserConversationCategory[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 60000; // 60 secondes

  /**
   * Vérifie si le cache est valide
   */
  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.CACHE_DURATION;
  }

  /**
   * Invalide le cache
   */
  private invalidateCache(): void {
    this.preferencesCache.clear();
    this.categoriesCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Transforme les données de préférences du backend vers le format frontend
   */
  private transformPreferencesData(backendPreferences: unknown): UserConversationPreferences {
    const prefs = backendPreferences as Record<string, unknown>;

    return {
      id: String(prefs.id),
      userId: String(prefs.userId),
      conversationId: String(prefs.conversationId),
      isPinned: Boolean(prefs.isPinned),
      categoryId: prefs.categoryId ? String(prefs.categoryId) : undefined,
      orderInCategory: prefs.orderInCategory !== undefined && prefs.orderInCategory !== null
        ? Number(prefs.orderInCategory)
        : undefined,
      isMuted: Boolean(prefs.isMuted),
      isArchived: Boolean(prefs.isArchived),
      tags: Array.isArray(prefs.tags) ? (prefs.tags as string[]) : [],
      customName: prefs.customName ? String(prefs.customName) : undefined,
      reaction: prefs.reaction ? String(prefs.reaction) : undefined,
      createdAt: new Date(String(prefs.createdAt)),
      updatedAt: new Date(String(prefs.updatedAt)),
    };
  }

  /**
   * Transforme les données de catégorie du backend vers le format frontend
   */
  private transformCategoryData(backendCategory: unknown): UserConversationCategory {
    const cat = backendCategory as Record<string, unknown>;

    return {
      id: String(cat.id),
      userId: String(cat.userId),
      name: String(cat.name),
      color: cat.color ? String(cat.color) : undefined,
      icon: cat.icon ? String(cat.icon) : undefined,
      order: Number(cat.order),
      isExpanded: Boolean(cat.isExpanded ?? true),
      createdAt: new Date(String(cat.createdAt)),
      updatedAt: new Date(String(cat.updatedAt)),
    };
  }

  /**
   * Récupère les préférences utilisateur pour une conversation spécifique
   */
  async getPreferences(conversationId: string): Promise<UserConversationPreferences | null> {
    try {
      // Vérifier le cache
      if (this.isCacheValid() && this.preferencesCache.has(conversationId)) {
        return this.preferencesCache.get(conversationId)!;
      }

      const response = await apiService.get<UserPreferencesResponse>(
        `/api/user-preferences/conversations/${conversationId}`
      );

      if (!response.data.success || !response.data.data) {
        return null;
      }

      const preferences = this.transformPreferencesData(response.data.data);
      this.preferencesCache.set(conversationId, preferences);
      this.cacheTimestamp = Date.now();

      return preferences;
    } catch (error: any) {
      // Si 404, la préférence n'existe pas encore (c'est normal)
      if (error.status === 404) {
        return null;
      }
      console.error('Erreur lors de la récupération des préférences:', error);
      throw error;
    }
  }

  /**
   * Récupère toutes les préférences utilisateur
   */
  async getAllPreferences(): Promise<UserConversationPreferences[]> {
    try {
      const response = await apiService.get<{
        success: boolean;
        data: unknown[];
      }>('/api/user-preferences/conversations');

      if (!response.data.success || !Array.isArray(response.data.data)) {
        return [];
      }

      const preferences = response.data.data.map(prefs =>
        this.transformPreferencesData(prefs)
      );

      // Mettre en cache
      preferences.forEach(prefs => {
        this.preferencesCache.set(prefs.conversationId, prefs);
      });
      this.cacheTimestamp = Date.now();

      return preferences;
    } catch (error) {
      console.error('Erreur lors de la récupération de toutes les préférences:', error);
      return [];
    }
  }

  /**
   * Crée ou met à jour les préférences utilisateur pour une conversation
   */
  async upsertPreferences(
    conversationId: string,
    data: CreateUserConversationPreferencesRequest | UpdateUserConversationPreferencesRequest
  ): Promise<UserConversationPreferences> {
    try {
      const response = await apiService.put<UserPreferencesResponse>(
        `/api/user-preferences/conversations/${conversationId}`,
        data
      );

      if (!response.data.success || !response.data.data) {
        throw new Error('Échec de la mise à jour des préférences');
      }

      const preferences = this.transformPreferencesData(response.data.data);

      // Mettre à jour le cache
      this.preferencesCache.set(conversationId, preferences);
      this.cacheTimestamp = Date.now();

      return preferences;
    } catch (error) {
      console.error('Erreur lors de la mise à jour des préférences:', error);
      throw error;
    }
  }

  /**
   * Supprime les préférences utilisateur pour une conversation
   */
  async deletePreferences(conversationId: string): Promise<void> {
    try {
      await apiService.delete(`/api/user-preferences/conversations/${conversationId}`);

      // Invalider le cache pour cette conversation
      this.preferencesCache.delete(conversationId);
    } catch (error) {
      console.error('Erreur lors de la suppression des préférences:', error);
      throw error;
    }
  }

  /**
   * Épingle ou désépingle une conversation
   */
  async togglePin(conversationId: string, isPinned: boolean): Promise<UserConversationPreferences> {
    return this.upsertPreferences(conversationId, { isPinned });
  }

  /**
   * Active ou désactive le mode silencieux
   */
  async toggleMute(conversationId: string, isMuted: boolean): Promise<UserConversationPreferences> {
    return this.upsertPreferences(conversationId, { isMuted });
  }

  /**
   * Archive ou désarchive une conversation
   */
  async toggleArchive(conversationId: string, isArchived: boolean): Promise<UserConversationPreferences> {
    return this.upsertPreferences(conversationId, { isArchived });
  }

  /**
   * Met à jour les tags d'une conversation
   */
  async updateTags(conversationId: string, tags: string[]): Promise<UserConversationPreferences> {
    return this.upsertPreferences(conversationId, { tags });
  }

  /**
   * Ajoute un tag à une conversation
   */
  async addTag(conversationId: string, tag: string): Promise<UserConversationPreferences> {
    try {
      const currentPrefs = await this.getPreferences(conversationId);
      const currentTags = currentPrefs?.tags || [];

      // Éviter les doublons
      if (currentTags.includes(tag)) {
        throw new Error('Ce tag existe déjà');
      }

      const updatedTags = [...currentTags, tag];
      return this.updateTags(conversationId, updatedTags);
    } catch (error) {
      console.error('Erreur lors de l\'ajout du tag:', error);
      throw error;
    }
  }

  /**
   * Supprime un tag d'une conversation
   */
  async removeTag(conversationId: string, tag: string): Promise<UserConversationPreferences> {
    try {
      const currentPrefs = await this.getPreferences(conversationId);
      const currentTags = currentPrefs?.tags || [];
      const updatedTags = currentTags.filter(t => t !== tag);

      return this.updateTags(conversationId, updatedTags);
    } catch (error) {
      console.error('Erreur lors de la suppression du tag:', error);
      throw error;
    }
  }

  /**
   * Met à jour la catégorie d'une conversation
   */
  async updateCategory(
    conversationId: string,
    categoryId: string | null,
    orderInCategory?: number
  ): Promise<UserConversationPreferences> {
    return this.upsertPreferences(conversationId, {
      categoryId,
      orderInCategory,
    });
  }

  /**
   * Met à jour le nom personnalisé d'une conversation
   */
  async updateCustomName(
    conversationId: string,
    customName: string | null
  ): Promise<UserConversationPreferences> {
    return this.upsertPreferences(conversationId, { customName });
  }

  /**
   * Met à jour la réaction sur une conversation
   */
  async updateReaction(
    conversationId: string,
    reaction: string | null
  ): Promise<UserConversationPreferences> {
    return this.upsertPreferences(conversationId, { reaction });
  }

  /**
   * Réordonne les conversations dans une catégorie
   */
  async reorderInCategory(
    updates: Array<{
      conversationId: string;
      orderInCategory: number;
    }>
  ): Promise<void> {
    try {
      await apiService.post('/api/user-preferences/reorder', { updates });

      // Invalider le cache
      this.invalidateCache();
    } catch (error) {
      console.error('Erreur lors du réordonnancement:', error);
      throw error;
    }
  }

  // ========== Gestion des catégories ==========

  /**
   * Récupère toutes les catégories de l'utilisateur
   */
  async getCategories(): Promise<UserConversationCategory[]> {
    try {
      // Vérifier le cache
      if (this.isCacheValid() && this.categoriesCache) {
        return this.categoriesCache;
      }

      const response = await apiService.get<UserCategoriesResponse>(
        '/api/user-preferences/categories'
      );

      if (!response.data.success || !Array.isArray(response.data.data)) {
        return [];
      }

      const categories = response.data.data
        .map(cat => this.transformCategoryData(cat))
        .sort((a, b) => a.order - b.order);

      this.categoriesCache = categories;
      this.cacheTimestamp = Date.now();

      return categories;
    } catch (error) {
      console.error('Erreur lors de la récupération des catégories:', error);
      return [];
    }
  }

  /**
   * Récupère une catégorie spécifique
   */
  async getCategory(categoryId: string): Promise<UserConversationCategory | null> {
    try {
      const response = await apiService.get<{
        success: boolean;
        data: unknown;
      }>(`/api/user-preferences/categories/${categoryId}`);

      if (!response.data.success || !response.data.data) {
        return null;
      }

      return this.transformCategoryData(response.data.data);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      console.error('Erreur lors de la récupération de la catégorie:', error);
      throw error;
    }
  }

  /**
   * Crée une nouvelle catégorie
   */
  async createCategory(
    data: CreateUserConversationCategoryRequest
  ): Promise<UserConversationCategory> {
    try {
      const response = await apiService.post<{
        success: boolean;
        data: unknown;
      }>('/api/user-preferences/categories', data);

      if (!response.data.success || !response.data.data) {
        throw new Error('Échec de la création de la catégorie');
      }

      const category = this.transformCategoryData(response.data.data);

      // Invalider le cache des catégories
      this.categoriesCache = null;

      return category;
    } catch (error) {
      console.error('Erreur lors de la création de la catégorie:', error);
      throw error;
    }
  }

  /**
   * Met à jour une catégorie
   */
  async updateCategory(
    categoryId: string,
    data: UpdateUserConversationCategoryRequest
  ): Promise<UserConversationCategory> {
    try {
      const response = await apiService.patch<{
        success: boolean;
        data: unknown;
      }>(`/api/user-preferences/categories/${categoryId}`, data);

      if (!response.data.success || !response.data.data) {
        throw new Error('Échec de la mise à jour de la catégorie');
      }

      const category = this.transformCategoryData(response.data.data);

      // Invalider le cache des catégories
      this.categoriesCache = null;

      return category;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la catégorie:', error);
      throw error;
    }
  }

  /**
   * Supprime une catégorie
   */
  async deleteCategory(categoryId: string): Promise<void> {
    try {
      await apiService.delete(`/api/user-preferences/categories/${categoryId}`);

      // Invalider le cache
      this.categoriesCache = null;
      this.invalidateCache();
    } catch (error) {
      console.error('Erreur lors de la suppression de la catégorie:', error);
      throw error;
    }
  }

  /**
   * Change l'état d'expansion d'une catégorie (accordéon)
   */
  async toggleCategoryExpanded(
    categoryId: string,
    isExpanded: boolean
  ): Promise<UserConversationCategory> {
    return this.updateCategory(categoryId, { isExpanded });
  }

  /**
   * Réordonne les catégories
   */
  async reorderCategories(
    updates: Array<{
      categoryId: string;
      order: number;
    }>
  ): Promise<void> {
    try {
      await apiService.post('/api/user-preferences/categories/reorder', { updates });

      // Invalider le cache
      this.categoriesCache = null;
    } catch (error) {
      console.error('Erreur lors du réordonnancement des catégories:', error);
      throw error;
    }
  }

  /**
   * Recherche des catégories par nom
   */
  searchCategories(query: string, categories?: UserConversationCategory[]): UserConversationCategory[] {
    const categoriesToSearch = categories || this.categoriesCache || [];
    const lowerQuery = query.toLowerCase();

    return categoriesToSearch.filter(cat =>
      cat.name.toLowerCase().includes(lowerQuery)
    );
  }
}

// Instance singleton
export const userPreferencesService = new UserPreferencesService();
