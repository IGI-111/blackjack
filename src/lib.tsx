import { BN } from "fuels";
import contractIds from "./sway-api/contract-ids.json";

export const providerUrl = "https://testnet.fuel.network/v1/graphql";
export const providerChainId = 0;

export const contractId = "0x2c6b9268ddb24dec03be1e195ca892649f3b2a359c53d052fb0375d4a7615ad1";

export const renderTransactionId = (transactionId: string) => {
  if (isLocal) {
    return transactionId;
  }

  return (
    <a
      href={`https://app-testnet.fuel.network/tx/${transactionId}/simple`}
      target="_blank"
      rel="noreferrer"
      className="underline"
    >
      {transactionId}
    </a>
  );
};
