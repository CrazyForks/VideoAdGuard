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
            "你是一个专业的视频内容分析师，专门识别视频中的植入广告。只有当内容明确包含商业推广、产品推荐且有明确的购买引导时，才认定为广告。",
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

  /**
   * 限制模式下的请求方法，使用不同的提示词
   */
  private static async makeRequestRestricted(videoInfo: any, url: string, model: string,
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
            "你是一个专业的视频内容分析师，专门识别视频中的植入广告。在限制模式下，你需要更加谨慎和精确地判断广告内容。只有当内容明确包含商业推广、产品推荐且有明确的购买引导时，才认定为广告。",
        },
        {
          role: "user",
          content: this.buildRestrictedPrompt(videoInfo),
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

    console.log("【VideoAdGuard】限制模式API请求已发送");
    if (response.success) {
      console.log("【VideoAdGuard】限制模式收到大模型响应:", response.data);
      return response.data;
    } else {
      console.error("【VideoAdGuard】限制模式请求失败:", response.error);
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

  /**
   * 限制模式下的广告检测方法
   * 使用不同的提示词进行更精确的广告检测
   */
  public static async detectAdRestricted(videoInfo: {
    title: string;
    topComment: string | null;
    addtionMessages: Record<string, Record<string, any>> | null;
    captions: Record<number, string>;
    goodNames?: string[];
  }) {
    console.log("【VideoAdGuard】限制模式：开始分析视频信息:", videoInfo);
    const url = await this.getApiUrl();
    const model = await this.getModel();
    const enableLocalOllama = await this.getEnableLocalOllama();

    if (enableLocalOllama) {
      const data = await this.makeRequestRestricted(videoInfo, url, model,
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

      const data = await this.makeRequestRestricted(videoInfo, url, model,
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
    const prompt = `你需要分析视频内容，识别其中的植入广告。

视频信息：
标题：${videoInfo.title}
置顶评论：${videoInfo.topComment || '无'}
附加信息：${JSON.stringify(videoInfo.addtionMessages) || '无'}

检测规则：
1. 只有当内容明确包含商业推广、产品推荐且有明确的购买引导时，才认定为广告
2. 纯粹的产品介绍、评测、对比，如果没有明确的购买引导，不认定为广告
3. 必须有明确的商品链接或购买渠道信息才能认定为广告
4. 如果置顶评论中没有商品链接，则更倾向于认定为无广告
5. 广告内容必须与置顶评论或附加信息中的商品链接相对应

字幕内容：${JSON.stringify(videoInfo.captions)}

请严格按照检测规则进行判断，以json格式输出：
{
  "exist": <bool. true表示存在广告，false表示不存在广告>,
  "good_name": <list[string]. 广告的商品名称>,
  "index_lists": <list[list[int]]. 二维数组，每一行是[start, end]，表示一段完整广告的开头结尾字幕index>
}`;
    console.log('【VideoAdGuard】构建提示词成功:', {prompt});
    return prompt;
  }

  /**
   * 限制模式下的提示词构建方法
   * 使用更严格的判断标准
   */
  private static buildRestrictedPrompt(videoInfo: {
    title: string;
    topComment: string | null;
    addtionMessages: Record<string, Record<string, any>> | null;
    captions: Record<number, string>;
    goodNames?: string[];
  }): string {
    const goodNamesText = videoInfo.goodNames && videoInfo.goodNames.length > 0
      ? videoInfo.goodNames.join('、')
      : '无';

const prompt = `以下视频内容存在广告，请你根据预提取的商品名称找出广告内容。

视频信息：
标题：${videoInfo.title}
置顶评论：${videoInfo.topComment || '无'}
附加信息：${JSON.stringify(videoInfo.addtionMessages) || '无'}
预提取的商品名称：${goodNamesText}

限制模式检测规则：
1. 只有当内容明确包含商业推广、产品推荐且有明确的购买引导时，才认定为广告
2. 纯粹的产品介绍、评测、对比，如果没有明确的购买引导，不认定为广告
3. 必须有明确的商品链接或购买渠道信息才能认定为广告
4. 如果置顶评论中没有商品链接，则更倾向于认定为无广告
5. 广告内容必须与置顶评论或附加信息中的商品链接相对应
6. 重点关注预提取的商品名称，在字幕中寻找与这些商品相关的推广内容

字幕内容：${JSON.stringify(videoInfo.captions)}

请严格按照限制模式规则进行判断，特别关注预提取的商品名称，以json格式输出：
{
  "exist": <bool. true表示存在广告，false表示不存在广告>,
  "good_name": <list[string]. 广告的商品名称>,
  "index_lists": <list[list[int]]. 二维数组，每一行是[start, end]，表示一段完整广告的开头结尾字幕index>
}`;
    console.log('【VideoAdGuard】限制模式构建提示词成功:', {prompt});
    return prompt;
  }

  /**
   * 根据链接标题提取商品名称
   */
  public static async extractProductName(linkTitle: string): Promise<string> {
    console.log("【VideoAdGuard】开始提取商品名称");
    const url = await this.getApiUrl();
    const model = await this.getModel();
    const enableLocalOllama = await this.getEnableLocalOllama();

    const messageBody = {
      model: model,
      messages: [
        {
          role: "system",
          content: "你是商品名称提取专家。从链接标题中提取核心商品名称，去除修饰词、营销词汇，只保留商品的本质名称。"
        },
        {
          role: "user",
          content: `链接标题：${linkTitle}\n\n请提取其中的核心商品名称，只返回商品名称，不要解释。`
        }
      ],
      temperature: 0,
      max_tokens: 100,
      stream: false
    };

    if (enableLocalOllama) {
      const response = await chrome.runtime.sendMessage({
        url: url,
        headers: {
          "Content-Type": "application/json",
        },
        body: messageBody,
      });

      if (response.success) {
        console.log("【VideoAdGuard】商品名称提取成功:", response.data);
        return JSON.parse(response.data.message.content);
      } else {
        console.error("【VideoAdGuard】商品名称提取失败:", response.error);
        throw new Error(response.error);
      }
    } else {
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        throw new Error("未设置API密钥");
      }

      const response = await chrome.runtime.sendMessage({
        url: url,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: messageBody,
      });

      if (response.success) {
        console.log("【VideoAdGuard】商品名称提取成功:", response.data);
        return response.data.choices[0].message.content.trim();
      } else {
        console.error("【VideoAdGuard】商品名称提取失败:", response.error);
        throw new Error(response.error);
      }
    }
  }

  private static async getApiUrl(): Promise<string> {
    const result = await chrome.storage.local.get('apiUrl');
    return result.apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  }

  private static async getApiKey(): Promise<string | null> {
    const result = await chrome.storage.local.get('apiKey');
    return result.apiKey || null;
  }

  private static async getModel(): Promise<string> {
    const result = await chrome.storage.local.get('model');
    return result.model || 'glm-4-flash';
  }

  private static async getEnableLocalOllama(): Promise<boolean> {
    const result = await chrome.storage.local.get("enableLocalOllama");
    return result.enableLocalOllama || false;
  }
}
