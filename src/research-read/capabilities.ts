import type { ResearchCapabilityDescriptor } from '../contract/research-read/dto.js';
import { RESEARCH_READ_CONTRACT_VERSION } from '../contract/research-read/version.js';

export function researchCapabilities(): ResearchCapabilityDescriptor {
  return {
    researchReadContractVersion: RESEARCH_READ_CONTRACT_VERSION,
    capabilities: { read: true, mutation: false, backtestSubmission: false, backtestResults: false },
    note: 'backtesting_moved_to_trading_backtester',
  };
}
