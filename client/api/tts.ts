import { httpRequest } from './index';

// TTS请求参数接口
export interface TtsRequest {
  input: string;
  model?: string;
  voice?: string;
  response_format?: string;
  stream?: boolean;
  speed?: number;
}

// TTS响应接口
export interface TtsResponse {
  audio: HTMLAudioElement;
  blob: Blob;
}

// 流式文本转语音 - 使用分段策略处理较长文本
export async function textToSpeechStream(text: string): Promise<TtsResponse> {
  // 创建音频元素
  const audio = new Audio();
  
  try {
    // 分割太长的文本
    // 中文可以根据句号、问号、感叹号等标点符号进行分割
    // 如果文本太长，按自然段落或句子分段发送请求更高效
    // 对于本次实现，我们仅处理单段
    
    // 请求参数
    const data: TtsRequest = {
      input: text,
      speed: 1.5,
      stream: true
    };
    
    // 获取完整URL
    const baseURL = httpRequest.instance.defaults.baseURL || '';
    const url = `${baseURL}/tts/speech`;
    
    console.log('TTS请求URL:', url);
    console.log('TTS请求内容:', text);
    
    // 创建请求
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`TTS请求失败: ${response.status} ${response.statusText}`);
    }
    
    // 获取音频blob
    const blob = await response.blob();
    
    if (blob.size === 0) {
      console.warn('TTS返回了空的音频数据');
      throw new Error('语音服务返回了空数据');
    }
    
    console.log('TTS响应成功，音频大小:', blob.size);
    
    // 在iOS上，MediaSource不被良好支持，因此使用blob URL
    const audioUrl = URL.createObjectURL(blob);
    audio.src = audioUrl;
    
    // 设置播放结束后释放资源
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };
    
    // 添加错误处理
    audio.onerror = (e) => {
      console.error('音频播放错误:', e);
    };
    
    return { audio, blob };
  } catch (error) {
    console.error('TTS API 错误:', error);
    throw error;
  }
} 