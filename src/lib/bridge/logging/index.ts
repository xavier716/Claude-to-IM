/**
 * Structured Logging System for Claude-to-IM Bridge
 *
 * Provides consistent, structured logging with context awareness
 * and multiple output formats (console, file, JSON).
 */

import type { BridgeError } from '../errors/index.js';

/** Log levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Log context for tracing and debugging */
export interface LogContext {
  /** Channel type (feishu, weixin, telegram, etc.) */
  channel?: string;
  /** User ID */
  userId?: string;
  /** Chat ID */
  chatId?: string;
  /** Message ID */
  messageId?: string;
  /** Session ID */
  sessionId?: string;
  /** Permission request ID */
  permissionId?: string;
  /** Tool name */
  toolName?: string;
  /** Error code */
  errorCode?: string;
  /** Additional custom fields */
  [key: string]: unknown;
}

/** Structured log entry */
export interface LogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Context */
  context?: LogContext;
  /** Error (if applicable) */
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Logger configuration */
export interface LoggerConfig {
  /** Minimum log level */
  minLevel: LogLevel;
  /** Enable JSON output */
  jsonOutput: boolean;
  /** Enable console colors */
  colors: boolean;
  /** Include stack traces for errors */
  includeStackTraces: boolean;
}

/** Default logger configuration */
const defaultConfig: LoggerConfig = {
  minLevel: 'info',
  jsonOutput: false,
  colors: true,
  includeStackTraces: true,
};

/** Log level priority (higher = more important) */
const logLevelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** ANSI color codes for console output */
const colors = {
  reset: '\x1b[0m',
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  dim: '\x1b[2m',    // Dim
};

/** Logger class */
export class Logger {
  private config: LoggerConfig;
  private context: LogContext;

  constructor(
    private component: string,
    config: Partial<LoggerConfig> = {},
    baseContext: LogContext = {},
  ) {
    this.config = { ...defaultConfig, ...config };
    this.context = { ...baseContext };
  }

  /** Create a child logger with additional context */
  withContext(additionalContext: LogContext): Logger {
    const child = new Logger(this.component, this.config, {
      ...this.context,
      ...additionalContext,
    });
    return child;
  }

  /** Check if a log level should be output */
  private shouldLog(level: LogLevel): boolean {
    return logLevelPriority[level] >= logLevelPriority[this.config.minLevel];
  }

  /** Format a log entry for output */
  private formatEntry(entry: LogEntry): string {
    if (this.config.jsonOutput) {
      return JSON.stringify(entry);
    }

    // Human-readable format
    const time = entry.timestamp.slice(11, 23); // HH:MM:SS.mmm
    const level = entry.level.toUpperCase().padEnd(5);
    const component = `[${this.component}]`;

    let output = `${time} ${level} ${component} ${entry.message}`;

    // Add context
    if (entry.context && Object.keys(entry.context).length > 0) {
      const contextStr = Object.entries(entry.context)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      output += ` (${contextStr})`;
    }

    // Add error
    if (entry.error) {
      output += `\n  Error: ${entry.error.name}`;
      if (entry.error.code) {
        output += ` [${entry.error.code}]`;
      }
      output += `: ${entry.error.message}`;
      if (this.config.includeStackTraces && entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack.split('\n').slice(1).join('\n    ')}`;
      }
    }

    return output;
  }

  /** Output a log entry */
  private log(level: LogLevel, message: string, error?: Error | BridgeError, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context },
      metadata,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };

      // Add error code for BridgeError
      if ('code' in error) {
        entry.error.code = (error as BridgeError).code;
      }

      // Add error context
      if ('context' in error) {
        entry.context = { ...entry.context, ...(error as BridgeError).context };
      }
    }

    const formatted = this.formatMessage(entry);
    this.writeToConsole(level, formatted);
  }

  /** Write to console with colors */
  private writeToConsole(level: LogLevel, message: string): void {
    const color = this.config.colors ? colors[level] : '';
    const reset = this.config.colors ? colors.reset : '';
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(`${color}${message}${reset}`);
  }

  /** Format message with optional metadata */
  private formatMessage(entry: LogEntry): string {
    if (this.config.jsonOutput) {
      return JSON.stringify(entry);
    }

    const time = entry.timestamp.slice(11, 23); // HH:MM:SS.mmm
    const level = entry.level.toUpperCase().padEnd(5);
    const component = `[${this.component}]`;

    let parts = [time, level, component, entry.message];

    // Add context
    if (entry.context && Object.keys(entry.context).length > 0) {
      const contextStr = Object.entries(entry.context)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      if (contextStr) {
        parts.push(`(${contextStr})`);
      }
    }

    let output = parts.join(' ');

    // Add error
    if (entry.error) {
      output += `\n    Error: ${entry.error.name}`;
      if (entry.error.code) {
        output += ` [${entry.error.code}]`;
      }
      output += `: ${entry.error.message}`;
      if (this.config.includeStackTraces && entry.error.stack) {
        const stackLines = entry.error.stack.split('\n');
        const relevantStack = stackLines.slice(1, 4).join('\n      ');
        output += `\n      ${relevantStack}`;
      }
    }

    // Add metadata
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += `\n    Metadata: ${JSON.stringify(entry.metadata)}`;
    }

    return output;
  }

  /** Log debug message */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, undefined, metadata);
  }

  /** Log info message */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, undefined, metadata);
  }

  /** Log warning message */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, undefined, metadata);
  }

  /** Log error with optional error object */
  error(message: string, error?: Error | BridgeError, metadata?: Record<string, unknown>): void {
    this.log('error', message, error, metadata);
  }
}

/** Global logger instances by component name */
const loggers = new Map<string, Logger>();

/** Get or create a logger for a component */
export function getLogger(
  component: string,
  config?: Partial<LoggerConfig>,
  baseContext?: LogContext,
): Logger {
  let logger = loggers.get(component);
  if (!logger) {
    logger = new Logger(component, config, baseContext);
    loggers.set(component, logger);
  }
  return logger;
}

/** Create a logger with a specific context */
export function createLogger(
  component: string,
  baseContext: LogContext,
  config?: Partial<LoggerConfig>,
): Logger {
  return new Logger(component, config, baseContext);
}
