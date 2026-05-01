/**
 * 云端缓存相关类型定义
 */

export interface RemoteAdRecord {
  bvid: string;
  exist: boolean;
  goodName: string[];
  adTimeRanges: number[][];
  model: string;
  provider: string;
  detectedAt: number;
  isDetectionConfident: boolean;
  /** accurate: 可用于查询; inaccurate: 用户标记不准确，查询时跳过 */
  accuracy: 'accurate' | 'inaccurate';
  /** ai: AI 检测结果; user: 用户手动修正 */
  source: 'ai' | 'user';
  version: number;
  clientVersion?: string;
}