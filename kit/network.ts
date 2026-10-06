// The game is built once per variant; the network is stamped into the HTML afterwards
// (build/networks.mjs adds <meta name="playable-network">). Without the tag this is a preview build,
// where ?net=<network> lets the portfolio site show each network's CTA path against stub APIs.
export type Network =
  | "applovin"
  | "unity"
  | "liftoff"
  | "google"
  | "meta"
  | "moloco"
  | "mintegral"
  | "tiktok"
  | "preview";

export const NETWORKS: Network[] = ["applovin", "unity", "liftoff", "google", "meta", "moloco", "mintegral", "tiktok"];

export function currentNetwork(doc: Document, search: string): { network: Network; stubbed: boolean } {
  const tag = doc.querySelector('meta[name="playable-network"]')?.getAttribute("content");
  if (tag && (NETWORKS as string[]).includes(tag)) return { network: tag as Network, stubbed: false };
  const fromUrl = new URLSearchParams(search).get("net");
  if (fromUrl && (NETWORKS as string[]).includes(fromUrl)) return { network: fromUrl as Network, stubbed: true };
  return { network: "preview", stubbed: false };
}
