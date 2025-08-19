import { useConnectUI, useDisconnect, useIsConnected, useNetwork } from "@fuels/react";
import { useEffect } from "react";

import { useRouter } from "./hooks/useRouter";
import Button from "./components/Button";
import Blackjack from "./components/Blackjack";
import { providerUrl } from "./lib.tsx";

function App() {
  const { connect } = useConnectUI();
  const { disconnect } = useDisconnect();
  const { isConnected, refetch } = useIsConnected();
  const { network } = useNetwork();
  const { view, views, setRoute } = useRouter();
  const isConnectedToCorrectNetwork = network?.url === providerUrl;

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <main
      data-theme="dark"
      className="flex items-center justify-center lg:pt-6 text-zinc-50/90"
    >
              <div className="col-span-5">
                <div >
                  {!isConnected && (
                    <section className="flex h-full flex-col justify-center space-y-6 px-4 py-8 lg:px-[25%]">
                      <Button onClick={() => connect()}>Connect Wallet</Button>
                    </section>
                  )}

                  {isConnected && !isConnectedToCorrectNetwork && (
                    <section className="flex h-full flex-col justify-center space-y-6 px-4 py-8">
                      <p className="text-center">
                        You are connected to the wrong network. Please switch to{" "}
                        <a
                          href={providerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-green-500/80 transition-colors hover:text-green-500"
                        >
                          {providerUrl}
                        </a>
                        &nbsp;in your wallet.
                      </p>
                    </section>
                  )}

                  {isConnected && isConnectedToCorrectNetwork && (
                    <section>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div>
                          {views.map((viewName) => (
                            <Button
                              key={viewName}
                              className="w-full sm:flex-1 capitalize"
                              color={view === viewName ? "primary" : "inactive"}
                              onClick={() => setRoute(viewName)}
                            >
                              {viewName}
                            </Button>
                          ))}
                        </div>
                        <Button onClick={() => disconnect()}>Disconnect</Button>
                      </div>

                      {view === "blackjack" && <Blackjack/>}
                    </section>
                  )}
                </div>
              </div>
    </main>
  );
}

export default App;
