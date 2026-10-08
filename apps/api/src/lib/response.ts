import { type Response } from "express";

export function sendOk<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({
    status: "ok" as const,
    data,
    timestamp: new Date().toISOString(),
  });
}

export function sendError(res: Response, message: string, statusCode = 400): void {
  res.status(statusCode).json({
    status: "error" as const,
    error: message,
    timestamp: new Date().toISOString(),
  });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): void {
  res.status(200).json({
    status: "ok" as const,
    data,
    total,
    page,
    pageSize,
    timestamp: new Date().toISOString(),
  });
}
