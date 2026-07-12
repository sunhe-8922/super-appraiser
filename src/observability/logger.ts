/**
 * 结构化 Agent 日志
 * - 内存缓冲（供 Meta 即时读取）
 * - 可选 JSONL 落盘（可追溯、可回放）
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  AgentEvent,
  AgentEventOutcome,
  AgentEventType,
  DecisionPayload,
  FailurePayload,
  OutputPayload,
  RetryPayload,
} from './types';

export interface StructuredLoggerOptions {
  runId?: string;
  agentId?: string;
  /** 写入 JSONL 的目录；undefined 则仅内存 */
  logDir?: string;
  /** 文件名；默认 agent-{runId}.jsonl */
  fileName?: string;
}

export class StructuredLogger {
  readonly runId: string;
  readonly agentId: string;
  private readonly events: AgentEvent[] = [];
  private readonly logPath: string | null;
  private sequence = 0;

  constructor(options: StructuredLoggerOptions = {}) {
    this.runId = options.runId ?? randomUUID();
    this.agentId = options.agentId ?? 'worker';
    if (options.logDir) {
      fs.mkdirSync(options.logDir, { recursive: true });
      const name = options.fileName ?? `agent-${this.runId}.jsonl`;
      this.logPath = path.join(options.logDir, name);
    } else {
      this.logPath = null;
    }
  }

  /** 全部事件（只读副本） */
  getEvents(): readonly AgentEvent[] {
    return [...this.events];
  }

  /** 按类型过滤 */
  filter(event: AgentEventType): AgentEvent[] {
    return this.events.filter((e) => e.event === event);
  }

  child(agentId: string): StructuredLogger {
    const child = new StructuredLogger({
      runId: this.runId,
      agentId,
      logDir: this.logPath ? path.dirname(this.logPath) : undefined,
      fileName: this.logPath ? path.basename(this.logPath) : undefined,
    });
    // 共享同一文件时，子 logger 仍独立缓冲；Meta 应读 root 或合并。
    // 若共享 fileName，追加写同一 JSONL 仍正确。
    return child;
  }

  log(
    event: AgentEventType,
    payload: Record<string, unknown>,
    opts: {
      stage?: string;
      outcome?: AgentEventOutcome;
      parentEventId?: string | null;
    } = {},
  ): AgentEvent {
    this.sequence += 1;
    const record: AgentEvent = {
      ts: new Date().toISOString(),
      run_id: this.runId,
      agent_id: this.agentId,
      event,
      stage: opts.stage,
      parent_event_id: opts.parentEventId ?? null,
      event_id: `${this.runId}-${this.agentId}-${this.sequence}`,
      outcome: opts.outcome ?? 'ok',
      payload: sanitizePayload(payload),
    };
    this.events.push(record);
    if (this.logPath) {
      fs.appendFileSync(this.logPath, `${JSON.stringify(record)}\n`, 'utf8');
    }
    return record;
  }

  decision(stage: string, decision: DecisionPayload, outcome: AgentEventOutcome = 'ok'): AgentEvent {
    return this.log('decision', { ...decision }, { stage, outcome });
  }

  failure(stage: string, failure: FailurePayload, parentEventId?: string | null): AgentEvent {
    return this.log('failure', { ...failure }, {
      stage,
      outcome: 'error',
      parentEventId,
    });
  }

  retry(stage: string, retry: RetryPayload, parentEventId?: string | null): AgentEvent {
    return this.log('retry', { ...retry }, {
      stage,
      outcome: 'partial',
      parentEventId,
    });
  }

  output(stage: string, output: OutputPayload, outcome: AgentEventOutcome = 'ok'): AgentEvent {
    return this.log('output', { ...output }, { stage, outcome });
  }

  stateTransition(from: string, to: string, allowed: boolean, reason?: string): AgentEvent {
    return this.log(
      'state_transition',
      { from, to, allowed, reason },
      {
        stage: to,
        outcome: allowed ? 'ok' : 'error',
      },
    );
  }

  getLogPath(): string | null {
    return this.logPath;
  }

  /** 从 JSONL 文件加载事件（Meta Agent 只读通道） */
  static loadJsonl(filePath: string): AgentEvent[] {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AgentEvent);
  }
}

const SENSITIVE_KEY = /(token|secret|password|api[_-]?key|authorization|cookie)/i;

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = sanitizePayload(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
