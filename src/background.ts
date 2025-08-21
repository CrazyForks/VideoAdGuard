/**
 * Background Script - 后台脚本
 * 负责处理跨域请求和语音识别API调用
 */

export {}

// 消息类型枚举
enum MessageType {
  TRANSCRIBE_AUDIO_FILE_STREAM = 'TRANSCRIBE_AUDIO_FILE_STREAM',
  API_REQUEST = 'API_REQUEST'
}

// 响应接口
interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// 消息处理器类
class MessageHandler {
  /**
   * 处理来自content script的消息
   */
  static handleMessage(message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response: ApiResponse) => void): boolean {
    try {
      // 处理语音识别请求
      if (message.type === MessageType.TRANSCRIBE_AUDIO_FILE_STREAM) {
        AudioTranscriptionHandler.handle(message.data, sendResponse);
        return true; // 异步响应
      }

      // 处理通用API请求
      if (MessageHandler.isApiRequest(message)) {
        ApiRequestHandler.handle(message, sendResponse);
        return true; // 异步响应
      }

      // 无效消息结构
      sendResponse({ success: false, error: "Invalid message structure" });
      return false;
    } catch (error) {
      console.error('【VideoAdGuard】[Background] 消息处理失败:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * 检查是否为API请求
   */
  private static isApiRequest(message: any): boolean {
    return message.url && message.headers && message.body;
  }
}

// 通用API请求处理器
class ApiRequestHandler {
  /**
   * 处理通用API请求
   */
  static async handle(message: any, sendResponse: (response: ApiResponse) => void): Promise<void> {
    try {
      const { url, headers, body } = message;

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const data = await response.json();
      sendResponse({ success: true, data });
    } catch (error) {
      console.error('【VideoAdGuard】[Background] API请求失败:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// 音频转录处理器
class AudioTranscriptionHandler {
  private static readonly GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
  private static readonly DEFAULT_MODEL = 'whisper-large-v3-turbo';
  private static readonly DEFAULT_RESPONSE_FORMAT = 'verbose_json';

  /**
   * 处理音频转录请求
   * 支持传入：audioBytes(ArrayBuffer) | audioBase64(dataURL) | audioUrl(兜底)
   */
  static async handle(data: any, sendResponse: (response: ApiResponse) => void): Promise<void> {
    try {
      console.log('【VideoAdGuard】[Background] 开始语音识别...');

      const { audioUrl, audioBytes, audioBase64, fileInfo, apiKey, options } = data;

      // 验证API密钥
      if (!apiKey) {
        throw new Error('未配置Groq API密钥，请在设置中配置');
      }

      // 统一构建 Blob：优先使用 audioBytes/audioBase64，否则如果提供 audioUrl 在后台下载
      const audioBlob = await this.buildAudioBlob({ audioUrl, audioBytes, audioBase64, fileInfo });

      const sizeMB = (audioBlob.size / 1024 / 1024).toFixed(2);
      console.log(`【VideoAdGuard】[Background] 准备上传音频，大小: ${sizeMB}MB`);

      // 使用Blob调用Groq API
      const result = await this.callGroqApiWithBlob(audioBlob, fileInfo, options, apiKey);

      console.log('【VideoAdGuard】[Background] 语音识别成功');
      sendResponse({ success: true, data: result });
    } catch (error) {
      console.error('【VideoAdGuard】[Background] 语音识别失败:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // 从多种输入构建Blob（支持 audioBytes/audioBase64/audioUrl）
  private static async buildAudioBlob(input: {
    audioUrl?: string;
    audioBytes?: ArrayBuffer;
    audioBase64?: string;
    fileInfo?: any;
  }): Promise<Blob> {
    const { audioUrl, audioBytes, audioBase64, fileInfo } = input;

    let audioBlob: Blob | undefined;

    if (audioBytes instanceof ArrayBuffer) {
      const guessedType = (fileInfo?.type || '').toLowerCase();
      const fixedType = guessedType === 'audio/m4s' || guessedType === 'application/octet-stream'
        ? 'audio/m4a'
        : (fileInfo?.type || 'application/octet-stream');
      audioBlob = new Blob([new Uint8Array(audioBytes)], { type: fixedType });
    } else if (typeof audioBase64 === 'string' && audioBase64.startsWith('data:')) {
      // dataURL -> Blob
      const comma = audioBase64.indexOf(',');
      const meta = audioBase64.substring(5, comma);
      const base64 = audioBase64.substring(comma + 1);
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const mimeFromMeta = meta.split(';')[0];
      const lower = (mimeFromMeta || '').toLowerCase();
      const fixedType = lower === 'audio/m4s' || lower === 'application/octet-stream'
        ? 'audio/m4a'
        : (mimeFromMeta || fileInfo?.type || 'application/octet-stream');
      audioBlob = new Blob([bytes], { type: fixedType });
    } else if (audioUrl) {
      // 在后台下载远端音频（注意：不能下载 page-local blob: URL）
      if (audioUrl.startsWith('blob:')) {
        throw new Error('audioUrl 为 blob: URL，后台无法直接下载。请在页面端转换为可访问的 URL 或发送字节数据。');
      }

      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) throw new Error(`后台下载音频失败: ${audioResponse.status} ${audioResponse.statusText}`);
      audioBlob = await audioResponse.blob();

      // 修正类型：某些服务器返回 application/octet-stream 或 audio/m4s，需要改为 audio/m4a
      const serverType = (audioBlob.type || fileInfo?.type || '').toLowerCase();
      if (serverType === 'audio/m4s' || serverType === 'application/octet-stream') {
        audioBlob = new Blob([audioBlob], { type: 'audio/m4a' });
        console.log('【VideoAdGuard】[Background] 将后台下载的音频类型修正为 audio/m4a');
      }
    }

    if (!audioBlob) {
      throw new Error('未提供有效的音频数据');
    }

    // Groq 限制：建议小于 19MB
    const maxSize = 19 * 1024 * 1024;
    if (audioBlob.size > maxSize) {
      const fileSizeMB = (audioBlob.size / 1024 / 1024).toFixed(2);
      throw new Error(`音频文件过大 (${fileSizeMB}MB)，超过Groq API限制(19MB)。请尝试使用较短的音频片段或降低音频质量。`);
    }

    return audioBlob;
  }

  /**
   * 使用Blob调用Groq API
   */
  private static async callGroqApiWithBlob(audioBlob: Blob, fileInfo: any, options: any, apiKey: string): Promise<any> {
    const formData = new FormData();
    const originalName = fileInfo?.name || 'audio.bin';
    // 若类型被修正为 m4a，则对应名称后缀也尽量改为 .m4a
    const extFixed = (audioBlob.type === 'audio/m4a' && !/\.m4a$/i.test(originalName)) ? (originalName.replace(/\.[^.]+$/, '') + '.m4a') : originalName;

    const file = new File([audioBlob], extFixed, {
      type: audioBlob.type || fileInfo?.type || 'application/octet-stream',
      lastModified: Date.now()
    });

    formData.append('file', file);
    formData.append('model', options?.model || this.DEFAULT_MODEL);
    formData.append('response_format', options?.responseFormat || this.DEFAULT_RESPONSE_FORMAT);

    const response = await fetch(this.GROQ_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('【VideoAdGuard】[Background] Groq API错误:', errorText);
      throw new Error(`Groq API调用失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }
}

// 注册消息监听器
chrome.runtime.onMessage.addListener(MessageHandler.handleMessage);