/**
 * UP主白名单配置接口
 */
export interface UPWhitelistConfig {
  enabled: boolean;          // 白名单功能开关
  whitelistedUPs: {         
    uid: string;            // UP主UID
    name: string;           // UP主名称
    addTime: number;        // 添加时间戳
  }[];
}

/**
 * UP主信息接口
 */
export interface UPInfo {
  uid: string;
  name: string;
}