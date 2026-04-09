/**
 * Health Check and Monitoring System
 *
 * Provides health check endpoints and metrics collection for the Claude-to-IM bridge.
 */

import { getBridgeContext } from '../context.js';

/** Health status levels */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/** Service health status */
export interface ServiceHealth {
  name: string;
  status: 'up' | 'down';
  lastCheck: string;
  latency?: number;
  error?: string;
}

/** Overall health check response */
export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  services: ServiceHealth[];
}

/** Metrics data */
export interface MetricsData {
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  avgResponseTime: number;
  activeSessions: number;
  uptime: number;
}

/** Health checker */
export class HealthChecker {
  private startTime = Date.now();
  private serviceChecks = new Map<string, () => Promise<ServiceHealth>>();

  /**
   * Register a service health check function.
   */
  registerService(name: string, checkFn: () => Promise<ServiceHealth>): void {
    this.serviceChecks.set(name, checkFn);
  }

  /**
   * Get overall health status.
   */
  async getHealth(): Promise<HealthCheckResponse> {
    const services: ServiceHealth[] = [];

    for (const [name, checkFn] of this.serviceChecks) {
      try {
        const serviceHealth = await checkFn();
        services.push(serviceHealth);
      } catch (err) {
        services.push({
          name,
          status: 'down',
          lastCheck: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Determine overall status
    let status: HealthStatus = 'healthy';
    if (services.some(s => s.status === 'down')) {
      status = 'unhealthy';
    } else if (services.some(s => s.latency !== undefined && s.latency > 1000)) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      services,
    };
  }

  /**
   * Get metrics.
   */
  getMetrics(): MetricsData {
    const { store } = getBridgeContext();

    // Get message counts from store
    const messagesSent = store.getMetric?.('messages_sent') || 0;
    const messagesReceived = store.getMetric?.('messages_received') || 0;
    const errors = store.getMetric?.('errors') || 0;
    const avgResponseTime = store.getMetric?.('avg_response_time') || 0;
    const activeSessions = store.getActiveSessionIds?.().length || 0;

    return {
      messagesSent: Number(messagesSent),
      messagesReceived: Number(messagesReceived),
      errors: Number(errors),
      avgResponseTime: Number(avgResponseTime),
      activeSessions,
      uptime: Date.now() - this.startTime,
    };
  }
}

/** Global health checker instance */
export const healthChecker = new HealthChecker();

/**
 * Setup health checks for all adapters.
 */
export function setupAdapterHealthChecks(): void {
  const { bridgeManager } = getBridgeContext();

  if (!bridgeManager) {
    console.warn('[health-check] Bridge manager not available');
    return;
  }

  const adapters = bridgeManager.getAdapters?.() || [];

  for (const adapter of adapters) {
    healthChecker.registerService(
      adapter.channelType,
      async () => {
        const start = Date.now();

        try {
          // Check if adapter is running
          if (!adapter.isRunning?.()) {
            return {
              name: adapter.channelType,
              status: 'down',
              lastCheck: new Date().toISOString(),
              error: 'Adapter not running',
            };
          }

          // Basic health check: can we access the adapter?
          // For now, just check if it's running
          const latency = Date.now() - start;

          return {
            name: adapter.channelType,
            status: 'up',
            lastCheck: new Date().toISOString(),
            latency,
          };
        } catch (err) {
          return {
            name: adapter.channelType,
            status: 'down',
            lastCheck: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    );
  }
}
