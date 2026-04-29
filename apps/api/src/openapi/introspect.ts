import type { Express, Router } from "express";
import type { ZodSchema } from "zod";

export interface ExtractedRoute {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  pathParams: string[];
  authType: "none" | "optional" | "required";
  adminOnly: boolean;
  permission?: string;
  bodySchema?: ZodSchema;
  querySchema?: ZodSchema;
  paramsSchema?: ZodSchema;
}

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
]);

/**
 * Extract the URL prefix that an Express sub-router was mounted under.
 * Express stores the mount path as a compiled RegExp on the layer; we
 * reverse-engineer it from the regex source.
 */
function extractMountPath(layer: any): string {
  if (!layer || !layer.regexp) return "";
  if (layer.regexp.fast_slash) return "";
  if (layer.regexp.fast_star) return "";

  // Source format: /^\/some\/prefix\/?(?=\/|$)/i
  const source: string = layer.regexp.source;
  const match = source.match(/^\^\\\/(.+?)\\\/\?\(\?=\\\/\|\$\)$/);
  if (match) {
    return "/" + match[1].replace(/\\\//g, "/").replace(/\\\./g, ".");
  }

  // Fallback: param-prefixed or other patterns
  const fallback = source.match(/^\^\\?\/(.+?)\\?\/?\$?/);
  if (fallback) return "/" + fallback[1].replace(/\\\//g, "/");
  return "";
}

function expressPathToOpenApi(path: string): { path: string; params: string[] } {
  const params: string[] = [];
  let converted = path.replace(/:([A-Za-z0-9_]+)/g, (_match, name) => {
    params.push(name);
    return `{${name}}`;
  });
  // Strip trailing slash (except for the root "/") so the spec doesn't list
  // both /foo and /foo/ when Express only registered one of them.
  if (converted.length > 1 && converted.endsWith("/")) {
    converted = converted.slice(0, -1);
  }
  return { path: converted, params };
}

function inspectMiddlewareChain(
  handlers: any[],
  acc: ExtractedRoute
): void {
  for (const fn of handlers) {
    if (!fn) continue;

    // Zod validator: schemas attached as __zodSchemas
    if (fn.__zodSchemas) {
      const s = fn.__zodSchemas;
      if (s.body) acc.bodySchema = s.body;
      if (s.query) acc.querySchema = s.query;
      if (s.params) acc.paramsSchema = s.params;
    }

    // Auth: detect by function name or attached tag
    if (fn.name === "authenticate") {
      if (acc.authType === "none") acc.authType = "required";
    } else if (fn.name === "optionalAuth") {
      if (acc.authType === "none") acc.authType = "optional";
    }

    if (fn.__authType === "required") {
      acc.authType = "required";
    } else if (fn.__authType === "optional" && acc.authType === "none") {
      acc.authType = "optional";
    }

    if (fn.__adminAccess) {
      acc.adminOnly = true;
      if (fn.__permission) acc.permission = fn.__permission;
    }
  }
}

/**
 * Recursively walk an Express router stack and collect every leaf route,
 * carrying along the cumulative URL prefix and inherited middleware.
 */
function walkRouter(
  router: Router | Express,
  basePath: string,
  inheritedHandlers: any[],
  collected: ExtractedRoute[]
): void {
  const stack: any[] = (router as any).stack || (router as any)._router?.stack || [];

  // First pass: collect router-level middleware (router.use(fn) without a path).
  // These are leaf-less layers whose handle is a function rather than a router.
  // We detect them and add to the inherited chain so child routes see them.
  const routerLevelMiddleware: any[] = [];

  for (const layer of stack) {
    if (
      !layer.route &&
      typeof layer.handle === "function" &&
      layer.handle !== router &&
      !(layer.handle as any).stack &&
      layer.regexp?.fast_slash
    ) {
      routerLevelMiddleware.push(layer.handle);
    }
  }

  const effectiveInherited = [...inheritedHandlers, ...routerLevelMiddleware];

  for (const layer of stack) {
    if (layer.route) {
      // Leaf route
      const route = layer.route;
      const routePath: string = route.path;
      const fullPath = basePath + routePath;
      const { path: openApiPath, params } = expressPathToOpenApi(fullPath);

      const routeStack = route.stack || [];
      const routeHandlers = routeStack.map((l: any) => l.handle);
      const allHandlers = [...effectiveInherited, ...routeHandlers];

      const methods = Object.keys(route.methods || {}) as string[];
      for (const method of methods) {
        if (!HTTP_METHODS.has(method)) continue;
        const acc: ExtractedRoute = {
          method: method as ExtractedRoute["method"],
          path: openApiPath,
          pathParams: params,
          authType: "none",
          adminOnly: false,
        };
        inspectMiddlewareChain(allHandlers, acc);
        collected.push(acc);
      }
    } else if (layer.handle && (layer.handle as any).stack) {
      // Mounted sub-router
      const mount = extractMountPath(layer);
      walkRouter(
        layer.handle as Router,
        basePath + mount,
        effectiveInherited,
        collected
      );
    }
  }
}

/**
 * Extracts every registered route from an Express app.
 * Walk happens after all routes are mounted (call this at startup, post-route-mount).
 */
export function extractRoutes(app: Express): ExtractedRoute[] {
  const collected: ExtractedRoute[] = [];
  const rootStack: any[] = (app as any)._router?.stack || (app as any).router?.stack || [];

  for (const layer of rootStack) {
    if (layer.route) {
      const routePath: string = layer.route.path;
      const { path: openApiPath, params } = expressPathToOpenApi(routePath);
      const routeStack = layer.route.stack || [];
      const handlers = routeStack.map((l: any) => l.handle);
      const methods = Object.keys(layer.route.methods || {});
      for (const method of methods) {
        if (!HTTP_METHODS.has(method)) continue;
        const acc: ExtractedRoute = {
          method: method as ExtractedRoute["method"],
          path: openApiPath,
          pathParams: params,
          authType: "none",
          adminOnly: false,
        };
        inspectMiddlewareChain(handlers, acc);
        collected.push(acc);
      }
    } else if (layer.handle && (layer.handle as any).stack) {
      const mount = extractMountPath(layer);
      walkRouter(layer.handle as Router, mount, [], collected);
    }
  }

  // De-duplicate (same method+path can appear if mounted twice)
  const seen = new Set<string>();
  return collected.filter((r) => {
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
