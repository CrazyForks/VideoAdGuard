export class AIService {
  private static async makeRequest(videoInfo: any, url: string, model: string,
    config: {
    headers: Record<string, string>,
    bodyExtra?: Record<string, any>
  }) {
    const messageBody = {
      model: model,
      messages: [
        {
          role: "system",
          content:
            "你是一个敏感的视频观看者，能根据视频的连贯性改变和宣传推销类内容，找出视频中可能存在的植入广告。内容如果和主题相关，即使是推荐/评价也可能只是分享而不是广告，重点要看置顶评论和附加信息中有没有商品链接。",
        },
        {
          role: "user",
          content: this.buildPrompt(videoInfo),
        },
      ],
      temperature: 0,
      max_tokens: 1024,
      stream: false,
      ...config.bodyExtra,
    };

    const response = await chrome.runtime.sendMessage({
      url: url,
      headers: config.headers,
      body: messageBody,
    });

    console.log("【VideoAdGuard】API请求已发送");
    if (response.success) {
      console.log("【VideoAdGuard】收到大模型响应:", response.data);
      return response.data;
    } else {
      console.error("【VideoAdGuard】请求失败:", response.error);
      throw new Error(response.error);
    }
  }

  public static async detectAd(videoInfo: {
    title: string;
    topComment: string | null;
    addtionMessages: Record<string, Record<string, any>> | null;
    captions: Record<number, string>;
  }) {
    console.log("【VideoAdGuard】开始分析视频信息:", videoInfo);
    const url = await this.getApiUrl();
    const model = await this.getModel();
    const enableLocalOllama = await this.getEnableLocalOllama();

    if (enableLocalOllama) {
      const data = await this.makeRequest(videoInfo, url, model,
      {
        headers: {
          "Content-Type": "application/json",
        },
        bodyExtra: {
          format: "json",
        }
      });
      return JSON.parse(data.message.content);
    } else {
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        throw new Error("未设置API密钥");
      }
      

      const isOpenAI = url.includes("api.openai.com");
      const isAzureOpenAI = url.includes("openai.azure.com");
      const isZhipuAI = url.includes("open.bigmodel.cn");
      const isDeepseek = url.includes("api.deepseek.com");
      const isQwen = url.includes("aliyuncs.com");

      const bodyExtra: any = {};

      // 仅对支持 JSON 模式的模型添加 response_format
      if (isOpenAI || isAzureOpenAI || isZhipuAI || isDeepseek || isQwen) {
        bodyExtra.response_format = { type: "json_object" };
      }

      const data = await this.makeRequest(videoInfo, url, model,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        bodyExtra: Object.keys(bodyExtra).length ? bodyExtra : undefined,
      });
      return data.choices[0].message.content;
    }
  }
  
  private static buildPrompt(videoInfo: {
    title: string;
    topComment: string | null;
    addtionMessages: Record<string, Record<string, any>> | null;
    captions: Record<number, string>;
  }): string {
    const prompt = `视频的标题和置顶评论如下，可供参考判断是否有广告。
    视频标题：${videoInfo.title}
    置顶评论：${videoInfo.topComment || '无'}，如果没有置顶评论，认为没有广告。
    附加信息：${JSON.stringify(videoInfo.addtionMessages) || '无'}，如果置顶评论中有链接，且是商品链接，那么广告商品已经确定，只需要找出介绍商品的部分（介绍其他产品认为是用于对比，不用管）；如果不是商品链接，认为没有广告。
    下面我会给你这个视频的字幕字典，形式为 index: context. 如果有广告，请你完整地找出其中的广告，返回json格式的数据。注意要返回一整段的广告，从广告的引入到结尾重新转折回到视频内容的所有广告部分。
    字幕内容：${JSON.stringify(videoInfo.captions)}
    请以json格式输出，示例如下：
    {
      "exist": <bool. true表示存在广告，false表示不存在广告>,
      "good_name": <list[string]. 广告的商品名称，可以参考置顶评论和附加信息，有多少个链接一般视频就会推销多少个商品>,
      "index_lists": <list[list[int]]. 二维数组，行数表示广告的段数。每一行是长度为2的数组[start, end]，表示一段完整广告的开头结尾，start和end是字幕的index。>
    }`;
    console.log('【VideoAdGuard】构建提示词成功:', {prompt});
    return prompt;
  }

  private static async getApiUrl(): Promise<string> {
    const result = await chrome.storage.local.get('apiUrl');
    console.log('【VideoAdGuard】API地址状态:', result.apiUrl? '已设置' : '未设置');
    return result.apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  }

  private static async getApiKey(): Promise<string | null> {
    const result = await chrome.storage.local.get('apiKey');
    console.log('【VideoAdGuard】API密钥状态:', result.apiKey ? '已设置' : '未设置');
    return result.apiKey || null;
  }

  private static async getModel(): Promise<string> {
    const result = await chrome.storage.local.get('model');
    console.log('【VideoAdGuard】模型名称状态:', result.model ? '已设置' : '未设置');
    return result.model || 'glm-4-flash';
  }

  private static async getEnableLocalOllama(): Promise<boolean> {
    const result = await chrome.storage.local.get("enableLocalOllama");
    console.log("【VideoAdGuard】本地Ollama设置状态:", result.enableLocalOllama);
    return result.enableLocalOllama || false;
  }
}
