# VideoAdGuard 文件说明文档

## 核心功能文件

### content.ts
主要负责视频页面的广告检测和交互功能：
- 实现了 `AdDetector` 类，用于检测和处理视频中的广告内容
- 提供广告时间段标记、跳过按钮和自动跳过功能
- 处理视频播放器的DOM操作和事件监听
- 与B站API和AI服务进行交互，获取视频信息和进行广告分析

### popup.html 和 popup.ts
插件的设置界面实现：
- popup.html：提供用户友好的设置界面，包含API配置和功能开关
- popup.ts：处理设置界面的交互逻辑，包括：
  - 保存和加载用户配置
  - 处理API密钥的显示/隐藏
  - 检查当前页面的广告检测状态
  - 管理本地Ollama和自动跳过广告的设置

### background.ts
插件的后台服务：
- 处理跨域请求
- 管理与AI服务的通信
- 提供消息传递机制

## 服务类文件

### services/bilibili.ts
B站API接口封装：
- 提供视频信息获取方法
- 处理评论数据获取
- 获取播放器信息和字幕数据
- 实现带Cookie的请求处理

### services/ai.ts
AI服务接口封装：
- 支持多种AI服务提供商（如智谱AI、OpenAI等）
- 处理广告检测的AI分析请求
- 管理API配置和请求参数
- 提供本地Ollama支持

## 工具类文件

### utils/wbi.ts
B站wbi签名工具：
- 实现B站API的wbi签名算法
- 管理签名密钥的缓存
- 提供参数加密功能
- 确保API请求的合法性

## 文件关系说明

1. content.ts 作为主要功能入口，调用 bilibili.ts 获取视频数据，使用 ai.ts 进行广告分析
2. popup.ts 负责用户配置管理，这些配置会被 content.ts 和 ai.ts 使用
3. background.ts 为前端提供跨域请求支持，主要服务于 ai.ts 的API调用
4. wbi.ts 为 bilibili.ts 提供必要的签名支持，确保API调用成功