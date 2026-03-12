declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: "USER" | "ADMIN" | "SUPER_ADMIN";
      userPermissions?: string[];
    }
  }
}

export {};
