// The browser controller is still serialized inline from render-form-page.ts.
// This module marks the client-controller boundary for future extraction.
export const controllerDelivery = "inline-controller-script" as const;
