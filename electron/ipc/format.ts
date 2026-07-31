import { ipcMain } from "electron";
import { loadQuantumCoin } from "../sdk";

export function registerFormatHandlers(): void {
    const { parseEther, formatEther, FixedNumber } = loadQuantumCoin();

    ipcMain.handle("FormatApiEtherToWei", async (_event, data) => {
        const etherAmount = parseEther(data);
        return etherAmount;
    });

    ipcMain.handle("FormatApiWeiToEther", async (_event, data) => {
        const etherAmount = formatEther(data);
        return etherAmount;
    });

    ipcMain.handle("FormatApiWeiToEtherCommified", async (_event, data) => {
        const etherAmount = formatEther(data);
        return etherAmount.toLocaleString();
    });

    ipcMain.handle("FormatApiIsValidEther", async (_event, data) => {
        try {
            if (data.startsWith("0")) {
                return false;
            }
            const number = FixedNumber.fromString(data);
            const isNegative = number.isNegative();
            return !isNegative;
        } catch {
            return false;
        }
    });

    ipcMain.handle("FormatApiCompareEther", async (_event, data) => {
        try {
            const number1 = FixedNumber.fromString(data.num1.replaceAll(",", ""));
            const number2 = FixedNumber.fromString(data.num2.replaceAll(",", ""));
            if (number1.isNegative() || number2.isNegative()) {
                throw new Error("error parsing numbers. negative values.");
            }

            if (number1.eq(number2)) {
                return 0;
            } else if (number1.gt(number2)) {
                return 1;
            } else {
                return -1;
            }
        } catch {
            throw new Error("error parsing numbers");
        }
    });
}
