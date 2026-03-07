import { apiService } from './api.service';

export const monitoringService = {
  async getRealtime() {
    try {
      const response = await apiService.get('/admin/analytics/realtime');
      return response;
    } catch (error) {
      console.error('Error fetching realtime data:', error);
      throw error;
    }
  },
  async getHealth() {
    try {
      const response = await apiService.get('/health/ready');
      return response;
    } catch (error) {
      console.error('Error fetching health:', error);
      throw error;
    }
  },
  async getMetrics() {
    try {
      const response = await apiService.get('/health/metrics');
      return response;
    } catch (error) {
      console.error('Error fetching metrics:', error);
      throw error;
    }
  },
  async getCircuitBreakers() {
    try {
      const response = await apiService.get('/health/circuit-breakers');
      return response;
    } catch (error) {
      console.error('Error fetching circuit breakers:', error);
      throw error;
    }
  },
  async getKpis(period: '7d' | '30d' | '90d' = '7d') {
    try {
      const response = await apiService.get('/admin/analytics/kpis', { period });
      return response;
    } catch (error) {
      console.error('Error fetching KPIs:', error);
      throw error;
    }
  },
  async getVolumeTimeline() {
    try {
      const response = await apiService.get('/admin/analytics/volume-timeline');
      return response;
    } catch (error) {
      console.error('Error fetching volume timeline:', error);
      throw error;
    }
  },
  async getLanguageDistribution() {
    try {
      const response = await apiService.get('/admin/analytics/language-distribution');
      return response;
    } catch (error) {
      console.error('Error fetching language distribution:', error);
      throw error;
    }
  },
  async getUserDistribution() {
    try {
      const response = await apiService.get('/admin/analytics/user-distribution');
      return response;
    } catch (error) {
      console.error('Error fetching user distribution:', error);
      throw error;
    }
  },
  async getHourlyActivity() {
    try {
      const response = await apiService.get('/admin/analytics/hourly-activity');
      return response;
    } catch (error) {
      console.error('Error fetching hourly activity:', error);
      throw error;
    }
  },
  async getMessageTypes(period: '24h' | '7d' | '30d' = '7d') {
    try {
      const response = await apiService.get('/admin/analytics/message-types', { period });
      return response;
    } catch (error) {
      console.error('Error fetching message types:', error);
      throw error;
    }
  },
};
