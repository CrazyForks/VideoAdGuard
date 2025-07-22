export {};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {




  // 处理语音识别请求（文件流方式）
  if (message.type === 'TRANSCRIBE_AUDIO_FILE_STREAM') {
    handleAudioTranscriptionFileStream(message.data, sendResponse);
    return true; // 表示异步响应
  }

  // 处理原有的API请求
  const { url, headers, body } = message;
  if (url && headers && body) {
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
      .then((res) => res.json())
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.toString() });
      });

    return true; // 表示异步响应
  }

  // 如果不符合结构，直接返回错误
  sendResponse({ success: false, error: "Invalid message structure" });
  return false;
});





/**
 * 处理音频转录请求（文件流方式，模拟file.stream()）
 * @param data 音频URL、文件信息和选项
 * @param sendResponse 响应回调函数
 */
async function handleAudioTranscriptionFileStream(data: any, sendResponse: (response: any) => void) {
  try {
    console.log('【VideoAdGuard】[Background] 开始处理语音识别请求（文件流方式）...');
    console.log('【VideoAdGuard】[Background] 接收到的数据:', data);

    const { audioUrl, fileInfo, apiKey, options } = data;

    if (!apiKey) {
      console.error('【VideoAdGuard】[Background] API密钥未配置');
      throw new Error('未配置Groq API密钥，请在设置中配置');
    }

    console.log('【VideoAdGuard】[Background] API密钥已配置，长度:', apiKey.length);
    console.log('【VideoAdGuard】[Background] 文件信息:', fileInfo);
    console.log('【VideoAdGuard】[Background] 音频URL:', audioUrl);

    // 从URL获取音频数据，模拟file.stream()的行为
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error('无法获取音频数据');
    }

    // 获取ReadableStream，类似于file.stream()
    const fileStream = audioResponse.body;
    if (!fileStream) {
      throw new Error('无法获取文件流');
    }

    // 创建一个新的Response对象，使用流数据
    const streamResponse = new Response(fileStream, {
      headers: {
        'Content-Type': fileInfo.type,
        'Content-Length': fileInfo.size.toString()
      }
    });

    // 将流转换为Blob，但保持流式特性
    const audioBlob = await streamResponse.blob();

    // 创建FormData，模拟使用file.stream()的效果
    const formData = new FormData();

    // 创建一个类似File对象的Blob，包含文件信息
    const fileBlob = new File([audioBlob], fileInfo.name, {
      type: fileInfo.type,
      lastModified: Date.now()
    });

    formData.append('file', fileBlob);
    formData.append('model', options.model || 'whisper-large-v3-turbo');
    formData.append('response_format', options.responseFormat || 'verbose_json');

    console.log('【VideoAdGuard】[Background] 使用文件流处理，文件大小:', fileInfo.size, 'bytes');
    console.log('【VideoAdGuard】[Background] 准备调用Groq API...');

    // 调用Groq API
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData
    });

    console.log('【VideoAdGuard】[Background] Groq API响应状态:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('【VideoAdGuard】[Background] Groq API错误响应:', errorText);
      throw new Error(`Groq API调用失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log('【VideoAdGuard】[Background] 语音识别成功（文件流方式）');

    sendResponse({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('【VideoAdGuard】[Background] 语音识别失败（文件流方式）:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
