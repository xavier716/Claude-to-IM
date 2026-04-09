/**
 * Permission Timeout Manager — automatically denies permission requests
 * that don't receive a response within the timeout period.
 *
 * This prevents deadlocks where a conversation hangs indefinitely
 * waiting for a user to respond to a permission request.
 */

import { getBridgeContext } from './context.js';

/** Default timeout for permission requests (5 minutes). */
const DEFAULT_PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

/** Active timeout timers by permission ID. */
const activeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/** Adapter info by permission ID for timeout notifications. */
interface PendingPermission {
  permissionRequestId: string;
  channelType: string;
  chatId: string;
  toolName: string;
  startTime: number;
}

const pendingPermissions = new Map<string, PendingPermission>();

/**
 * Set a timeout for a permission request.
 * If the user doesn't respond within the timeout period, the permission
 * will be automatically denied.
 *
 * @param permissionRequestId - The permission request ID
 * @param channelType - The channel type (for logging)
 * @param chatId - The chat ID (for logging)
 * @param toolName - The tool name (for logging)
 * @param timeoutMs - Timeout in milliseconds (default: 5 minutes)
 */
export function setPermissionTimeout(
  permissionRequestId: string,
  channelType: string,
  chatId: string,
  toolName: string,
  timeoutMs: number = DEFAULT_PERMISSION_TIMEOUT_MS,
): void {
  // Clear any existing timeout for this permission
  clearPermissionTimeout(permissionRequestId);

  // Track this permission
  pendingPermissions.set(permissionRequestId, {
    permissionRequestId,
    channelType,
    chatId,
    toolName,
    startTime: Date.now(),
  });

  // Set timeout to auto-deny
  const timer = setTimeout(() => {
    handlePermissionTimeout(permissionRequestId);
  }, timeoutMs);

  activeTimeouts.set(permissionRequestId, timer);

  console.log(
    `[permission-timeout] Set ${timeoutMs / 1000}s timeout for permission ${permissionRequestId} (tool: ${toolName}, channel: ${channelType})`
  );
}

/**
 * Clear a permission timeout (e.g., when user responds).
 *
 * @param permissionRequestId - The permission request ID
 */
export function clearPermissionTimeout(permissionRequestId: string): void {
  const timer = activeTimeouts.get(permissionRequestId);
  if (timer) {
    clearTimeout(timer);
    activeTimeouts.delete(permissionRequestId);
    console.log(`[permission-timeout] Cleared timeout for permission ${permissionRequestId}`);
  }
  pendingPermissions.delete(permissionRequestId);
}

/**
 * Handle a permission timeout by auto-denying the request.
 */
function handlePermissionTimeout(permissionRequestId: string): void {
  const pending = pendingPermissions.get(permissionRequestId);
  if (!pending) {
    // Permission was already cleared
    return;
  }

  const { permissions } = getBridgeContext();

  // Auto-deny the permission
  const denied = permissions.resolvePendingPermission(permissionRequestId, {
    behavior: 'deny',
    message: `Permission request timed out after ${DEFAULT_PERMISSION_TIMEOUT_MS / 1000 / 60} minutes`,
  });

  if (denied) {
    console.warn(
      `[permission-timeout] Auto-denied permission ${permissionRequestId} (tool: ${pending.toolName}) due to timeout`
    );
  } else {
    console.warn(
      `[permission-timeout] Failed to auto-deny permission ${permissionRequestId} - may have already been resolved`
    );
  }

  // Clean up
  activeTimeouts.delete(permissionRequestId);
  pendingPermissions.delete(permissionRequestId);
}

/**
 * Get all pending permissions (for monitoring/debugging).
 */
export function getPendingPermissions(): PendingPermission[] {
  return Array.from(pendingPermissions.values());
}

/**
 * Get the count of pending permissions.
 */
export function getPendingPermissionCount(): number {
  return pendingPermissions.size;
}
