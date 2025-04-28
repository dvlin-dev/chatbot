import { Module } from '@nestjs/common';
import { TtsService } from './tts.service';
import { ConfigModule } from '@nestjs/config';
import { TtsController } from './tts.controller';

@Module({
  imports: [ConfigModule],
  controllers: [TtsController],
  providers: [TtsService],
  exports: [TtsService],
})
export class TtsModule {} 