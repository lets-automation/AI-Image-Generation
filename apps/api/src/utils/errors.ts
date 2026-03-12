export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, string[]>;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: Record<string, string[]>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, string[]>) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, string[]>) {
    super(message, 409, "CONFLICT", details);
  }
}

export class ValidationError extends AppError {
  constructor(details: Record<string, string[]>) {
    super("Validation failed", 422, "VALIDATION_ERROR", details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests, please try again later") {
    super(message, 429, "TOO_MANY_REQUESTS");
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(balance: number, required: number) {
    super(
      `Insufficient credits: balance ${balance}, required ${required}`,
      402,
      "INSUFFICIENT_CREDITS"
    );
  }
}

export class SubscriptionRequiredError extends AppError {
  constructor() {
    super(
      "Active subscription required",
      402,
      "SUBSCRIPTION_REQUIRED"
    );
  }
}

export class TierNotAllowedError extends AppError {
  constructor(tier: string) {
    super(
      `Your subscription plan does not include ${tier} tier access`,
      403,
      "TIER_NOT_ALLOWED"
    );
  }
}

export class ModerationError extends AppError {
  constructor(reason: string) {
    super(`Content blocked: ${reason}`, 400, "CONTENT_MODERATED");
  }
}

export class ProviderUnavailableError extends AppError {
  constructor(tier: string) {
    super(
      `No AI providers available for ${tier} tier`,
      503,
      "PROVIDER_UNAVAILABLE"
    );
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable") {
    super(message, 503, "SERVICE_UNAVAILABLE");
  }
}
