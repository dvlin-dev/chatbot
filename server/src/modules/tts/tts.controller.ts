import {
  Body,
  Controller,
  Post,
  Res,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TtsService } from './tts.service';
import { TtsDto } from './dto/tts.dto';
import { Response } from 'express';

@ApiTags('TTS')
@UseInterceptors(ClassSerializerInterceptor)
@Controller('tts')
export class TtsController {
  constructor(private ttsService: TtsService) {}

  @ApiOperation({ summary: '文本转语音', description: '将文本转换为语音文件并返回' })
  @ApiResponse({ status: 200, description: '成功转换文本为语音文件' })
  @Post('/speech')
  async textToSpeech(@Body() ttsDto: TtsDto, @Res() res: Response) {
    await this.ttsService.textToSpeechStream(ttsDto, res);
  }
} 