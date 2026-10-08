import { type Request, type Response, type NextFunction } from "express";
import { type ZodSchema, type ZodError } from "zod";
import { sendError } from "../lib/response.js";

interface ValidatedRequest extends Request {
  validatedQuery?: Record<string, unknown>;
  validatedParams?: Record<string, unknown>;
}

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidationSchemas) {
  return (req: ValidatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          sendError(res, `validation error: ${formatZodError(result.error)}`, 400);
          return;
        }
        req.body = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          sendError(res, `validation error: ${formatZodError(result.error)}`, 400);
          return;
        }
        req.validatedQuery = result.data as Record<string, unknown>;
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          sendError(res, `validation error: ${formatZodError(result.error)}`, 400);
          return;
        }
        req.validatedParams = result.data as Record<string, unknown>;
      }

      next();
    } catch (err) {
      sendError(res, `validation error: ${(err as Error).message}`, 400);
    }
  };
}

function formatZodError(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}
