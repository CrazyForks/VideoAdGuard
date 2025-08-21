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
          console.warn('【VideoAdGuard】[Audio] 语音识别失败:', errorMsg);
          throw new Error(errorMsg);
        }
      } finally {
        // 清理临时URL
        URL.revokeObjectURL(audioUrl);
      }

    } catch (error) {
      console.warn('【VideoAdGuard】[Audio] 语音识别失败:', error);
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

      // 1. 处理音频
      const audioBlob = await this.processAudio(playUrlData);
      if (!audioBlob) {
        throw new Error('音频处理失败');
      }

      // 2. 语音识别
      const transcription = await this.transcribeAudio(audioBlob, transcribeOptions);

      console.log('【VideoAdGuard】[Audio] 完整流程处理成功');
      return {
        transcription
      };
    } catch (error) {
      console.warn('【VideoAdGuard】[Audio] 完整流程处理失败:', error);
      return null;
    }
  }

}