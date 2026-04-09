# Claude-to-IM Comprehensive Optimization Design

**Date**: 2026-04-09
**Author**: Claude (AI Assistant)
**Status**: In Progress

## Executive Summary

This document outlines a comprehensive optimization plan for the Claude-to-IM bridge project. The optimization is divided into 4 phases, each addressing specific aspects of stability, architecture, performance, and user experience.

## Problem Statement

The Claude-to-IM project has several identified issues:

| Category | Issue | Severity |
|----------|-------|----------|
| API Correctness | Feishu CardKit uses non-existent endpoints | 🔴 High |
| Reliability | No permission timeout mechanism | 🔴 High |
| Error Handling | Inconsistent error handling across components | 🟡 Medium |
| Logging | Unstructured logging, difficult debugging | 🟡 Medium |
| Code Quality | feishu-adapter.ts: 1592 lines (too large) | 🟡 Medium |
| Monitoring | No health checks or metrics | 🟡 Medium |
| Documentation | Missing architecture docs | 🟢 Low |

## Phase 1: Stability Fixes (1 week) ✅

### 1.1 Fix Feishu CardKit API

**Problem**: Using non-existent `/open-apis/cardkit/v1/cards/{id}/stream_content` endpoint

**Solution**: Use correct `PATCH /open-apis/im/v1/messages/{message_id}` endpoint

**Implementation**:
- Created `CardKitApiClient` class
- Implemented `updateCardMessage()` method
- Implemented `streamCardContent()` method

**Files Modified**:
- `src/lib/bridge/adapters/feishu-adapter.ts`
- `src/lib/bridge/adapters/feishu/cardkit-api.ts` (new)

**Verification**: Send test message to Feishu bot and verify streaming works

### 1.2 Permission Timeout Mechanism

**Problem**: Permission requests can hang indefinitely, blocking conversations

**Solution**: Auto-deny permissions after 5 minutes

**Implementation**:
```typescript
// src/lib/bridge/permission-timeout.ts
export function setPermissionTimeout(
  permissionRequestId: string,
  channelType: string,
  chatId: string,
  toolName: string,
  timeoutMs: number = 5 * 60 * 1000,
): void

export function clearPermissionTimeout(permissionRequestId: string): void
```

**Files Modified**:
- `src/lib/bridge/permission-broker.ts`
- `src/lib/bridge/permission-timeout.ts` (new)

**Verification**:
1. Send message that triggers permission request
2. Wait 5 minutes without responding
3. Verify auto-deny occurs
4. Verify conversation continues

### 1.3 Unified Error Handling

**Problem**: Inconsistent error handling across components

**Solution**: Standardized error types and handling

**Implementation**:
```typescript
// src/lib/bridge/errors/index.ts
export class BridgeError extends Error
export class ApiError extends BridgeError
export class MessageError extends BridgeError
export class ConnectionError extends BridgeError
export class PermissionError extends BridgeError

export const ErrorCodes = {
  API_RATE_LIMIT: 'E101',
  API_TIMEOUT: 'E102',
  // ... more codes
}
```

**Files Created**:
- `src/lib/bridge/errors/index.ts`

**Usage Example**:
```typescript
throw new ApiError('API_TIMEOUT', 'Request timed out', originalError, {
  endpoint: '/api/messages',
  timeout: 10000
});
```

### 1.4 Structured Logging

**Problem**: Unstructured logs make debugging difficult

**Solution**: JSON-structured logging with context

**Implementation**:
```typescript
// src/lib/bridge/logging/index.ts
export class Logger {
  debug(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
  error(message: string, error?: Error, metadata?: Record<string, unknown>): void
}

export function getLogger(component: string, config?: LoggerConfig): Logger
export function createLogger(component: string, context: LogContext): Logger
```

**Files Created**:
- `src/lib/bridge/logging/index.ts`

**Log Format**:
```
2026-04-09T14:30:45.123Z INFO  [feishu-adapter] Card created (chatId=oc_xxx, messageId=om_xxx)
```

## Phase 2: Architecture Improvements (2-3 weeks) 🔄

### 2.1 Modularization

**Problem**: feishu-adapter.ts is 1592 lines (too large)

**Solution**: Split into focused modules

**New Structure**:
```
src/lib/bridge/adapters/feishu/
├── cardkit-api.ts          # CardKit HTTP API client
├── streaming-cards.ts      # Streaming card lifecycle
├── content-parser.ts       # Message content parsing
├── event-handler.ts        # Event processing
├── message-sender.ts       # Message sending logic
└── index.ts               # Main adapter (orchestration)
```

**Benefits**:
- Easier to understand and maintain
- Better testability
- Clear separation of concerns
- Reusable components

### 2.2 Adapter Pattern Refinement

**Current**: Monolithic adapters with mixed concerns

**Target**: Focused adapters with clear responsibilities

**Refactored Structure**:
```typescript
// Main adapter (orchestration only)
class FeishuAdapter extends BaseChannelAdapter {
  private apiClient: CardKitApiClient;
  private cardManager: StreamingCardManager;
  private eventHandler: FeishuEventHandler;
  private messageSender: FeishuMessageSender;

  // Thin layer: delegate to specialists
}
```

### 2.3 Dependency Injection

**Problem**: Tight coupling between components

**Solution**: Constructor-based DI

**Example**:
```typescript
class StreamingCardManager {
  constructor(
    private apiClient: CardKitApiClient,
    private options: StreamingCardManagerOptions,
  ) {}
}
```

## Phase 3: Performance Optimizations (1-2 weeks) 📋

### 3.1 Caching Layer

**Target**: Reduce redundant API calls

**Implementation**:
```typescript
// src/lib/bridge/cache/
class CacheManager<T> {
  get(key: string): T | undefined
  set(key: string, value: T, ttl: number): void
  invalidate(key: string): void
  clear(): void
}
```

**Use Cases**:
- Tenant access token caching
- Bot identity caching
- User info caching

### 3.2 Connection Pooling

**Target**: Efficient HTTP connection reuse

**Implementation**:
```typescript
// src/lib/bridge/http/
class ConnectionPool {
  private agent: http.Agent;

  constructor(maxSockets: number = 50) {
    this.agent = new http.Agent({ maxSockets, keepAlive: true });
  }

  fetch(url: string, options: RequestOptions): Promise<Response>
}
```

### 3.3 Message Queue Optimization

**Target**: Better throughput for high-volume scenarios

**Implementation**:
```typescript
// src/lib/bridge/queue/
class MessageQueue {
  private queue: Array<MessageTask> = [];
  private processing: number = 0;

  async enqueue(task: MessageTask): Promise<void>
  private process(): void
}
```

## Phase 4: Feature Enhancements (2-3 weeks) 📋

### 4.1 Health Check API

**Implementation**:
```typescript
// GET /health
{
  "status": "healthy",
  "timestamp": "2026-04-09T14:30:45Z",
  "services": [
    { "name": "feishu", "status": "up", "latency": 45 },
    { "name": "weixin", "status": "up", "latency": 120 }
  ]
}

// GET /health/detailed
{
  // ... more detailed metrics
}
```

### 4.2 Metrics Endpoint

**Implementation**:
```typescript
// GET /metrics
{
  "messagesSent": 1234,
  "messagesReceived": 1567,
  "errors": 12,
  "avgResponseTime": 450,
  "activeSessions": 5
}
```

### 4.3 Interactive Card Enhancements

**Features**:
- Progress indicators for long-running tools
- Rich error display in cards
- Collapsible tool outputs
- Better mobile support

### 4.4 Session Management UI

**Features**:
- List active sessions
- Cancel running sessions
- View session history
- Session analytics

## Testing Strategy

### Unit Tests
- [ ] Error handling classes
- [ ] Logger functionality
- [ ] Permission timeout mechanism
- [ ] Cache manager
- [ ] Content parsers

### Integration Tests
- [ ] Feishu API integration
- [ ] Permission flow
- [ ] Streaming card lifecycle
- [ ] Message queue processing

### E2E Tests
- [ ] Full conversation flow
- [ ] Permission request/response
- [ ] Error recovery
- [ ] Multi-channel scenarios

## Rollout Plan

### Week 1: Phase 1 (Stability)
- Deploy permission timeout fix
- Deploy error handling and logging
- Monitor for issues

### Week 2-3: Phase 2 (Architecture)
- Deploy refactored Feishu adapter
- Monitor for performance
- Fix any regressions

### Week 4-5: Phase 3 (Performance)
- Deploy caching layer
- Deploy connection pooling
- Benchmark improvements

### Week 6-8: Phase 4 (Features)
- Deploy health checks
- Deploy metrics
- Deploy UI enhancements

## Success Metrics

| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Mean Time to Recovery (MTTR) | Unknown | < 5 min | Error logs |
| Permission timeout incidents | 100% | < 1% | Permission requests |
| Adapter code quality | 1592 lines | < 400 lines/file | Lines of code |
| Test coverage | Unknown | > 80% | Test reports |
| Average response time | Unknown | < 500ms | Metrics API |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes during refactoring | High | Comprehensive testing, gradual rollout |
| Performance regression | Medium | Benchmarking before/after |
| User confusion from UI changes | Low | Documentation, migration guide |
| Increased complexity | Medium | Clear documentation, code comments |

## Next Steps

1. ✅ Implement Phase 1 (Stability)
2. 🔄 Implement Phase 2 (Architecture)
3. 📋 Implement Phase 3 (Performance)
4. 📋 Implement Phase 4 (Features)
5. 📋 Comprehensive testing
6. 📋 Documentation updates
7. 📋 Release notes

## Appendix

### A. File Structure Changes

**Before**:
```
src/lib/bridge/adapters/
├── feishu-adapter.ts (1592 lines)
├── telegram-adapter.ts (865 lines)
├── discord-adapter.ts (662 lines)
└── qq-adapter.ts (552 lines)
```

**After**:
```
src/lib/bridge/adapters/
├── feishu/
│   ├── cardkit-api.ts
│   ├── streaming-cards.ts
│   ├── content-parser.ts
│   ├── event-handler.ts
│   ├── message-sender.ts
│   └── index.ts (~200 lines)
├── telegram/
│   └── (similar structure)
└── ...
```

### B. API Changes

**Feishu CardKit API Fix**:

Old (broken):
```
POST /open-apis/cardkit/v1/cards/{card_id}/stream_content
```

New (working):
```
PATCH /open-apis/im/v1/messages/{message_id}
Content-Type: application/json

{
  "msg_type": "interactive",
  "update_key": "",
  "content": "<card_json>"
}
```

### C. Configuration

New environment variables:
```bash
# Permission timeout (milliseconds)
PERMISSION_TIMEOUT_MS=300000

# Logging
LOG_LEVEL=info
LOG_JSON_OUTPUT=false

# Health check
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_PORT=3000
```

---

**Document Status**: Draft
**Last Updated**: 2026-04-09 14:30 UTC
**Version**: 0.1.0
