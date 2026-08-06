import type { FastifyReply } from "fastify";

// One error shape for the whole API (api-design.md): { error: { code, message, details } }.
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  INTERNAL: "INTERNAL",
} as const;

export class ApiError extends Error {
  code: string;
  statusCode: number;
  details: Record<string, unknown>;
  constructor(code: string, statusCode: number, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function sendError(reply: FastifyReply, code: string, statusCode: number, message: string, details: Record<string, unknown> = {}) {
  return reply.code(statusCode).send({ error: { code, message, details } });
}
