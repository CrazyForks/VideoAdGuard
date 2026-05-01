/**
 * 仅用于类型占位的模块：./services/audio
 * 实际构建时会被 webpack NormalModuleReplacementPlugin 替换为：
 * - ./services/audio.chrome.ts 或 ./services/audio.firefox.ts
 * 本文件不包含运行时代码，仅提供类型签名。
 */

// 音频流信息
interface AudioStreamInfo {
  bandwidth: number;
  baseUrl: string;
}

// 播放URL数据
interface PlayUrlData {
  dash?: {
    audio?: AudioStreamInfo[];
  };
}

// Whisper 字幕分段
interface WhisperSegment {
  text?: string;
  start?: number;
  end?: number;
}

// Whisper 识别结果
interface WhisperTranscription {
  text?: string;
  segments?: WhisperSegment[];
}

// 文件信息
interface AudioFileInfo {
  name?: string;
  type?: string;
}

export declare class AudioService {
  /** 从视频流数据中获取最低带宽的音频流URL */
  static getLowestBandwidthAudioUrl(playUrlData: PlayUrlData): string | null;

  /** 下载音频（Blob）— Chrome 实现可用 */
  static downloadAudio(audioUrl: string): Promise<Blob>;

  /** 下载音频（ArrayBuffer）— Firefox 实现可用 */
  static downloadAudioBytes(audioUrl: string): Promise<{ bytes: ArrayBuffer; type: string }>;

  /** 音频处理流程：下载、转换 */
  static processAudio(playUrlData: PlayUrlData): Promise<Blob | null>;

  /** 以 Blob 走识别（content 端转 data:URL 传给 background）— Chrome 实现可用 */
  static transcribeAudioBlob(audioBlob: Blob, fileInfo: AudioFileInfo): Promise<WhisperTranscription>;

  /** 以 ArrayBuffer 走识别（直接传给 background）— Firefox 实现可用 */
  static transcribeAudioBytes(bytes: ArrayBuffer, fileInfo: AudioFileInfo): Promise<WhisperTranscription>;

  /** 后台通过 URL 下载并识别（兜底） */
  static transcribeAudioByUrl(
    audioUrl: string,
    fileInfo: AudioFileInfo,
    options?: { model?: string; responseFormat?: string }
  ): Promise<WhisperTranscription>;

  /** 完整流程：下载并识别 */
  static processAndTranscribeAudio(
    playUrlData: PlayUrlData,
    transcribeOptions?: { model?: string; language?: string; responseFormat?: 'verbose_json' }
  ): Promise<{ transcription: WhisperTranscription } | null>;
}