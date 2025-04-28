import { IsString, IsBoolean, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TtsDto {
  @ApiProperty({
    description: '需要转换为语音的文本',
    example: '你好，世界！',
    required: true
  })
  @IsString()
  input: string;

  @ApiProperty({
    description: '语音模型',
    example: 'speech-02-turbo',
    required: false,
    default: 'speech-02-turbo'
  })
  @IsString()
  @IsOptional()
  model?: string = 'speech-02-turbo';

  @ApiProperty({
    description: '语音声音',
    example: 'Chinese (Mandarin)_Warm_Bestie',
    required: false,
    default: 'Chinese (Mandarin)_Warm_Bestie'
  })
  @IsString()
  @IsOptional()
  voice?: string = 'Chinese (Mandarin)_Warm_Bestie';

  @ApiProperty({
    description: '响应格式',
    example: 'mp3',
    required: false,
    default: 'mp3',
    enum: ['mp3']
  })
  @IsString()
  @IsOptional()
  response_format?: string = 'mp3';

  @ApiProperty({
    description: '是否流式输出',
    example: true,
    required: false,
    default: true
  })
  @IsBoolean()
  @IsOptional()
  stream?: boolean = true;

  @ApiProperty({
    description: '语音速度',
    example: 1,
    required: false,
    default: 1
  })
  @IsNumber()
  @IsOptional()
  speed?: number = 1;
} 