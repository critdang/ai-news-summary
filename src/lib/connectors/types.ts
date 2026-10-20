export type ConnectorDomainType = "project" | "release" | "article";

export type ConnectorDefinition<Config, Entity> = {
  type: string;
  version: number;
  displayName: string;
  description: string;
  capabilities: ConnectorDomainType[];
  validateConfig(value: unknown): Config;
  fetch(config: Config, signal?: AbortSignal): Promise<Entity[]>;
};

export type GitHubProject = {
  externalId: string;
  canonicalUrl: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  topics: string[];
  upstreamCreatedAt: Date | null;
  upstreamUpdatedAt: Date | null;
};
