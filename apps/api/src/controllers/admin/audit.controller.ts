import type { Request, Response, NextFunction } from "express";
import { auditService } from "../../services/audit.service.js";

class AuditController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        userId?: string;
        entity?: string;
        action?: string;
      };

      const result = await auditService.query(query);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (err) {
      next(err);
    }
  }
}

export const auditController = new AuditController();
