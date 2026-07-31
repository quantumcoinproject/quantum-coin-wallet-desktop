export interface TxStepGasSelection {
    gasLimit: number;
    gasFee: string;
}

export function appendTxStepGasSelection(
    selections: TxStepGasSelection[],
    gasLimit: number,
    gasFee: string,
): TxStepGasSelection[] {
    if (!Number.isInteger(gasLimit) || gasLimit <= 0 || gasFee.trim() === "") {
        throw new Error("Invalid step gas selection");
    }
    return selections.concat({ gasLimit, gasFee });
}
