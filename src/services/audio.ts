/**
 * 音频处理服务类
 * 负责音频下载、格式转换和语音识别
 */
export class AudioService {

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
      console.warn('【VideoAdGuard】[Audio] 获取音频URL失败:', error);
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
      const response = await fetch(audioUrl);

      if (!response.ok) {
        throw new Error(`音频下载失败: ${response.status} ${response.statusText}`);
      }

      console.log(`【VideoAdGuard】[Audio] 音频下载完成`);

      return await response.blob();
    } catch (error) {
      console.warn('【VideoAdGuard】[Audio] 音频下载失败:', error);
      throw error;
    }
  }

  /**
   * 直接以 ArrayBuffer 下载音频，并返回内容类型
   */
  public static async downloadAudioBytes(audioUrl: string): Promise<{ bytes: ArrayBuffer; type: string }> {
    try {
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`音频下载失败: ${response.status} ${response.statusText}`);
      }
      const type = response.headers.get('content-type') || 'application/octet-stream';
      const bytes = await response.arrayBuffer();
      console.log('【VideoAdGuard】[Audio] 音频(ArrayBuffer)下载完成');
      return { bytes, type };
    } catch (error) {
      console.warn('【VideoAdGuard】[Audio] 音频(ArrayBuffer)下载失败:', error);
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
      console.log('【VideoAdGuard】[Audio] 音频URL:', audioUrl);
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

      // 处理m4s格式（MPEG-DASH音频片段）
      if (audioBlob.type === 'audio/m4s' || audioBlob.type === 'application/octet-stream') {
        const m4aBlob = new Blob([audioBlob], { type: 'audio/m4a' });
        console.log('【VideoAdGuard】[Audio] m4s格式转换为m4a完成');
        return m4aBlob;
      }

      throw new Error('未知格式: ' + audioBlob.type);

    } catch (error) {
      console.warn('【VideoAdGuard】[Audio] 音频处理失败:', error);
      return null;
    }
  }

  /**
   * 直接用 ArrayBuffer 走识别（与 background.ts 的 audioBytes 对接）
   */
  public static async transcribeAudioBytes(
    audioBytes: ArrayBuffer,
    fileInfo: { name?: string; type?: string }
  ): Promise<any> {
    try {
      console.log('【VideoAdGuard】[Audio] 开始语音识别(ArrayBuffer)...');

      const settings = await chrome.storage.local.get(['groqApiKey']);
      const apiKey = settings.groqApiKey;
      if (!apiKey) {
        throw new Error('未配置Groq API密钥，请在设置中配置');
      }

      const response = await chrome.runtime.sendMessage({
        type: 'TRANSCRIBE_AUDIO_FILE_STREAM',
        data: {
          audioBytes,
          fileInfo: {
            name: fileInfo.name || 'audio.bin',
            type: fileInfo.type || 'application/octet-stream',
            size: audioBytes.byteLength
          },
          apiKey,
          options: {
            model: 'whisper-large-v3-turbo',
            responseFormat: 'verbose_json'
          }
        }
      });

      if (response && response.success) {
        console.log('【VideoAdGuard】[Audio] 语音识别成功(ArrayBuffer)');
        return response.data;
      } else {
        const errorMsg = response?.error || '未知错误';
        console.warn('【VideoAdGuard】[Audio] 语音识别失败(ArrayBuffer):', errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.warn('【VideoAdGuard】[Audio] 语音识别失败(ArrayBuffer):', error);
      throw error;
    }
  }

  /**
   * 通过后台直接使用音频 URL 进行识别（后台负责下载 Blob、类型修正与调用 Groq）
   */
  public static async transcribeAudioByUrl(
    audioUrl: string,
    fileInfo: { name?: string; type?: string; size?: number },
    options: { model?: string; responseFormat?: string } = {}
  ): Promise<any> {
    try {
      console.log('【VideoAdGuard】[Audio] 开始语音识别(通过URL)...', audioUrl);

      const settings = await chrome.storage.local.get(['groqApiKey']);
      const apiKey = settings.groqApiKey;
      if (!apiKey) throw new Error('未配置Groq API密钥，请在设置中配置');

      const response = await chrome.runtime.sendMessage({
        type: 'TRANSCRIBE_AUDIO_FILE_STREAM',
        data: {
          audioUrl,
          fileInfo: {
            name: fileInfo.name || 'audio.bin',
            type: fileInfo.type || 'application/octet-stream',
            size: fileInfo.size || 0
          },
          apiKey,
          options: {
            model: options.model || 'whisper-large-v3-turbo',
            responseFormat: options.responseFormat || 'verbose_json'
          }
        }
      });

      if (response && response.success) {
        console.log('【VideoAdGuard】[Audio] 语音识别成功(通过URL)');
        return response.data;
      }

      const err = response?.error || '未知错误';
      console.warn('【VideoAdGuard】[Audio] 语音识别失败(通过URL):', err);
      throw new Error(err);
    } catch (error) {
      console.warn('【VideoAdGuard】[Audio] 语音识别失败(通过URL):', error);
      throw error;
    }
  }

  /**
   * 完整的音频处理和识别流程
   * @param playUrlData 视频流数据
   * @param transcribeOptions 语音识别选项
   * @returns 包含音频文件和识别结果的对象
   */
  public static async processAndTranscribeAudio(
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

      // 优先获取音频下载 URL，然后交由后台负责下载与识别
      const audioUrl = this.getLowestBandwidthAudioUrl(playUrlData);
      console.log('【VideoAdGuard】[Audio] 音频URL:', audioUrl);
      if (!audioUrl) {
        return null;
      }

      // 简单根据 URL 或播放信息推断类型与文件名（后台会进行最终类型修正）
      const guessedType = (playUrlData?.dash?.audio?.[0]?.mimeType) || '';
      const name = audioUrl.split('/').pop() || 'audio.bin';

      const transcription = await this.transcribeAudioByUrl(audioUrl, { name, type: guessedType });

      console.log('【VideoAdGuard】[Audio] 完整流程处理成功(通过URL)');
      return { transcription };
    } catch (error) {
      console.warn('【VideoAdGuard】[Audio] 完整流程处理失败:', error);
      return null;
    }
  }

}