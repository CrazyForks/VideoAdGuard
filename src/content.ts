import { BilibiliService } from './services/bilibili';
import { AIService } from './services/ai';

// 添加广告标记位置的接口定义
interface AdPosition {
  startPercent: number;
  endPercent: number;
}

class AdDetector {
  public static adDetectionResult: string | null = null; // 状态存储
  private static adTimeRanges: number[][] = []; // 存储广告时间段
  private static timeUpdateListener: (() => void) | null = null; // 新增: 用于存储 timeupdate 监听器的引用
  private static adMarkerLayer: HTMLElement | null = null; // 添加标记层引用
  private static validIndexLists: number[][] = []; // 存储过滤和合并前的有效广告索引区间

  private static async getCurrentBvid(): Promise<string> {
    // 先尝试从路径中匹配
    const pathMatch = window.location.pathname.match(/BV[\w]+/);
    if (pathMatch) return pathMatch[0];
    
    // 如果路径中没有，尝试从查询参数中获取
    const urlParams = new URLSearchParams(window.location.search);
    const bvid = urlParams.get('bvid');
    if (bvid) return bvid;
    
    throw new Error('未找到视频ID');
  }

  public static async analyze() {
    try {
      // 移除已存在的跳过按钮
      const existingButton = document.querySelector('.skip-ad-button10032');
      if (existingButton) {
        existingButton.remove();
      }
      
      // 新增: 在开始分析前移除旧监听器
      this.removeAutoSkipListener();

      const bvid = await this.getCurrentBvid();
      
      // 获取视频信息
      const videoInfo = await BilibiliService.getVideoInfo(bvid);
      const comments = await BilibiliService.getComments(bvid);
      const playerInfo = await BilibiliService.getPlayerInfo(bvid, videoInfo.cid);

      // 获取字幕
      if (!playerInfo.subtitle?.subtitles?.length) {
        console.log('【VideoAdGuard】当前视频无字幕，无法检测');
        this.adDetectionResult = '当前视频无字幕，无法检测';
        return;
      }

      const captionsUrl = 'https:' + playerInfo.subtitle.subtitles[0].subtitle_url;
      const captionsData = await BilibiliService.getCaptions(captionsUrl);
      
      // 处理数据
      const captions: Record<number, string> = {};
      captionsData.body.forEach((caption: any, index: number) => {
        captions[index] = caption.content;
      });

      // AI分析
      const rawResult = await AIService.detectAd({
        title: videoInfo.title,
        topComment: comments.upper?.top?.content?.message || null,
        captions
      });

      // 处理可能的转义字符并解析 JSON
      let result;
      try {
        const cleanJson = typeof rawResult === 'string' 
          ? rawResult
              .replace(/\s+/g, '')     // 删除所有空白字符
              .replace(/\\/g, '')
              .replace(/json/g, '')
              .replace(/```/g, '')
          : JSON.stringify(rawResult);
        
        result = JSON.parse(cleanJson);
        
        // 验证返回数据格式
        if (typeof result.exist !== 'boolean' || !Array.isArray(result.index_lists)) {
          throw new Error('返回数据格式错误');
        }
        
        // 验证 index_lists 格式
        if (result.exist && !result.index_lists.every((item: number[]) =>
          Array.isArray(item) && item.length === 2 && 
          typeof item[0] === 'number' && typeof item[1] === 'number'
        )) {
          throw new Error('广告时间段格式错误');
        }
      } catch (e) {
        console.error('【VideoAdGuard】大模型返回数据JSON解析失败:', e);
        throw new Error(`AI返回数据格式错误: ${(e as Error).message}`);
      }

      if (result.exist) {
        // 新增: 过滤掉不合法的索引区间 (end < start)
        this.validIndexLists = result.index_lists.filter((item: number[]) => item[1] >= item[0]);

        // 新增: 合并相交、相邻或间隔为1的广告索引区间
        let mergedIndexLists: number[][] = [];
        if (this.validIndexLists.length > 0) { // 使用过滤后的列表
          // 1. 按起始索引排序
          const sortedLists = [...this.validIndexLists].sort((a, b) => a[0] - b[0]); // 对过滤后的列表排序

          // 2. 初始化合并后的列表
          mergedIndexLists.push([...sortedLists[0]]); // 添加第一个区间

          // 3. 遍历并合并
          for (let i = 1; i < sortedLists.length; i++) {
            const currentStart = sortedLists[i][0];
            const currentEnd = sortedLists[i][1];
            const lastMerged = mergedIndexLists[mergedIndexLists.length - 1];
            const lastMergedEnd = lastMerged[1];

            // 如果当前区间的开始 <= 上一个合并区间的结束+1 (允许相邻，如 [1,2], [3,4])
            if (currentStart <= lastMergedEnd + 1) {
              // 合并区间，更新上一个合并区间的结束索引为两者中的较大值
              lastMerged[1] = Math.max(lastMergedEnd, currentEnd);
            } else {
              // 不满足合并条件，直接添加新区间
              mergedIndexLists.push([...sortedLists[i]]);
            }
          }
        }
        const second_lists = this.index2second(mergedIndexLists, captionsData.body);
        this.adTimeRanges = second_lists;
        this.adDetectionResult = `发现${second_lists.length}处广告：${
          second_lists.map(([start, end]) => `${this.second2time(start)}~${this.second2time(end)}`).join(' | ')
        }`;
        console.log('【VideoAdGuard】检测到广告片段:', JSON.stringify(this.adDetectionResult));

        // 首先获取video元素和总时长
        const videoElement = document.querySelector("video");
        if (!videoElement) {
          console.error('未找到视频元素');
          throw new Error('未找到视频元素');
        }
        const videoDuration = videoElement ? videoElement.duration : 0; // 获取视频总时长
       
        // 计算总广告时长
        let totalAdDuration = 0;
        if (this.adTimeRanges && this.adTimeRanges.length > 0) {
            //累加所有广告时间段的长度
            totalAdDuration = this.adTimeRanges.reduce((sum, [start, end]) => sum + (end - start), 0);
        }

        const isDetectionConfident =                                     
            this.adTimeRanges.length > 0 &&                     // 1. 确实检测到了广告时间段
            this.validIndexLists.length <= 3 &&                 // 2. 原始广告片段数量（合并前，过滤后）不多于3个 (修正并保留用户之前的逻辑)              // 3. 成功获取到视频元素和有效的视频总时长
            totalAdDuration < (videoDuration * 0.5);            // 3. 总广告时长小于视频总时长的50%
        
        // 注入跳过按钮
        this.injectSkipButton(videoElement);

        // 新增: 如果开启了自动跳过，则设置监听器
        if (autoSkipAd && isDetectionConfident ) {
            console.log("【VideoAdGuard】设置自动跳过监听器");
            this.setupAutoSkip(videoElement);
        }
      } else {
        console.log('【VideoAdGuard】无广告内容');
        this.adDetectionResult = '无广告内容';
        // 新增: 无广告也移除监听器
        this.removeAutoSkipListener();
      }

    } catch (error) {
      console.error('【VideoAdGuard】分析失败:', error);
      this.adDetectionResult = '分析失败：' + (error as Error).message;
      // 新增: 出错时也移除监听器
      this.removeAutoSkipListener();
    }
  }

  // 添加：创建广告标记层的方法
  private static markAdPositions(): void {
    // 检查是否已有视频元素
    const videoElement = document.querySelector('video');
    if (!videoElement) {
      console.log('【VideoAdGuard】未找到视频元素，无法创建广告标记');
      return;
    }

    // 清除已有标记层
    this.removeAdMarkers();
    
    // 获取进度条容器
    const progressWrap = document.querySelector('.bpx-player-progress-wrap');
    if (!progressWrap) {
      console.log('【VideoAdGuard】未找到进度条容器，无法创建广告标记');
      return;
    }

    // 创建广告标记层
    const adMarkerLayer = document.createElement('div');
    adMarkerLayer.className = 'ad-marker-layer10032'; // 添加唯一标识
    adMarkerLayer.style.cssText = `
      position: absolute;
      top: 7px;
      left: 0;
      width: 100%;
      height: 5px;
      pointer-events: none;
      z-index: 30;
    `;
    
    // 保存标记层引用
    this.adMarkerLayer = adMarkerLayer;
    
    // 将广告标记层添加到进度条容器
    progressWrap.appendChild(adMarkerLayer);
    
    // 为每个广告位置创建标记
    if (this.adTimeRanges && this.adTimeRanges.length > 0) {
      // 计算广告位置百分比
      const duration = videoElement.duration || 1; // 防止除以0
      
      this.adTimeRanges.forEach(([start, end]) => {
        // 计算位置百分比
        const startPercent = (start / duration) * 100;
        const endPercent = (end / duration) * 100;
        
        // 创建标记元素
        const marker = document.createElement('div');
        marker.className = 'ad-position-marker10032';
        marker.style.cssText = `
          position: absolute;
          top: 0;
          left: ${startPercent}%;
          width: ${endPercent - startPercent}%;
          height: 100%;
          background-color: #4CAF50;
          opacity: 1;
          border-radius: 1px;
        `;
        
        adMarkerLayer.appendChild(marker);
      });
    }
    
    console.log('【VideoAdGuard】已创建广告标记层');
  }
  
  // 添加：移除广告标记层的方法
  private static removeAdMarkers(): void {
    // 移除已有的标记层
    document.querySelectorAll('.ad-marker-layer10032').forEach(element => {
      element.remove();
    });
    this.adMarkerLayer = null;
  }

  private static index2second(indexLists: number[][], captions: any[]) {
    // 直接生成时间范围列表
    const time_lists = indexLists.map(list => {
      const start = captions[list[0]]?.from || 0;
      const end = captions[list[list.length - 1]]?.to || 0;
      return [start, end];
    });
    return time_lists;
  }

  private static second2time(seconds: number): string {
    const hour = Math.floor(seconds / 3600);
    const min = Math.floor((seconds % 3600) / 60);
    const sec = Math.floor(seconds % 60);
    return `${hour > 0 ? hour + ':' : ''}${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  private static injectSkipButton(videoElement: HTMLVideoElement) {
    const player = document.querySelector('.bpx-player-control-bottom');
    if (!player) {
      console.error("【VideoAdGuard】未找到播放器底部控制栏");
      return;
    };

    const skipButton = document.createElement('button');
    skipButton.className = 'skip-ad-button10032';
    skipButton.textContent = '跳过广告';
    skipButton.style.cssText = `
      font-size: 14px;
      position: absolute;
      right: 20px;
      bottom: 100px;
      z-index: 999;
      padding: 4px 4px;
      color: #000000; 
      font-weight: bold;
      background: rgba(255, 255, 255, 0.7);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `; 

    player.appendChild(skipButton);

    // 点击跳过按钮
    skipButton.addEventListener('click', () => {
      const currentTime = videoElement.currentTime;
      console.log('【VideoAdGuard】当前时间:', currentTime);
      const adSegment = this.adTimeRanges.find(([start, end]) => 
        currentTime >= Math.min(start-10,0) && currentTime < end
      );

      if (adSegment) {
        videoElement.currentTime = adSegment[1]; // 跳到广告段结束时间
        console.log('【VideoAdGuard】跳转时间:',adSegment[1]);
      }
    });
  }

  // 设置自动跳过监听器的方法
  private static setupAutoSkip(videoElement: HTMLVideoElement) {
  // 确保移除旧监听器
  this.removeAutoSkipListener(); 
  
  // 用于记录已经跳过的广告区间
  const skippedRanges = new Set<string>();
  
  // 定义并保存 timeupdate 回调
  this.timeUpdateListener = () => {
  const currentTime = videoElement.currentTime;
  
  for (const [start, end] of this.adTimeRanges) {
     // 生成当前区间的唯一标识
     const rangeKey = `${start}-${end}`;
     
     // 如果当前时间在广告区间内，且该区间还未被跳过
     if (currentTime >= start && currentTime < end && !skippedRanges.has(rangeKey)) { 
        console.log(`【VideoAdGuard】检测到广告时间 ${this.second2time(start)}~${this.second2time(end)}，当前时间 (${currentTime}s)，准备跳过...`);
        // 目标时间略微超过广告结束时间，防止误差，并确保不超出视频总长
        const targetTime = Math.min(end + 0.1, videoElement.duration); 
        videoElement.currentTime = targetTime; 
        console.log(`【VideoAdGuard】已自动跳过到 ${this.second2time(targetTime)}`);
        
        // 将当前区间标记为已跳过
        skippedRanges.add(rangeKey);
        
        // 检查是否所有区间都已经跳过
        const allSkipped = this.adTimeRanges.every(([s, e]) => skippedRanges.has(`${s}-${e}`));
        if (allSkipped) {
            console.log('【VideoAdGuard】所有广告区间都已跳过，移除监听器');
            this.removeAutoSkipListener();
        }
        break;
     }
  }
  };
    
  // 添加事件监听
  videoElement.addEventListener('timeupdate', this.timeUpdateListener);
  console.log("【VideoAdGuard】已添加 timeupdate 监听器用于自动跳过");
  // 新增: 设置自动跳过监听器的方法
  private static setupAutoSkip() {
    const videoElement = document.querySelector("video");
    const timeDisplayElement = document.querySelector(".bpx-player-ctrl-time-current"); 

    if (!videoElement || !timeDisplayElement) {
      console.error("【VideoAdGuard】未找到视频或时间显示元素，无法设置自动跳过");
      this.removeAutoSkipListener(); 
      return;
    }

    if (!this.adTimeRanges || this.adTimeRanges.length === 0) {
      console.log("【VideoAdGuard】无广告时间段，无需设置自动跳过");
      this.removeAutoSkipListener(); 
      return;
    }

    this.removeAutoSkipListener(); 

    // 定义并保存 timeupdate 回调
    this.timeUpdateListener = () => {
      // 在回调内重新获取元素，应对DOM变化
      const currentVideoElement = document.querySelector("video"); 
      const currentTimeDisplayElement = document.querySelector(".bpx-player-ctrl-time-current");

      if (!currentVideoElement || !currentTimeDisplayElement) {
         console.warn("【VideoAdGuard】视频或时间元素在 timeupdate 中消失，移除监听器");
         this.removeAutoSkipListener(); 
         return;
      }

      const currentTimeStr = currentTimeDisplayElement.textContent;
      if (!currentTimeStr) return; 

      // 检查自动跳过设置是否开启
      chrome.storage.local.get({ autoSkipAd: false }, (result) => {
        if (!result.autoSkipAd) {
          return; // 如果自动跳过未开启,则不执行后续跳过逻辑
        }

        const currentTime = this.timeStrToSeconds(currentTimeStr);

        for (const [start, end] of this.adTimeRanges) {
          if (currentTime >= start && currentTime < end) { 
            console.log(`【VideoAdGuard】检测到广告时间 ${this.second2time(start)}~${this.second2time(end)}，当前显示时间 ${currentTimeStr} (${currentTime}s)，准备跳过...`);
            const targetTime = Math.min(end + 0.1, currentVideoElement.duration); 
            currentVideoElement.currentTime = targetTime; 
            console.log(`【VideoAdGuard】已自动跳过到 ${this.second2time(targetTime)}`);
            break;
          }
        }
      });
    };
      
    videoElement.addEventListener('timeupdate', this.timeUpdateListener);
    console.log("【VideoAdGuard】已添加 timeupdate 监听器用于自动跳过");
  }

  // 移除自动跳过监听器的方法
  private static removeAutoSkipListener() {
    const videoElement = document.querySelector("video");
    if (videoElement && this.timeUpdateListener) {
      videoElement.removeEventListener('timeupdate', this.timeUpdateListener);
      console.log("【VideoAdGuard】已移除 timeupdate 监听器");
      this.timeUpdateListener = null;
    }
  }
}

// 消息监听器：
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'GET_AD_INFO') {
    sendResponse({ 
      adInfo: AdDetector.adDetectionResult || '广告检测尚未完成',
      timestamp: Date.now()
    });
  }
});

// 页面加载监听：页面加载完成后执行
window.addEventListener('load', () => AdDetector.analyze());

// 添加 URL 变化监听
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('【VideoAdGuard】URL changed:', url);
    AdDetector.analyze();
  }
}).observe(document, { subtree: true, childList: true });