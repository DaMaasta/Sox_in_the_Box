type ErrorHandler = (msg: string) => void;
let handler: ErrorHandler = () => {};

export function setErrorHandler(fn: ErrorHandler) {
  handler = fn;
}

export function reportError(msg: string) {
  handler(msg);
}
