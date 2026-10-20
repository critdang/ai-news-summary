import { githubConnector } from "./github";

export const connectorRegistry = new Map([[githubConnector.type, githubConnector]]);

export function getConnector(type: string) {
  const connector = connectorRegistry.get(type);
  if (!connector) throw new Error(`Unsupported connector type: ${type}`);
  return connector;
}
