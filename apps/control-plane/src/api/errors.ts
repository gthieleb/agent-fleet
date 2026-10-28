export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "missing or invalid credentials") {
    super(401, "unauthorized", message)
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "insufficient role") {
    super(403, "forbidden", message)
    this.name = "ForbiddenError"
  }
}
