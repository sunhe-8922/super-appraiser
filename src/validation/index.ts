/**
 * 规范约束校验器 barrel export
 *
 * 校验器模块对国标 GB/T 50291-2015 的关键约束进行强制检查。
 * 校验器只负责检查和报告，不修改数据——修改由上层 skill 处理。
 */

export { validateAmplitudes } from './amplitude-validator';
export type { AmplitudeCheckResult, AmplitudeValidationResult } from './amplitude-validator';
export { assessMethodApplicability, validateMethodCount } from './method-applicability';
export type { MethodAssessment, ValidationResult } from './method-applicability';
export { validateConsistency } from './result-consistency';
export type { ConsistencyCheckResult, CheckItem, VarianceAnalysis } from './result-consistency';
