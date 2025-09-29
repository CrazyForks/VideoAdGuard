/**
 * Firefox 专用音频处理（ArrayBuffer -> background）
 */
export class AudioService {
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

  public static async downloadAudioBytes(audioUrl: string): Promise<{ bytes: ArrayBuffer; type: string }> {
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`音频下载失败: ${response.status} ${response.statusText}`);
    const type = response.headers.get('content-type') || 'audio/m4a/octet-stream';
    const bytes = await response.arrayBuffer();
    return { bytes, type };
  }

  public static async transcribeAudioBytes(bytes: ArrayBuffer, fileInfo: { name?: string; type?: string }): Promise<any> {
    // 仅修正类型，不改变字节
    const temp = new Blob([new Uint8Array(bytes)], { type: fileInfo.type || 'application/octet-stream' });
    const type = AudioService.normalizeAudioBlob(temp).type;

    const { groqApiKey: apiKey, enableGroqProxy } = await chrome.storage.local.get(['groqApiKey', 'enableGroqProxy']);
    if (!apiKey) throw new Error('未配置Groq API密钥，请在设置中配置');

    const response = await chrome.runtime.sendMessage({
      type: 'TRANSCRIBE_AUDIO_FILE_STREAM',
      data: {
        audioBytes: bytes,
        fileInfo: { name: fileInfo.name || 'audio.bin', type: type, size: bytes.byteLength },
        apiKey,
        options: {
          model: 'whisper-large-v3-turbo',
          responseFormat: 'verbose_json',
          allowProxyFallback: Boolean(enableGroqProxy)
        }
      }
    });
    if (!response?.success) throw new Error(response?.error || '未知错误');
    return response.data;
  }


  /** Firefox 固化流程：ArrayBuffer 路径 */
  public static async processAndTranscribeAudio(playUrlData: any, _opts: { model?: string; language?: string; responseFormat?: 'verbose_json' } = {}): Promise<{ transcription: any } | null> {
    try {
      const audioUrl = this.getLowestBandwidthAudioUrl(playUrlData);
      if (!audioUrl) return null;
      const name = 'audio.m4a';
      const { bytes, type } = await this.downloadAudioBytes(audioUrl);
      const transcription = await this.transcribeAudioBytes(bytes, { name, type });
      return { transcription };
    } catch (e) {
      console.warn('【VideoAdGuard】[Audio] 完整流程处理失败(Firefox):', e);
      return null;
    }
  }
}
