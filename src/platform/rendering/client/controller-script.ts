// The browser controller stays inline for speed. Development responses keep the
// readable controller source, while production responses compact the inline JS.
export const controllerDelivery = "inline-controller-script-source-or-built" as const;
