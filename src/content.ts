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
      
      // 新增: 获取自动跳过设置
      const { autoSkipAd } = await chrome.storage.local.get({ autoSkipAd: false }); // 提供默认值 false
      console.log("【VideoAdGuard】读取自动跳过设置:", autoSkipAd);

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
        console.log('【VideoAdGuard】检测到广告片段:', JSON.stringify(result.index_lists));
        const second_lists = this.index2second(result.index_lists, captionsData.body);
        AdDetector.adTimeRanges = second_lists;
        this.adDetectionResult = `发现${second_lists.length}处广告：${
          second_lists.map(([start, end]) => `${this.second2time(start)}~${this.second2time(end)}`).join(' | ')
        }`;
        // 注入跳过按钮
        this.injectSkipButton();
        // 新增: 如果开启了自动跳过，则设置监听器
        if (autoSkipAd) {
            console.log("【VideoAdGuard】设置自动跳过监听器");
            this.setupAutoSkip();
        }
        
        // 添加：创建广告标记
        this.markAdPositions();
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

  private static injectSkipButton() {
    const player = document.querySelector('.bpx-player-control-bottom');
    if (!player) return;

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

    // 监听视频播放时间
    const video = document.querySelector('video');
    if (!video) {
      console.error('未找到视频元素');
      return;
    }

    // 点击跳过按钮
    skipButton.addEventListener('click', () => {
      const currentTime = video.currentTime;
      console.log('【VideoAdGuard】当前时间:', currentTime);
      const adSegment = this.adTimeRanges.find(([start, end]) => 
        currentTime >= start && currentTime < end
      );

      if (adSegment) {
        video.currentTime = adSegment[1]; // 跳到广告段结束时间
        console.log('【VideoAdGuard】跳转时间:',adSegment[1]);
      }
    });
  }

  // 新增: 设置自动跳过监听器的方法
  private static setupAutoSkip() {
    const videoElement = document.querySelector("video");
    // 注意B站更新可能导致选择器失效，这里使用时间显示元素作为触发源更可靠
    const timeDisplayElement = document.querySelector(".bpx-player-ctrl-time-current"); 

    if (!videoElement || !timeDisplayElement) {
      console.error("【VideoAdGuard】未找到视频或时间显示元素，无法设置自动跳过");
      this.removeAutoSkipListener(); // 找不到元素则清理并退出
      return;
    }
    if (!this.adTimeRanges || this.adTimeRanges.length === 0) {
      console.log("【VideoAdGuard】无广告时间段，无需设置自动跳过");
      this.removeAutoSkipListener(); // 无广告时间段也清理并退出
      return;
    }

    // 确保移除旧监听器
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
      if (!currentTimeStr) return; // 如果获取不到时间文本，则跳过此次处理

      const currentTime = this.timeStrToSeconds(currentTimeStr);

      for (const [start, end] of this.adTimeRanges) {
         if (currentTime >= start && currentTime < end) { 
            console.log(`【VideoAdGuard】检测到广告时间 ${this.second2time(start)}~${this.second2time(end)}，当前显示时间 ${currentTimeStr} (${currentTime}s)，准备跳过...`);
            // 目标时间略微超过广告结束时间，防止误差，并确保不超出视频总长
            const targetTime = Math.min(end + 0.1, currentVideoElement.duration); 
            currentVideoElement.currentTime = targetTime; 
            console.log(`【VideoAdGuard】已自动跳过到 ${this.second2time(targetTime)}`);
            // 可选: 考虑在跳过后临时移除再添加监听器以避免快速连续触发
            // this.removeAutoSkipListener();
            // setTimeout(() => this.setupAutoSkip(), 50);
            break; // 跳过一个广告段后退出循环
          }
      }
    };
      
    // 添加事件监听
    // 使用 timeDisplay 元素的 MutaionObserver 比 video 元素的 timeupdate 更可靠地触发
    // 但为了简单起见，暂时仍用 timeupdate, 注意：如果B站更新了时间显示逻辑，可能需要改用 MutationObserver 观察 timeDisplayElement 的内容变化
    videoElement.addEventListener('timeupdate', this.timeUpdateListener);
    console.log("【VideoAdGuard】已添加 timeupdate 监听器用于自动跳过");
  }

  // 新增: 移除自动跳过监听器的方法
  private static removeAutoSkipListener() {
    const videoElement = document.querySelector("video");
    if (videoElement && this.timeUpdateListener) {
      videoElement.removeEventListener('timeupdate', this.timeUpdateListener);
      console.log("【VideoAdGuard】已移除旧的 timeupdate 监听器");
      this.timeUpdateListener = null; // 清理引用
    }
  }

  // 新增: 辅助函数，将时间字符串转为秒数
  private static timeStrToSeconds(timeStr: string): number {
    const parts = timeStr.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 3) { // HH:MM:SS
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) { // MM:SS
      seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 1) { // S
      seconds = parts[0];
    }
    return seconds;
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

// 监听 history 变化
window.addEventListener('popstate', () => {
  console.log('【VideoAdGuard】History changed:', location.href);
  AdDetector.analyze();
});