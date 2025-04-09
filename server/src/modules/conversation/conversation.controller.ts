import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Post,
  UseInterceptors,
  Res,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ConversationService } from './conversation.service'
import { CompletionsDto } from './dto/chat.dto'
import { Response } from 'express'

@ApiTags('Conversation')
@UseInterceptors(ClassSerializerInterceptor)
@Controller('conversation')
export class ConversationController {
  constructor(
    private conversationService: ConversationService
  ) {}

  @ApiOperation({ summary: 'completions' })
  @ApiResponse({ status: 200, description: 'Successfully get completions' })
  @Post('/completions')
  async completions(@Body() completionsDto: CompletionsDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    await this.conversationService.completionsStream(completionsDto, res)
  }
}
