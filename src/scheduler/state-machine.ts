/**
 * 估价状态机
 * 对应 GB/T 50291-2015 第3.0.1条的11步估价程序
 */

export type EstimationStage =
  | 'demand_clarity'       // 步骤 1-2: 受理委托 + 确定基本事项
  | 'estimation_plan'      // 步骤 3: 编制估价作业方案
  | 'data_collection'      // 步骤 4: 搜集估价所需资料
  | 'site_inspection'      // 步骤 5: 实地查勘估价对象
  | 'method_selection'     // 步骤 6 前半: 选用估价方法
  | 'calculation'          // 步骤 6 后半: 测算（并行）
  | 'result_determination' // 步骤 7: 确定估价结果
  | 'report_generation'    // 步骤 8: 撰写估价报告
  | 'report_review'        // 步骤 9: 审核估价报告
  | 'delivery'             // 步骤 10: 交付估价报告
  | 'archive';             // 步骤 11: 保存估价资料

export interface StateTransition {
  from: EstimationStage;
  to: EstimationStage;
  allowed: boolean;
  reason?: string;
}

export class EstimationStateMachine {
  currentState: EstimationStage = 'demand_clarity';

  /**
   * 允许的状态转移表
   * report_review 可回退到 report_generation（审核不通过需修改）
   */
  private readonly transitions: Record<EstimationStage, EstimationStage[]> = {
    'demand_clarity': ['estimation_plan'],
    'estimation_plan': ['data_collection'],
    'data_collection': ['site_inspection'],
    'site_inspection': ['method_selection'],
    'method_selection': ['calculation'],
    'calculation': ['result_determination'],
    'result_determination': ['report_generation'],
    'report_generation': ['report_review'],
    'report_review': ['delivery', 'report_generation'], // 审核通过→交付；不通过→退回重写
    'delivery': ['archive'],
    'archive': [], // 终态
  };

  /**
   * 尝试状态转移
   */
  transition(to: EstimationStage): StateTransition {
    const allowedTargets = this.transitions[this.currentState];
    const allowed = allowedTargets.includes(to);

    return {
      from: this.currentState,
      to,
      allowed,
      reason: allowed
        ? `从 ${this.currentState} 转移到 ${to} 是允许的`
        : `不允许从 ${this.currentState} 直接转移到 ${to}`,
    };
  }

  /**
   * 检查是否可以转移到指定状态
   */
  canTransition(to: EstimationStage): boolean {
    const result = this.transition(to);
    return result.allowed;
  }

  /**
   * 获取当前阶段
   */
  getCurrentStage(): EstimationStage {
    return this.currentState;
  }

  /**
   * 重置状态机
   */
  reset(): void {
    this.currentState = 'demand_clarity';
  }

  /**
   * 获取已完成的阶段列表
   */
  getCompletedStages(): EstimationStage[] {
    const allStages = Object.keys(this.transitions) as EstimationStage[];
    const currentIndex = allStages.indexOf(this.currentState);
    return allStages.slice(0, currentIndex + 1);
  }
}
