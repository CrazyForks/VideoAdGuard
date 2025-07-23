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
    if (data.code !== 0) {
      console.log('【VideoAdGuard】[BilibiliService] Error:', data.message);
      throw new Error(data.message);
    }
    return data.data;
  }

  public static async getVideoInfo(bvid: string) {
    console.log('【VideoAdGuard】[BilibiliService] Getting video info for bvid:', bvid);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/web-interface/view',
      { bvid: bvid }
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

  public static async getTopComments(bvid: string) {
    console.log('【VideoAdGuard】[BilibiliService] Getting top comments for bvid:', bvid);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/v2/reply',
      { oid: bvid, type: 1}
    );
    const top_replies = data?.top_replies || null;
    const topComment = top_replies ? (top_replies[0]?.content || null) : null;
    console.log('【VideoAdGuard】[BilibiliService] Top comments result:', topComment);
    return topComment;
  }

  public static async getPlayerInfo(bvid: string, cid: number) {
    console.log('【VideoAdGuard】[BilibiliService] Getting player info for bvid:', bvid, 'cid:', cid);
    const params = { bvid: bvid, cid: cid};
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
    const params = { mid: uid };
    const signedParams = await WbiUtils.encWbi(params);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/space/wbi/acc/info',
      signedParams
    );
    console.log('【VideoAdGuard】[BilibiliService] UP info result:', data);
    return {
      uid: data.mid.toString(),
      name: data.name
    };
  }

  /**
   * 获取视频流信息
   * @param bvid 视频的BVID
   * @param cid 视频的CID
   * @returns 视频流信息，包含播放地址等
   */
  public static async getPlayUrl(bvid: string, cid: number) {
    console.log('【VideoAdGuard】[BilibiliService] Getting video url for bvid:', bvid, 'cid:', cid);
    const params = { bvid: bvid, cid: cid, fnval: 16 };
    const signedParams = await WbiUtils.encWbi(params);
    const data = await this.fetchWithCookie(
      'https://api.bilibili.com/x/player/wbi/playurl',
      signedParams
    );
    console.log('【VideoAdGuard】[BilibiliService] video url result:', data);
    return data;
  }
}