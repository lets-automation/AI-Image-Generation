import type { Request, Response, NextFunction } from "express";
import { roleService } from "../../services/role.service.js";

class RoleController {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const roles = await roleService.list();
      res.json({ success: true, data: roles });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const role = await roleService.getById(req.params.id as string);
      res.json({ success: true, data: role });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const role = await roleService.create(req.body);
      res.status(201).json({ success: true, data: role });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const role = await roleService.update(req.params.id as string, req.body);
      res.json({ success: true, data: role });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await roleService.delete(req.params.id as string);
      res.json({ success: true, message: "Role deleted" });
    } catch (err) {
      next(err);
    }
  }

  async assignToUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await roleService.assignToUser(
        req.params.id as string,
        req.body.customRoleId ?? null
      );
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }
}

export const roleController = new RoleController();
