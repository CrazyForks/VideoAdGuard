/**
 * 音频处理服务类
 * 负责音频下载、格式转换和语音识别
 */
export class AudioService {
  private static readonly CACHE_NAME = 'video-ad-guard-audio';
  private static readonly CACHE_EXPIRY_HOURS = 24;

  /**
   * 从视频流数据中获取最低带宽的音频流URL
   * @param playUrlData 视频流数据
   * @returns 音频流URL或null
   */
  public static getLowestBandwidthAudioUrl(playUrlData: any): string | null {
    try {
      if (!playUrlData?.dash?.audio || !Array.isArray(playUrlData.dash.audio)) {
        console.log('【VideoAdGuard】[Audio] 未找到音频流信息');
        return null;
      }

      const audioStreams = playUrlData.dash.audio;
      
      // 遍历音频流，找到带宽最小的
      let minBandwidthAudio = audioStreams[0];
      for (const audioStream of audioStreams) {
        if (audioStream.bandwidth < minBandwidthAudio.bandwidth) {
          minBandwidthAudio = audioStream;
        }
      }

      return minBandwidthAudio.baseUrl;
    } catch (error) {
      console.error('【VideoAdGuard】[Audio] 获取音频URL失败:', error);
      return null;
    }
  }

  /**
   * 下载音频文件
   * @param audioUrl 音频文件URL
   * @returns 音频文件Blob
   */
  public static async downloadAudio(audioUrl: string): Promise<Blob> {
    try {
      const response = await fetch(audioUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com/'
        }
      });

      if (!response.ok) {
        throw new Error(`音频下载失败: ${response.status} ${response.statusText}`);
      }

      console.log(`【VideoAdGuard】[Audio] 音频下载完成`);

      return await response.blob();
    } catch (error) {
      console.error('【VideoAdGuard】[Audio] 音频下载失败:', error);
      throw error;
    }
  }



  /**
   * 音频处理流程：下载、转换
   * @param playUrlData 视频流数据
   * @returns 处理后的音频Blob
   */
  public static async processAudio(playUrlData: any): Promise<Blob | null> {
    try {
      // 获取音频URL
      const audioUrl = this.getLowestBandwidthAudioUrl(playUrlData);
      if (!audioUrl) {
        return null;
      }

      // 下载音频
      const audioBlob = await this.downloadAudio(audioUrl);

      // 检查原始格式，如果已经是支持的格式就直接返回
      const supportedFormats = ['audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/flac', 'video/mp4'];

      if (supportedFormats.includes(audioBlob.type)) {
        console.log(`【VideoAdGuard】[Audio] 音频格式${audioBlob.type}已支持，直接使用`);
        return audioBlob;
      }

      if (audioBlob.type === 'audio/m4s') {
        const m4aBlob = new Blob([audioBlob], { type: 'audio/m4a' });
        console.log('【VideoAdGuard】[Audio] 音频处理完成');
        return m4aBlob
      }

      throw new Error('未知格式: ' + audioBlob.type);

    } catch (error) {
      console.error('【VideoAdGuard】[Audio] 音频处理失败:', error);
      return null;
    }
  }

  /**
   * 通过后台脚本调用Groq语音识别API
   * @param audioBlob 音频文件Blob
   * @param options 识别选项
   * @returns 识别结果对象
   */
  public static async transcribeAudio(
    audioBlob: Blob,
    options: {
      model?: string;
      language?: string;
      responseFormat?: 'json' | 'text' | 'verbose_json';
    } = {}
  ): Promise<any> {
    try {
      console.log('【VideoAdGuard】[Audio] 开始语音识别...');

      // 获取API密钥
      const settings = await chrome.storage.local.get(['groqApiKey']);
      const apiKey = settings.groqApiKey;

      if (!apiKey) {
        throw new Error('未配置Groq API密钥，请在设置中配置');
      }

      // 创建临时的Blob URL
      const audioUrl = URL.createObjectURL(audioBlob);

      try {
        // 通过后台脚本调用API
        const response = await chrome.runtime.sendMessage({
          type: 'TRANSCRIBE_AUDIO_FILE_STREAM',
          data: {
            audioUrl: audioUrl,
            fileInfo: {
              name: 'audio.m4a',
              size: audioBlob.size,
              type: audioBlob.type || 'audio/m4a'
            },
            apiKey: apiKey,
            options: {
              model: options.model || 'whisper-large-v3-turbo',
              responseFormat: options.responseFormat || 'verbose_json'
            }
          }
        });

        if (response && response.success) {
          console.log('【VideoAdGuard】[Audio] 语音识别成功');
          return response.data;
        } else {
          const errorMsg = response?.error || '未知错误';
          console.error('【VideoAdGuard】[Audio] 语音识别失败:', errorMsg);
          throw new Error(errorMsg);
        }
      } finally {
        // 清理临时URL
        URL.revokeObjectURL(audioUrl);
      }

    } catch (error) {
      console.error('【VideoAdGuard】[Audio] 语音识别失败:', error);
      throw error;
    }
  }

  /**
   * 完整的音频处理和识别流程
   * @param bvid 视频BV号
   * @param cid 视频CID
   * @param playUrlData 视频流数据
   * @param transcribeOptions 语音识别选项
   * @returns 包含音频文件和识别结果的对象
   */
  public static async processAndTranscribeAudio(
    bvid: string,
    cid: number,
    playUrlData: any,
    transcribeOptions: {
      model?: string;
      language?: string;
      responseFormat?: 'verbose_json';
    } = {}
  ): Promise<{
    transcription: any;
  } | null> {
    try {
      console.log('【VideoAdGuard】[Audio] 开始完整的音频处理和识别流程...');

      // 1. 检查识别结果缓存
      const cachedTranscription = await this.getTranscriptionFromCache(bvid, cid);
      if (cachedTranscription) {
        console.log('【VideoAdGuard】[Audio] 使用缓存的识别结果');
        return {
          transcription: JSON.parse(cachedTranscription)
        };
      }

      // 2. 处理音频
      const audioBlob = await this.processAudio(playUrlData);
      if (!audioBlob) {
        throw new Error('音频处理失败');
      }

      // 3. 语音识别
      const transcription = await this.transcribeAudio(audioBlob, transcribeOptions);

      // 4. 缓存识别结果
      await this.saveTranscriptionToCache(bvid, cid, JSON.stringify(transcription));

      console.log('【VideoAdGuard】[Audio] 完整流程处理成功');
      return {
        transcription
      };
    } catch (error) {
      console.error('【VideoAdGuard】[Audio] 完整流程处理失败:', error);
      return null;
    }
  }

  /**
   * 从缓存中获取语音识别结果
   * @param bvid 视频BV号
   * @param cid 视频CID
   * @returns 缓存的识别结果或null
   */
  public static async getTranscriptionFromCache(bvid: string, cid: number): Promise<string | null> {
    try {
      const cacheKey = `transcription_${bvid}_${cid}`;
      const cache = await caches.open(this.CACHE_NAME);
      const response = await cache.match(cacheKey);
      if (response) {
        const result = await response.text();
        return result;
      }
      return null;
    } catch (error) {
      console.error('【VideoAdGuard】[Audio] 从缓存读取识别结果失败:', error);
      return null;
    }
  }

  /**
   * 将语音识别结果保存到缓存
   * @param bvid 视频BV号
   * @param cid 视频CID
   * @param transcription 识别结果文本
   */
  public static async saveTranscriptionToCache(bvid: string, cid: number, transcription: string): Promise<void> {
    try {
      const cacheKey = `transcription_${bvid}_${cid}`;
      const cache = await caches.open(this.CACHE_NAME);
      const response = new Response(transcription, {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': `max-age=${this.CACHE_EXPIRY_HOURS * 3600}`
        }
      });
      await cache.put(cacheKey, response);
      console.log('【VideoAdGuard】[Audio] 识别结果已保存到缓存');
    } catch (error) {
      console.error('【VideoAdGuard】[Audio] 保存识别结果到缓存失败:', error);
      throw error;
    }
  }

  /**
   * 清理过期的缓存
   */
  public static async cleanExpiredCache(): Promise<void> {
    try {
      const cache = await caches.open(this.CACHE_NAME);
      const requests = await cache.keys();

      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const cacheControl = response.headers.get('cache-control');
          if (cacheControl) {
            const maxAge = parseInt(cacheControl.match(/max-age=(\d+)/)?.[1] || '0');
            const responseDate = new Date(response.headers.get('date') || Date.now());
            const expiryDate = new Date(responseDate.getTime() + maxAge * 1000);

            if (Date.now() > expiryDate.getTime()) {
              await cache.delete(request);
              console.log('【VideoAdGuard】[Audio] 已清理过期缓存');
            }
          }
        }
      }
    } catch (error) {
      console.error('【VideoAdGuard】[Audio] 清理缓存失败:', error);
    }
  }
}