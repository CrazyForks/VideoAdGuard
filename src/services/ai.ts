export class AIService {
  public static async analyze(videoInfo: {
    title: string;
    topComment: string | null;
    captions: Record<number, string>;
  }) {
    console.log('开始分析视频信息:', videoInfo);
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('未设置API密钥');
    }
    console.log('成功获取API密钥');

    const response = await fetch(await this.getApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: await this.getModel(),
        messages: [
          {
            'role': 'system',
            'content': '你是一个敏感的视频观看者，能根据视频的连贯性改变和宣传推销类内容，找出视频中可能存在的植入广告。内容如果和主题强相关，即使是推荐/评价也可能只是好物分享而不是广告，重点要看有没有指明通过视频博主受益的渠道进行购买。'
          },
          {
            'role': 'user',
            'content': this.buildPrompt(videoInfo)
          }
        ],
        response_format: { 'type': 'json_object' },
        temperature: 0.1,
        max_tokens: 1024
      })
    });
    console.log('API请求已发送');

    const data = await response.json();
    console.log('收到API响应:', data);
    return JSON.parse(data.choices[0].message.content);
  }

  private static buildPrompt(videoInfo: {
    title: string;
    topComment: string | null;
    captions: Record<number, string>;
  }): string {
    console.log('构建提示词，输入数据:', videoInfo);
    const prompt = `视频的标题和置顶评论如下，可供参考判断是否有植入广告。如果置顶评论中有购买链接，则肯定有广告。并且可以根据置顶评论锁定视频中广告的位置。
视频标题：${videoInfo.title}
置顶评论：${videoInfo.topComment || '无'}
下面我会给你这个视频的字幕字典，形式为 index: context. 请你找出其中的植入广告，返回json格式的数据。一般来说视频是没有广告的，但也有小部分会植入一段广告，极少部分是多段广告。
字幕内容：${JSON.stringify(videoInfo.captions)}
先返回'exist': bool。true表示存在植入广告，false表示不存在植入广告。
再返回'index_lists': list[list[int]]。二维数组，行数表示广告的段数，每一行是长度为2的数组[start, end]，表示一段广告的开头结尾，start和end是字幕的index。`;

    return prompt;
  }

  private static async getApiUrl(): Promise<string> {
    console.log('正在获取API地址');
    const result = await chrome.storage.local.get('apiUrl');
    console.log('API地址状态:', result.apiUrl? '已设置' : '未设置');
    return result.apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  }

  private static async getApiKey(): Promise<string | null> {
    console.log('正在获取API密钥');
    const result = await chrome.storage.local.get('apiKey');
    console.log('API密钥状态:', result.apiKey ? '已设置' : '未设置');
    return result.apiKey || null;
  }

  private static async getModel(): Promise<string | null> {
    console.log('正在获取模型名称');
    const result = await chrome.storage.local.get('model');
    console.log('模型名称状态:', result.model ? '已设置' : '未设置');
    return result.model || 'glm-4-flash';
  }

  
}