/**
 * 音频处理服务类
 * 负责音频下载、格式转换和缓存管理
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
        console.log('【VideoAdGuard】[AudioService] 未找到音频流信息');
        return null;
      }

      const audioStreams = playUrlData.dash.audio;
      console.log('【VideoAdGuard】[AudioService] 找到音频流数量:', audioStreams.length);

      // 遍历音频流，找到带宽最小的
      let minBandwidthAudio = audioStreams[0];
      for (const audioStream of audioStreams) {
        if (audioStream.bandwidth < minBandwidthAudio.bandwidth) {
          minBandwidthAudio = audioStream;
        }
      }

      console.log('【VideoAdGuard】[AudioService] 选择的音频流带宽:', minBandwidthAudio.bandwidth);
      console.log('【VideoAdGuard】[AudioService] 音频流URL:', minBandwidthAudio.baseUrl);

      return minBandwidthAudio.baseUrl;
    } catch (error) {
      console.error('【VideoAdGuard】[AudioService] 获取音频URL失败:', error);
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
      console.log('【VideoAdGuard】[AudioService] 开始下载音频文件...');

      const response = await fetch(audioUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com/'
        }
      });

      if (!response.ok) {
        throw new Error(`音频下载失败: ${response.status} ${response.statusText}`);
      }

      console.log('【VideoAdGuard】[AudioService] 音频文件下载成功');
      console.log('【VideoAdGuard】[AudioService] 文件大小:', response.headers.get('content-length'));
      console.log('【VideoAdGuard】[AudioService] 文件类型:', response.headers.get('content-type'));

      return await response.blob();
    } catch (error) {
      console.error('【VideoAdGuard】[AudioService] 音频下载失败:', error);
      throw error;
    }
  }

  /**
   * 转换音频格式为WAV
   * @param audioBlob 原始音频文件Blob
   * @returns WAV格式的Blob
   */
  public static async convertToWav(audioBlob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        console.log('【VideoAdGuard】[AudioService] 开始转换音频格式...');

        // 创建音频上下文
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        // 读取音频文件
        const fileReader = new FileReader();
        fileReader.onload = async (e) => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;

            // 解码音频数据
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // 转换为WAV格式
            const wavBlob = this.audioBufferToWav(audioBuffer);

            console.log('【VideoAdGuard】[AudioService] 音频已转换为WAV格式');
            resolve(wavBlob);

          } catch (decodeError) {
            console.error('【VideoAdGuard】[AudioService] 音频解码失败:', decodeError);
            // 如果解码失败，直接返回原始音频
            resolve(audioBlob);
          }
        };

        fileReader.onerror = () => {
          console.error('【VideoAdGuard】[AudioService] 文件读取失败');
          reject(new Error('文件读取失败'));
        };

        fileReader.readAsArrayBuffer(audioBlob);

      } catch (error) {
        console.error('【VideoAdGuard】[AudioService] 音频转换过程出错:', error);
        // 如果转换失败，返回原始音频
        resolve(audioBlob);
      }
    });
  }

  /**
   * 生成缓存键
   * @param bvid 视频BV号
   * @param cid 视频CID
   * @returns 缓存键
   */
  public static generateCacheKey(bvid: string, cid: number): string {
    return `audio_${bvid}_${cid}`;
  }





  /**
   * 创建类似File对象的流式音频对象
   * @param audioBlob 音频Blob
   * @param filename 文件名
   * @returns 具有stream()方法的类File对象
   */
  public static createStreamableAudioFile(audioBlob: Blob, filename: string = 'audio.wav') {
    return {
      name: filename,
      size: audioBlob.size,
      type: audioBlob.type || 'audio/wav',
      lastModified: Date.now(),
      stream: () => audioBlob.stream(), // 使用Blob的stream()方法
      arrayBuffer: () => audioBlob.arrayBuffer(),
      text: () => audioBlob.text(),
      slice: (start?: number, end?: number, contentType?: string) =>
        audioBlob.slice(start, end, contentType)
    };
  }

  /**
   * 将音频文件保存到缓存（保存为WAV文件）
   * @param cacheKey 缓存键
   * @param audioBlob 音频Blob
   */
  public static async saveAudioToCache(cacheKey: string, audioBlob: Blob): Promise<void> {
    try {
      const cache = await caches.open(this.CACHE_NAME);
      const response = new Response(audioBlob, {
        headers: {
          'Content-Type': 'audio/wav',
          'Cache-Control': `max-age=${this.CACHE_EXPIRY_HOURS * 3600}`, // 缓存时间（秒）
          'X-File-Type': 'wav' // 标记为WAV文件
        }
      });
      await cache.put(cacheKey, response);
      console.log('【VideoAdGuard】[AudioService] WAV音频文件已保存到缓存:', cacheKey);
    } catch (error) {
      console.error('【VideoAdGuard】[AudioService] 保存音频到缓存失败:', error);
      throw error;
    }
  }



  /**
   * 将AudioBuffer转换为WAV格式的Blob
   * @param audioBuffer 音频缓冲区
   * @returns WAV格式的Blob
   */
  private static audioBufferToWav(audioBuffer: AudioBuffer): Blob {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    const buffer = new ArrayBuffer(44 + audioBuffer.length * numberOfChannels * bytesPerSample);
    const view = new DataView(buffer);

    // WAV文件头
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, buffer.byteLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, audioBuffer.length * numberOfChannels * bytesPerSample, true);

    // 写入音频数据
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * 音频处理流程：下载、转换（不缓存音频文件）
   * @param playUrlData 视频流数据
   * @returns 处理后的音频Blob
   */
  public static async processAudio(playUrlData: any): Promise<Blob | null> {
    try {
      console.log('【VideoAdGuard】[AudioService] 开始音频处理流程（不缓存音频）...');

      // 获取音频URL
      const audioUrl = this.getLowestBandwidthAudioUrl(playUrlData);
      if (!audioUrl) {
        return null;
      }

      // 下载音频
      const audioBlob = await this.downloadAudio(audioUrl);

      // 转换格式为WAV
      const wavBlob = await this.convertToWav(audioBlob);

      console.log('【VideoAdGuard】[AudioService] 音频处理完成，准备发送给API');
      return wavBlob;
    } catch (error) {
      console.error('【VideoAdGuard】[AudioService] 音频处理失败:', error);
      return null;
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
              console.log('【VideoAdGuard】[AudioService] 已清理过期缓存:', request.url);
            }
          }
        }
      }
    } catch (error) {
      console.error('【VideoAdGuard】[AudioService] 清理缓存失败:', error);
    }
  }



  /**
   * 通过后台脚本调用Groq语音识别API（使用临时URL方式）
   * @param audioBlob 音频文件Blob
   * @param options 识别选项
   * @returns 识别结果对象（包含文本和详细信息）
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
      console.log('【VideoAdGuard】[AudioService] 开始语音识别...');

      // 获取API密钥
      const settings = await chrome.storage.local.get(['groqApiKey']);
      const apiKey = settings.groqApiKey;

      if (!apiKey) {
        throw new Error('未配置Groq API密钥，请在设置中配置');
      }

      // 创建临时的Blob URL
      const audioUrl = URL.createObjectURL(audioBlob);

      try {
        console.log('【VideoAdGuard】[AudioService] 准备发送消息到后台脚本...');
        console.log('【VideoAdGuard】[AudioService] API密钥已配置:', !!apiKey);
        console.log('【VideoAdGuard】[AudioService] 音频URL:', audioUrl);

        // 通过后台脚本调用API，使用文件流
        const response = await chrome.runtime.sendMessage({
          type: 'TRANSCRIBE_AUDIO_FILE_STREAM',
          data: {
            audioUrl: audioUrl,
            fileInfo: {
              name: 'audio.wav',
              size: audioBlob.size,
              type: audioBlob.type || 'audio/wav'
            },
            apiKey: apiKey,
            options: {
              model: options.model || 'whisper-large-v3-turbo',
              responseFormat: options.responseFormat || 'verbose_json'
            }
          }
        });

        console.log('【VideoAdGuard】[AudioService] 收到后台脚本响应:', response);

        if (response && response.success) {
          console.log('【VideoAdGuard】[AudioService] 语音识别成功');
          return response.data;
        } else {
          const errorMsg = response?.error || '未知错误';
          console.error('【VideoAdGuard】[AudioService] 后台脚本返回错误:', errorMsg);
          throw new Error(errorMsg);
        }
      } catch (error) {
        console.error('【VideoAdGuard】[AudioService] 消息发送或处理失败:', error);
        throw error;
      } finally {
        // 清理临时URL
        URL.revokeObjectURL(audioUrl);
      }

    } catch (error) {
      console.error('【VideoAdGuard】[AudioService] 语音识别失败:', error);
      throw error;
    }
  }



  /**
   * 完整的音频处理和识别流程（使用文件流，缓存识别结果）
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
    audioBlob: Blob;
    transcription: any;
  } | null> {
    try {
      console.log('【VideoAdGuard】[AudioService] 开始完整的音频处理和识别流程...');

      // 1. 检查识别结果缓存
      const cachedTranscription = await this.getTranscriptionFromCache(bvid, cid);
      if (cachedTranscription) {
        console.log('【VideoAdGuard】[AudioService] 使用缓存的识别结果');
        // 仍需要处理音频以返回audioBlob
        const audioBlob = await this.processAudio(playUrlData);
        if (!audioBlob) {
          throw new Error('音频处理失败');
        }
        return {
          audioBlob,
          transcription: JSON.parse(cachedTranscription)
        };
      }

      // 2. 处理音频（下载、转换，不缓存）
      const audioBlob = await this.processAudio(playUrlData);
      if (!audioBlob) {
        throw new Error('音频处理失败');
      }

      // 3. 语音识别（使用文件流方式）
      const transcription = await this.transcribeAudio(audioBlob, transcribeOptions);

      // 4. 缓存识别结果
      await this.saveTranscriptionToCache(bvid, cid, JSON.stringify(transcription));

      console.log('【VideoAdGuard】[AudioService] 完整流程处理成功');
      return {
        audioBlob,
        transcription
      };
    } catch (error) {
      console.error('【VideoAdGuard】[AudioService] 完整流程处理失败:', error);
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
        console.log('【VideoAdGuard】[AudioService] 从缓存获取语音识别结果:', cacheKey);
        return result;
      }
      return null;
    } catch (error) {
      console.error('【VideoAdGuard】[AudioService] 从缓存读取识别结果失败:', error);
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
          'Cache-Control': `max-age=${this.CACHE_EXPIRY_HOURS * 3600}` // 缓存时间（秒）
        }
      });
      await cache.put(cacheKey, response);
      console.log('【VideoAdGuard】[AudioService] 语音识别结果已保存到缓存:', cacheKey);
    } catch (error) {
      console.error('【VideoAdGuard】[AudioService] 保存识别结果到缓存失败:', error);
      throw error;
    }
  }
}