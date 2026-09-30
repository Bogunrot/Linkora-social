/**
 * #1593 — wallet session persistence.
 *
 * A session must remember the adapter that created it and the network it was
 * established on, restore through that same adapter on the next cold start, and
 * only delete stored credentials when the adapter definitively says the session
 * is gone.
 */
import { renderHook, waitFor, act } from "@testing-library/react-native";

const mockSecureStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(mockSecureStore.has(key) ? mockSecureStore.get(key)! : null)
  ),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureStore.delete(key);
    return Promise.resolve();
  }),
}));

jest.mock("../NetworkContext", () => {
  const actual = jest.requireActual("../NetworkContext");
  return {
    ...actual,
    useNetworkContext: () => ({
      network: actual.NETWORK_PRESETS.TESTNET,
      settings: {
        selectedNetwork: "TESTNET",
        rpcUrl: actual.NETWORK_PRESETS.TESTNET.rpcUrl,
      },
    }),
  };
});

import { WalletProvider, useWalletContext } from "../WalletContext";
import {
  setWalletAddress,
  setConnectionState,
  getWalletAddress,
  getConnectionState,
} from "../../utils/secureStorage";

const ADDRESS = "G" + "A".repeat(55);

type Provider = "freighter" | "walletconnect";

function makeKit(overrides: Record<string, unknown> = {}) {
  return {
    connect: jest.fn(async () => ({ publicKey: ADDRESS })),
    disconnect: jest.fn(async () => {}),
    isConnected: jest.fn(async () => true),
    getPublicKey: jest.fn(async () => ADDRESS),
    ...overrides,
  };
}

function makeFreighter(overrides: Record<string, unknown> = {}) {
  return {
    isConnected: jest.fn(async () => true),
    getPublicKey: jest.fn(async () => ADDRESS),
    requestAccess: jest.fn(async () => ({ address: ADDRESS })),
    ...overrides,
  };
}

async function seedSession(
  provider: Provider | undefined,
  { address = ADDRESS, network = "TESTNET" } = {}
) {
  await setWalletAddress(address);
  await setConnectionState({
    connected: true,
    address,
    provider,
    network,
    timestamp: Date.now(),
  });
}

function renderWallet() {
  return renderHook(() => useWalletContext(), {
    wrapper: ({ children }) => <WalletProvider>{children}</WalletProvider>,
  });
}

describe("WalletContext session persistence (#1593)", () => {
  beforeEach(() => {
    mockSecureStore.clear();
    globalThis.__LINKORA_WALLET_KIT__ = makeKit() as never;
    globalThis.__LINKORA_FREIGHTER_API__ = makeFreighter();
  });

  afterEach(() => {
    delete (globalThis as { __LINKORA_WALLET_KIT__?: unknown }).__LINKORA_WALLET_KIT__;
    delete (globalThis as { __LINKORA_FREIGHTER_API__?: unknown }).__LINKORA_FREIGHTER_API__;
  });

  it("restores a persisted Freighter session through Freighter, not WalletConnect", async () => {
    await seedSession("freighter");
    const kit = globalThis.__LINKORA_WALLET_KIT__ as unknown as ReturnType<typeof makeKit>;
    const freighter = globalThis.__LINKORA_FREIGHTER_API__ as unknown as ReturnType<
      typeof makeFreighter
    >;

    const { result } = renderWallet();

    await waitFor(() => expect(result.current.state).toBe("connected"));
    expect(result.current.wallet).toMatchObject({
      address: ADDRESS,
      provider: "freighter",
      network: "TESTNET",
    });
    expect(freighter.getPublicKey).toHaveBeenCalled();
    expect(kit.getPublicKey).not.toHaveBeenCalled();
    expect(kit.isConnected).not.toHaveBeenCalled();
  });

  it("restores a persisted WalletConnect session through WalletConnect, not Freighter", async () => {
    await seedSession("walletconnect");
    const kit = globalThis.__LINKORA_WALLET_KIT__ as unknown as ReturnType<typeof makeKit>;
    const freighter = globalThis.__LINKORA_FREIGHTER_API__ as unknown as ReturnType<
      typeof makeFreighter
    >;

    const { result } = renderWallet();

    await waitFor(() => expect(result.current.state).toBe("connected"));
    expect(result.current.wallet).toMatchObject({
      address: ADDRESS,
      provider: "walletconnect",
      network: "TESTNET",
    });
    expect(kit.getPublicKey).toHaveBeenCalled();
    expect(freighter.getPublicKey).not.toHaveBeenCalled();
  });

  it("never prompts the Freighter extension while restoring", async () => {
    await seedSession("freighter");
    const freighter = globalThis.__LINKORA_FREIGHTER_API__ as unknown as ReturnType<
      typeof makeFreighter
    >;

    const { result } = renderWallet();

    await waitFor(() => expect(result.current.state).toBe("connected"));
    expect(freighter.requestAccess).not.toHaveBeenCalled();
  });

  it("keeps the network the session was established on instead of hardcoding TESTNET", async () => {
    await seedSession("freighter", { network: "MAINNET" });

    const { result } = renderWallet();

    await waitFor(() => expect(result.current.state).toBe("connected"));
    expect(result.current.network).toBe("MAINNET");
    expect(result.current.wallet.network).toBe("MAINNET");
  });

  it("probes both adapters for a legacy session and records the one that matched", async () => {
    await seedSession(undefined);
    expect((await getConnectionState())?.provider).toBeUndefined();

    const { result } = renderWallet();

    await waitFor(() => expect(result.current.state).toBe("connected"));
    expect(result.current.wallet.provider).toBe("freighter");
    await waitFor(async () => {
      expect((await getConnectionState())?.provider).toBe("freighter");
    });
  });

  it("clears the stored session when the recorded adapter reports it is gone", async () => {
    await seedSession("walletconnect");
    globalThis.__LINKORA_WALLET_KIT__ = makeKit({
      isConnected: jest.fn(async () => false),
    }) as never;

    const { result } = renderWallet();

    await waitFor(() => expect(result.current.state).toBe("disconnected"));
    expect(result.current.wallet.address).toBeNull();
    await waitFor(async () => {
      expect(await getWalletAddress()).toBeNull();
      expect(await getConnectionState()).toBeNull();
    });
  });

  it("keeps the stored session when the adapter cannot be verified", async () => {
    await seedSession("freighter");
    globalThis.__LINKORA_FREIGHTER_API__ = makeFreighter({
      isConnected: jest.fn(async () => {
        throw new Error("extension unavailable");
      }),
    });

    const { result } = renderWallet();

    await waitFor(() => expect(result.current.state).toBe("disconnected"));
    // Unverifiable is not invalid — the credentials must survive for a retry.
    expect(await getWalletAddress()).toBe(ADDRESS);
    expect(await getConnectionState()).not.toBeNull();
  });

  it("persists provider and network when a wallet connects", async () => {
    const { result } = renderWallet();
    await waitFor(() => expect(result.current.state).toBe("disconnected"));

    await act(async () => {
      await result.current.connect("freighter");
    });

    expect(result.current.state).toBe("connected");
    await waitFor(async () => {
      expect(await getConnectionState()).toMatchObject({
        connected: true,
        address: ADDRESS,
        provider: "freighter",
        network: "TESTNET",
      });
    });
  });

  it("disconnect clears the session and only tears down the active provider", async () => {
    await seedSession("freighter");
    const kit = globalThis.__LINKORA_WALLET_KIT__ as unknown as ReturnType<typeof makeKit>;

    const { result } = renderWallet();
    await waitFor(() => expect(result.current.state).toBe("connected"));

    await act(async () => {
      await result.current.disconnect();
    });

    expect(kit.disconnect).not.toHaveBeenCalled();
    expect(await getWalletAddress()).toBeNull();
    expect(await getConnectionState()).toBeNull();
  });
});
