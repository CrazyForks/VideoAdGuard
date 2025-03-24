import md5 from 'md5';

interface WbiCache {
  img_key: string;
  sub_key: string;
  timestamp: number;
}

export class WbiUtils {
  private static readonly mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
  ];

  private static getMixinKey(orig: string): string {
    return this.mixinKeyEncTab
      .map(i => orig[i])
      .join('')
      .slice(0, 32);
  }

  public static async getWbiKeys(): Promise<[string, string]> {
    const cacheKey = 'wbi_cache';
    const cache = await chrome.storage.local.get(cacheKey);
    
    if (cache[cacheKey]) {
      const wbiCache: WbiCache = cache[cacheKey];
      const today = new Date().setHours(0, 0, 0, 0);
      if (wbiCache.timestamp >= today) {
        return [wbiCache.img_key, wbiCache.sub_key];
      }
    }

    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
      }
    });
    const data = await response.json();
    const wbiImg = data.data.wbi_img;
    
    const img_key = wbiImg.img_url.slice(
      wbiImg.img_url.lastIndexOf('/') + 1,
      wbiImg.img_url.lastIndexOf('.')
    );
    const sub_key = wbiImg.sub_url.slice(
      wbiImg.sub_url.lastIndexOf('/') + 1,
      wbiImg.sub_url.lastIndexOf('.')
    );

    const newCache: WbiCache = {
      img_key,
      sub_key,
      timestamp: Date.now()
    };
    
    await chrome.storage.local.set({ [cacheKey]: newCache });
    return [img_key, sub_key];
  }

  public static async encWbi(params: Record<string, any>): Promise<Record<string, any>> {
    const [img_key, sub_key] = await this.getWbiKeys();
    const mixin_key = this.getMixinKey(img_key + sub_key);
    const currTime = Math.round(Date.now() / 1000);
    
    const newParams: Record<string, any> = {
      ...params,
      wts: currTime
    };

    const query = Object.keys(newParams)
      .sort()
      .map(key => {
        const value = String(newParams[key]).replace(/[!'()*]/g, '');
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      })
      .join('&');

    const w_rid = md5(query + mixin_key);
    return { ...newParams, w_rid };
  }
}