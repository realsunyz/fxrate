export const INTERNAL_AUTH_BYPASS = Symbol.for('fxrate.internal-auth-bypass');

export const markInternalAuthBypass = (request: object): void => {
    Object.defineProperty(request, INTERNAL_AUTH_BYPASS, {
        value: true,
        enumerable: false,
        configurable: true,
    });
};

export const hasInternalAuthBypass = (request: object): boolean =>
    (request as Record<symbol, unknown>)[INTERNAL_AUTH_BYPASS] === true;
