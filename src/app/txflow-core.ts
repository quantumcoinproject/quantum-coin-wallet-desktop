export function buildStepReview<T extends object>(
    baseReview: T,
    stepReview: Partial<T> | undefined,
    gasLimit: number,
    gasFee: string,
): T & { gasLimit: string; gasFee: string } {
    return {
        ...baseReview,
        ...(stepReview || {}),
        gasLimit: String(gasLimit),
        gasFee,
    };
}
