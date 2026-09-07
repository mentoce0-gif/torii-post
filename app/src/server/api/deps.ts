import type { AnalyticsProvider } from '../analytics/provider.ts';
import type { Config } from '../config.ts';
import type { Repository } from '../data/repository.ts';

export interface Deps {
  repo: Repository;
  analytics: AnalyticsProvider;
  config: Config;
}
