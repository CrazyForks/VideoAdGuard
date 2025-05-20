# UP主白名单功能开发文档

## 功能概述

为了解决部分UP主视频内容被误判为广告的问题，我们将实现一个UP主白名单功能。该功能允许用户将特定UP主加入白名单，在播放这些UP主的视频时，将不会启动广告检测功能。

## 技术方案

### 1. 数据结构设计

```typescript
interface UPWhitelistConfig {
  enabled: boolean;          // 白名单功能开关
  whitelistedUPs: {         // 白名单UP主列表
    uid: string;            // UP主UID
    name: string;           // UP主名称（用于显示）
    addTime: number;        // 添加时间
  }[];
}
```

### 2. 存储实现

- 使用Chrome Storage API存储白名单配置
- 键名：`up_whitelist_config`
- 在popup.ts中实现配置管理
- 在content.ts中实现配置读取和判断

### 3. 功能实现

#### 3.1 配置界面（popup.ts）

- 在设置界面添加白名单管理区域
- 提供白名单功能开关
- 显示当前白名单列表
- 支持添加/删除白名单UP主
- 支持通过UID或用户名搜索UP主

#### 3.2 广告检测逻辑修改（content.ts）

- 在初始化广告检测前，获取当前视频UP主信息
- 检查UP主是否在白名单中
- 如果在白名单中，跳过广告检测流程
- 在视频信息变更时重新检查白名单状态

### 4. 接口设计

#### 4.1 白名单管理接口

```typescript
interface WhitelistManager {
  // 添加UP主到白名单
  addToWhitelist(uid: string): Promise<boolean>;
  
  // 从白名单移除UP主
  removeFromWhitelist(uid: string): Promise<boolean>;
  
  // 检查UP主是否在白名单中
  isWhitelisted(uid: string): Promise<boolean>;
  
  // 获取白名单列表
  getWhitelistedUPs(): Promise<UPWhitelistConfig['whitelistedUPs']>;
  
  // 启用/禁用白名单功能
  setEnabled(enabled: boolean): Promise<void>;
}
```

#### 4.2 B站API集成

- 使用现有的bilibili.ts中的接口获取UP主信息
- 在视频加载时获取UP主UID
- 缓存UP主信息以提升性能

## 实现步骤

1. 更新配置存储
   - 在Chrome Storage中添加白名单配置结构
   - 实现配置的读取和保存功能

2. 修改广告检测逻辑
   - 在AdDetector类中添加白名单检查
   - 实现白名单判断逻辑

3. 更新设置界面
   - 添加白名单管理UI组件
   - 实现白名单管理功能

4. 优化用户体验
   - 添加白名单状态提示
   - 实现UP主搜索功能
   - 提供批量导入/导出功能

## 注意事项

1. 性能考虑
   - 缓存白名单配置以减少存储API调用
   - 优化UP主信息获取逻辑

2. 用户体验
   - 提供清晰的白名单管理界面
   - 添加操作成功/失败提示
   - 支持快速添加当前视频UP主

3. 数据安全
   - 定期同步白名单数据
   - 提供白名单备份功能

## 后续优化

1. 智能推荐
   - 基于用户观看历史推荐可信UP主
   - 提供社区维护的可信UP主列表

2. 高级功能
   - 支持白名单分组管理
   - 添加白名单有效期设置
   - 支持导入其他用户的白名单配置

## 开发计划

1. v1.0版本（基础功能）
   - 实现基本的白名单管理功能
   - 完成广告检测逻辑修改
   - 提供简单的用户界面

2. v1.1版本（功能优化）
   - 添加UP主搜索功能
   - 实现批量导入/导出
   - 优化用户界面体验

3. v1.2版本（高级特性）
   - 添加智能推荐功能
   - 实现分组管理
   - 添加数据同步功能