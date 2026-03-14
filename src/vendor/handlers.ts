import * as handlers from "../../node_modules/handlers.js/dist/main.node.js";

const typedHandlers = handlers as typeof import("handlers.js");

export const handler = typedHandlers.handler;
export const interfaces = typedHandlers.interfaces;
export const method = typedHandlers.method;
export const platformAdapater = typedHandlers.platformAdapater;
export const request = typedHandlers.request;
export const response = typedHandlers.response;
export const rootRouter = typedHandlers.rootRouter;
export const route = typedHandlers.route;
export const router = typedHandlers.router;

export default typedHandlers.default;
