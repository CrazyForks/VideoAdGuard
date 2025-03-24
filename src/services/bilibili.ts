import { WbiUtils } from '../utils/wbi';

export class BilibiliService {
  private static async fetchWithCookie(url: string, params: Record<string, any> = {}) {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = `${url}?${queryString}`;
    console.log('[BilibiliService] Fetching URL:', fullUrl);

    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/'
      },
      credentials: 'include'
    });

    const data = await response.json();
    console.log('[BilibiliService] Response data:', data);
    if (data.code !== 0) {
      throw new Error(data.message);
    }
    return data.data;
  }

  public static async getVideoInfo(bvid: string) {
    console.log('[BilibiliService] Getting video info for bvid:', bvid);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/web-interface/view',
      { bvid }
    );
    console.log('[BilibiliService] Video info result:', data);
    return data;
  }

  public static async getComments(bvid: string) {
    console.log('[BilibiliService] Getting comments for bvid:', bvid);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/v2/reply',
      { oid: bvid, type: 1 }
    );
    console.log('[BilibiliService] Comments result:', data);
    return data;
  }

  public static async getPlayerInfo(bvid: string, cid: number) {
    console.log('[BilibiliService] Getting player info for bvid:', bvid, 'cid:', cid);
    const params = { bvid, cid };
    const signedParams = await WbiUtils.encWbi(params);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/player/wbi/v2',
      signedParams
    );
    console.log('[BilibiliService] Player info result:', data);
    return data;
  }

  public static async getCaptions(url: string) {
    console.log('[BilibiliService] Getting captions from URL:', url);
    const response = await fetch(url);
    const data = await response.json();
    console.log('[BilibiliService] Captions result:', data);
    return data;
  }
}