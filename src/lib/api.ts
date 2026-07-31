// HTTP client for the blockchain scan API. 1:1 port of the old src/js/api.js.
import { hexWeiToEthFormatted } from "./bridge";
import { IsValidAddress } from "./crypto";
import { isHex, isLargeNumber, isValidDate } from "./util";
import { isNumber } from "./wallet";
import { langJson } from "./i18n";

const HTTPS = "https://";
const HTTP = "http://";
const ADDRESS_LENGTH_CHECK = 64;

// Use HTTP for localhost or any IP address; HTTPS for other domains
const isHttpAllowedDomain = (domain: string): boolean => {
    if (domain.startsWith("localhost:")) return true;
    return /^(\d{1,3}\.){3}\d{1,3}(:[0-9]{1,5})?$/.test(domain);
};

export class AccountDetails {
    address: string;
    nonce: number;
    balance: string;

    constructor(address: string, nonce: number, balance: string) {
        if (address.startsWith("0x") == false) {
            address = "0x" + address;
        }
        this.address = address;
        this.nonce = nonce;
        this.balance = balance;
    }
}

export class TransactionDetails {
    hash: string;
    createdAt: Date | "";
    from: string;
    to: string | null;
    value: string;
    status: boolean;

    constructor(hash: string, createdAt: Date | "", from: string, to: string | null, value: string, status: boolean) {
        this.hash = hash;
        this.createdAt = createdAt;
        this.from = from;
        this.to = to;
        this.value = value;
        this.status = status;
    }
}

export class AccountTokenDetails {
    tokenBalance: string;
    contractAddress: string;
    name: string;
    symbol: string;

    constructor(tokenBalance: string, contractAddress: string, name: string, symbol: string) {
        this.tokenBalance = tokenBalance;
        this.contractAddress = contractAddress;
        this.name = name;
        this.symbol = symbol;
    }
}

export interface TransactionListDetails {
    transactionList: TransactionDetails[] | null;
    pageCount: number;
}

export interface TokenListDetails {
    tokenList: AccountTokenDetails[] | null;
    pageCount: number;
}

export async function getAccountDetails(scanApiDomain: string, address: string): Promise<AccountDetails> {
    let url = HTTPS;
    if (isHttpAllowedDomain(scanApiDomain)) {
        url = HTTP;
    }
    url = url + scanApiDomain + "/account/" + address;
    let nonce = 0;
    let balance = "0";

    const response = await fetch(url);
    const jsonObj = await response.json();
    const result = jsonObj.result;
    if (result != null) {
        if (result.nonce != null) {
            const tempNonce = parseInt(result.nonce);
            if (Number.isInteger(tempNonce) == true) {
                nonce = tempNonce;
            } else {
                throw new Error(langJson.errors.invalidApiResponse);
            }
        }

        if (result.balance != null) {
            if (isLargeNumber(result.balance) == false) {
                throw new Error(langJson.errors.invalidApiResponse);
            } else {
                balance = result.balance;
            }
        }
    }

    return new AccountDetails(address, nonce, balance);
}

export async function getCompletedTransactionDetails(scanApiDomain: string, address: string, pageIndex: number): Promise<TransactionListDetails | null> {
    return await getTransactionDetails(scanApiDomain, address, pageIndex, false);
}

export async function getPendingTransactionDetails(scanApiDomain: string, address: string, pageIndex: number): Promise<TransactionListDetails | null> {
    return await getTransactionDetails(scanApiDomain, address, pageIndex, true);
}

async function getTransactionDetails(scanApiDomain: string, address: string, pageIndex: number, isPending: boolean): Promise<TransactionListDetails | null> {
    let url = HTTPS;
    if (isHttpAllowedDomain(scanApiDomain)) {
        url = HTTP;
    }

    if (isPending) {
        url = url + scanApiDomain + "/account/" + address + "/transactions/pending/" + pageIndex;
    } else {
        url = url + scanApiDomain + "/account/" + address + "/transactions/" + pageIndex;
    }

    const response = await fetch(url);

    const jsonObj = await response.json();
    const result = jsonObj;
    const pageCountString = result?.pageCount;

    if (result == null || pageCountString == null) {
        throw new Error("invalid result");
    }

    const pageCount = parseInt(pageCountString);
    if (isNumber(pageCount) == false || pageCount < 0) {
        throw new Error("invalid pageCount");
    }

    if (result.items == null || result.items.length == 0 || pageCount == 0) {
        return null;
    }

    if (pageIndex > pageCount) {
        return {
            transactionList: null,
            pageCount: pageCount,
        };
    }

    const transactionList: TransactionDetails[] = [];

    if (Array.isArray(result.items) === false) {
        return null;
    }

    for (let i = 0; i < result.items.length; i++) {
        const txn = result.items[i];

        if (txn.hash == null || txn.hash.length < ADDRESS_LENGTH_CHECK || await IsValidAddress(txn.hash) == false) {
            throw new Error("invalid hash");
        }
        if (txn.from == null || txn.from.length < ADDRESS_LENGTH_CHECK || await IsValidAddress(txn.from) == false) {
            throw new Error("invalid fromAddress");
        }
        if (txn.to != null && (txn.to.length < ADDRESS_LENGTH_CHECK || await IsValidAddress(txn.to) == false)) {
            throw new Error("invalid toAddress");
        }

        let txnDate: Date | "" = "";
        if (txn.createdAt == null || isValidDate(txn.createdAt) == false) {
            if (isPending === false) {
                throw new Error("invalid date");
            }
        } else {
            const txnDateString = (txn.createdAt.includes("UTC") || txn.createdAt.endsWith("Z")) ? txn.createdAt : txn.createdAt + "Z";
            txnDate = new Date(txnDateString);
        }

        if (txn.value == null || isHex(txn.value) == false) {
            throw new Error("invalid value");
        }
        let status = false;
        if (txn.status !== null && txn.status == "0x1") {
            status = true;
        }

        const txnValue = await hexWeiToEthFormatted(txn.value);
        transactionList.push(new TransactionDetails(txn.hash, txnDate, txn.from, txn.to, txnValue, status));
    }

    return {
        transactionList: transactionList,
        pageCount: pageCount,
    };
}

export async function getTransactionStatusByHash(scanApiDomain: string, address: string, txHash: string): Promise<{ status: string; error?: string }> {
    if (!txHash || !address) return { status: "unknown" };
    try {
        const pending = await getTransactionDetails(scanApiDomain, address, 0, true);
        if (pending && pending.transactionList) {
            for (let i = 0; i < pending.transactionList.length; i++) {
                if (pending.transactionList[i].hash === txHash) return { status: "pending" };
            }
        }
        const completed = await getTransactionDetails(scanApiDomain, address, 0, false);
        if (completed && completed.transactionList) {
            for (let i = 0; i < completed.transactionList.length; i++) {
                const t = completed.transactionList[i];
                if (t.hash === txHash) return { status: t.status ? "succeeded" : "failed" };
            }
        }
    } catch (e: any) {
        return { status: "unknown", error: (e && e.message) ? e.message : String(e) };
    }
    return { status: "unknown" };
}

export async function listAccountTokens(scanApiDomain: string, address: string, pageIndex: number): Promise<TokenListDetails | { transactionList: null; pageCount: number } | null> {
    let url = HTTPS;
    if (isHttpAllowedDomain(scanApiDomain)) {
        url = HTTP;
    }
    url = url + scanApiDomain + "/account/" + address + "/tokens/" + pageIndex;

    const response = await fetch(url);
    if (response.status === 404) {
        return null;
    }

    const jsonObj = await response.json();
    const result = jsonObj;

    if (result == null) {
        throw new Error("invalid result");
    }

    const pageCountString = result.pageCount;
    if (pageCountString == null) {
        throw new Error("invalid result");
    }

    const pageCount = parseInt(pageCountString);
    if (isNumber(pageCount) === false || pageCount < 0) {
        throw new Error("invalid pageCount");
    }

    if (result.items == null || result.items.length === 0 || pageCount === 0) {
        return null;
    }

    if (pageIndex > pageCount) {
        return {
            transactionList: null,
            pageCount: pageCount,
        };
    }

    const tokenList: AccountTokenDetails[] = [];

    if (Array.isArray(result.items) === false) {
        return null;
    }

    for (let i = 0; i < result.items.length; i++) {
        const token = result.items[i];
        let tokenName = "";
        let tokenSymbol = "";

        if (token.contractAddress == null || token.contractAddress.length < ADDRESS_LENGTH_CHECK || await IsValidAddress(token.contractAddress) === false) {
            throw new Error("invalid contractAddress");
        }

        if (token.tokenBalance == null || isHex(token.tokenBalance) === false) {
            throw new Error("invalid tokenBalance");
        }
        const tokenBalance = await hexWeiToEthFormatted(token.tokenBalance);

        if (token.name !== null && (typeof token.name === "string" || token.name instanceof String)) {
            tokenName = token.name;
        }

        if (token.symbol !== null && (typeof token.symbol === "string" || token.symbol instanceof String)) {
            tokenSymbol = token.symbol;
        }

        tokenList.push(new AccountTokenDetails(tokenBalance, token.contractAddress, tokenName, tokenSymbol));
    }

    return {
        tokenList: tokenList,
        pageCount: pageCount,
    };
}
