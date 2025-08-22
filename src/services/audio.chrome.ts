/**
 * Chrome 专用音频处理（Blob -> data:URL -> background）
 */
export class AudioService {
  // 支持的音频/容器类型
  private static readonly SUPPORTED_MIME = [
    'audio/mp3',
    'audio/mpeg',
    'audio/mp4',
    'audio/m4a',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/flac',
    'video/mp4'
  ];

  private static normalizeAudioBlob(audioBlob: Blob): Blob {
    const type = audioBlob.type || 'application/octet-stream';
    if (AudioService.SUPPORTED_MIME.includes(type)) return audioBlob;
    if (type === 'audio/m4s' || type === 'application/octet-stream') {
      return new Blob([audioBlob], { type: 'audio/m4a' });
    }
    throw new Error('未知格式: ' + type);
  }

  public static getLowestBandwidthAudioUrl(playUrlData: any): string | null {
    try {
      if (!playUrlData?.dash?.audio || !Array.isArray(playUrlData.dash.audio)) return null;
      const audioStreams = playUrlData.dash.audio;
      let min = audioStreams[0];
      for (const a of audioStreams) if (a.bandwidth < min.bandwidth) min = a;
      return min.baseUrl;
    } catch {
      return null;
    }
  }

  /** 下载音频（Blob）并进行类型规范化 */
  public static async downloadAudio(audioUrl: string): Promise<Blob> {
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`音频下载失败: ${response.status} ${response.statusText}`);
    const raw = await response.blob();
    return AudioService.normalizeAudioBlob(raw);
  }

  public static async transcribeAudioBlob(audioBlob: Blob, fileInfo: { name?: string; type?: string }): Promise<any> {
    const audioBlobUrl = URL.createObjectURL(audioBlob);

    const { groqApiKey: apiKey } = await chrome.storage.local.get(['groqApiKey']);
    if (!apiKey) throw new Error('未配置Groq API密钥，请在设置中配置');

    const response = await chrome.runtime.sendMessage({
      type: 'TRANSCRIBE_AUDIO_FILE_STREAM',
      data: {
        audioBlobUrl,
        fileInfo: {
          name: fileInfo.name || 'audio.m4a',
          type: fileInfo.type || 'audio/m4a',
          size: audioBlob.size
        },
        apiKey,
        options: { model: 'whisper-large-v3-turbo', responseFormat: 'verbose_json' }
      }
    });

    if (!response?.success) throw new Error(response?.error || '未知错误');
    return response.data;
  }


  public static async processAndTranscribeAudio(playUrlData: any, _opts: { model?: string; language?: string; responseFormat?: 'verbose_json' } = {}): Promise<{ transcription: any } | null> {
    try {
      const audioUrl = this.getLowestBandwidthAudioUrl(playUrlData);
      if (!audioUrl) return null;
      const name = 'audio.m4a';
      const blob = await this.downloadAudio(audioUrl);
      const blobType = blob.type || 'audio/m4a';
      const transcription = await this.transcribeAudioBlob(blob, { name, type: blobType });
      return { transcription };
    } catch (e) {
      console.warn('【VideoAdGuard】[Audio] 完整流程处理失败(Chrome):', e);
      return null;
    }
  }
}
