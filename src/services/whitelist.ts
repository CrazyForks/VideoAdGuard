import { UPWhitelistConfig, UPInfo } from '../types/whitelist';

/**
 * UP主白名单管理服务
 */
export class WhitelistService {
  private static readonly STORAGE_KEY = 'up_whitelist_config';
  
  /**
   * 获取白名单配置
   */
  public static async getConfig(): Promise<UPWhitelistConfig> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return result[this.STORAGE_KEY] || {
      enabled: false,
      whitelistedUPs: []
    };
  }

  /**
   * 保存白名单配置
   */
  private static async saveConfig(config: UPWhitelistConfig): Promise<void> {
    await chrome.storage.local.set({ [this.STORAGE_KEY]: config });
  }

  /**
   * 添加UP主到白名单
   */
  public static async addToWhitelist(upInfo: UPInfo): Promise<boolean> {
    const config = await this.getConfig();
    
    // 检查是否已在白名单中
    if (config.whitelistedUPs.some(up => up.uid === upInfo.uid)) {
      return false;
    }

    config.whitelistedUPs.push({
      uid: upInfo.uid,
      name: upInfo.name,
      addTime: Date.now()
    });

    await this.saveConfig(config);
    return true;
  }

  /**
   * 从白名单移除UP主
   */
  public static async removeFromWhitelist(uid: string): Promise<boolean> {
    const config = await this.getConfig();
    const initialLength = config.whitelistedUPs.length;
    
    config.whitelistedUPs = config.whitelistedUPs.filter(up => up.uid !== uid);
    
    if (config.whitelistedUPs.length !== initialLength) {
      await this.saveConfig(config);
      return true;
    }
    return false;
  }

  /**
   * 检查UP主是否在白名单中
   */
  public static async isWhitelisted(uid: string): Promise<boolean> {
    const config = await this.getConfig();
    return config.enabled && config.whitelistedUPs.some(up => up.uid === uid);
  }

  /**
   * 设置白名单功能开关
   */
  public static async setEnabled(enabled: boolean): Promise<void> {
    const config = await this.getConfig();
    config.enabled = enabled;
    await this.saveConfig(config);
  }
}