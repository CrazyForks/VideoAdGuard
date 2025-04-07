export class AIService {
  private static async makeRequest(videoInfo: any, config: {
    headers: Record<string, string>,
    bodyExtra?: Record<string, any>
  }) {
    const response = await fetch(await this.getApiUrl(), {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        model: await this.getModel(),
        messages: [
          {
            role: "system",
            content: "你是一个敏感的视频观看者，能根据视频的连贯性改变和宣传推销类内容，找出视频中可能存在的植入广告。内容如果和主题相关，即使是推荐/评价也可能只是分享而不是广告，重点要看有没有提到通过视频博主可以受益的渠道进行购买。",
          },
          {
            role: "user",
            content: this.buildPrompt(videoInfo),
          },
        ],
        temperature: 0.1,
        max_tokens: 1024,
        ...config.bodyExtra
      }),
    });

    console.log("【VideoAdGuard】API请求已发送");
    const data = await response.json();
    console.log("【VideoAdGuard】收到API响应:", data);
    return data;
  }

  public static async analyze(videoInfo: {
    title: string;
    topComment: string | null;
    captions: Record<number, string>;
  }) {
    console.log("【VideoAdGuard】开始分析视频信息:", videoInfo);
    const enableLocalOllama = await this.getEnableLocalOllama();

    if (enableLocalOllama) {
      const data = await this.makeRequest(videoInfo, {
        headers: {
          "Content-Type": "application/json",
        },
        bodyExtra: {
          format: "json",
          stream: false,
        }
      });
      return JSON.parse(data.message.content);
    } else {
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        throw new Error("未设置API密钥");
      }
      console.log("【VideoAdGuard】成功获取API密钥");

      const data = await this.makeRequest(videoInfo, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        bodyExtra: {
          response_format: { type: "json_object" }
        }
      });
      return JSON.parse(data.choices[0].message.content);
    }
  }
  
  private static buildPrompt(videoInfo: {
    title: string;
    topComment: string | null;
    captions: Record<number, string>;
  }): string {
    const prompt = `视频的标题和置顶评论如下，可供参考判断是否有植入广告。如果置顶评论中有购买链接，则肯定有广告，同时可以根据置顶评论的内容判断视频中的广告商从而确定哪部分是广告。
视频标题：${videoInfo.title}
置顶评论：${videoInfo.topComment || '无'}
下面我会给你这个视频的字幕字典，形式为 index: context. 请你完整地找出其中的植入广告，返回json格式的数据。注意要返回一整段的广告，从广告的引入到结尾重新转折回到视频内容前，因此不要返回太短的广告，可以组合成一整段返回。
字幕内容：${JSON.stringify(videoInfo.captions)}
先返回'exist': bool。true表示存在植入广告，false表示不存在植入广告。
再返回'index_lists': list[list[int]]。二维数组，行数表示广告的段数，一般来说视频是没有广告的，但也有小部分会植入一段广告，极少部分是多段广告，因此不要返回过多，只返回与标题最不相关或者与置顶链接中的商品最相关的部分。每一行是长度为2的数组[start, end]，表示一段广告的开头结尾，start和end是字幕的index。`;
    console.log('【VideoAdGuard】构建提示词成功:', prompt);
    return prompt;
  }

  private static async getApiUrl(): Promise<string> {
    console.log('【VideoAdGuard】正在获取API地址');
    const result = await chrome.storage.local.get('apiUrl');
    console.log('【VideoAdGuard】API地址状态:', result.apiUrl? '已设置' : '未设置');
    return result.apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  }

  private static async getApiKey(): Promise<string | null> {
    console.log('【VideoAdGuard】正在获取API密钥');
    const result = await chrome.storage.local.get('apiKey');
    console.log('【VideoAdGuard】API密钥状态:', result.apiKey ? '已设置' : '未设置');
    return result.apiKey || null;
  }

  private static async getModel(): Promise<string | null> {
    console.log('【VideoAdGuard】正在获取模型名称');
    const result = await chrome.storage.local.get('model');
    console.log('【VideoAdGuard】模型名称状态:', result.model ? '已设置' : '未设置');
    return result.model || 'glm-4-flash';
  }

  private static async getEnableLocalOllama(): Promise<boolean> {
    console.log("【VideoAdGuard】正在获取本地Ollama设置");
    const result = await chrome.storage.local.get("enableLocalOllama");
    console.log(
      "【VideoAdGuard】本地Ollama设置状态:",
      result.enableLocalOllama ? "已设置" : "未设置"
    );
    return result.enableLocalOllama || false;
  }
}
