// ============================================================
// 丹青有AI - 仲裁配置默认值(Phase 5)
// 对应文档:.trae/documents/art-evaluation-research.md §3.1, §3.3, §3.5
//          .trae/documents/new-features-design.md §4.3
// 系统级全局配置;v2 可通过 Tenant.config 实现租户级覆盖
// ============================================================

import type { ArbitrationConfig } from '../types/arbitration.js';

/**
 * 系统默认仲裁配置
 * 阈值来源:art-evaluation-research.md §3.1(央美/国美/清华三校评审经验值)
 *
 * 说明:
 * - consistent:总分极差<5 且维度差<8 → 一致,直接加权出分
 * - general:总分极差≥10 或维度差≥15 → 一般争议,单人复核
 * - high:总分极差≥20 或 ≥2 维度差≥15 或跨档≥2 → 委员会复议
 * - veto:任一评委判 E(<60)且其余判 A(≥90) → 强制委员会复议
 *
 * 评委权重:
 * - 常规双评委:教授 0.5 / 讲师 0.3 / AI 0.2(教授主导但具实质制衡)
 * - 教授+AI 双人:教授 0.7 / AI 0.3
 * - 委员会复议:每位教授 0.3 / AI 0.1(高争议属专业判断,AI 仅参考)
 *
 * 边界处理:
 * - 离群分差≥25 → 权重折半(×0.5)
 * - AI 置信度<0.6 → AI 权重降至 0.1
 * - AI 置信度<0.4 → AI 评分仅作参考不计入加权
 * - 缺失维度>2 → 评分作废
 */
export const DEFAULT_ARBITRATION_CONFIG: ArbitrationConfig = {
  triggers: {
    consistentTotalRange: 5,
    consistentDimDiff: 8,
    generalDisputeTotalRange: 10,
    generalDisputeDimDiff: 15,
    highDisputeTotalRange: 20,
    highDisputeDimCount: 2,
    gradeCrossTierHigh: 2,
    vetoLowGrade: 60,
    vetoHighGrade: 90,
  },
  judgeWeights: {
    regular: { professor: 0.5, lecturer: 0.3, ai: 0.2 },
    professorAi: { professor: 0.7, ai: 0.3 },
    committee: { professorEach: 0.3, ai: 0.1 },
  },
  rules: {
    final: 'weighted',
    boundaryTolerance: 1,
  },
  edgeCases: {
    outlierDiff: 25,
    outlierWeightFactor: 0.5,
    aiLowConfidence: 0.6,
    aiLowConfidenceWeight: 0.1,
    aiVeryLowConfidence: 0.4,
    aiHumanExtremeDiff: 20,
    maxMissingDimsToInvalidate: 2,
  },
};

/**
 * 获取仲裁配置
 * v1:统一返回系统默认配置
 * v2 TODO:支持从 Tenant.config.arbitration 读取租户级覆盖,深度合并
 *
 * @param _tenantId 租户 ID(v2 用于读取租户级覆盖)
 */
export function getArbitrationConfig(_tenantId?: string): ArbitrationConfig {
  // v1:直接返回系统默认
  // v2 实现:
  //   const tenantOverride = await tenantRepository.getArbitrationConfig(tenantId);
  //   return deepMerge(DEFAULT_ARBITRATION_CONFIG, tenantOverride);
  return DEFAULT_ARBITRATION_CONFIG;
}
