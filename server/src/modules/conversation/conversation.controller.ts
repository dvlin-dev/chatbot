import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Post,
  UseInterceptors,
  Res,
  Get,
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
    await this.conversationService.completionsStream(completionsDto, res)
  }

  @ApiOperation({ summary: 'tools' })
  @ApiResponse({ status: 200, description: 'Successfully get tools' })
  @Get('/tools')
  async getTools() {
    return await this.conversationService.getTools()
  }
}
