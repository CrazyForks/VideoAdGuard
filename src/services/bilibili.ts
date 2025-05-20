import { WbiUtils } from '../utils/wbi';

export class BilibiliService {
  private static async fetchWithCookie(url: string, params: Record<string, any> = {}) {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = `${url}?${queryString}`;
    console.log('【VideoAdGuard】[BilibiliService] Fetching URL:', fullUrl);

    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/'
      },
      credentials: 'include'
    });

    const data = await response.json();
    console.log('【VideoAdGuard】[BilibiliService] Response data:', data);
    if (data.code !== 0) {
      throw new Error(data.message);
    }
    return data.data;
  }

  public static async getVideoInfo(bvid: string) {
    console.log('【VideoAdGuard】[BilibiliService] Getting video info for bvid:', bvid);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/web-interface/view',
      { bvid }
    );
    console.log('【VideoAdGuard】[BilibiliService] Video info result:', data);
    return data;
  }

  public static async getComments(bvid: string) {
    console.log('【VideoAdGuard】[BilibiliService] Getting comments for bvid:', bvid);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/v2/reply',
      { oid: bvid, type: 1 }
    );
    console.log('【VideoAdGuard】[BilibiliService] Comments result:', data);
    return data;
  }

  public static async getPlayerInfo(bvid: string, cid: number) {
    console.log('【VideoAdGuard】[BilibiliService] Getting player info for bvid:', bvid, 'cid:', cid);
    const params = { bvid, cid };
    const signedParams = await WbiUtils.encWbi(params);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/player/wbi/v2',
      signedParams
    );
    console.log('【VideoAdGuard】[BilibiliService] Player info result:', data);
    return data;
  }

  public static async getCaptions(url: string) {
    console.log('【VideoAdGuard】[BilibiliService] Getting captions from URL:', url);
    const response = await fetch(url);
    const data = await response.json();
    console.log('【VideoAdGuard】[BilibiliService] Captions result:', data);
    return data;
  }

  /**
   * 获取UP主信息
   * @param uid UP主的UID
   * @returns UP主信息，包含uid和name
   */
  public static async getUpInfo(uid: string) {
    console.log('【VideoAdGuard】[BilibiliService] Getting UP info for uid:', uid);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/space/acc/info',
      { mid: uid }
    );
    console.log('【VideoAdGuard】[BilibiliService] UP info result:', data);
    return {
      uid: data.mid.toString(),
      name: data.name
    };
  }
}