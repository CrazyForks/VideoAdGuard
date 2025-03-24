import { BilibiliService } from './services/bilibili';
import { AIService } from './services/ai';

class AdDetector {
  public static adDetectionResult: string | null = null; // 状态存储
  private static adTimeRanges: number[][] = []; // 存储广告时间段

  private static async getCurrentBvid(): Promise<string> {
    const match = window.location.pathname.match(/\/video\/(BV[\w]+)/);
    if (!match) throw new Error('未找到视频ID');
    return match[1];
  }

  public static async analyze() {
    try {
      const bvid = await this.getCurrentBvid();
      
      // 获取视频信息
      const videoInfo = await BilibiliService.getVideoInfo(bvid);
      const comments = await BilibiliService.getComments(bvid);
      const playerInfo = await BilibiliService.getPlayerInfo(bvid, videoInfo.cid);

      // 获取字幕
      if (!playerInfo.subtitle?.subtitles?.length) {
        console.log('无字幕');
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
      const result = await AIService.analyze({
        title: videoInfo.title,
        topComment: comments.upper?.top?.content?.message || null,
        captions
      });

      if (result.exist) {
        console.log('检测到广告片段:', JSON.stringify(result.index_lists));
        const second_lists = this.index2second(result.index_lists, captionsData.body);
        AdDetector.adTimeRanges = second_lists;
        this.adDetectionResult = `发现${second_lists.length}处广告：${
          second_lists.map(([start, end]) => `${this.second2time(start)}~${this.second2time(end)}`).join(' | ')
        }`;
        // 注入跳过按钮
        this.injectSkipButton();
      } else {
        this.adDetectionResult = '无广告内容';
      }

    } catch (error) {
      console.error('分析失败:', error);
      this.adDetectionResult = '分析失败：' + (error as Error).message;
    }
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
      console.log('当前时间:', currentTime);
      const adSegment = this.adTimeRanges.find(([start, end]) => 
        currentTime >= start && currentTime < end
      );

      if (adSegment) {
        video.currentTime = adSegment[1]; // 跳到广告段结束时间
        console.log('跳转时间:',adSegment[1]);
      }
    });
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
    console.log('URL changed:', url);
    AdDetector.analyze();
  }
}).observe(document, { subtree: true, childList: true });

// 监听 history 变化
window.addEventListener('popstate', () => {
  console.log('History changed:', location.href);
  AdDetector.analyze();
});