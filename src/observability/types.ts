/**
 * Agent 结构化日志事件 schema
 * Meta Agent 只消费这些字段，禁止依赖 console 文本。
 */

export type AgentEventType =
  | 'decision'
  | 'failure'
  | 'retry'
  | 'output'
  | 'state_transition'
  | 'sufficiency_check'
  | 'meta_diagnosis'
  | 'meta_rewrite'
  | 'meta_sandbox'
  | 'meta_rollback';

export type AgentEventOutcome = 'ok' | 'error' | 'partial' | 'stagnant' | 'progressing';

export interface AgentEvent {
  /** ISO-8601 */
  ts: string;
  /** 单次 pipeline / agent run */
  run_id: string;
  /** worker | meta | research-vertical | research-horizontal | research-community */
  agent_id: string;
  event: AgentEventType;
  /** 业务阶段，如 method_selection / data_collection */
  stage?: string;
  /** 关联父事件，用于 retry 链 */
  parent_event_id?: string | null;
  event_id: string;
  outcome: AgentEventOutcome;
  /** 机器可读负载；禁止密钥/token */
  payload: Record<string, unknown>;
}

export interface DecisionPayload {
  context: string;
  alternatives: string[];
  selected: string;
  tradeoffs: string;
}

export interface FailurePayload {
  error_type: string;
  message: string;
  signature: string;
  evidence?: string;
}

export interface RetryPayload {
  attempt: number;
  trigger: string;
  diff_from_previous?: string;
}

export interface OutputPayload {
  artifact: string;
  summary: string;
  metrics?: Record<string, number | string | boolean>;
}
