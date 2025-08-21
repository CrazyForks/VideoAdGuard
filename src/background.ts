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
        headers: {
          ...headers,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: JSON.stringify(body),
        mode: 'cors'
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
   */
  static async handle(data: any, sendResponse: (response: ApiResponse) => void): Promise<void> {
    try {
      console.log('【VideoAdGuard】[Background] 开始语音识别...');

      const { audioUrl, fileInfo, apiKey, options } = data;

      // 验证API密钥
      if (!apiKey) {
        throw new Error('未配置Groq API密钥，请在设置中配置');
      }

      console.log(`【VideoAdGuard】[Background] 调用Groq API，文件大小: ${Math.round(fileInfo.size / 1024)}KB`);

      // 直接使用流式方式调用Groq API
      const result = await this.callGroqApiWithStream(audioUrl, fileInfo, options, apiKey);

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

  /**
   * 使用流式方式调用Groq API
   */
  private static async callGroqApiWithStream(audioUrl: string, fileInfo: any, options: any, apiKey: string): Promise<any> {
    // 获取音频流
    let audioResponse: Response;
    
    // 判断是否是 bilivideo.com 域名的资源
    if (audioUrl.includes('bilivideo.com')) {
      audioResponse = await BilivideoResourceHandler.fetchBilivideoResource(audioUrl);
    } else {
      audioResponse = await fetch(audioUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.bilibili.com/',
          'Origin': 'https://www.bilibili.com'
        },
        credentials: 'include',
        mode: 'cors',
        referrerPolicy: 'strict-origin-when-cross-origin'
      });
    }
    if (!audioResponse.ok) {
      throw new Error('无法获取音频数据');
    }

    const audioStream = audioResponse.body;
    if (!audioStream) {
      throw new Error('无法获取文件流');
    }

    // 创建FormData，使用Response对象作为文件
    const formData = new FormData();

    // 将流包装成Response，然后转换为Blob，但使用更小的块
    const streamResponse = new Response(audioStream, {
      headers: {
        'Content-Type': fileInfo.type,
        'Content-Length': fileInfo.size.toString()
      }
    });
    const audioBlob = await streamResponse.blob();

    // 检查文件大小，Groq API限制为25MB
    const maxSize = 19 * 1024 * 1024; // 19MB限制
    const fileSizeMB = audioBlob.size / 1024 / 1024;

    console.log(`【VideoAdGuard】[Background] 音频文件大小: ${fileSizeMB.toFixed(2)}MB`);

    if (audioBlob.size > maxSize) {
      throw new Error(`音频文件过大 (${fileSizeMB.toFixed(2)}MB)，超过Groq API限制(19MB)。请尝试使用较短的音频片段或降低音频质量。`);
    }

    const fileBlob = new File([audioBlob], fileInfo.name, {
      type: fileInfo.type,
      lastModified: Date.now()
    });

    formData.append('file', fileBlob);
    formData.append('model', options.model || this.DEFAULT_MODEL);
    formData.append('response_format', options.responseFormat || this.DEFAULT_RESPONSE_FORMAT);

    // 调用API
    const response = await fetch(this.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: formData,
      mode: 'cors'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('【VideoAdGuard】[Background] Groq API错误:', errorText);
      throw new Error(`Groq API调用失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }


}

// 专门处理 bilivideo.com 资源请求的处理器
class BilivideoResourceHandler {
  /**
   * 处理 bilivideo.com 资源请求，使用正确的 referrer 策略
   */
  static async fetchBilivideoResource(url: string, options: RequestInit = {}): Promise<Response> {
    return fetch(url, {
      ...options,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
        'Origin': 'https://www.bilibili.com',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        ...options.headers
      },
      credentials: 'omit', // 对于 bilivideo.com 资源，不发送 cookies
      mode: 'cors',
      referrerPolicy: 'strict-origin-when-cross-origin'
    });
  }
}

// 注册消息监听器
chrome.runtime.onMessage.addListener(MessageHandler.handleMessage);


