import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { ChatCompletionTool } from 'openai/resources'

// 定义 MessageRole 枚举
export enum MessageRole {
  system = 'system',
  assistant = 'assistant',
  user = 'user',
  tool = 'tool',
}

class MessageDto {
  @ApiProperty({ description: 'message content', required: true })
  @IsNotEmpty()
  @IsString()
  content: string

  @ApiProperty({ description: 'role', required: true })
  @IsString()
  role: MessageRole
}

export class CompletionsDto {
  @ApiProperty({ description: 'messages', required: true, type: [MessageDto] })
  @IsNotEmpty()
  messages: MessageDto[]

  @ApiProperty({ description: 'tools', required: false, type: [Object], isArray: true })
  @IsOptional()
  @IsArray()
  tools?: ChatCompletionTool[]
}
