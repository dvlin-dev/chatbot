import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsDto } from './dto/tts.dto';
import { Response } from 'express';
import * as https from 'https';
import { URL } from 'url';

@Injectable()
export class TtsService {
  private ttsApiUrl: string;
  private ttsApiKey: string;
  
  constructor(private configService: ConfigService) {
    this.ttsApiUrl = this.configService.get('TTS_API_URL') || 'https://aiproxy.gzg.sealos.run/v1/audio/speech';
    this.ttsApiKey = this.configService.get('TTS_API_KEY') || '';
  }

  /**
   * 将文本转换为语音流
   * @param text 要转换的文本
   * @param res Express响应对象
   */
  async textToSpeechStream(ttsDto: TtsDto, res: Response): Promise<void> {
    // 设置正确的响应头
    res.setHeader('Content-Type', `audio/${ttsDto.response_format}`);
    res.setHeader('Transfer-Encoding', 'chunked');
    try {
      const url = new URL(this.ttsApiUrl);
      
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.ttsApiKey}`
        }
      };

      // 创建TTS请求
      const req = https.request(options, (ttsRes) => {
        // 将TTS服务的响应直接管道到客户端响应
        ttsRes.on('data', (chunk) => {
          res.write(chunk);
        });
        
        ttsRes.on('end', () => {
          res.end();
        });
      });

      req.on('error', (error) => {
        console.error('TTS API request error:', error);
        res.status(500).send({ error: `TTS服务调用失败: ${error.message}` });
      });

      // 发送TTS请求数据
      req.write(JSON.stringify(ttsDto));
      req.end();
    } catch (error) {
      console.error('TTS API error:', error);
      res.status(500).send({ error: `TTS服务调用失败: ${error.message}` });
    }
  }
} 