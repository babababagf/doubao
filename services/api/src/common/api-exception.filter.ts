import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const request = context.getRequest<FastifyRequest>()
    const reply = context.getResponse<FastifyReply>()
    const requestId = request.id
    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let code = 'INTERNAL_ERROR'
    let message = '服务暂时不可用，请稍后重试'

    if (error instanceof HttpException) {
      status = error.getStatus()
      const payload = error.getResponse()
      if (typeof payload === 'object' && payload !== null) {
        const detail = payload as { code?: string; message?: string | string[] }
        code = detail.code ?? `HTTP_${status}`
        message = Array.isArray(detail.message) ? detail.message.join('；') : (detail.message ?? message)
      } else if (typeof payload === 'string') {
        message = payload
        code = `HTTP_${status}`
      }
    }

    reply.status(status).send({ code, message, requestId })
  }
}
