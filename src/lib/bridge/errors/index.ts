/**
 * Unified Error Handling System for Claude-to-IM Bridge
 *
 * Provides standardized error types, codes, and handling patterns
 * across all bridge components.
 */

/** Error codes for categorization and monitoring */
export const ErrorCodes = {
  // API Errors (E1xx)
  API_RATE_LIMIT: 'E101',
  API_TIMEOUT: 'E102',
  API_AUTH_FAILED: 'E103',
  API_NETWORK_ERROR: 'E104',
  API_PARSE_ERROR: 'E105',

  // Message Errors (E2xx)
  MESSAGE_TOO_LARGE: 'E201',
  MESSAGE_SEND_FAILED: 'E202',
 _MESSAGE_INVALID_FORMAT: 'E203',

  // Connection Errors (E3xx)
  CONNECTION_LOST: 'E301',
  RECONNECT_FAILED: 'E302',
  WEBSOCKET_ERROR: 'E303',

  // Permission Errors (E4xx)
  PERMISSION_DENIED: 'E401',
  PERMISSION_TIMEOUT: 'E402',
  PERMISSION_INVALID: 'E403',

  // Session Errors (E5xx)
  SESSION_LOCKED: 'E501',
  SESSION_EXPIRED: 'E502',
  SESSION_NOT_FOUND: 'E503',

  // Configuration Errors (E6xx)
  CONFIG_MISSING: 'E601',
  CONFIG_INVALID: 'E602',

  // Internal Errors (E9xx)
  INTERNAL_ERROR: 'E900',
  NOT_IMPLEMENTED: 'E901',
} as const;

/** Error severity levels */
export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Error recovery strategies */
export type RecoveryStrategy =
  | 'retry' // Automatically retry the operation
  | 'fallback' // Use a fallback mechanism
  | 'abort' // Abort the operation
  | 'ignore' // Ignore and continue
  | 'manual'; // Requires manual intervention

/** Base error class for all bridge errors */
export class BridgeError extends Error {
  constructor(
    public code: string,
    message: string,
    public severity: ErrorSeverity = 'medium',
    public recoverable: boolean = true,
    public recoveryStrategy: RecoveryStrategy = 'manual',
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /** Convert to JSON for logging */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      recoverable: this.recoverable,
      recoveryStrategy: this.recoveryStrategy,
      context: this.context,
      stack: this.stack,
    };
  }
}

/** API-specific errors */
export class ApiError extends BridgeError {
  constructor(
    code: keyof typeof ErrorCodes,
    message: string,
    public readonly originalError?: Error,
    context?: Record<string, unknown>,
  ) {
    super(
      ErrorCodes[code],
      message,
      'high',
      true,
      'retry',
      context,
    );
    this.name = 'ApiError';
  }
}

/** Message-specific errors */
export class MessageError extends BridgeError {
  constructor(
    code: keyof typeof ErrorCodes,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(
      ErrorCodes[code],
      message,
      'medium',
      true,
      'fallback',
      context,
    );
    this.name = 'MessageError';
  }
}

/** Connection-specific errors */
export class ConnectionError extends BridgeError {
  constructor(
    code: keyof typeof ErrorCodes,
    message: string,
    public readonly originalError?: Error,
    context?: Record<string, unknown>,
  ) {
    super(
      ErrorCodes[code],
      message,
      'critical',
      true,
      'retry',
      context,
    );
    this.name = 'ConnectionError';
  }
}

/** Permission-specific errors */
export class PermissionError extends BridgeError {
  constructor(
    code: keyof typeof ErrorCodes,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(
      ErrorCodes[code],
      message,
      'medium',
      true,
      'abort',
      context,
    );
    this.name = 'PermissionError';
  }
}

/** Helper: Wrap any error in a BridgeError */
export function wrapError(
  err: unknown,
  defaultCode: keyof typeof ErrorCodes = 'INTERNAL_ERROR',
  defaultMessage = 'Unknown error occurred',
): BridgeError {
  if (err instanceof BridgeError) {
    return err;
  }

  if (err instanceof Error) {
    return new BridgeError(
      ErrorCodes[defaultCode],
      err.message || defaultMessage,
      'medium',
      true,
      'manual',
      { originalError: err.name, originalMessage: err.message },
    );
  }

  return new BridgeError(
    ErrorCodes[defaultCode],
    defaultMessage,
    'medium',
    true,
    'manual',
    { originalValue: String(err) },
  );
}

/** Helper: Determine if an error is recoverable */
export function isRecoverableError(err: unknown): boolean {
  if (err instanceof BridgeError) {
    return err.recoverable;
  }
  return true; // Assume recoverable for unknown errors
}

/** Helper: Get recovery strategy for an error */
export function getRecoveryStrategy(err: unknown): RecoveryStrategy {
  if (err instanceof BridgeError) {
    return err.recoveryStrategy;
  }
  return 'manual';
}
